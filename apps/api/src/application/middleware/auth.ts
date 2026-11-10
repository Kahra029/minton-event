import { createMiddleware } from 'hono/factory';
import { assertAdmin } from '../../usecase/authorization';
import { unauthorized } from '../../usecase/errors';
import type { AppEnv } from '../env';
import { setLogContext } from '../logger';
import { readSessionToken } from '../sessionCookie';

/**
 * ログイン必須。Session Cookie を検証し c.var.member（id, circleId, role）をセットする。
 * 無効なら 401 UNAUTHORIZED。
 * usecase には c.var.member を渡し、Circle は必ずその circleId で絞る（docs/architecture.md）。
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('member')) {
    const member = await c.get('usecases').auth.authenticate(readSessionToken(c));
    if (!member) throw unauthorized();
    c.set('member', member);
    setLogContext(c, { circleId: member.circleId, memberId: member.id });
  }
  await next();
});

/**
 * admin 必須。未ログインは 401、admin 以外は 403（入力の検証より先に判定する）。
 * 単体で使える（requireAuth を前に置かなくてよい）。admin 専用の usecase も同じ判定を行う。
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  await requireAuth(c, async () => {
    assertAdmin(c.get('member'));
    await next();
  });
});
