/**
 * メンバー一覧のクエリ（T4）。usecase/members.ts の MemberRepository の実装。すべて circleId で絞り込む。
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { MemberRepository } from '../../usecase/members';
import type { DB } from '../db/client';
import { invitations, members } from '../db/schema';

export function createMemberRepository(db: DB): MemberRepository {
  return {
    async listMembers(circleId) {
      return db
        .select({
          id: members.id,
          email: members.email,
          displayName: members.displayName,
          role: members.role,
          createdAt: members.createdAt,
        })
        .from(members)
        .where(eq(members.circleId, circleId))
        .orderBy(asc(members.displayName), asc(members.id));
    },

    async listPendingInvitations(circleId) {
      return db
        .select({
          id: invitations.id,
          email: invitations.email,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
        })
        .from(invitations)
        .where(and(eq(invitations.circleId, circleId), eq(invitations.status, 'pending')))
        .orderBy(desc(invitations.createdAt), desc(invitations.id));
    },
  };
}
