/**
 * メンバー一覧（T4）。/api/members にマウント。業務ルールは usecase/members.ts。
 * 契約: packages/types/src/members.ts
 *   GET / （requireAdmin）
 */
import { Hono } from 'hono';
import type { MemberListResponse } from '@minton/types';
import type { AppEnv } from '../env';
import { requireAdmin } from '../middleware/auth';

const members = new Hono<AppEnv>();

/** AC-13（招待状態の確認）/ C6 */
members.get('/', requireAdmin, async (c) => {
  const body = await c.get('usecases').members.list(c.get('member'));
  return c.json<MemberListResponse>(body);
});

export default members;
