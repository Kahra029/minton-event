import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions } from '../../src/datasource/db/schema';
import { hashToken } from '../../src/datasource/crypto';
import { SESSION_TTL_MS } from '../../src/usecase/session';
import { addMs } from '../../src/usecase/time';
import { nowUtcIso } from '../../src/datasource/clock';
import { createCircle, createMember, db, sessionCookie, sessionFromSetCookie, setupCircle } from '../helpers';
import { testRequest } from './testApp';

describe('requireAuth', () => {
  it('Cookie が無ければ 401', async () => {
    const res = await testRequest('/auth');
    expect(res.status).toBe(401);
  });

  it('存在しない Token は 401', async () => {
    const res = await testRequest('/auth', { cookie: 'session=invalid-token' });
    expect(res.status).toBe(401);
  });

  it('有効な Session なら c.var.member に id / circleId / role をセットする', async () => {
    const { circle, member, memberCookie } = await setupCircle();
    const res = await testRequest('/auth', { cookie: memberCookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: member.id, circleId: circle.id, role: 'member' });
  });

  it('期限切れの Session は 401', async () => {
    const { member, memberCookie } = await setupCircle();
    const token = memberCookie.split('=')[1];
    await db()
      .update(sessions)
      .set({ expiresAt: addMs(nowUtcIso(), -1000) })
      .where(eq(sessions.tokenHash, await hashToken(token)));
    const res = await testRequest('/auth', { cookie: memberCookie });
    expect(res.status).toBe(401);
    expect(member).toBeDefined();
  });
});

describe('requireAdmin', () => {
  it('未ログインは 401', async () => {
    expect((await testRequest('/admin')).status).toBe(401);
  });

  it('member は 403', async () => {
    const { memberCookie } = await setupCircle();
    expect((await testRequest('/admin', { cookie: memberCookie })).status).toBe(403);
  });

  it('admin は通過する', async () => {
    const { admin, adminCookie } = await setupCircle();
    const res = await testRequest('/admin', { cookie: adminCookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(admin.id);
  });
});

describe('Session', () => {
  it('createSession は HttpOnly / SameSite=Lax / Path=/ / 30 日の Cookie を設定し、DB には Token のハッシュのみ保存する', async () => {
    const { circle, member } = await setupCircle();
    const res = await testRequest(`/session/${circle.id}/${member.id}`, { method: 'POST' });
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    expect(setCookie).not.toMatch(/Secure/i); // http のときは Secure を付けない

    const token = sessionFromSetCookie(res)!;
    const rows = await db().select().from(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ circleId: circle.id, memberId: member.id });
    // 平文 Token はどの行にも保存されていない
    const all = await db().select().from(sessions);
    expect(all.some((r) => r.tokenHash === token)).toBe(false);

    // 発行された Cookie で認証できる
    expect((await testRequest('/auth', { cookie: `session=${token}` })).status).toBe(200);
  });

  it('https のときは Secure を付ける', async () => {
    const { circle, member } = await setupCircle();
    const res = await testRequest(`/session/${circle.id}/${member.id}`, {
      method: 'POST',
      base: 'https://example.com',
    });
    expect(res.headers.get('Set-Cookie')).toMatch(/Secure/i);
  });

  it('destroySession は DB の Session を削除し、以降その Token は 401', async () => {
    const { memberCookie } = await setupCircle();
    const res = await testRequest('/logout', { method: 'POST', cookie: memberCookie });
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toMatch(/session=;/);
    expect((await testRequest('/auth', { cookie: memberCookie })).status).toBe(401);
  });
});

describe('Circle をまたいだ Session', () => {
  it('同じ Email の Member が 2 つの Circle にいても、Session はそれぞれの Circle の Member として認証される', async () => {
    const circleA = await createCircle();
    const circleB = await createCircle();
    const email = 'same@example.com';
    const memberA = await createMember({ circleId: circleA.id, email });
    const memberB = await createMember({ circleId: circleB.id, email, role: 'admin' });

    const resA = await testRequest('/auth', { cookie: await sessionCookie(memberA) });
    expect(await resA.json()).toEqual({ id: memberA.id, circleId: circleA.id, role: 'member' });
    const resB = await testRequest('/auth', { cookie: await sessionCookie(memberB) });
    expect(await resB.json()).toEqual({ id: memberB.id, circleId: circleB.id, role: 'admin' });
  });

  it('Session の Circle と Member の Circle が異なる組み合わせは DB に保存できない（複合 FK）', async () => {
    const circleA = await createCircle();
    const circleB = await createCircle();
    const memberB = await createMember({ circleId: circleB.id });
    await expect(
      sessionCookie({ id: memberB.id, circleId: circleA.id }),
    ).rejects.toThrow();
  });
});
