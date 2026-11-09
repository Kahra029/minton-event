/**
 * 試行回数制限（C33）の実装。usecase の RateLimiter を Workers Rate Limiting バインディングで実装する。
 * 上限・期間は wrangler.jsonc の ratelimits（AUTH_RATE_LIMITER: 60 秒あたり 10 回）。
 */
import type { RateLimiter } from '../usecase/rateLimit';

export function createWorkersRateLimiter(binding: RateLimit): RateLimiter {
  return async (key) => (await binding.limit({ key })).success;
}
