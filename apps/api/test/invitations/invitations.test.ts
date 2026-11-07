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
  setupCircle,
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

const parseLines = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

/** dev 経路のメールログから招待 URL を取り出す */
function invitationUrlFromLogs(lines: string[]): string {
  const entry = parseLines(lines).find((e) => e.message === 'invitation_mail_dev');
  expect(entry).toBeDefined();
  return entry!.invitationUrl as string;
}

const tokenFromUrl = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').pop()!);

const APP_BASE_URL = 'https://app.example.test';

/** 招待作成。env は wrangler.jsonc の vars（空）に APP_BASE_URL などを上書きして渡す */
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

const accept = (token: string, body: Record<string, unknown>) =>
  request(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body });

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

describe('POST /api/invitations（AC-13 / AC-14）', () => {
  it('AC-13: admin が招待を作成でき、Circle に紐づき、Token はハッシュで保存され、dev ではメールをログに出す', async () => {
    const { circle, admin, adminCookie } = await setupCircle();
    const lines = captureLogs();
    const res = await invite(adminCookie, '  Invitee@Example.COM ');
    expect(res.status).toBe(201);
    const body = (await res.json()) as { invitation: Record<string, string> };
    expect(body.invitation).toMatchObject({ email: 'invitee@example.com', status: 'pending' });
    // レスポンスに Token / URL を含めない
    expect(JSON.stringify(body)).not.toMatch(/token|invitations\//i);

    const [row] = await invitationRows(circle.id, 'invitee@example.com');
    expect(row).toMatchObject({ id: body.invitation.id, circleId: circle.id, createdBy: admin.id, status: 'pending' });

    // 有効期限 7 日（B2）
    const ttl = Date.parse(row.expiresAt) - Date.parse(row.createdAt);
    expect(ttl).toBe(7 * DAY_MS);

    // dev 経路でメール送信処理が呼ばれ、招待 URL が出る（C7）
    const url = invitationUrlFromLogs(lines);
    expect(url).toMatch(/^https:\/\/app\.example\.test\/invitations\//);
    const token = tokenFromUrl(url);
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bit の base64url
    expect(row.tokenHash).toBe(await hashToken(token));
    expect(row.tokenHash).not.toBe(token);

    // C7 の dev メールログ以外に Token は出ない
    const others = lines.filter((l) => !l.includes('"invitation_mail_dev"'));
    expect(others.join('\n')).not.toContain(token);
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
    const lines = captureLogs();
    expect((await invite(adminCookie, 'again@example.com')).status).toBe(201);
    const firstToken = tokenFromUrl(invitationUrlFromLogs(lines));
    lines.length = 0;
    expect((await invite(adminCookie, 'again@example.com')).status).toBe(201);

    const rows = await invitationRows(circle.id, 'again@example.com');
    expect(rows.map((r) => r.status).sort()).toEqual(['pending', 'revoked']);
    expect((await request(`/api/invitations/${firstToken}`)).status).toBe(404);
  });

  it('B4: 別 Circle の同じ Email の pending は無効化しない', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const { invitation } = await createInvitation({ circleId: b.circle.id, createdBy: b.admin.id, email: 'both@example.com' });
    captureLogs();
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
    captureLogs();
    const res = await invite(a.adminCookie, b.member.email);
    expect(res.status).toBe(201);
  });

  it('RESEND_API_KEY 設定時は MAIL_FROM から Resend API を呼び、招待 URL・Token・API キーをログに出さない', async () => {
    const { adminCookie } = await setupCircle();
    const lines = captureLogs();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
    const res = await invite(adminCookie, 'prod@example.com', {
      RESEND_API_KEY: 're_test_key',
      MAIL_FROM: 'Minton <noreply@example.test>',
    });
    expect(res.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    const payload = JSON.parse(init.body as string) as { from: string; to: string[]; text: string };
    expect(payload.from).toBe('Minton <noreply@example.test>');
    expect(payload.to).toEqual(['prod@example.com']);
    const mailUrl = payload.text.match(/https:\/\/app\.example\.test\/invitations\/\S+/)![0];
    const token = tokenFromUrl(mailUrl);

    const all = lines.join('\n');
    expect(all).not.toContain('invitation_mail_dev');
    expect(all).not.toContain(token);
    expect(all).not.toContain('re_test_key');
  });

  it('招待 URL は APP_BASE_URL から作り、Host / Origin ヘッダーは使わない（末尾の / は除く）', async () => {
    const { adminCookie } = await setupCircle();
    const lines = captureLogs();
    const res = await invite(
      adminCookie,
      'host@example.com',
      { APP_BASE_URL: 'https://app.example.test/' },
      { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' },
    );
    expect(res.status).toBe(201);
    expect(invitationUrlFromLogs(lines)).toMatch(/^https:\/\/app\.example\.test\/invitations\/[^/]+$/);
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

  it.each([
    ['Resend がエラーを返す', { MAIL_FROM: 'noreply@example.test' }, 500],
    ['MAIL_FROM が未設定', { MAIL_FROM: '' }, null],
  ])('送信失敗（%s）なら Invitation を revoked にして 500。Token はログに出さない', async (_label, overrides, resendStatus) => {
    const { circle, adminCookie } = await setupCircle();
    const lines = captureLogs();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"message":"error"}', { status: resendStatus ?? 200 }));
    const res = await invite(adminCookie, 'fail@example.com', { RESEND_API_KEY: 're_test_key', ...overrides });
    expect(res.status).toBe(500);
    const json = (await res.json()) as ApiErrorResponse;
    expect(json.error).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String) });
    expect(fetchSpy).toHaveBeenCalledTimes(resendStatus ? 1 : 0);

    const rows = await invitationRows(circle.id, 'fail@example.com');
    expect(rows.map((r) => r.status)).toEqual(['revoked']);
    // 一覧にも出ない（C6）
    const list = (await (await request('/api/members', { cookie: adminCookie })).json()) as {
      invitations: { email: string }[];
    };
    expect(list.invitations.map((i) => i.email)).not.toContain('fail@example.com');

    const failed = parseLines(lines).find((e) => e.message === 'invitation_mail_failed');
    expect(failed).toMatchObject({ level: 'error', circleId: circle.id, invitationId: rows[0].id });
    expect(lines.join('\n')).not.toMatch(/invitations\/[A-Za-z0-9_-]{20,}/);
    expect(lines.join('\n')).not.toContain('re_test_key');
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
  it('AC-13〜15: admin の招待 → メールの URL から登録 → Member 作成・Circle 所属・accepted・ログイン状態・一覧で確認', async () => {
    const { circle, adminCookie } = await setupCircle();
    const lines = captureLogs();
    expect((await invite(adminCookie, 'flow@example.com')).status).toBe(201);
    const token = tokenFromUrl(invitationUrlFromLogs(lines));

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
