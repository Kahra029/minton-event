import { createMiddleware } from 'hono/factory';
import type { RateLimitAction } from '../../usecase/rateLimit';
import type { AppEnv } from '../env';

/**
 * 試行回数制限（C33 / C34）。IP は Cloudflare が付ける CF-Connecting-IP から取る（無ければ usecase が unknown として数える）。
 * 超えたら 429 TOO_MANY_REQUESTS。ボディ・Token の検証より前に置く（全リクエストを数える）。
 * IP はログに出さない。
 */
export function rateLimit(action: RateLimitAction) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await c.get('usecases').rateLimit.check(action, c.req.header('CF-Connecting-IP') ?? null);
    await next();
  });
}
