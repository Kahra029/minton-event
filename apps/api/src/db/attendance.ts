/**
 * 出欠（T3）のクエリ。すべて circleId で絞る（docs/architecture.md §3）。
 */
import { and, eq } from 'drizzle-orm';
import type { AttendanceStatus } from '@minton/types';
import type { DB } from './client';
import { attendances, events, members } from './schema';
import { newId } from '../lib/id';
import { nowUtcIso } from '../lib/time';

export async function eventExistsInCircle(db: DB, circleId: string, eventId: string): Promise<boolean> {
  const row = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.circleId, circleId), eq(events.id, eventId)))
    .get();
  return row !== undefined;
}

export async function memberExistsInCircle(db: DB, circleId: string, memberId: string): Promise<boolean> {
  const row = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.circleId, circleId), eq(members.id, memberId)))
    .get();
  return row !== undefined;
}

/**
 * 出欠を upsert する。UNIQUE(event_id, member_id) で競合したら既存レコードの status を更新する
 * （新規レコードは作らない: AC-09）。呼び出し側で Event / Member が circleId に属することを確認済みであること。
 */
export async function upsertAttendance(
  db: DB,
  params: { circleId: string; eventId: string; memberId: string; status: AttendanceStatus },
) {
  const now = nowUtcIso();
  const row = await db
    .insert(attendances)
    .values({
      id: newId(),
      circleId: params.circleId,
      eventId: params.eventId,
      memberId: params.memberId,
      status: params.status,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [attendances.eventId, attendances.memberId],
      set: { status: params.status, updatedAt: now },
      setWhere: eq(attendances.circleId, params.circleId),
    })
    .returning({
      eventId: attendances.eventId,
      memberId: attendances.memberId,
      status: attendances.status,
      updatedAt: attendances.updatedAt,
    })
    .get();
  return row;
}
