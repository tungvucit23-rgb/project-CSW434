import { useEffect, useState } from 'react';
import { cacheIdentity, request } from '../api';
import type { Place } from '../types';
const entries = new Map<string, { time: number; promise: Promise<Place[]> }>();
export function useCatalog(cityId: string, token: string | null) {
  const [state, setState] = useState<{ places: Place[]; loading: boolean; error: string }>({ places: [], loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const key = `${cacheIdentity()}:${token}:${cityId}`;
    let entry = entries.get(key);
    setState({ places: [], loading: true, error: '' });
    if (!entry || Date.now() - entry.time > 300000) {
      const promise = request<Place[]>(`/places?cityId=${encodeURIComponent(cityId)}`, token);
      entry = { time: Date.now(), promise }; entries.set(key, entry);
      while (entries.size > 20) entries.delete(entries.keys().next().value!);
      promise.catch(() => { if (entries.get(key)?.promise === promise) entries.delete(key); });
    }
    entry.promise.then(places => { if (active) setState({ places, loading: false, error: '' }); })
      .catch(e => { if (active) setState({ places: [], loading: false, error: e.message }); });
    return () => { active = false; };
  }, [cityId, token, attempt, cacheIdentity()]);
  return { ...state, retry: () => { entries.delete(`${cacheIdentity()}:${token}:${cityId}`); setAttempt(n => n + 1); } };
}
