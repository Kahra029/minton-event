/**
 * Session の保存・検証（usecase/session.ts の SessionRepository の実装。decisions A2 / C1）。
 * DB には Token の SHA-256 ハッシュだけを保存する。
 */
import { and, eq, gt } from 'drizzle-orm';
import type { SessionRepository } from '../../usecase/session';
import type { DB } from '../db/client';
import { members, sessions } from '../db/schema';

export function createSessionRepository(db: DB): SessionRepository {
  return {
    async insert(session) {
      await db.insert(sessions).values(session);
    },

    async deleteByTokenHash(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    /** Member は Session と同じ Circle のものに限る（複合 FK でも保証しているが、クエリでも絞る） */
    async findMemberByTokenHash(tokenHash, now) {
      const rows = await db
        .select({ id: members.id, circleId: members.circleId, role: members.role })
        .from(sessions)
        .innerJoin(members, and(eq(members.id, sessions.memberId), eq(members.circleId, sessions.circleId)))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
