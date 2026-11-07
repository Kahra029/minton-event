import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { LOGIN_FAILED_MESSAGE, type ApiErrorResponse, type MeResponse } from '@minton/types';
import { sessions } from '../../src/db/schema';
import { hashToken } from '../../src/lib/crypto';
import {
  createCircle,
  createMember,
  db,
  DEFAULT_PASSWORD,
  errorCode,
  request,
  sessionCookie,
  sessionFromSetCookie,
  setupCircle,
} from '../helpers';

const login = (body: unknown, cookie?: string) => request('/api/auth/login', { method: 'POST', body, cookie });
const me = (cookie?: string) => request('/api/auth/me', { cookie });
// ブラウザの同一オリジン fetch と同じく Sec-Fetch-Site を付ける（ボディなし POST は csrf() が検査する）
const logout = (cookie?: string, site = 'same-origin') =>
  request('/api/auth/logout', { method: 'POST', cookie, headers: { 'Sec-Fetch-Site': site } });

/** ログインして Cookie ヘッダ値（"session=..."）を返す */
async function loginCookie(circleLoginId: string, email: string, password: string): Promise<string> {
  const res = await login({ circleLoginId, email, password });
  expect(res.status).toBe(200);
  const token = sessionFromSetCookie(res);
  expect(token).toBeTruthy();
  return `session=${token}`;
}

async function errorBody(res: Response) {
  return ((await res.json()) as ApiErrorResponse).error;
}

describe('POST /api/auth/login', () => {
  it('AC-01: 正しい Email / Password でログインでき、Session Cookie が発行され、自分の Circle の情報だけが返る', async () => {
    const { circle, admin } = await setupCircle();
    const other = await setupCircle();

    const res = await login({ circleLoginId: circle.circleLoginId, email: admin.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeResponse;
    expect(body).toEqual({
      member: { id: admin.id, email: admin.email, displayName: admin.displayName, role: 'admin' },
      circle: { id: circle.id, circleLoginId: circle.circleLoginId, name: circle.name },
    });
    // Password Hash などは返さない
    expect(JSON.stringify(body)).not.toContain('pbkdf2');

    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const token = sessionFromSetCookie(res)!;
    expect(token).toBeTruthy();

    // Session は DB にハッシュで保存され、ログインした Circle / Member を持つ
    const rows = await db().select().from(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ circleId: circle.id, memberId: admin.id });

    // 発行された Cookie の me は自分の Circle。別 Circle の情報は含まれない
    const meRes = await me(`session=${token}`);
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as MeResponse;
    expect(meBody.circle.id).toBe(circle.id);
    const meText = JSON.stringify(meBody);
    expect(meText).not.toContain(other.circle.id);
    expect(meText).not.toContain(other.circle.circleLoginId);
  });

  it('Email は trim + 小文字化して照合する（C5）', async () => {
    const { circle, member } = await setupCircle();
    const res = await login({
      circleLoginId: circle.circleLoginId,
      email: `  ${member.email.toUpperCase()} `,
      password: DEFAULT_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as MeResponse).member.id).toBe(member.id);
  });

  it('B12: 存在しない circleLoginId は 404 NOT_FOUND', async () => {
    const res = await login({ circleLoginId: 'no-such-circle-xyz', email: 'a@example.com', password: 'whatever1' });
    expect(res.status).toBe(404);
    expect((await errorBody(res)).code).toBe('NOT_FOUND');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('B12: Password 違いは 401 で統一文言', async () => {
    const { circle, member } = await setupCircle();
    const res = await login({ circleLoginId: circle.circleLoginId, email: member.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(await errorBody(res)).toEqual({ code: 'UNAUTHORIZED', message: LOGIN_FAILED_MESSAGE });
    expect(LOGIN_FAILED_MESSAGE).toBe('メールアドレスまたはパスワードが違います');
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('B12: 存在しない Email は Password 違いと同じ 401 / 同じ文言（どちらが誤りかを区別しない）', async () => {
    const { circle } = await setupCircle();
    const res = await login({ circleLoginId: circle.circleLoginId, email: 'nobody@example.com', password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
    expect(await errorBody(res)).toEqual({ code: 'UNAUTHORIZED', message: LOGIN_FAILED_MESSAGE });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('別 Circle の Member の Email / Password では、その circleLoginId でログインできない（401）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const res = await login({ circleLoginId: a.circle.circleLoginId, email: b.member.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
    expect((await errorBody(res)).message).toBe(LOGIN_FAILED_MESSAGE);
  });

  it.each([
    ['circleLoginId なし', { email: 'a@example.com', password: 'password1' }, 'circleLoginId'],
    ['Email 形式不正', { circleLoginId: 'x', email: 'not-an-email', password: 'password1' }, 'email'],
    ['Password 空', { circleLoginId: 'x', email: 'a@example.com', password: '' }, 'password'],
  ])('Validation: %s は 400 VALIDATION_ERROR', async (_name, body, field) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    const err = await errorBody(res);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details?.fieldErrors[field]).toBeDefined();
  });

  it('JSON でないボディは 400', async () => {
    const res = await login('not json');
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('VALIDATION_ERROR');
  });
});

describe('AC-02: 同じ Email で複数 Circle に所属できる', () => {
  it('Circle A / B に同じ Email の別 Member（別 Password）がいて、それぞれの circleLoginId でのみ認証され、相互のデータを参照できない', async () => {
    const circleA = await createCircle({ name: 'サークルA' });
    const circleB = await createCircle({ name: 'サークルB' });
    const email = `same-${crypto.randomUUID()}@example.com`;
    const memberA = await createMember({ circleId: circleA.id, email, password: 'password-of-A', displayName: 'Aさん' });
    const memberB = await createMember({
      circleId: circleB.id,
      email,
      password: 'password-of-B',
      displayName: 'Bさん',
      role: 'admin',
    });

    // それぞれ自分の Circle の Password でのみ認証される
    const cookieA = await loginCookie(circleA.circleLoginId, email, 'password-of-A');
    const cookieB = await loginCookie(circleB.circleLoginId, email, 'password-of-B');
    for (const [loginId, password] of [
      [circleA.circleLoginId, 'password-of-B'],
      [circleB.circleLoginId, 'password-of-A'],
    ]) {
      const res = await login({ circleLoginId: loginId, email, password });
      expect(res.status).toBe(401);
      expect((await errorBody(res)).message).toBe(LOGIN_FAILED_MESSAGE);
    }

    // 別 Member として認証され、me はそれぞれの Circle / Member だけを返す
    const meA = (await (await me(cookieA)).json()) as MeResponse;
    const meB = (await (await me(cookieB)).json()) as MeResponse;
    expect(meA).toEqual({
      member: { id: memberA.id, email, displayName: 'Aさん', role: 'member' },
      circle: { id: circleA.id, circleLoginId: circleA.circleLoginId, name: 'サークルA' },
    });
    expect(meB).toEqual({
      member: { id: memberB.id, email, displayName: 'Bさん', role: 'admin' },
      circle: { id: circleB.id, circleLoginId: circleB.circleLoginId, name: 'サークルB' },
    });
    expect(JSON.stringify(meA)).not.toContain(circleB.id);
    expect(JSON.stringify(meB)).not.toContain(circleA.id);

    // Session はログインした Circle に紐づく
    const tokenA = cookieA.split('=')[1];
    const [rowA] = await db().select().from(sessions).where(eq(sessions.tokenHash, await hashToken(tokenA)));
    expect(rowA).toMatchObject({ circleId: circleA.id, memberId: memberA.id });

    // 一方をログアウトしても他方の Session は有効
    expect((await logout(cookieA)).status).toBe(204);
    expect((await me(cookieA)).status).toBe(401);
    expect((await me(cookieB)).status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('B9: Session をサーバー側で無効化し Cookie を消す。同じ Cookie は以降 401', async () => {
    const { circle, member } = await setupCircle();
    const cookie = await loginCookie(circle.circleLoginId, member.email, DEFAULT_PASSWORD);
    expect((await me(cookie)).status).toBe(200);

    const res = await logout(cookie);
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toMatch(/session=;/);

    const token = cookie.split('=')[1];
    const rows = await db().select().from(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
    expect(rows).toHaveLength(0);

    const after = await me(cookie);
    expect(after.status).toBe(401);
    expect(await errorCode(after)).toBe('UNAUTHORIZED');
  });

  it('クロスサイトからのログアウト要求は拒否され、Session は残る', async () => {
    const { memberCookie } = await setupCircle();
    expect((await logout(memberCookie, 'cross-site')).status).toBe(403);
    expect((await me(memberCookie)).status).toBe(200);
  });

  it('未ログインでも 204', async () => {
    expect((await logout()).status).toBe(204);
    expect((await logout('session=unknown-token')).status).toBe(204);
  });
});

describe('GET /api/auth/me', () => {
  it('未ログインは 401', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('不正な Token は 401', async () => {
    expect((await me('session=invalid')).status).toBe(401);
  });

  it('ログイン中の Member と Circle を返す', async () => {
    const { circle, member } = await setupCircle();
    const res = await me(await sessionCookie(member));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      member: { id: member.id, email: member.email, displayName: member.displayName, role: 'member' },
      circle: { id: circle.id, circleLoginId: circle.circleLoginId, name: circle.name },
    });
  });
});
