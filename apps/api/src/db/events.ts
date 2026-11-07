/**
 * Event のクエリ（担当: T2）。
 * すべての関数は circleId を引数に取り、WHERE に circle_id を入れる（guardrails §2 / B14）。
 */
import { and, asc, count, eq, gt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { AttendanceStatus, Event, EventDetail, EventListItem } from '@minton/types';
import type { DB } from './client';
import { attendances, events, members } from './schema';

type EventRow = typeof events.$inferSelect;

/** DB の行から API の Event に変換する（circleId / createdBy は返さない） */
export function toEvent(row: EventRow): Event {
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

export async function findEvent(db: DB, circleId: string, eventId: string): Promise<EventRow | undefined> {
  return db.query.events.findFirst({
    where: and(eq(events.circleId, circleId), eq(events.id, eventId)),
  });
}

/**
 * 今後の Event（end_at > now: decisions C4）を開始日時の昇順（B7）で返す。
 * 各 Event に自分の出欠（null = 未回答）と参加人数を付ける。
 */
export async function listUpcomingEvents(
  db: DB,
  params: { circleId: string; memberId: string; now: string },
): Promise<EventListItem[]> {
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
}

/**
 * Event 詳細。Circle の全 Member（未回答含む）を Display Name 昇順（decisions C8）で、
 * それぞれの出欠（Attendance レコードなし = 未回答: AC-10）を付けて返す。
 * Member も Attendance も同じ circleId で絞るので、別 Circle の情報は含まれない（AC-12）。
 */
export async function getEventDetail(
  db: DB,
  params: { circleId: string; eventId: string; memberId: string },
): Promise<EventDetail | undefined> {
  const event = await findEvent(db, params.circleId, params.eventId);
  if (!event) return undefined;

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
        eq(attendances.eventId, event.id),
      ),
    )
    .where(eq(members.circleId, params.circleId))
    .orderBy(asc(members.displayName), asc(members.id));

  const memberStatuses = rows.map((r) => ({
    memberId: r.memberId,
    displayName: r.displayName,
    status: (r.status ?? null) as AttendanceStatus | null,
  }));
  const counts = { attending: 0, absent: 0, unanswered: 0 };
  for (const m of memberStatuses) {
    if (m.status === 'attending') counts.attending++;
    else if (m.status === 'absent') counts.absent++;
    else counts.unanswered++;
  }

  return {
    ...toEvent(event),
    myStatus: memberStatuses.find((m) => m.memberId === params.memberId)?.status ?? null,
    counts,
    members: memberStatuses,
  };
}

export type EventValues = {
  title: string | null;
  startAt: string;
  endAt: string;
  location: string;
};

export async function insertEvent(
  db: DB,
  params: EventValues & { id: string; circleId: string; createdBy: string; now: string },
): Promise<EventRow> {
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
  return row;
}

/** 更新した行を返す。自分の Circle に無ければ undefined */
export async function updateEvent(
  db: DB,
  params: EventValues & { circleId: string; eventId: string; now: string },
): Promise<EventRow | undefined> {
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
  return row;
}

/** 物理削除（B1）。関連 Attendance は FK の ON DELETE CASCADE で消える。削除できたら true */
export async function deleteEvent(db: DB, circleId: string, eventId: string): Promise<boolean> {
  const deleted = await db
    .delete(events)
    .where(and(eq(events.circleId, circleId), eq(events.id, eventId)))
    .returning({ id: events.id });
  return deleted.length > 0;
}
