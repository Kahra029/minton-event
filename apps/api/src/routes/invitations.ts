/**
 * 招待（担当: T4）。/api/invitations にマウント済み。
 * 契約: packages/types/src/invitations.ts
 *   POST /                 作成（requireAdmin）
 *   GET  /:token           招待情報（ログイン不要）
 *   POST /:token/accept    初回登録 → createSession（ログイン不要）
 */
import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  INVITATION_INVALID_MESSAGE,
  INVITATION_TTL_DAYS,
  invitationTokenParamSchema,
  type CreateInvitationResponse,
  type InvitationInfoResponse,
  type MeResponse,
} from '@minton/types';
import type { AppEnv } from '../bindings';
import { getDb, type DB } from '../db/client';
import {
  acceptInvitation,
  createInvitationRevokingPending,
  findUsableInvitationByTokenHash,
  revokeInvitation,
} from '../db/invitations';
import { memberExistsByEmail } from '../db/members';
import { circles } from '../db/schema';
import { generateToken, hashToken } from '../lib/crypto';
import {
  conflict,
  internalError,
  isUniqueConstraintError,
  notFound,
  parseJsonBody,
  parseParams,
} from '../lib/errors';
import { newId } from '../lib/id';
import { log, setLogContext } from '../lib/logger';
import { hashPassword } from '../lib/password';
import { createSession } from '../lib/session';
import { addMs, DAY_MS, nowUtcIso } from '../lib/time';
import { appBaseUrl, buildInvitationUrl, getMailSender } from '../mail/invitationMail';
import { requireAdmin } from '../middleware/auth';

const MEMBER_EXISTS_MESSAGE = 'このメールアドレスのメンバーは既に登録されています';

const invitations = new Hono<AppEnv>();

/** AC-13 / AC-14 / B2 / B4 / B5 */
invitations.post('/', requireAdmin, async (c) => {
  const { email } = await parseJsonBody(c, createInvitationRequestSchema);
  const me = c.get('member');
  const db = getDb(c.env.DB);

  if (await memberExistsByEmail(db, me.circleId, email)) throw conflict(MEMBER_EXISTS_MESSAGE);

  // 招待 URL は設定値からのみ作る（推測しない）。未設定なら Invitation を作らずエラー
  const baseUrl = appBaseUrl(c.env);
  if (!baseUrl) {
    log('error', 'app_base_url_not_configured', { requestId: c.get('requestId') });
    throw internalError();
  }

  const circle = await db.query.circles.findFirst({ where: eq(circles.id, me.circleId) });
  if (!circle) throw notFound();

  const token = generateToken();
  const now = nowUtcIso();
  const invitation = await createInvitationRevokingPending(db, {
    circleId: me.circleId,
    email,
    tokenHash: await hashToken(token),
    expiresAt: addMs(now, INVITATION_TTL_DAYS * DAY_MS),
    createdBy: me.id,
    now,
  });
  setLogContext(c, { invitationId: invitation.id });

  try {
    await getMailSender(c.env)({
      invitationId: invitation.id,
      to: email,
      circleName: circle.name,
      invitationUrl: buildInvitationUrl(baseUrl, token),
    });
  } catch (e) {
    // 送信できなかった招待は使えないようにしてから 500
    await revokeInvitation(db, me.circleId, invitation.id);
    log('error', 'invitation_mail_failed', {
      requestId: c.get('requestId'),
      circleId: me.circleId,
      invitationId: invitation.id,
      errorName: e instanceof Error ? e.name : 'Unknown',
      errorMessage: e instanceof Error ? e.message : undefined,
    });
    throw internalError();
  }

  const body: CreateInvitationResponse = {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      status: 'pending',
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    },
  };
  return c.json(body, 201);
});

/** 使える Invitation を Token から引く。使えなければ 404（C11） */
async function findUsableOr404(c: Context<AppEnv>, db: DB, now: string) {
  const { token } = parseParams(c, invitationTokenParamSchema);
  const found = await findUsableInvitationByTokenHash(db, await hashToken(token), now);
  if (!found) throw notFound(INVITATION_INVALID_MESSAGE);
  setLogContext(c, { circleId: found.circle.id, invitationId: found.invitation.id });
  return found;
}

/** 招待情報（Circle 名・招待先 Email） */
invitations.get('/:token', async (c) => {
  const { invitation, circle } = await findUsableOr404(c, getDb(c.env.DB), nowUtcIso());
  const body: InvitationInfoResponse = { circleName: circle.name, email: invitation.email };
  return c.json(body);
});

/** 初回登録（AC-15 / AC-16 / AC-17 / C9 / C11） */
invitations.post('/:token/accept', async (c) => {
  const db = getDb(c.env.DB);
  const now = nowUtcIso();
  const { invitation, circle } = await findUsableOr404(c, db, now);
  // Email はリクエストから受け取らない（AC-16）。スキーマに無いキーは zod が捨てる
  const input = await parseJsonBody(c, acceptInvitationRequestSchema);

  if (await memberExistsByEmail(db, invitation.circleId, invitation.email)) throw conflict(MEMBER_EXISTS_MESSAGE);

  const memberId = newId();
  let accepted: boolean;
  try {
    accepted = await acceptInvitation(db, {
      invitation,
      memberId,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      now,
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) throw conflict(MEMBER_EXISTS_MESSAGE);
    throw e;
  }
  // 検証後に別リクエストで使われた・期限が切れた場合
  if (!accepted) throw notFound(INVITATION_INVALID_MESSAGE);

  setLogContext(c, { memberId });
  await createSession(c, db, { circleId: invitation.circleId, memberId });

  const body: MeResponse = {
    member: { id: memberId, email: invitation.email, displayName: input.displayName, role: 'member' },
    circle: { id: circle.id, circleLoginId: circle.circleLoginId, name: circle.name },
  };
  return c.json(body, 201);
});

export default invitations;
