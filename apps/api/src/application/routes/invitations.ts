/**
 * 招待（T4）。/api/invitations にマウント。業務ルールは usecase/invitations.ts。
 * 契約: packages/types/src/invitations.ts
 *   POST /                 作成（requireAdmin）
 *   GET  /:token           招待情報（ログイン不要）
 *   POST /:token/accept    初回登録 → Session を発行（ログイン不要。IP 単位の試行回数制限: C33 / C34）
 */
import { Hono } from 'hono';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  invitationTokenParamSchema,
  type CreateInvitationResponse,
  type InvitationInfoResponse,
  type MeResponse,
} from '@minton/types';
import type { AppEnv } from '../env';
import { parseJsonBody, parseParams } from '../errors';
import { requireAdmin } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { setSessionCookie } from '../sessionCookie';

const invitations = new Hono<AppEnv>();

/** AC-13 / AC-14 / B2 / B4 / B5。招待 URL（Token を含む）はこのレスポンスでだけ返す（C31） */
invitations.post('/', requireAdmin, async (c) => {
  const { email } = await parseJsonBody(c, createInvitationRequestSchema);
  const { invitation, invitationUrl } = await c.get('usecases').invitations.create(c.get('member'), email);
  return c.json<CreateInvitationResponse>({ invitation, invitationUrl }, 201);
});

/** 招待情報（Circle 名・招待先 Email） */
invitations.get('/:token', async (c) => {
  const { token } = parseParams(c, invitationTokenParamSchema);
  const body = await c.get('usecases').invitations.getInfo(token);
  return c.json<InvitationInfoResponse>(body);
});

/** 初回登録（AC-15 / AC-16 / AC-17 / C9 / C11） */
invitations.post('/:token/accept', rateLimit('accept'), async (c) => {
  const { token } = parseParams(c, invitationTokenParamSchema);
  // Token を先に検証する（使えなければ入力に関係なく 404）
  const accept = await c.get('usecases').invitations.prepareAccept(token);
  // Email はリクエストから受け取らない（AC-16）。スキーマに無いキーは zod が捨てる
  const input = await parseJsonBody(c, acceptInvitationRequestSchema);
  const { me, sessionToken } = await accept(input);
  setSessionCookie(c, sessionToken);
  return c.json<MeResponse>(me, 201);
});

export default invitations;
