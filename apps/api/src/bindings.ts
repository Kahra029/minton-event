import type { Role } from '@minton/types';

/** Cloudflare Workers のバインディング / 環境変数 / Secret */
export type Bindings = {
  DB: D1Database;
  /** Resend の API キー（Secret）。未設定なら dev 扱いで実送信しない（A4 / C7。利用は T4） */
  RESEND_API_KEY?: string;
  /** 招待メールの送信元アドレス（vars）。RESEND_API_KEY 設定時に未設定なら送信エラー（T4） */
  MAIL_FROM?: string;
  /** 招待 URL の基準となる web のオリジン（vars。例: https://example.com）。未設定なら招待作成はエラー（T4） */
  APP_BASE_URL?: string;
};

/** requireAuth が c.var.member にセットするログイン中の Member */
export type AuthMember = {
  id: string;
  circleId: string;
  role: Role;
};

export type Variables = {
  /** requireAuth / requireAdmin 通過後のみ存在する */
  member: AuthMember;
  /** リクエストごとの ID（ログの相関用） */
  requestId: string;
  /** ログに載せる操作対象など（lib/logger.ts の setLogContext で追加） */
  logContext: Record<string, unknown>;
};

/** Hono の型パラメータ。すべての route で共有する */
export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
