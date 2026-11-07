/**
 * 招待のクエリ（担当: T4）。
 * - 作成・一覧は circleId で絞り込む
 * - Token からの取得だけは Circle を知らない状態（未ログイン）で行うため Token ハッシュで引き、
 *   以降の更新は取得した Invitation の circleId で絞り込む
 */
import { and, eq, gt, sql } from 'drizzle-orm';
import type { DB } from './client';
import { circles, invitations, members } from './schema';
import { newId } from '../lib/id';

export type InvitationRow = typeof invitations.$inferSelect;

/**
 * B4: 同じ Circle・同じ Email の pending を revoked にしてから新規作成する（1 つの batch で原子的に）。
 */
export async function createInvitationRevokingPending(
  db: DB,
  params: { circleId: string; email: string; tokenHash: string; expiresAt: string; createdBy: string; now: string },
): Promise<InvitationRow> {
  const row: InvitationRow = {
    id: newId(),
    circleId: params.circleId,
    email: params.email,
    tokenHash: params.tokenHash,
    status: 'pending',
    expiresAt: params.expiresAt,
    createdBy: params.createdBy,
    createdAt: params.now,
    acceptedAt: null,
  };
  await db.batch([
    db
      .update(invitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(invitations.circleId, params.circleId),
          eq(invitations.email, params.email),
          eq(invitations.status, 'pending'),
        ),
      ),
    db.insert(invitations).values(row),
  ]);
  return row;
}

/**
 * 使用可能な Invitation（pending かつ expires_at > now: B3 / AC-17）と、その Circle を返す。
 * 存在しない・accepted・revoked・期限切れはすべて null（C11: 理由を区別しない）。
 */
export async function findUsableInvitationByTokenHash(db: DB, tokenHash: string, now: string) {
  const rows = await db
    .select({
      invitation: invitations,
      circle: { id: circles.id, circleLoginId: circles.circleLoginId, name: circles.name },
    })
    .from(invitations)
    .innerJoin(circles, eq(circles.id, invitations.circleId))
    .where(
      and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, 'pending'), gt(invitations.expiresAt, now)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 初回登録（AC-15 / AC-17）。Member 作成と Invitation の accepted 更新を 1 つの batch で行う。
 * 両方とも「Invitation がまだ pending かつ期限内」を条件にしており、同時リクエストや
 * 直前に使われた Token では Member を作らない。作成できなかった場合は false。
 */
export async function acceptInvitation(
  db: DB,
  params: {
    invitation: Pick<InvitationRow, 'id' | 'circleId' | 'email'>;
    memberId: string;
    displayName: string;
    passwordHash: string;
    now: string;
  },
): Promise<boolean> {
  const { invitation, now } = params;
  const usable = and(
    eq(invitations.id, invitation.id),
    eq(invitations.circleId, invitation.circleId),
    eq(invitations.status, 'pending'),
    gt(invitations.expiresAt, now),
  );
  const [inserted] = await db.batch([
    // Email / Circle は Invitation の行から取る（AC-16）
    db.insert(members).select(
      db
        .select({
          id: sql<string>`${params.memberId}`.as('id'),
          circleId: invitations.circleId,
          email: invitations.email,
          displayName: sql<string>`${params.displayName}`.as('display_name'),
          role: sql<'member'>`'member'`.as('role'),
          passwordHash: sql<string>`${params.passwordHash}`.as('password_hash'),
          createdAt: sql<string>`${now}`.as('created_at'),
          updatedAt: sql<string>`${now}`.as('updated_at'),
        })
        .from(invitations)
        .where(usable),
    ),
    db.update(invitations).set({ status: 'accepted', acceptedAt: now }).where(usable),
  ]);
  return inserted.meta.changes === 1;
}
