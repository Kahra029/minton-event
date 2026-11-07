/**
 * Session（decisions A2 / C1）
 * - Token は 256 bit の乱数。Cookie にのみ平文で載せ、DB にはハッシュを保存する。
 * - Session は Circle ID を持つ。検証時は「Session の circle_id = Member の circle_id」で結合する（datasource）。
 * - 有効期限は 30 日固定。アクセスによる延長はしない（C1）。
 * Cookie の読み書きは application/sessionCookie.ts。
 */
import type { AuthMember, Now, TokenService } from './ports';
import { addMs, DAY_MS } from './time';

/** Session の有効期限（decisions C1: 30 日固定、延長なし） */
export const SESSION_TTL_MS = 30 * DAY_MS;

export interface SessionRepository {
  insert(session: { tokenHash: string; circleId: string; memberId: string; expiresAt: string; createdAt: string }): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** 有効期限内の Session の Member（Session と同じ Circle の Member に限る）。無ければ null */
  findMemberByTokenHash(tokenHash: string, now: string): Promise<AuthMember | null>;
}

export type SessionDeps = { sessions: SessionRepository; tokens: TokenService; now: Now };

/** Session を作り、平文 Token を返す（ログイン成功時・招待からの初回登録時: C9。テストヘルパーからも使う） */
export async function issueSession(
  deps: SessionDeps,
  params: { circleId: string; memberId: string },
): Promise<{ token: string; expiresAt: string }> {
  const token = deps.tokens.generate();
  const now = deps.now();
  const expiresAt = addMs(now, SESSION_TTL_MS);
  await deps.sessions.insert({
    tokenHash: await deps.tokens.hash(token),
    circleId: params.circleId,
    memberId: params.memberId,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}
