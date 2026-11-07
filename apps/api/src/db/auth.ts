/**
 * 認証（T1）のクエリ。Member の取得は必ず Circle ID で絞る（guardrails §2）。
 */
import { and, eq } from 'drizzle-orm';
import type { MeResponse } from '@minton/types';
import type { DB } from './client';
import { circles, members } from './schema';

/** circleLoginId から Circle を取得する（ログイン時の Circle 特定。decisions B12） */
export async function findCircleByLoginId(db: DB, circleLoginId: string) {
  return db.query.circles.findFirst({ where: eq(circles.circleLoginId, circleLoginId) });
}

/** Circle ID + Email で Member を取得する（Email は正規化済みの値を渡す: C5） */
export async function findMemberByEmail(db: DB, circleId: string, email: string) {
  return db.query.members.findFirst({
    where: and(eq(members.circleId, circleId), eq(members.email, email)),
  });
}

/** ログイン中の Member と所属 Circle（GET /api/auth/me）。Password Hash は返さない */
export async function findMe(db: DB, circleId: string, memberId: string): Promise<MeResponse | null> {
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
}
