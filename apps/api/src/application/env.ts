import type { Usecases } from '../usecase';
import type { AuthMember } from '../usecase/ports';

export type { AuthMember };

/** Cloudflare Workers のバインディング / 環境変数 / Secret（composition.ts が datasource の組み立てに使う） */
export type Bindings = {
  DB: D1Database;
  /**
   * "1" なら招待メールを実送信せず招待 URL をログに出す（開発環境用: C7 / C23）。
   * `.dev.vars` にだけ置き、wrangler.jsonc の vars・本番には置かない
   */
  DEV_MAIL_LOG?: string;
  /** Resend の API キー（Secret）。DEV_MAIL_LOG も RESEND_API_KEY も無ければ招待メールは送信エラー（C23 / C16） */
  RESEND_API_KEY?: string;
  /** 招待メールの送信元アドレス（vars）。RESEND_API_KEY 設定時に未設定なら送信エラー */
  MAIL_FROM?: string;
  /** 招待 URL の基準となる web のオリジン（vars。例: https://example.com）。未設定なら招待作成はエラー */
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
