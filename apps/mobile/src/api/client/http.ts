import { DataError } from '../contracts/adapter';
export type Fetcher = typeof fetch;
/** Injectable fetch keeps contract tests independent of native modules. No mock fallback. */
export async function httpRequest<T>(baseUrl: string, path: string, token: string | null, method = 'GET', body?: unknown, timeoutMs = 45000, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<T> {
  if (signal?.aborted) throw new DataError('CANCELLED', 'Yêu cầu đã hủy.', 499);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetcher(`${baseUrl}/api${path}`, {
      method, signal: controller.signal,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let result: any;
    try { result = raw ? JSON.parse(raw) : undefined; }
    catch { throw new DataError('INVALID_RESPONSE', 'Máy chủ trả về dữ liệu không đúng JSON.', 502); }
    if (!response.ok) throw new DataError(result?.code || (response.status === 401 ? 'SESSION_EXPIRED' : `HTTP_${response.status}`), result?.error || `Yêu cầu thất bại (${response.status}).`, response.status);
    return result as T;
  } catch (error) {
    if (signal?.aborted) throw new DataError('CANCELLED', 'Yêu cầu đã hủy.', 499);
    if (controller.signal.aborted) throw new DataError('TIMEOUT', 'Máy chủ phản hồi quá lâu. Hãy thử lại.', 408);
    if (error instanceof DataError) throw error;
    throw new DataError('NETWORK', `Chưa kết nối được máy chủ ${baseUrl}. Kiểm tra kết nối trong Cài đặt.`, 0);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
