/**
 * メンバー一覧（担当: T4）。/api/members にマウント済み。
 * 契約: packages/types/src/members.ts
 *   GET / （requireAdmin）
 */
import { Hono } from 'hono';
import type { MemberListResponse } from '@minton/types';
import type { AppEnv } from '../bindings';
import { getDb } from '../db/client';
import { listMembers, listPendingInvitations } from '../db/members';
import { nowUtcIso } from '../lib/time';
import { requireAdmin } from '../middleware/auth';

const members = new Hono<AppEnv>();

/** AC-13（招待状態の確認）/ C6: Member と未登録 Invitation（pending / expired）を別配列で返す */
members.get('/', requireAdmin, async (c) => {
  const { circleId } = c.get('member');
  const db = getDb(c.env.DB);
  const now = nowUtcIso();
  const [memberRows, invitationRows] = await Promise.all([
    listMembers(db, circleId),
    listPendingInvitations(db, circleId),
  ]);
  const body: MemberListResponse = {
    members: memberRows,
    invitations: invitationRows.map((i) => ({
      ...i,
      // B3: expired は保存せず expires_at <= 現在 で判定
      status: i.expiresAt > now ? 'pending' : 'expired',
    })),
  };
  return c.json(body);
});

export default members;
