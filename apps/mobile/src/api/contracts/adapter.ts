/** The transport seam shared by existing Phase 1/2 screens and new screens. */
export type DataSource = 'mock' | 'api';
export type MockScenario = 'normal' | 'empty' | 'offline' | 'expired' | 'missing-weather' | 'rain-change' | 'slow';
export type ConnectionState = 'local' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type DataEvent = { name: string; groupId?: string; payload?: unknown };
export type SubscriptionOptions = {
  token: string;
  groupId: string | null;
  onEvent: (event: DataEvent) => void;
  onStatus: (state: ConnectionState) => void;
};
export type DataSubscription = {
  close: () => void;
  typing: (target: { placeId?: string; planId?: string; typing: boolean }) => void;
};
export interface DataAdapter {
  readonly source: DataSource;
  request<T>(path: string, token: string | null, method?: string, body?: unknown, timeoutMs?: number, signal?: AbortSignal): Promise<T>;
  subscribe(options: SubscriptionOptions): DataSubscription;
}
export type Preferences = { categories: string[]; environmentPreference: 'ANY' | 'INDOOR' | 'OUTDOOR'; travelStyles: string[] };
export type AuthResult = { token: string; user: import('../../types').User };
export type AuthInput = { name?: string; email: string; password: string };
export type PasswordResetInput = { email: string };
export type ChangePasswordInput = { currentPassword: string; newPassword: string };
export type ActionResult = { ok: true; message: string };
export class DataError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = 'DataError'; }
}
