/**
 * Event のクエリ（T2）。usecase/events.ts の EventRepository の実装。
 * すべてのメソッドは circleId を受け取り、WHERE に circle_id を入れる（guardrails §2 / B14）。
 */
import { and, asc, count, eq, gt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { AttendanceStatus, Event } from '@minton/types';
import type { EventRepository } from '../../usecase/events';
import type { DB } from '../db/client';
import { attendances, events, members } from '../db/schema';

type EventRow = typeof events.$inferSelect;

/** DB の行から API の Event に変換する（circleId / createdBy は返さない） */
function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createEventRepository(db: DB): EventRepository {
  return {
    async listUpcoming(params) {
      const counted = alias(attendances, 'counted');
      const attendingCount = db
        .select({ n: count() })
        .from(counted)
        .where(
          and(
            eq(counted.circleId, events.circleId),
            eq(counted.eventId, events.id),
            eq(counted.status, 'attending'),
          ),
        );

      const rows = await db
        .select({
          event: events,
          myStatus: attendances.status,
          attendingCount: sql<number>`(${attendingCount})`,
        })
        .from(events)
        .leftJoin(
          attendances,
          and(
            eq(attendances.circleId, events.circleId),
            eq(attendances.eventId, events.id),
            eq(attendances.memberId, params.memberId),
          ),
        )
        .where(and(eq(events.circleId, params.circleId), gt(events.endAt, params.now)))
        .orderBy(asc(events.startAt), asc(events.id));

      return rows.map((r) => ({
        ...toEvent(r.event),
        myStatus: r.myStatus ?? null,
        attendingCount: Number(r.attendingCount),
      }));
    },

    async find(circleId, eventId) {
      const row = await db.query.events.findFirst({
        where: and(eq(events.circleId, circleId), eq(events.id, eventId)),
      });
      return row && toEvent(row);
    },

    /** Member も Attendance も同じ circleId で絞るので、別 Circle の情報は含まれない（AC-12） */
    async listMemberAttendances(circleId, eventId) {
      const rows = await db
        .select({
          memberId: members.id,
          displayName: members.displayName,
          status: attendances.status,
        })
        .from(members)
        .leftJoin(
          attendances,
          and(
            eq(attendances.circleId, members.circleId),
            eq(attendances.memberId, members.id),
            eq(attendances.eventId, eventId),
          ),
        )
        .where(eq(members.circleId, circleId))
        .orderBy(asc(members.displayName), asc(members.id));

      return rows.map((r) => ({
        memberId: r.memberId,
        displayName: r.displayName,
        status: (r.status ?? null) as AttendanceStatus | null,
      }));
    },

    async insert(params) {
      const row = {
        id: params.id,
        circleId: params.circleId,
        title: params.title,
        startAt: params.startAt,
        endAt: params.endAt,
        location: params.location,
        createdBy: params.createdBy,
        createdAt: params.now,
        updatedAt: params.now,
      } satisfies typeof events.$inferInsert;
      await db.insert(events).values(row);
      return toEvent(row);
    },

    async update(params) {
      const [row] = await db
        .update(events)
        .set({
          title: params.title,
          startAt: params.startAt,
          endAt: params.endAt,
          location: params.location,
          updatedAt: params.now,
        })
        .where(and(eq(events.circleId, params.circleId), eq(events.id, params.eventId)))
        .returning();
      return row && toEvent(row);
    },

    async delete(circleId, eventId) {
      const deleted = await db
        .delete(events)
        .where(and(eq(events.circleId, circleId), eq(events.id, eventId)))
        .returning({ id: events.id });
      return deleted.length > 0;
    },
  };
}
