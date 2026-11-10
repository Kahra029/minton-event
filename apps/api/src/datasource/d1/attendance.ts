/**
 * 出欠（T3）のクエリ。usecase/attendance.ts の AttendanceRepository の実装。すべて circleId で絞る。
 */
import { and, eq } from 'drizzle-orm';
import type { AttendanceRepository } from '../../usecase/attendance';
import type { DB } from '../db/client';
import { attendances, events, members } from '../db/schema';

export function createAttendanceRepository(db: DB): AttendanceRepository {
  return {
    async eventExists(circleId, eventId) {
      const row = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.circleId, circleId), eq(events.id, eventId)))
        .get();
      return row !== undefined;
    },

    async memberExists(circleId, memberId) {
      const row = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.circleId, circleId), eq(members.id, memberId)))
        .get();
      return row !== undefined;
    },

    async upsert(params) {
      return db
        .insert(attendances)
        .values({
          id: params.id,
          circleId: params.circleId,
          eventId: params.eventId,
          memberId: params.memberId,
          status: params.status,
          createdAt: params.now,
          updatedAt: params.now,
        })
        .onConflictDoUpdate({
          target: [attendances.eventId, attendances.memberId],
          set: { status: params.status, updatedAt: params.now },
          setWhere: eq(attendances.circleId, params.circleId),
        })
        .returning({
          eventId: attendances.eventId,
          memberId: attendances.memberId,
          status: attendances.status,
          updatedAt: attendances.updatedAt,
        })
        .get();
    },
  };
}
