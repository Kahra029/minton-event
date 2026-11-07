import { describe, expect, it } from 'vitest';
import type { MemberListResponse } from '@minton/types';
import { addMs, nowUtcIso } from '../../src/lib/time';
import { createInvitation, createMember, errorCode, request, setupCircle } from '../helpers';

const list = async (cookie: string) => {
  const res = await request('/api/members', { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as MemberListResponse;
};

describe('GET /api/members（AC-13 / AC-14 / C6）', () => {
  it('admin は Member（Display Name 昇順）と未登録 Invitation（pending / expired）を確認できる', async () => {
    const { circle, admin, member, adminCookie } = await setupCircle();
    const extra = await createMember({ circleId: circle.id, displayName: 'あいう' });
    const pending = await createInvitation({ circleId: circle.id, createdBy: admin.id });
    const expired = await createInvitation({
      circleId: circle.id,
      createdBy: admin.id,
      expiresAt: addMs(nowUtcIso(), -1000),
    });
    const accepted = await createInvitation({ circleId: circle.id, createdBy: admin.id, status: 'accepted' });
    const revoked = await createInvitation({ circleId: circle.id, createdBy: admin.id, status: 'revoked' });

    const body = await list(adminCookie);

    // setupCircle の displayName は 管理者 / メンバー。SQLite の文字列順: あいう < メンバー < 管理者
    expect(body.members.map((m) => m.id)).toEqual([extra.id, member.id, admin.id]);
    expect(body.members.find((m) => m.id === admin.id)).toEqual({
      id: admin.id,
      email: admin.email,
      displayName: '管理者',
      role: 'admin',
      createdAt: admin.createdAt,
    });
    // Password Hash などは返さない
    expect(JSON.stringify(body)).not.toMatch(/password|hash|token/i);

    const byId = Object.fromEntries(body.invitations.map((i) => [i.id, i]));
    expect(byId[pending.invitation.id]).toMatchObject({ email: pending.invitation.email, status: 'pending' });
    expect(byId[expired.invitation.id]).toMatchObject({ email: expired.invitation.email, status: 'expired' });
    expect(byId[accepted.invitation.id]).toBeUndefined();
    expect(byId[revoked.invitation.id]).toBeUndefined();
    expect(body.invitations).toHaveLength(2);
  });

  it('AC-14: member は 403', async () => {
    const { memberCookie } = await setupCircle();
    const res = await request('/api/members', { cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN');
  });

  it('未ログインは 401', async () => {
    const res = await request('/api/members');
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('Circle 境界: 別 Circle の Member・Invitation は含まれない', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const bInvitation = await createInvitation({ circleId: b.circle.id, createdBy: b.admin.id });
    const body = await list(a.adminCookie);
    const ids = [...body.members.map((m) => m.id), ...body.invitations.map((i) => i.id)];
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(b.admin.id);
    expect(ids).not.toContain(b.member.id);
    expect(ids).not.toContain(bInvitation.invitation.id);
  });
});
