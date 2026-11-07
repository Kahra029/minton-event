/**
 * 認証（担当: T1）。/api/auth にマウント済み。
 * 契約: packages/types/src/auth.ts
 *   POST /login   circleLoginId → Circle、Circle ID + Email → Member、PBKDF2 で照合し Session を発行（A2 / A3 / B12）
 *   POST /logout  Session をサーバー側で削除し Cookie を消す（A2 / B9）。未ログインでも 204
 *   GET  /me      requireAuth
 */
import { Hono } from 'hono';
import { LOGIN_FAILED_MESSAGE, loginRequestSchema } from '@minton/types';
import type { AppEnv } from '../bindings';
import { getDb } from '../db/client';
import { findCircleByLoginId, findMe, findMemberByEmail } from '../db/auth';
import { notFound, parseJsonBody, unauthorized } from '../lib/errors';
import { setLogContext } from '../lib/logger';
import { verifyPassword } from '../lib/password';
import { createSession, destroySession } from '../lib/session';
import { requireAuth } from '../middleware/auth';

const auth = new Hono<AppEnv>();

auth.post('/login', async (c) => {
  const input = await parseJsonBody(c, loginRequestSchema);
  const db = getDb(c.env.DB);

  const circle = await findCircleByLoginId(db, input.circleLoginId);
  if (!circle) throw notFound('サークルが見つかりません');
  setLogContext(c, { circleId: circle.id });

  const member = await findMemberByEmail(db, circle.id, input.email);
  // Member がいない場合もダミーで照合し、Email 違いと Password 違いを区別しない（B12）
  const ok = await verifyPassword(input.password, member?.passwordHash ?? null);
  if (!member || !ok) throw unauthorized(LOGIN_FAILED_MESSAGE);

  await createSession(c, db, { circleId: circle.id, memberId: member.id });
  setLogContext(c, { memberId: member.id });

  const me = await findMe(db, circle.id, member.id);
  if (!me) throw unauthorized(LOGIN_FAILED_MESSAGE);
  return c.json(me, 200);
});

auth.post('/logout', async (c) => {
  await destroySession(c, getDb(c.env.DB));
  return c.body(null, 204);
});

auth.get('/me', requireAuth, async (c) => {
  const { id, circleId } = c.get('member');
  const me = await findMe(getDb(c.env.DB), circleId, id);
  if (!me) throw unauthorized();
  return c.json(me, 200);
});

export default auth;
