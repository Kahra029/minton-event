import type { Context } from 'hono';
import type { LogFn, RequestLogger } from '../usecase/ports';
import type { AppEnv } from './env';

/**
 * 構造化ログ（JSON 1 行）。guardrails §13:
 * API・Circle・操作対象・Error 種別・発生時刻を追えること / Password・Token・Session を出さないこと。
 *
 * - リクエストログは application/middleware/requestLogger.ts が 1 リクエスト 1 行で出す。
 *   route は「パターン」（例: /api/invitations/:token）を出し、実パスは出さない（Token を含みうるため）。
 * - 操作対象を追加したいときは setLogContext(c, { eventId }) を呼ぶ。
 * - キー名が SECRET_KEY_PATTERN に一致する値は自動で [REDACTED] にする。
 */
export type LogLevel = 'info' | 'warn' | 'error';

const SECRET_KEY_PATTERN = /pass(word)?|token|secret|session|cookie|authorization|hash|api[-_]?key/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

export const log: LogFn = (level: LogLevel, message: string, fields: Record<string, unknown> = {}): void => {
  const entry = { level, message, timestamp: new Date().toISOString(), ...(redact(fields) as object) };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

/** リクエストログに載せる項目を追加する（操作対象の ID など。秘密情報は渡さない） */
export function setLogContext(c: Context<AppEnv>, fields: Record<string, unknown>): void {
  c.set('logContext', { ...(c.get('logContext') ?? {}), ...fields });
}

/** 予期しない例外のログ。stack はサーバーログにのみ出す（Client には返さない） */
export function logError(c: Context<AppEnv>, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  log('error', 'unhandled_error', {
    requestId: c.get('requestId'),
    method: c.req.method,
    route: c.req.routePath,
    circleId: c.get('member')?.circleId,
    memberId: c.get('member')?.id,
    errorName: e.name,
    errorMessage: e.message,
    stack: e.stack,
  });
}

/** usecase に渡す RequestLogger（middleware/usecases.ts が composition root に渡す） */
export function requestLoggerFor(c: Context<AppEnv>): RequestLogger {
  return {
    addContext: (fields) => setLogContext(c, fields),
    error: (message, fields = {}) => log('error', message, { requestId: c.get('requestId'), ...fields }),
  };
}
