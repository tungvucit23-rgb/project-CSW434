import { useEffect, useState } from 'react';
import { forecastIdentity, request } from '../api';
import type { WeatherSummary } from '../types';
const cache = new Map<string, { until: number; promise: Promise<WeatherSummary> }>();
export function useForecast(path: string | null, token: string | null, scope: string) {
  const [state, setState] = useState<{ data: WeatherSummary | null; loading: boolean; error: string }>({ data: null, loading: false, error: '' });
  const [attempt, setAttempt] = useState(0);
  const key = `${forecastIdentity()}:${token}:${path}:${scope}`;
  useEffect(() => {
    let active = true;
    if (!path || !token) { setState({ data: null, loading: false, error: '' }); return; }
    setState({ data: null, loading: true, error: '' });
    let entry = cache.get(key);
    if (!entry || entry.until <= Date.now()) {
      const promise = request<WeatherSummary>(path, token);
      entry = { until: Date.now() + 60000, promise }; cache.set(key, entry);
      promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
      while (cache.size > 20) cache.delete(cache.keys().next().value!);
    }
    entry.promise.then(data => { if (active) setState({ data, loading: false, error: '' }); }).catch(e => { if (active) setState({ data: null, loading: false, error: e.message }); });
    return () => { active = false; };
  }, [key, attempt]);
  return { ...state, retry: () => { cache.delete(key); setAttempt(n => n + 1); } };
}
