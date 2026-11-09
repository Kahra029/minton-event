/**
 * 招待のクエリ（T4）。usecase/invitations.ts の InvitationRepository の実装。
 * - 作成・一覧は circleId で絞り込む
 * - Token からの取得だけは Circle を知らない状態（未ログイン）で行うため Token ハッシュで引き、
 *   以降の更新は取得した Invitation の circleId で絞り込む
 */
import { and, eq, gt, sql } from 'drizzle-orm';
import type { InvitationRepository } from '../../usecase/invitations';
import type { DB } from '../db/client';
import { circles, invitations, members } from '../db/schema';

/** D1 の UNIQUE 制約違反か（同時リクエストの競合を CONFLICT に変換する用途） */
export function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : '';
  return msg.includes('UNIQUE constraint failed');
}

export function createInvitationRepository(db: DB): InvitationRepository {
  return {
    async memberExistsByEmail(circleId, email) {
      const row = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.circleId, circleId), eq(members.email, email)))
        .limit(1);
      return row.length > 0;
    },

    /** 1 つの batch で原子的に行う */
    async createRevokingPending(invitation) {
      await db.batch([
        db
          .update(invitations)
          .set({ status: 'revoked' })
          .where(
            and(
              eq(invitations.circleId, invitation.circleId),
              eq(invitations.email, invitation.email),
              eq(invitations.status, 'pending'),
            ),
          ),
        db.insert(invitations).values(invitation),
      ]);
    },

    /** token_hash は UNIQUE。使えるか（pending かつ期限内）の判定は usecase */
    async findByTokenHash(tokenHash) {
      const rows = await db
        .select({
          invitation: invitations,
          circle: { id: circles.id, circleLoginId: circles.circleLoginId, name: circles.name },
        })
        .from(invitations)
        .innerJoin(circles, eq(circles.id, invitations.circleId))
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);
      return rows[0] ?? null;
    },

    /**
     * Member 作成と Invitation の accepted 更新を 1 つの batch で行う。
     * 両方とも「Invitation がまだ pending かつ期限内」を条件にしており、同時リクエストや
     * 直前に使われた Token では Member を作らない。
     */
    async accept(params) {
      const { invitation, now } = params;
      const usable = and(
        eq(invitations.id, invitation.id),
        eq(invitations.circleId, invitation.circleId),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, now),
      );
      try {
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
        return inserted.meta.changes === 1 ? 'accepted' : 'unusable';
      } catch (e) {
        // 同じ Circle・同じ Email の Member が同時に作られた
        if (isUniqueConstraintError(e)) return 'email_taken';
        throw e;
      }
    },
  };
}
