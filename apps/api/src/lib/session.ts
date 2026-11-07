/**
 * Session（decisions A2 / C1）
 * - Token は 256 bit の乱数。Cookie にのみ平文で載せ、DB には SHA-256 ハッシュを保存する。
 * - Session は Circle ID を持つ。検証時は「Session の circle_id = Member の circle_id」で結合する。
 * - 有効期限は 30 日固定。アクセスによる延長はしない（C1）。
 * - Cookie: HttpOnly / SameSite=Lax / Path=/ / Secure（https のとき）。
 *
 * T1（login / logout / me）と T4（招待からの初回登録後のログイン: C9）が使う。
 */
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { and, eq, gt } from 'drizzle-orm';
import type { AppEnv, AuthMember } from '../bindings';
import type { DB } from '../db/client';
import { members, sessions } from '../db/schema';
import { generateToken, hashToken } from './crypto';
import { addMs, DAY_MS, nowUtcIso } from './time';

export const SESSION_COOKIE_NAME = 'session';
/** Session の有効期限（decisions C1: 30 日固定、延長なし） */
export const SESSION_TTL_MS = 30 * DAY_MS;

/** Session を DB に作り、平文 Token を返す（Cookie は設定しない。テストヘルパーからも使う） */
export async function issueSession(
  db: DB,
  params: { circleId: string; memberId: string },
): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken();
  const now = nowUtcIso();
  const expiresAt = addMs(now, SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: await hashToken(token),
    circleId: params.circleId,
    memberId: params.memberId,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

/** Session を作成して Cookie を設定する（ログイン成功時・招待からの初回登録時） */
export async function createSession(
  c: Context<AppEnv>,
  db: DB,
  params: { circleId: string; memberId: string },
): Promise<void> {
  const { token } = await issueSession(db, params);
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** リクエストの Session を DB から削除し Cookie を消す（ログアウト）。Session が無くてもエラーにしない */
export async function destroySession(c: Context<AppEnv>, db: DB): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: isHttps(c), httpOnly: true, sameSite: 'Lax' });
}

/**
 * Token から有効な Session の Member を返す。無効・期限切れ・Member が消えている場合は null。
 * Member は Session と同じ Circle のものに限る（複合 FK でも保証しているが、クエリでも絞る）。
 */
export async function verifySessionToken(db: DB, token: string): Promise<AuthMember | null> {
  if (!token) return null;
  const rows = await db
    .select({ id: members.id, circleId: members.circleId, role: members.role })
    .from(sessions)
    .innerJoin(members, and(eq(members.id, sessions.memberId), eq(members.circleId, sessions.circleId)))
    .where(and(eq(sessions.tokenHash, await hashToken(token)), gt(sessions.expiresAt, nowUtcIso())))
    .limit(1);
  return rows[0] ?? null;
}

/** リクエストの Cookie から Session を検証する */
export async function getSessionMember(c: Context<AppEnv>, db: DB): Promise<AuthMember | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  return token ? verifySessionToken(db, token) : null;
}

function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:';
}
