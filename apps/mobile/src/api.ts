import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ApiDataAdapter } from './api/adapters/ApiDataAdapter';
import { MockDataAdapter } from './api/adapters/MockDataAdapter';
import { DataError, type DataSource, type MockScenario, type SubscriptionOptions } from './api/contracts/adapter';

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return Platform.OS === "web"
        ? window.localStorage.getItem(key)
        : await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string) {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === "web") window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
const defaultHost =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.hostname
    : Platform.OS === "android"
      ? "10.0.2.2"
      : "localhost";
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL || `http://${defaultHost}:4000`;
export let apiUrl = DEFAULT_API_URL;
export function setApiUrl(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Địa chỉ API cần là URL HTTP(S), không chứa tài khoản, truy vấn hoặc hash.');
  apiUrl = value
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api$/, "");
}

export let dataSource: DataSource = process.env.EXPO_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';
export const developmentControls = typeof __DEV__ !== 'undefined' && __DEV__;
const mock = new MockDataAdapter();
const api = new ApiDataAdapter(() => apiUrl);
let generation = 0;
let weatherGeneration = 0;
const expiredListeners = new Set<() => void>();
export const cacheIdentity = () => `${dataSource}:${apiUrl}:${generation}`;
export const forecastIdentity = () => `${cacheIdentity()}:${weatherGeneration}`;
export const mockScenario = () => mock.getScenario();
export function setMockScenario(scenario: MockScenario, reset = false) { mock.setScenario(scenario, reset); generation++; }
export function setDataSource(source: DataSource) { dataSource = source; generation++; }
export const subscribeData = (options: SubscriptionOptions) => (dataSource === 'mock' ? mock : api).subscribe({ ...options, onEvent: event => {
  if (event.name === 'weather:updated' || event.name === 'resync') weatherGeneration++;
  options.onEvent(event);
} });
export function onSessionExpired(listener: () => void) { expiredListeners.add(listener); return () => { expiredListeners.delete(listener); }; }

export async function request<T>(
  path: string,
  token: string | null,
  method = "GET",
  body?: unknown,
  timeoutMs = 45000,
  signal?: AbortSignal,
): Promise<T> {
  const adapter = dataSource === 'mock' ? mock : api;
  try {
    const result = await adapter.request<T>(path, token, method, body, timeoutMs, signal);
    if (method !== 'GET' && /\/(weather\/check|demo\/rain)$/.test(path)) weatherGeneration++;
    return result;
  } catch (error) {
    if (error instanceof DataError && error.status === 401 && token && !path.startsWith('/auth/change-password')) for (const listener of expiredListeners) listener();
    throw error;
  }
}
