import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { INVITATION_INVALID_MESSAGE, type ApiErrorResponse, type MeResponse } from '@minton/types';
import app from '../../src/index';
import { invitations, members } from '../../src/datasource/db/schema';
import { hashToken } from '../../src/datasource/crypto';
import { addMs, DAY_MS } from '../../src/usecase/time';
import { nowUtcIso } from '../../src/datasource/clock';
import {
  createInvitation,
  createMember,
  db,
  errorCode,
  request,
  sessionFromSetCookie,
  sendUntilLimited,
  setupCircle,
  uniqueIp,
  verifySessionToken,
} from '../helpers';

afterEach(() => vi.restoreAllMocks());

function captureLogs() {
  const lines: string[] = [];
  const push = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(push);
  vi.spyOn(console, 'warn').mockImplementation(push);
  vi.spyOn(console, 'error').mockImplementation(push);
  return lines;
}

const tokenFromUrl = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').pop()!);

const APP_BASE_URL = 'https://app.example.test';

/** 招待作成。env は wrangler.jsonc の vars（空）に APP_BASE_URL を上書きして渡す */
const invite = (
  cookie: string,
  email: string,
  envOverrides: Record<string, string | undefined> = {},
  headers: Record<string, string> = {},
) =>
  app.request(
    'http://localhost/api/invitations',
    {
      method: 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ email }),
    },
    { ...env, APP_BASE_URL, ...envOverrides },
  );

type CreateBody = { invitation: Record<string, string>; invitationUrl: string };

const accept = (token: string, body: Record<string, unknown>, ip?: string | null) =>
  request(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body, ip });

const validAccept = { displayName: '新メンバー', password: 'newpassword1', passwordConfirmation: 'newpassword1' };

async function invitationRows(circleId: string, email: string) {
  return db()
    .select()
    .from(invitations)
    .where(and(eq(invitations.circleId, circleId), eq(invitations.email, email)));
}

async function memberCount(circleId: string) {
  return (await db().select({ id: members.id }).from(members).where(eq(members.circleId, circleId))).length;
}

describe('POST /api/invitations（AC-13 / AC-14 / C31）', () => {
  it('AC-13: admin が招待を作成でき、Circle に紐づき、Token はハッシュで保存され、招待 URL はレスポンスにだけ載る', async () => {
    const { circle, admin, adminCookie } = await setupCircle();
    const lines = captureLogs();
    const res = await invite(adminCookie, '  Invitee@Example.COM ');
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateBody;
    expect(body.invitation).toMatchObject({ email: 'invitee@example.com', status: 'pending' });

    const [row] = await invitationRows(circle.id, 'invitee@example.com');
    expect(row).toMatchObject({ id: body.invitation.id, circleId: circle.id, createdBy: admin.id, status: 'pending' });

    // 有効期限 7 日（B2）
    const ttl = Date.parse(row.expiresAt) - Date.parse(row.createdAt);
    expect(ttl).toBe(7 * DAY_MS);

    // 招待 URL は APP_BASE_URL から作る（C17）
    expect(body.invitationUrl).toMatch(/^https:\/\/app\.example\.test\/invitations\/[^/]+$/);
    const token = tokenFromUrl(body.invitationUrl);
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bit の base64url
    expect(row.tokenHash).toBe(await hashToken(token));
    expect(row.tokenHash).not.toBe(token);

    // Token / 招待 URL はログに出さない
    const all = lines.join('\n');
    expect(all).not.toContain(token);
    expect(all).not.toContain(body.invitationUrl);

    // 招待 URL で招待情報が引ける
    expect((await request(new URL(body.invitationUrl).pathname.replace('/invitations/', '/api/invitations/'))).status).toBe(200);
  });

  it('メンバー一覧には Token / 招待 URL を返さない（C31: 再表示できない）', async () => {
    const { adminCookie } = await setupCircle();
    captureLogs();
    const { invitationUrl } = (await (await invite(adminCookie, 'list@example.com')).json()) as CreateBody;
    const list = await (await request('/api/members', { cookie: adminCookie })).text();
    expect(list).toContain('list@example.com');
    expect(list).not.toContain(tokenFromUrl(invitationUrl));
    expect(list).not.toMatch(/token|invitations\//i);
  });

  it('AC-14: member は 403 で、Invitation は作られない', async () => {
    const { circle, memberCookie } = await setupCircle();
    const res = await invite(memberCookie, 'x@example.com');
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN');
    expect(await invitationRows(circle.id, 'x@example.com')).toHaveLength(0);
  });

  it('未ログインは 401', async () => {
    const res = await invite('', 'x@example.com');
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('Email の形式が不正なら 400', async () => {
    const { adminCookie } = await setupCircle();
    const res = await invite(adminCookie, 'not-an-email');
    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiErrorResponse;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details?.fieldErrors?.email).toBeDefined();
  });

  it('B4: 同じ Email に再招待すると前の pending は revoked になり、前の Token は使えない', async () => {
    const { circle, adminCookie } = await setupCircle();
    const first = (await (await invite(adminCookie, 'again@example.com')).json()) as CreateBody;
    const firstToken = tokenFromUrl(first.invitationUrl);
    expect((await invite(adminCookie, 'again@example.com')).status).toBe(201);

    const rows = await invitationRows(circle.id, 'again@example.com');
    expect(rows.map((r) => r.status).sort()).toEqual(['pending', 'revoked']);
    expect((await request(`/api/invitations/${firstToken}`)).status).toBe(404);
  });

  it('B4: 別 Circle の同じ Email の pending は無効化しない', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const { invitation } = await createInvitation({ circleId: b.circle.id, createdBy: b.admin.id, email: 'both@example.com' });
    expect((await invite(a.adminCookie, 'both@example.com')).status).toBe(201);
    const [row] = await invitationRows(b.circle.id, 'both@example.com');
    expect(row).toMatchObject({ id: invitation.id, status: 'pending' });
  });

  it('B5: 同じ Circle に同じ Email の Member がいれば 409（大文字・空白も正規化して照合）', async () => {
    const { circle, adminCookie } = await setupCircle();
    await createMember({ circleId: circle.id, email: 'exists@example.com' });
    const res = await invite(adminCookie, ' EXISTS@example.com');
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CONFLICT');
    expect(await invitationRows(circle.id, 'exists@example.com')).toHaveLength(0);
  });

  it('別 Circle の Member と同じ Email なら招待できる（複数 Circle 所属は許容）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const res = await invite(a.adminCookie, b.member.email);
    expect(res.status).toBe(201);
  });

  it('招待 URL は APP_BASE_URL から作り、Host / Origin ヘッダーは使わない（末尾の / は除く）', async () => {
    const { adminCookie } = await setupCircle();
    const res = await invite(
      adminCookie,
      'host@example.com',
      { APP_BASE_URL: 'https://app.example.test/' },
      { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' },
    );
    expect(res.status).toBe(201);
    expect(((await res.json()) as CreateBody).invitationUrl).toMatch(/^https:\/\/app\.example\.test\/invitations\/[^/]+$/);
  });

  it('APP_BASE_URL 未設定なら 500 で、Invitation は作らない', async () => {
    const { circle, adminCookie } = await setupCircle();
    const lines = captureLogs();
    const res = await invite(adminCookie, 'nobase@example.com', { APP_BASE_URL: '' });
    expect(res.status).toBe(500);
    expect(await errorCode(res)).toBe('INTERNAL_ERROR');
    expect(await invitationRows(circle.id, 'nobase@example.com')).toHaveLength(0);
    expect(lines.some((l) => l.includes('app_base_url_not_configured'))).toBe(true);
  });
});

describe('GET /api/invitations/:token', () => {
  it('有効な Token なら Circle 名と招待先 Email を返す', async () => {
    const { circle, admin } = await setupCircle({ name: '月曜バド' });
    const { invitation, token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const res = await request(`/api/invitations/${token}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ circleName: '月曜バド', email: invitation.email });
  });

  it.each([
    ['存在しない', null],
    ['accepted 済み', { status: 'accepted' as const }],
    ['revoked', { status: 'revoked' as const }],
    ['期限切れ', { expiresAt: addMs(nowUtcIso(), -1000) }],
  ])('%s の Token は 404「この招待URLは無効です」（C11）', async (_label, overrides) => {
    const { circle, admin } = await setupCircle();
    const token = overrides
      ? (await createInvitation({ circleId: circle.id, createdBy: admin.id, ...overrides })).token
      : 'no-such-token';
    const res = await request(`/api/invitations/${token}`);
    expect(res.status).toBe(404);
    const json = (await res.json()) as ApiErrorResponse;
    expect(json.error).toEqual({ code: 'NOT_FOUND', message: INVITATION_INVALID_MESSAGE });
  });
});

describe('POST /api/invitations/:token/accept（AC-15 / AC-16 / AC-17）', () => {
  it('AC-13〜15: admin の招待 → 表示された URL から登録 → Member 作成・Circle 所属・accepted・ログイン状態・一覧で確認', async () => {
    const { circle, adminCookie } = await setupCircle();
    const lines = captureLogs();
    const createdRes = await invite(adminCookie, 'flow@example.com');
    expect(createdRes.status).toBe(201);
    const token = tokenFromUrl(((await createdRes.json()) as CreateBody).invitationUrl);

    // 登録前: メンバー一覧に招待状態が出る
    const before = (await (await request('/api/members', { cookie: adminCookie })).json()) as {
      invitations: { email: string; status: string }[];
    };
    expect(before.invitations).toContainEqual(expect.objectContaining({ email: 'flow@example.com', status: 'pending' }));

    lines.length = 0;
    const res = await accept(token, validAccept);
    expect(res.status).toBe(201);
    const me = (await res.json()) as MeResponse;
    expect(me.member).toMatchObject({ email: 'flow@example.com', displayName: '新メンバー', role: 'member' });
    expect(me.circle).toMatchObject({ id: circle.id, circleLoginId: circle.circleLoginId, name: circle.name });

    // Member が Invitation の Circle に作成されている
    const created = await db().query.members.findFirst({
      where: and(eq(members.circleId, circle.id), eq(members.email, 'flow@example.com')),
    });
    expect(created).toMatchObject({ id: me.member.id, role: 'member', displayName: '新メンバー' });
    expect(created!.passwordHash).not.toContain('newpassword1');

    // Invitation = accepted
    const [inv] = await invitationRows(circle.id, 'flow@example.com');
    expect(inv.status).toBe('accepted');
    expect(inv.acceptedAt).not.toBeNull();

    // ログイン状態（Session Cookie が発行され、その Circle の Member として有効）
    const session = sessionFromSetCookie(res);
    expect(session).toBeTruthy();
    expect(await verifySessionToken(session!)).toEqual({ id: me.member.id, circleId: circle.id, role: 'member' });
    // Circle 利用可能: 認証必須 API が通る（member なので admin 専用は 403）
    expect((await request('/api/members', { cookie: `session=${session}` })).status).toBe(403);

    // 登録後: 一覧では Member として出て、Invitation は出ない（C6）
    const after = (await (await request('/api/members', { cookie: adminCookie })).json()) as {
      members: { email: string }[];
      invitations: { email: string }[];
    };
    expect(after.members.map((m) => m.email)).toContain('flow@example.com');
    expect(after.invitations.map((i) => i.email)).not.toContain('flow@example.com');

    // ログに Token・Password・Session が出ていない
    const all = lines.join('\n');
    expect(all).not.toContain(token);
    expect(all).not.toContain('newpassword1');
    expect(all).not.toContain(session!);
  });

  it('AC-16: リクエストに別の Email を混ぜても Invitation の Email で作成される', async () => {
    const { circle, admin } = await setupCircle();
    const { invitation, token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const res = await accept(token, { ...validAccept, email: 'hijack@example.com' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as MeResponse).member.email).toBe(invitation.email);
    const hijacked = await db().query.members.findFirst({ where: eq(members.email, 'hijack@example.com') });
    expect(hijacked).toBeUndefined();
  });

  it('AC-17: accepted 済みの Token を再利用しても新しい Member は作られない', async () => {
    const { circle, admin } = await setupCircle();
    const { token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    expect((await accept(token, validAccept)).status).toBe(201);
    const count = await memberCount(circle.id);

    const res = await accept(token, { ...validAccept, displayName: '二人目' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorResponse).error.message).toBe(INVITATION_INVALID_MESSAGE);
    expect(sessionFromSetCookie(res)).toBeNull();
    expect(await memberCount(circle.id)).toBe(count);
  });

  it.each([
    ['accepted 済み', { status: 'accepted' as const }],
    ['revoked', { status: 'revoked' as const }],
    ['期限切れ', { expiresAt: addMs(nowUtcIso(), -1000) }],
  ])('AC-17: %s の Token では登録できず Member は増えない', async (_label, overrides) => {
    const { circle, admin } = await setupCircle();
    const { invitation, token } = await createInvitation({ circleId: circle.id, createdBy: admin.id, ...overrides });
    const count = await memberCount(circle.id);
    const res = await accept(token, validAccept);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('NOT_FOUND');
    expect(sessionFromSetCookie(res)).toBeNull();
    expect(await memberCount(circle.id)).toBe(count);
    const [row] = await invitationRows(circle.id, invitation.email);
    expect(row.status).toBe(invitation.status);
  });

  it('存在しない Token は 404', async () => {
    const res = await accept('no-such-token', validAccept);
    expect(res.status).toBe(404);
  });

  it('同時に 2 回登録しても Member は 1 人だけ', async () => {
    const { circle, admin } = await setupCircle();
    const { token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const count = await memberCount(circle.id);
    const results = await Promise.all([accept(token, validAccept), accept(token, validAccept)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    // 後着は「Token 使用済み」(404) か「Member 既存」(409)。どちらでも Member は増えない
    expect([404, 409]).toContain(statuses[1]);
    expect(await memberCount(circle.id)).toBe(count + 1);
  });

  it('同じ Circle + Email の Member が既にいれば 409（C11）で、Invitation は pending のまま', async () => {
    const { circle, admin } = await setupCircle();
    const { invitation, token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    await createMember({ circleId: circle.id, email: invitation.email });
    const res = await accept(token, validAccept);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CONFLICT');
    const [row] = await invitationRows(circle.id, invitation.email);
    expect(row.status).toBe('pending');
  });

  it.each([
    ['Display Name 未入力', { ...validAccept, displayName: '   ' }, 'displayName'],
    ['Display Name 51 文字', { ...validAccept, displayName: 'あ'.repeat(51) }, 'displayName'],
    ['Password 7 文字', { ...validAccept, password: 'short12', passwordConfirmation: 'short12' }, 'password'],
    ['Password 129 文字', { ...validAccept, password: 'a'.repeat(129), passwordConfirmation: 'a'.repeat(129) }, 'password'],
    ['Password 確認の不一致', { ...validAccept, passwordConfirmation: 'different1' }, 'passwordConfirmation'],
  ])('%s は 400 で Member は作られない', async (_label, body, field) => {
    const { circle, admin } = await setupCircle();
    const { invitation, token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const count = await memberCount(circle.id);
    const res = await accept(token, body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiErrorResponse;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details?.fieldErrors?.[field]).toBeDefined();
    expect(await memberCount(circle.id)).toBe(count);
    const [row] = await invitationRows(circle.id, invitation.email);
    expect(row.status).toBe('pending');
  });

  it('Display Name の前後空白は除いて保存する', async () => {
    const { circle, admin } = await setupCircle();
    const { token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const res = await accept(token, { ...validAccept, displayName: '  たろう  ' });
    expect(((await res.json()) as MeResponse).member.displayName).toBe('たろう');
  });
});

describe('試行回数制限（C33 / C34）', () => {
  /** 存在しない Token で上限まで受け入れを試す（すべて 404 → 429） */
  const exhaust = (ip: string) =>
    sendUntilLimited(
      () => accept('no-such-token', validAccept, ip),
      (r) => expect(r.status).toBe(404),
    );

  it('同じ IP から 60 秒に 10 回を超えると受け入れは 429 TOO_MANY_REQUESTS（Token の検証より前に数える）', async () => {
    const { circle, admin } = await setupCircle();
    const { token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const count = await memberCount(circle.id);

    const sameIp = uniqueIp();
    const res = await exhaust(sameIp);
    expect(((await res.json()) as ApiErrorResponse).error).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: '試行回数が多すぎます。しばらくしてから再度お試しください',
    });

    // 有効な Token・入力でも制限される（Member は作られない）
    expect((await accept(token, validAccept, sameIp)).status).toBe(429);
    expect(await memberCount(circle.id)).toBe(count);

    // 別の IP は制限されない
    expect((await accept(token, validAccept, uniqueIp())).status).toBe(201);
  });

  it('login と招待の受け入れは別々に数える', async () => {
    const sameIp = uniqueIp();
    await exhaust(sameIp);
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { circleLoginId: 'no-such-circle', email: 'a@example.com', password: 'password1234' },
      ip: sameIp,
    });
    expect(login.status).toBe(404);
  });

  it('招待情報の取得（GET）と招待の作成は制限しない', async () => {
    const { circle, admin, adminCookie } = await setupCircle();
    const { token } = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const sameIp = uniqueIp();
    await exhaust(sameIp);
    expect((await request(`/api/invitations/${token}`, { ip: sameIp })).status).toBe(200);
    const created = await invite(adminCookie, 'after-limit@example.com', {}, { 'CF-Connecting-IP': sameIp });
    expect(created.status).toBe(201);
  });
});
