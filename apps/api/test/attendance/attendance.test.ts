import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { AttendanceResponse } from '@minton/types';
import { attendances, members } from '../../src/db/schema';
import {
  createAttendance,
  createEvent,
  createMember,
  db,
  errorCode,
  request,
  sessionCookie,
  setupCircle,
} from '../helpers';

const path = (eventId: string, memberId: string) => `/api/events/${eventId}/attendances/${memberId}`;

const put = (eventId: string, memberId: string, body: unknown, cookie?: string) =>
  request(path(eventId, memberId), { method: 'PUT', body, cookie });

/** Event の Attendance レコード（circleId で絞る） */
const attendanceRows = (circleId: string, eventId: string) =>
  db()
    .select()
    .from(attendances)
    .where(and(eq(attendances.circleId, circleId), eq(attendances.eventId, eventId)))
    .all();

/**
 * Event 詳細と同じ定義の人数（Circle の全 Member のうち attending / absent / 未回答）。
 * Attendance レコードが無い Member は未回答（AC-10）。
 */
async function counts(circleId: string, eventId: string) {
  const circleMembers = await db().select({ id: members.id }).from(members).where(eq(members.circleId, circleId)).all();
  const rows = await attendanceRows(circleId, eventId);
  const byMember = new Map(rows.map((r) => [r.memberId, r.status]));
  const statuses = circleMembers.map((m) => byMember.get(m.id) ?? null);
  return {
    attending: statuses.filter((s) => s === 'attending').length,
    absent: statuses.filter((s) => s === 'absent').length,
    unanswered: statuses.filter((s) => s === null).length,
  };
}

async function setup() {
  const ctx = await setupCircle();
  const event = await createEvent({ circleId: ctx.circle.id, createdBy: ctx.admin.id });
  return { ...ctx, event };
}

describe('PUT /api/events/:eventId/attendances/:memberId', () => {
  describe('AC-07 参加を登録できる', () => {
    it('未登録から attending を登録するとレコードが作成され、参加人数が増える', async () => {
      const { circle, member, memberCookie, event } = await setup();
      expect(await counts(circle.id, event.id)).toEqual({ attending: 0, absent: 0, unanswered: 2 });

      const res = await put(event.id, member.id, { status: 'attending' }, memberCookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as AttendanceResponse;
      expect(body.attendance).toMatchObject({ eventId: event.id, memberId: member.id, status: 'attending' });
      expect(body.attendance.updatedAt).toMatch(/Z$/);

      const rows = await attendanceRows(circle.id, event.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ memberId: member.id, status: 'attending', circleId: circle.id });
      expect(await counts(circle.id, event.id)).toEqual({ attending: 1, absent: 0, unanswered: 1 });
    });

    it('他 Member（admin）の操作後の状態として、同じ Circle の Member から参加が確認できる', async () => {
      const { circle, admin, adminCookie, member, event } = await setup();
      const res = await put(event.id, admin.id, { status: 'attending' }, adminCookie);
      expect(res.status).toBe(200);

      // member 視点: 同じ Circle の Event の Attendance として admin の参加が見える
      const rows = await attendanceRows(member.circleId, event.id);
      expect(rows.map((r) => [r.memberId, r.status])).toEqual([[admin.id, 'attending']]);
      expect(await counts(circle.id, event.id)).toEqual({ attending: 1, absent: 0, unanswered: 1 });
    });
  });

  describe('AC-08 不参加を登録できる', () => {
    it('未登録から absent を登録するとレコードが作成され、不参加人数が増える（他 Member からも確認可能）', async () => {
      const { circle, admin, member, memberCookie, event } = await setup();
      const res = await put(event.id, member.id, { status: 'absent' }, memberCookie);
      expect(res.status).toBe(200);
      expect(((await res.json()) as AttendanceResponse).attendance.status).toBe('absent');

      const rows = await attendanceRows(admin.circleId, event.id);
      expect(rows.map((r) => [r.memberId, r.status])).toEqual([[member.id, 'absent']]);
      expect(await counts(circle.id, event.id)).toEqual({ attending: 0, absent: 1, unanswered: 1 });
    });
  });

  describe('AC-09 Attendance を変更できる', () => {
    it('attending → absent → attending でレコードは増えず既存を更新し、人数が ±1 される', async () => {
      const { circle, member, memberCookie, event } = await setup();

      expect((await put(event.id, member.id, { status: 'attending' }, memberCookie)).status).toBe(200);
      const [created] = await attendanceRows(circle.id, event.id);
      expect(await counts(circle.id, event.id)).toMatchObject({ attending: 1, absent: 0 });

      expect((await put(event.id, member.id, { status: 'absent' }, memberCookie)).status).toBe(200);
      let rows = await attendanceRows(circle.id, event.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(created.id);
      expect(rows[0].status).toBe('absent');
      expect(rows[0].createdAt).toBe(created.createdAt);
      expect(rows[0].updatedAt >= created.updatedAt).toBe(true);
      expect(await counts(circle.id, event.id)).toMatchObject({ attending: 0, absent: 1 });

      expect((await put(event.id, member.id, { status: 'attending' }, memberCookie)).status).toBe(200);
      rows = await attendanceRows(circle.id, event.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(created.id);
      expect(rows[0].status).toBe('attending');
      expect(await counts(circle.id, event.id)).toMatchObject({ attending: 1, absent: 0 });
    });

    it('同じ状態を再送してもレコードは 1 件のまま', async () => {
      const { circle, member, memberCookie, event } = await setup();
      await put(event.id, member.id, { status: 'absent' }, memberCookie);
      await put(event.id, member.id, { status: 'absent' }, memberCookie);
      expect(await attendanceRows(circle.id, event.id)).toHaveLength(1);
    });
  });

  describe('AC-10 未回答と不参加を区別できる', () => {
    it('Attendance 未登録の Member は未回答、absent は不参加として数える', async () => {
      const { circle, member, memberCookie, admin, event } = await setup();
      const other = await createMember({ circleId: circle.id });
      await put(event.id, member.id, { status: 'absent' }, memberCookie);

      const rows = await attendanceRows(circle.id, event.id);
      expect(rows.find((r) => r.memberId === member.id)?.status).toBe('absent');
      // 未回答はレコードなし（absent レコードを作らない）
      expect(rows.find((r) => r.memberId === admin.id)).toBeUndefined();
      expect(rows.find((r) => r.memberId === other.id)).toBeUndefined();
      expect(await counts(circle.id, event.id)).toEqual({ attending: 0, absent: 1, unanswered: 2 });
    });
  });

  describe('AC-11 他人の Attendance を変更できない', () => {
    it('同じ Circle の他 Member の memberId を指定すると 403、レコードは作られない', async () => {
      const { circle, admin, memberCookie, event } = await setup();
      const res = await put(event.id, admin.id, { status: 'attending' }, memberCookie);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe('FORBIDDEN');
      expect(await attendanceRows(circle.id, event.id)).toHaveLength(0);
    });

    it('admin でも他 Member の出欠は代理変更できない（403、既存レコードも変わらない）', async () => {
      const { circle, member, adminCookie, event } = await setup();
      await createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'attending' });

      const res = await put(event.id, member.id, { status: 'absent' }, adminCookie);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe('FORBIDDEN');
      const rows = await attendanceRows(circle.id, event.id);
      expect(rows.map((r) => r.status)).toEqual(['attending']);
    });

    it('エラーレスポンスに stack trace などの内部情報を含めない', async () => {
      const { admin, memberCookie, event } = await setup();
      const res = await put(event.id, admin.id, { status: 'attending' }, memberCookie);
      const json = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(json)).toEqual(['error']);
      expect(JSON.stringify(json)).not.toMatch(/stack|at .*\.ts/);
    });
  });

  describe('AC-12 別 Circle の Event を参照できない', () => {
    it('別 Circle の Event ID を指定すると 404 で、Attendance は作られない', async () => {
      const a = await setupCircle();
      const b = await setup();
      const res = await put(b.event.id, a.member.id, { status: 'attending' }, a.memberCookie);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
      expect(await attendanceRows(b.circle.id, b.event.id)).toHaveLength(0);
    });

    it('別 Circle の Event に、別 Circle の Member 自身の ID を指定しても 404（403 にしない）', async () => {
      const a = await setupCircle();
      const b = await setup();
      const res = await put(b.event.id, b.member.id, { status: 'attending' }, a.memberCookie);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
    });

    it('自分の Circle の Event に別 Circle の Member ID を指定すると 404（403 にしない）', async () => {
      const a = await setup();
      const b = await setupCircle();
      const res = await put(a.event.id, b.member.id, { status: 'attending' }, a.memberCookie);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
      expect(await attendanceRows(a.circle.id, a.event.id)).toHaveLength(0);
    });

    it('存在しない Event ID は 404', async () => {
      const { member, memberCookie } = await setupCircle();
      const res = await put('01NOTEXISTEVENT', member.id, { status: 'attending' }, memberCookie);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
    });

    it('404 のレスポンスに別 Circle の情報を含めない', async () => {
      const a = await setupCircle();
      const b = await setup();
      const res = await put(b.event.id, a.member.id, { status: 'attending' }, a.memberCookie);
      const text = await res.text();
      expect(text).not.toContain(b.circle.id);
      expect(text).not.toContain(b.event.location);
      expect(text).not.toContain(b.circle.name);
    });
  });

  describe('認証・Validation', () => {
    it('未ログインは 401', async () => {
      const { member, event } = await setup();
      const res = await put(event.id, member.id, { status: 'attending' });
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('UNAUTHORIZED');
    });

    it.each([[{}], [{ status: 'unanswered' }], [{ status: null }], [{ status: 'ATTENDING' }]])(
      '不正な status %j は 400 VALIDATION_ERROR',
      async (body) => {
        const { circle, member, memberCookie, event } = await setup();
        const res = await put(event.id, member.id, body, memberCookie);
        expect(res.status).toBe(400);
        expect(await errorCode(res)).toBe('VALIDATION_ERROR');
        expect(await attendanceRows(circle.id, event.id)).toHaveLength(0);
      },
    );

    it('JSON でないボディは 400 VALIDATION_ERROR', async () => {
      const { member, memberCookie, event } = await setup();
      const res = await put(event.id, member.id, 'not-json', memberCookie);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_ERROR');
    });

    it('別の Member でログインしていれば、その Member 自身の出欠は登録できる', async () => {
      const { circle, event } = await setup();
      const other = await createMember({ circleId: circle.id });
      const res = await put(event.id, other.id, { status: 'attending' }, await sessionCookie(other));
      expect(res.status).toBe(200);
    });
  });
});
