/**
 * テスト用ヘルパー（Phase 1 の各 worker が使う。T1 の実装を待たずに認証付きリクエストを書ける）。
 *
 *   const { circle, admin, member } = await setupCircle();
 *   const res = await request('/api/events', { cookie: await sessionCookie(member) });
 *
 * - 各 create* は DB に直接 INSERT する（API を通さない）。
 * - ID・circleLoginId・Email は既定で一意な値になるので、テスト間で衝突しない。
 */
import { env } from 'cloudflare:workers';
import type { ApiErrorResponse, Role } from '@minton/types';
import app from '../src/index';
import { getDb } from '../src/datasource/db/client';
import { attendances, circles, events, invitations, members } from '../src/datasource/db/schema';
import { generateToken, hashToken } from '../src/datasource/crypto';
import { newId } from '../src/datasource/id';
import { hashPassword } from '../src/datasource/password';
import { SESSION_COOKIE_NAME } from '../src/application/sessionCookie';
import { createSessionRepository } from '../src/datasource/d1/sessions';
import { webCryptoTokens } from '../src/datasource/crypto';
import { issueSession } from '../src/usecase/session';
import type { AuthMember } from '../src/usecase/ports';
import { addMs, DAY_MS } from '../src/usecase/time';
import { nowUtcIso } from '../src/datasource/clock';

export const db = () => getDb(env.DB);

export const DEFAULT_PASSWORD = 'password1234';
let defaultPasswordHash: Promise<string> | undefined;
const passwordHashFor = (password: string) =>
  password === DEFAULT_PASSWORD
    ? (defaultPasswordHash ??= hashPassword(DEFAULT_PASSWORD))
    : hashPassword(password);

const unique = () => newId().toLowerCase();

export type TestCircle = typeof circles.$inferSelect;
export type TestMember = typeof members.$inferSelect;
export type TestEvent = typeof events.$inferSelect;

export async function createCircle(overrides: Partial<typeof circles.$inferInsert> = {}): Promise<TestCircle> {
  const now = nowUtcIso();
  const row = {
    id: newId(),
    circleLoginId: `circle-${unique()}`,
    name: 'テストサークル',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db().insert(circles).values(row);
  return row;
}

export async function createMember(params: {
  circleId: string;
  role?: Role;
  email?: string;
  displayName?: string;
  /** 平文。既定は DEFAULT_PASSWORD */
  password?: string;
}): Promise<TestMember> {
  const now = nowUtcIso();
  const row = {
    id: newId(),
    circleId: params.circleId,
    email: params.email ?? `user-${unique()}@example.com`,
    displayName: params.displayName ?? 'テストメンバー',
    role: params.role ?? 'member',
    passwordHash: await passwordHashFor(params.password ?? DEFAULT_PASSWORD),
    createdAt: now,
    updatedAt: now,
  } satisfies typeof members.$inferInsert;
  await db().insert(members).values(row);
  return row;
}

export async function createEvent(params: {
  circleId: string;
  createdBy: string;
  title?: string | null;
  /** 既定: 1 日後 */
  startAt?: string;
  /** 既定: startAt の 2 時間後 */
  endAt?: string;
  location?: string;
}): Promise<TestEvent> {
  const now = nowUtcIso();
  const startAt = params.startAt ?? addMs(now, DAY_MS);
  const row = {
    id: newId(),
    circleId: params.circleId,
    title: params.title === undefined ? '練習' : params.title,
    startAt,
    endAt: params.endAt ?? addMs(startAt, 2 * 60 * 60 * 1000),
    location: params.location ?? '市民体育館',
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await db().insert(events).values(row);
  return row;
}

export async function createAttendance(params: {
  circleId: string;
  eventId: string;
  memberId: string;
  status: 'attending' | 'absent';
}) {
  const now = nowUtcIso();
  const row = { id: newId(), ...params, createdAt: now, updatedAt: now };
  await db().insert(attendances).values(row);
  return row;
}

/** Invitation を作り、平文 Token も返す（DB にはハッシュのみ保存） */
export async function createInvitation(params: {
  circleId: string;
  createdBy: string;
  email?: string;
  status?: 'pending' | 'accepted' | 'revoked';
  /** 既定: 7 日後 */
  expiresAt?: string;
}) {
  const token = generateToken();
  const now = nowUtcIso();
  const row = {
    id: newId(),
    circleId: params.circleId,
    email: params.email ?? `invitee-${unique()}@example.com`,
    tokenHash: await hashToken(token),
    status: params.status ?? 'pending',
    expiresAt: params.expiresAt ?? addMs(now, 7 * DAY_MS),
    createdBy: params.createdBy,
    createdAt: now,
    acceptedAt: params.status === 'accepted' ? now : null,
  } satisfies typeof invitations.$inferInsert;
  await db().insert(invitations).values(row);
  return { invitation: row, token };
}

/** ログイン済みの Session を DB に直接作り、Cookie ヘッダの値（"session=..."）を返す */
export async function sessionCookie(member: Pick<TestMember, 'id' | 'circleId'>): Promise<string> {
  const { token } = await issueSession(sessionDeps(), { circleId: member.circleId, memberId: member.id });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** 本番と同じ datasource で Session を発行・検証するための依存 */
export const sessionDeps = () => ({ sessions: createSessionRepository(db()), tokens: webCryptoTokens, now: nowUtcIso });

/** Session Token から有効な Session の Member を返す（無効・期限切れなら null） */
export async function verifySessionToken(token: string): Promise<AuthMember | null> {
  return sessionDeps().sessions.findMemberByTokenHash(await webCryptoTokens.hash(token), nowUtcIso());
}

/** Circle と admin / member を 1 人ずつ作る */
export async function setupCircle(overrides: Partial<typeof circles.$inferInsert> = {}) {
  const circle = await createCircle(overrides);
  const admin = await createMember({ circleId: circle.id, role: 'admin', displayName: '管理者' });
  const member = await createMember({ circleId: circle.id, role: 'member', displayName: 'メンバー' });
  return {
    circle,
    admin,
    member,
    adminCookie: await sessionCookie(admin),
    memberCookie: await sessionCookie(member),
  };
}

/** API へのリクエスト。body はオブジェクトなら JSON にする */
export async function request(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.cookie) headers.Cookie = init.cookie;
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] ??= 'application/json';
    body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  }
  return app.request(`http://localhost${path}`, { method: init.method ?? 'GET', headers, body }, env);
}

/** エラーレスポンスの code を取り出す */
export async function errorCode(res: Response): Promise<string> {
  const json = (await res.json()) as ApiErrorResponse;
  return json.error.code;
}

/** Set-Cookie から session の値を取り出す（無ければ null） */
export function sessionFromSetCookie(res: Response): string | null {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const m = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`));
  return m ? m[1] : null;
}
