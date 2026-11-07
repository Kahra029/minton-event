/**
 * 認証（T1）。/api/auth にマウント。業務ルールは usecase/auth.ts。
 * 契約: packages/types/src/auth.ts
 *   POST /login   circleLoginId → Circle、Circle ID + Email → Member、PBKDF2 で照合し Session を発行（A2 / A3 / B12）
 *   POST /logout  Session をサーバー側で削除し Cookie を消す（A2 / B9）。未ログインでも 204
 *   GET  /me      requireAuth
 */
import { Hono } from 'hono';
import { loginRequestSchema } from '@minton/types';
import type { AppEnv } from '../env';
import { parseJsonBody } from '../errors';
import { requireAuth } from '../middleware/auth';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../sessionCookie';

const auth = new Hono<AppEnv>();

auth.post('/login', async (c) => {
  const input = await parseJsonBody(c, loginRequestSchema);
  const { me, sessionToken } = await c.get('usecases').auth.login(input);
  setSessionCookie(c, sessionToken);
  return c.json(me, 200);
});

auth.post('/logout', async (c) => {
  await c.get('usecases').auth.logout(readSessionToken(c));
  clearSessionCookie(c);
  return c.body(null, 204);
});

auth.get('/me', requireAuth, async (c) => {
  const me = await c.get('usecases').auth.getMe(c.get('member'));
  return c.json(me, 200);
});

export default auth;
