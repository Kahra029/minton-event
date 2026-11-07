import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { EventDetailResponse, EventListResponse, EventResponse } from '@minton/types';
import { attendances, events } from '../../src/db/schema';
import { addMs, DAY_MS, nowUtcIso } from '../../src/lib/time';
import { createAttendance, createEvent, createMember, db, errorCode, request, sessionCookie, setupCircle } from '../helpers';

const HOUR_MS = 60 * 60 * 1000;
/**
 * ボディなしの DELETE は Content-Type が無く、hono/csrf が text/plain 扱いで Origin を要求する。
 * ブラウザの同一オリジン fetch は Origin / Sec-Fetch-Site を付けるので、テストでも付ける。
 */
const SAME_ORIGIN = { Origin: 'http://localhost' };

const validInput = () => {
  const startAt = addMs(nowUtcIso(), 3 * DAY_MS);
  return { title: '定例練習', startAt, endAt: addMs(startAt, 2 * HOUR_MS), location: '市民体育館' };
};

const listEvents = async (cookie: string) => {
  const res = await request('/api/events', { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as EventListResponse).events;
};

const getDetail = async (eventId: string, cookie: string) => {
  const res = await request(`/api/events/${eventId}`, { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as EventDetailResponse).event;
};

const attendanceRows = (eventId: string) =>
  db().select().from(attendances).where(eq(attendances.eventId, eventId));

describe('POST /api/events（AC-03 / AC-04）', () => {
  it('admin は作成でき、自分の Circle に所属し、同一 Circle の Member から閲覧できる', async () => {
    const { circle, admin, adminCookie, memberCookie } = await setupCircle();
    const input = validInput();
    const res = await request('/api/events', { method: 'POST', body: input, cookie: adminCookie });
    expect(res.status).toBe(201);
    const { event } = (await res.json()) as EventResponse;
    expect(event).toMatchObject({ title: '定例練習', startAt: input.startAt, endAt: input.endAt, location: '市民体育館' });
    expect(Object.keys(event).sort()).toEqual(['createdAt', 'endAt', 'id', 'location', 'startAt', 'title', 'updatedAt']);

    const row = await db().query.events.findFirst({ where: eq(events.id, event.id) });
    expect(row).toMatchObject({ circleId: circle.id, createdBy: admin.id });

    const detail = await getDetail(event.id, memberCookie);
    expect(detail.id).toBe(event.id);
  });

  it('別 Circle からは閲覧できない', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const res = await request('/api/events', { method: 'POST', body: validInput(), cookie: a.adminCookie });
    const { event } = (await res.json()) as EventResponse;
    const other = await request(`/api/events/${event.id}`, { cookie: b.memberCookie });
    expect(other.status).toBe(404);
    expect((await listEvents(b.adminCookie)).map((e) => e.id)).not.toContain(event.id);
  });

  it('日時は UTC（末尾 Z）に正規化して保存・返却する（B8）', async () => {
    const { adminCookie } = await setupCircle();
    const res = await request('/api/events', {
      method: 'POST',
      body: { startAt: '2099-11-07T19:00:00+09:00', endAt: '2099-11-07T21:00:00+09:00', location: '体育館' },
      cookie: adminCookie,
    });
    expect(res.status).toBe(201);
    const { event } = (await res.json()) as EventResponse;
    expect(event.startAt).toBe('2099-11-07T10:00:00.000Z');
    expect(event.endAt).toBe('2099-11-07T12:00:00.000Z');
  });

  it('Title は任意。未入力・空文字は null（B6）', async () => {
    const { adminCookie } = await setupCircle();
    const { title: _t, ...noTitle } = validInput();
    void _t;
    for (const body of [noTitle, { ...noTitle, title: '' }, { ...noTitle, title: '   ' }, { ...noTitle, title: null }]) {
      const res = await request('/api/events', { method: 'POST', body, cookie: adminCookie });
      expect(res.status).toBe(201);
      expect(((await res.json()) as EventResponse).event.title).toBeNull();
    }
  });

  it('member は API を直接呼んでも 403 で、作成されない', async () => {
    const { circle, memberCookie } = await setupCircle();
    const res = await request('/api/events', { method: 'POST', body: validInput(), cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN');
    const rows = await db().select().from(events).where(eq(events.circleId, circle.id));
    expect(rows).toHaveLength(0);
  });

  it('未ログインは 401', async () => {
    const res = await request('/api/events', { method: 'POST', body: validInput() });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHORIZED');
  });

  describe('Validation', () => {
    it.each([
      ['終了 = 開始（B13）', (i: ReturnType<typeof validInput>) => ({ ...i, endAt: i.startAt }), 'endAt'],
      ['終了 < 開始（B13）', (i: ReturnType<typeof validInput>) => ({ ...i, endAt: addMs(i.startAt, -HOUR_MS) }), 'endAt'],
      ['場所が空', (i: ReturnType<typeof validInput>) => ({ ...i, location: '  ' }), 'location'],
      ['場所が 101 文字', (i: ReturnType<typeof validInput>) => ({ ...i, location: 'あ'.repeat(101) }), 'location'],
      ['Title が 101 文字', (i: ReturnType<typeof validInput>) => ({ ...i, title: 'あ'.repeat(101) }), 'title'],
      ['開始日時が不正', (i: ReturnType<typeof validInput>) => ({ ...i, startAt: 'tomorrow' }), 'startAt'],
      ['タイムゾーンなしの日時', (i: ReturnType<typeof validInput>) => ({ ...i, startAt: '2099-11-07T19:00:00' }), 'startAt'],
      ['開始日時なし', (i: ReturnType<typeof validInput>) => ({ ...i, startAt: undefined }), 'startAt'],
    ])('%s は 400', async (_name, mutate, field) => {
      const { adminCookie } = await setupCircle();
      const res = await request('/api/events', { method: 'POST', body: mutate(validInput()), cookie: adminCookie });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { code: string; details: { fieldErrors: Record<string, string[]> } } };
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.details.fieldErrors[field]).toBeDefined();
    });

    it('境界値: 場所 100 文字・Title 100 文字は作成できる', async () => {
      const { adminCookie } = await setupCircle();
      const body = { ...validInput(), location: 'あ'.repeat(100), title: 'い'.repeat(100) };
      const res = await request('/api/events', { method: 'POST', body, cookie: adminCookie });
      expect(res.status).toBe(201);
    });

    it('JSON でないボディは 400', async () => {
      const { adminCookie } = await setupCircle();
      const res = await request('/api/events', { method: 'POST', body: '{bad', cookie: adminCookie });
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_ERROR');
    });
  });
});

describe('GET /api/events（AC-05 / B7 / C4）', () => {
  it('今後の Event（end_at > 現在、開催中を含む）を開始日時の昇順で返す', async () => {
    const { circle, admin, memberCookie } = await setupCircle();
    const now = nowUtcIso();
    const later = await createEvent({ circleId: circle.id, createdBy: admin.id, startAt: addMs(now, 5 * DAY_MS) });
    const sooner = await createEvent({ circleId: circle.id, createdBy: admin.id, startAt: addMs(now, DAY_MS) });
    const ongoing = await createEvent({
      circleId: circle.id,
      createdBy: admin.id,
      startAt: addMs(now, -HOUR_MS),
      endAt: addMs(now, HOUR_MS),
    });
    await createEvent({
      circleId: circle.id,
      createdBy: admin.id,
      startAt: addMs(now, -3 * HOUR_MS),
      endAt: addMs(now, -HOUR_MS),
    });

    const list = await listEvents(memberCookie);
    expect(list.map((e) => e.id)).toEqual([ongoing.id, sooner.id, later.id]);
  });

  it('自分の出欠状態（未回答は null）と参加人数を返す', async () => {
    const { circle, admin, member, memberCookie } = await setupCircle();
    const other = await createMember({ circleId: circle.id });
    const now = nowUtcIso();
    const e1 = await createEvent({ circleId: circle.id, createdBy: admin.id, startAt: addMs(now, DAY_MS) });
    const e2 = await createEvent({ circleId: circle.id, createdBy: admin.id, startAt: addMs(now, 2 * DAY_MS) });
    const e3 = await createEvent({ circleId: circle.id, createdBy: admin.id, startAt: addMs(now, 3 * DAY_MS) });
    await createAttendance({ circleId: circle.id, eventId: e1.id, memberId: member.id, status: 'attending' });
    await createAttendance({ circleId: circle.id, eventId: e1.id, memberId: admin.id, status: 'attending' });
    await createAttendance({ circleId: circle.id, eventId: e1.id, memberId: other.id, status: 'absent' });
    await createAttendance({ circleId: circle.id, eventId: e2.id, memberId: member.id, status: 'absent' });
    await createAttendance({ circleId: circle.id, eventId: e2.id, memberId: other.id, status: 'attending' });

    const list = await listEvents(memberCookie);
    expect(list.map((e) => [e.id, e.myStatus, e.attendingCount])).toEqual([
      [e1.id, 'attending', 2],
      [e2.id, 'absent', 1],
      [e3.id, null, 0],
    ]);
    expect(list[0]).toMatchObject({ startAt: e1.startAt, endAt: e1.endAt, location: e1.location, title: e1.title });
  });

  it('別 Circle の Event は含まれない（AC-12）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const mine = await createEvent({ circleId: a.circle.id, createdBy: a.admin.id });
    await createEvent({ circleId: b.circle.id, createdBy: b.admin.id });
    const list = await listEvents(a.memberCookie);
    expect(list.map((e) => e.id)).toEqual([mine.id]);
  });

  it('未ログインは 401', async () => {
    const res = await request('/api/events');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/events/:eventId（AC-06 / AC-10）', () => {
  it('日時・場所・自分の出欠・参加/不参加/未回答人数・全 Member の出欠（Display Name 昇順）を返す', async () => {
    const { circle, admin, member, memberCookie } = await setupCircle();
    // setupCircle の displayName: 管理者 / メンバー
    const alice = await createMember({ circleId: circle.id, displayName: 'Alice' });
    const bob = await createMember({ circleId: circle.id, displayName: 'Bob' });
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id, title: null });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'attending' });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: alice.id, status: 'absent' });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: admin.id, status: 'attending' });

    const detail = await getDetail(event.id, memberCookie);
    expect(detail).toMatchObject({
      id: event.id,
      title: null,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location,
      myStatus: 'attending',
      counts: { attending: 2, absent: 1, unanswered: 1 },
    });
    expect(detail.members).toEqual([
      { memberId: alice.id, displayName: 'Alice', status: 'absent' },
      { memberId: bob.id, displayName: 'Bob', status: null },
      { memberId: member.id, displayName: 'メンバー', status: 'attending' },
      { memberId: admin.id, displayName: '管理者', status: 'attending' },
    ]);
  });

  it('未回答（レコードなし）と不参加を区別する', async () => {
    const { circle, admin, member, memberCookie, adminCookie } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: admin.id, status: 'absent' });

    const asMember = await getDetail(event.id, memberCookie);
    expect(asMember.myStatus).toBeNull();
    expect(asMember.counts).toEqual({ attending: 0, absent: 1, unanswered: 1 });
    expect(asMember.members.find((m) => m.memberId === member.id)?.status).toBeNull();

    const asAdmin = await getDetail(event.id, adminCookie);
    expect(asAdmin.myStatus).toBe('absent');
  });

  it('別 Circle の Event は 404 で、Event・Attendance・Member の情報を返さない（AC-12）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const event = await createEvent({ circleId: b.circle.id, createdBy: b.admin.id, title: 'B の秘密練習', location: 'B 体育館' });
    await createAttendance({ circleId: b.circle.id, eventId: event.id, memberId: b.member.id, status: 'attending' });

    for (const cookie of [a.memberCookie, a.adminCookie]) {
      const res = await request(`/api/events/${event.id}`, { cookie });
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(JSON.parse(text).error.code).toBe('NOT_FOUND');
      for (const secret of ['B の秘密練習', 'B 体育館', b.member.id, b.admin.id, b.circle.id, 'メンバー']) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it('自分の Circle の詳細に別 Circle の Member は含まれない', async () => {
    const a = await setupCircle();
    await setupCircle();
    const event = await createEvent({ circleId: a.circle.id, createdBy: a.admin.id });
    const detail = await getDetail(event.id, a.memberCookie);
    expect(detail.members.map((m) => m.memberId).sort()).toEqual([a.admin.id, a.member.id].sort());
  });

  it('存在しない Event は 404、未ログインは 401', async () => {
    const { memberCookie, circle, admin } = await setupCircle();
    expect((await request('/api/events/does-not-exist', { cookie: memberCookie })).status).toBe(404);
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    expect((await request(`/api/events/${event.id}`)).status).toBe(401);
  });
});

describe('PUT /api/events/:eventId（AC-18）', () => {
  it('admin は開始・終了日時と場所を変更でき、同一 Circle の Member から更新後の情報を確認できる', async () => {
    const { circle, admin, adminCookie, memberCookie } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    const startAt = addMs(nowUtcIso(), 10 * DAY_MS);
    const body = { title: '', startAt, endAt: addMs(startAt, 3 * HOUR_MS), location: '県立体育館' };
    const res = await request(`/api/events/${event.id}`, { method: 'PUT', body, cookie: adminCookie });
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as EventResponse).event;
    expect(updated).toMatchObject({ id: event.id, title: null, startAt, endAt: body.endAt, location: '県立体育館' });
    expect(updated.createdAt).toBe(event.createdAt);

    const detail = await getDetail(event.id, memberCookie);
    expect(detail).toMatchObject({ startAt, endAt: body.endAt, location: '県立体育館', title: null });
  });

  it('member は 403 で、変更されない', async () => {
    const { circle, admin, memberCookie } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    const res = await request(`/api/events/${event.id}`, { method: 'PUT', body: validInput(), cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN');
    const row = await db().query.events.findFirst({ where: eq(events.id, event.id) });
    expect(row?.location).toBe(event.location);
  });

  it('終了 <= 開始は 400（B13）', async () => {
    const { circle, admin, adminCookie } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    const input = validInput();
    const res = await request(`/api/events/${event.id}`, {
      method: 'PUT',
      body: { ...input, endAt: input.startAt },
      cookie: adminCookie,
    });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('別 Circle の Event は 404 で、変更されない（AC-12）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const event = await createEvent({ circleId: b.circle.id, createdBy: b.admin.id });
    const res = await request(`/api/events/${event.id}`, { method: 'PUT', body: validInput(), cookie: a.adminCookie });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('NOT_FOUND');
    const row = await db().query.events.findFirst({ where: eq(events.id, event.id) });
    expect(row?.location).toBe(event.location);
  });

  it('未ログインは 401', async () => {
    const { circle, admin } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    expect((await request(`/api/events/${event.id}`, { method: 'PUT', body: validInput() })).status).toBe(401);
  });
});

describe('DELETE /api/events/:eventId（AC-19 / B1）', () => {
  it('admin が削除すると 204、以後 Event は 404 で、関連 Attendance も残らない', async () => {
    const { circle, admin, member, adminCookie, memberCookie } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    const keep = await createEvent({ circleId: circle.id, createdBy: admin.id });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'attending' });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: admin.id, status: 'absent' });
    await createAttendance({ circleId: circle.id, eventId: keep.id, memberId: member.id, status: 'attending' });

    const res = await request(`/api/events/${event.id}`, { method: 'DELETE', headers: SAME_ORIGIN, cookie: adminCookie });
    expect(res.status).toBe(204);

    expect((await request(`/api/events/${event.id}`, { cookie: memberCookie })).status).toBe(404);
    expect((await listEvents(memberCookie)).map((e) => e.id)).toEqual([keep.id]);
    expect(await db().query.events.findFirst({ where: eq(events.id, event.id) })).toBeUndefined();
    expect(await attendanceRows(event.id)).toHaveLength(0);
    expect(await attendanceRows(keep.id)).toHaveLength(1);

    // 二重削除も 404
    expect((await request(`/api/events/${event.id}`, { method: 'DELETE', headers: SAME_ORIGIN, cookie: adminCookie })).status).toBe(404);
  });

  it('member は 403 で、削除されない', async () => {
    const { circle, admin, member, memberCookie } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    await createAttendance({ circleId: circle.id, eventId: event.id, memberId: member.id, status: 'attending' });
    const res = await request(`/api/events/${event.id}`, { method: 'DELETE', headers: SAME_ORIGIN, cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN');
    expect(await db().query.events.findFirst({ where: eq(events.id, event.id) })).toBeDefined();
    expect(await attendanceRows(event.id)).toHaveLength(1);
  });

  it('別 Circle の Event は 404 で、削除されない（AC-12）', async () => {
    const a = await setupCircle();
    const b = await setupCircle();
    const event = await createEvent({ circleId: b.circle.id, createdBy: b.admin.id });
    await createAttendance({ circleId: b.circle.id, eventId: event.id, memberId: b.member.id, status: 'attending' });
    const res = await request(`/api/events/${event.id}`, { method: 'DELETE', headers: SAME_ORIGIN, cookie: a.adminCookie });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('NOT_FOUND');
    expect(
      await db().query.events.findFirst({ where: and(eq(events.id, event.id), eq(events.circleId, b.circle.id)) }),
    ).toBeDefined();
    expect(await attendanceRows(event.id)).toHaveLength(1);
  });

  it('未ログインは 401', async () => {
    const { circle, admin } = await setupCircle();
    const event = await createEvent({ circleId: circle.id, createdBy: admin.id });
    expect((await request(`/api/events/${event.id}`, { method: 'DELETE', headers: SAME_ORIGIN })).status).toBe(401);
  });
});

describe('別 Circle の Member の Session', () => {
  it('Circle B の admin の Session で Circle A の Event を操作できない', async () => {
    const a = await setupCircle();
    const bAdmin = await createMember({ circleId: (await setupCircle()).circle.id, role: 'admin' });
    const cookie = await sessionCookie(bAdmin);
    const event = await createEvent({ circleId: a.circle.id, createdBy: a.admin.id });
    expect((await request(`/api/events/${event.id}`, { cookie })).status).toBe(404);
    expect((await request(`/api/events/${event.id}`, { method: 'PUT', body: validInput(), cookie })).status).toBe(404);
    expect((await request(`/api/events/${event.id}`, { method: 'DELETE', headers: SAME_ORIGIN, cookie })).status).toBe(404);
  });
});
