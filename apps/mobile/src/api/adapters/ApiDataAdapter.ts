import { io } from 'socket.io-client';
import { httpRequest } from '../client/http';
import type { DataAdapter, DataSubscription, SubscriptionOptions } from '../contracts/adapter';
export class ApiDataAdapter implements DataAdapter {
  readonly source = 'api' as const;
  constructor(private readonly getUrl: () => string) {}
  request<T>(path: string, token: string | null, method = 'GET', body?: unknown, timeoutMs = 45000, signal?: AbortSignal) {
    return httpRequest<T>(this.getUrl(), path, token, method, body, timeoutMs, signal);
  }
  subscribe({ token, groupId, onEvent, onStatus }: SubscriptionOptions): DataSubscription {
    onStatus('connecting');
    const client = io(this.getUrl(), { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 10000 });
    client.on('connect', () => {
      const ready = () => { onStatus('connected'); onEvent({ name: 'resync', groupId: groupId || undefined }); };
      if (!groupId) ready();
      else client.emit('group:join', { groupId }, (ack: { ok: boolean }) => ack?.ok ? ready() : onStatus('disconnected'));
    });
    client.on('disconnect', () => onStatus('reconnecting'));
    client.on('connect_error', () => onStatus('reconnecting'));
    ['group:updated', 'wishlist:updated', 'comment:created', 'comment:updated', 'comment:deleted', 'comment:typing', 'plan:created', 'plan:updated', 'plan:applied', 'weather:updated', 'alert:created', 'notification:created', 'activity:created'].forEach(name => client.on(name, payload => onEvent({ name, groupId: payload?.groupId, payload })));
    return {
      typing: target => { if (groupId && client.connected) client.emit('comment:typing', { ...target, groupId }); },
      close: () => { if (groupId && client.connected) client.emit('group:leave', { groupId }); client.removeAllListeners(); client.disconnect(); },
    };
  }
}
