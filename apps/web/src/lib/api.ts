/**
 * API クライアント。すべての API 呼び出しはこれを通す（features/<feature>/api.ts から使う）。
 * - パスは @minton/types の apiPaths を使う
 * - Cookie（Session）は同一オリジンで自動送信される（dev は Vite proxy 経由）
 * - エラーは ApiError（code は @minton/types の ErrorCode）として throw する
 */
import type { ApiErrorResponse, ErrorCode, ValidationErrorDetails } from '@minton/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: ValidationErrorDetails;

  constructor(status: number, code: ErrorCode, message: string, details?: ValidationErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isApiError = (e: unknown, code?: ErrorCode): e is ApiError =>
  e instanceof ApiError && (code === undefined || e.code === code);

const NETWORK_ERROR_MESSAGE = '通信に失敗しました。電波状況を確認して再度お試しください';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

/** JSON API を呼ぶ。204 のときは undefined を返す */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'INTERNAL_ERROR', NETWORK_ERROR_MESSAGE);
  }

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (json as Partial<ApiErrorResponse> | null)?.error;
    if (err && typeof err.code === 'string' && typeof err.message === 'string') {
      throw new ApiError(res.status, err.code, err.message, err.details);
    }
    throw new ApiError(res.status, 'INTERNAL_ERROR', 'サーバーでエラーが発生しました');
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiFetch<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  delete: <T = void>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** 画面に出すエラーメッセージ（ApiError 以外は汎用文言） */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'エラーが発生しました';
}
