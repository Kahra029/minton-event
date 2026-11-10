import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { attendances, events } from '../../src/datasource/db/schema';
import { createAttendance, createCircle, createEvent, createMember, db, setupCircle } from '../helpers';

describe('DB スキーマの制約', () => {
  it('circle_login_id は一意', async () => {
    const c = await createCircle();
    await expect(createCircle({ circleLoginId: c.circleLoginId })).rejects.toThrow();
  });

  it('UNIQUE(circle_id, email): 同じ Circle に同じ Email は登録できないが、別 Circle なら登録できる', async () => {
    const a = await createCircle();
    const b = await createCircle();
    await createMember({ circleId: a.id, email: 'dup@example.com' });
    await expect(createMember({ circleId: a.id, email: 'dup@example.com' })).rejects.toThrow();
    await expect(createMember({ circleId: b.id, email: 'dup@example.com' })).resolves.toBeDefined();
  });

  it('UNIQUE(event_id, member_id): 同じ Event に 2 つ目の Attendance は作れない', async () => {
    const { circle, admin, member } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'attending' });
    await expect(
      createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'absent' }),
    ).rejects.toThrow();
  });

  it('attendances.status は attending / absent のみ', async () => {
    const { circle, admin, member } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    await expect(
      createAttendance({
        circleId: circle.id,
        eventId: event.id,
        memberId: member.id,
        status: 'maybe' as 'attending',
      }),
    ).rejects.toThrow();
  });

  it('Event を削除すると Attendance も削除される（ON DELETE CASCADE: B1）', async () => {
    const { circle, admin, member } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'attending' });
    await db().delete(events).where(eq(events.id, event.id));
    expect(await db().select().from(attendances).where(eq(attendances.eventId, event.id))).toHaveLength(0);
  });

  it('別 Circle の Event / Member を組み合わせた Attendance は保存できない（複合 FK）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const eventB = await createEvent({ circleId: b.circle.id, createdBy: b.admin.id });
    await expect(
      createAttendance({ circleId: a.circle.id, eventId: eventB.id, memberId: a.member.id, status: 'attending' }),
    ).rejects.toThrow();
    await expect(
      createAttendance({ circleId: b.circle.id, eventId: eventB.id, memberId: a.member.id, status: 'attending' }),
    ).rejects.toThrow();
  });

  it('終了日時 <= 開始日時 の Event は保存できない', async () => {
    const { circle, admin } = await setupCircle();
    await expect(
      createEvent({
        circleId: circle.id,
        createdBy: admin.id,
        startAt: '2030-01-01T10:00:00.000Z',
        endAt: '2030-01-01T10:00:00.000Z',
      }),
    ).rejects.toThrow();
  });
});
