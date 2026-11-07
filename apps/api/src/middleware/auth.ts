import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../bindings';
import { getDb } from '../db/client';
import { forbidden, unauthorized } from '../lib/errors';
import { setLogContext } from '../lib/logger';
import { getSessionMember } from '../lib/session';

/**
 * ログイン必須。Session Cookie を検証し c.var.member（id, circleId, role）をセットする。
 * 無効なら 401 UNAUTHORIZED。
 * 以降の DB アクセスは必ず c.var.member.circleId で Circle を絞ること（docs/architecture.md）。
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('member')) {
    const member = await getSessionMember(c, getDb(c.env.DB));
    if (!member) throw unauthorized();
    c.set('member', member);
    setLogContext(c, { circleId: member.circleId, memberId: member.id });
  }
  await next();
});

/**
 * admin 必須。未ログインは 401、admin 以外は 403。
 * 単体で使える（requireAuth を前に置かなくてよい）。
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  await requireAuth(c, async () => {
    if (c.get('member').role !== 'admin') throw forbidden();
    await next();
  });
});
