/**
 * 認証（T1）のクエリ。usecase/auth.ts の AuthRepository の実装。Member の取得は必ず Circle ID で絞る（guardrails §2）。
 */
import { and, eq } from 'drizzle-orm';
import type { AuthRepository } from '../../usecase/auth';
import type { DB } from '../db/client';
import { circles, members } from '../db/schema';

export function createAuthRepository(db: DB): AuthRepository {
  return {
    /** circleLoginId から Circle を取得する（ログイン時の Circle 特定。decisions B12） */
    async findCircleByLoginId(circleLoginId) {
      return db.query.circles.findFirst({ where: eq(circles.circleLoginId, circleLoginId) });
    },

    async findMemberByEmail(circleId, email) {
      return db.query.members.findFirst({
        where: and(eq(members.circleId, circleId), eq(members.email, email)),
      });
    },

    async findMe(circleId, memberId) {
      const rows = await db
        .select({
          memberId: members.id,
          email: members.email,
          displayName: members.displayName,
          role: members.role,
          circleId: circles.id,
          circleLoginId: circles.circleLoginId,
          circleName: circles.name,
        })
        .from(members)
        .innerJoin(circles, eq(circles.id, members.circleId))
        .where(and(eq(members.circleId, circleId), eq(members.id, memberId)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        member: { id: row.memberId, email: row.email, displayName: row.displayName, role: row.role },
        circle: { id: row.circleId, circleLoginId: row.circleLoginId, name: row.circleName },
      };
    },
  };
}
