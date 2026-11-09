import type { Usecases } from '../usecase';
import type { AuthMember } from '../usecase/ports';

export type { AuthMember };

/** Cloudflare Workers のバインディング / 環境変数 / Secret（composition.ts が datasource の組み立てに使う） */
export type Bindings = {
  DB: D1Database;
  /** 試行回数制限（C33 / C34）。wrangler.jsonc の ratelimits（60 秒あたり 10 回） */
  AUTH_RATE_LIMITER: RateLimit;
  /** 招待 URL の基準（vars。C17 / C30: https://minton-event-api.<account>.workers.dev）。未設定なら招待作成はエラー */
  APP_BASE_URL?: string;
};

export type Variables = {
  /** requireAuth / requireAdmin 通過後のみ存在する */
  member: AuthMember;
  /** リクエストごとの ID（ログの相関用） */
  requestId: string;
  /** ログに載せる操作対象など（application/logger.ts の setLogContext で追加） */
  logContext: Record<string, unknown>;
  /** リクエストごとに composition root が組み立てた usecase（middleware/usecases.ts） */
  usecases: Usecases;
};

/** Hono の型パラメータ。すべての route で共有する */
export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
