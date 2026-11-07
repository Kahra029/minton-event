import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';
import type { AppEnv } from '../env';
import { log } from '../logger';
import type { NewId } from '../../usecase/ports';

/**
 * 1 リクエスト 1 行の構造化ログ（guardrails §13）。
 * 出す: requestId, method, route（パターン）, params（token は除く）, status, durationMs,
 *       circleId / memberId（ログイン時）, errorCode（エラー時）, timestamp
 * 出さない: 実パス・クエリ・ボディ・Cookie・ヘッダ（Token / Password を含みうるため）
 * requestId は ULID（newId は composition root から渡す）。
 */
export const requestLogger = (newId: NewId) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const start = Date.now();
    c.set('requestId', newId());
    c.set('logContext', {});
    await next();
    let route: string | undefined;
    let params: Record<string, string> = {};
    try {
      route = routePath(c, -1);
      params = c.req.param() as Record<string, string>;
    } catch {
      // ルートにマッチしなかった場合など
    }
    const { token: _token, ...safeParams } = params;
    void _token;
    log(c.res.status >= 500 ? 'error' : 'info', 'request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      route,
      params: safeParams,
      status: c.res.status,
      durationMs: Date.now() - start,
      ...c.get('logContext'),
    });
  });
