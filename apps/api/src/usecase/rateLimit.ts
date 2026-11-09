/**
 * 試行回数制限（decisions C33 / C34）。POST /api/auth/login と招待の受け入れ（POST /api/invitations/:token/accept）が対象。
 * - IP 単位。login と招待の受け入れは別々に数える（key `login:<IP>` / `accept:<IP>`）
 * - IP が分からないときは `unknown` として数える（制限を外さない）
 * - 成功・失敗を問わず全リクエストを数え、超えたら 429 TOO_MANY_REQUESTS
 * 上限と期間（60 秒あたり 10 回）は datasource 側の設定（wrangler.jsonc の ratelimits）で決まる。
 */
import { tooManyRequests } from './errors';

export type RateLimitAction = 'login' | 'accept';

/** key ごとの回数を 1 つ数え、上限内なら true を返す */
export type RateLimiter = (key: string) => Promise<boolean>;

export type RateLimitDeps = { limiter: RateLimiter };

export function rateLimitKey(action: RateLimitAction, ip: string | null): string {
  return `${action}:${ip?.trim() || 'unknown'}`;
}

export function createRateLimitUsecase(deps: RateLimitDeps) {
  return {
    /** 上限を超えていたら 429 を throw する */
    async check(action: RateLimitAction, ip: string | null): Promise<void> {
      if (!(await deps.limiter(rateLimitKey(action, ip)))) throw tooManyRequests();
    },
  };
}

export type RateLimitUsecase = ReturnType<typeof createRateLimitUsecase>;
