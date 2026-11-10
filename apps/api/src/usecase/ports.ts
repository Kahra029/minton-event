/**
 * 複数の機能で共有する port（usecase が使う外部依存のインターフェース）。実装は datasource/、組み立ては composition.ts。
 * 機能固有の port（Repository など）は各 usecase/<feature>.ts に置く。port は usecase が実際に使うものだけを持つ。
 */
import type { Role } from '@minton/types';

/** ログイン中の Member（Session から解決したもの） */
export type AuthMember = {
  id: string;
  circleId: string;
  role: Role;
};

/** 現在時刻（UTC ISO 文字列） */
export type Now = () => string;

/** 主キー用の ID（ULID） */
export type NewId = () => string;

/** Session / Invitation の Token。平文は Cookie / URL にだけ載せ、DB にはハッシュだけを保存する */
export interface TokenService {
  /** 推測困難な乱数 Token（256 bit） */
  generate(): string;
  /** DB 保存用のハッシュ */
  hash(token: string): Promise<string>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** storedHash が null（該当 Member なし）でも同じ計算をして false を返す（時間差を作らない） */
  verify(password: string, storedHash: string | null): Promise<boolean>;
}

/** 構造化ログ 1 行（application/logger.ts の log） */
export type LogFn = (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => void;

/** リクエスト単位のログ（guardrails §13）。秘密情報（Password / Token / Session）を渡さない */
export interface RequestLogger {
  /** 1 リクエスト 1 行のリクエストログに操作対象などを追加する */
  addContext(fields: { circleId?: string; memberId?: string; eventId?: string; invitationId?: string }): void;
  /** requestId 付きのエラーログを出す */
  error(message: string, fields?: Record<string, unknown>): void;
}
