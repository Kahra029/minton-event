import { describe, expect, it, vi } from 'vitest';
import { createAttendanceUsecase, type AttendanceRepository } from '../../src/usecase/attendance';
import { adminOf, CIRCLE_A, CIRCLE_B, expectAppError, fakeIds, memberOf, NOW } from './fakes';

/** Circle A に event-a・member-a・admin-a、Circle B に event-b・member-b がいる */
function setup() {
  const events = new Set([`${CIRCLE_A}/event-a`, `${CIRCLE_B}/event-b`]);
  const members = new Set([`${CIRCLE_A}/member-${CIRCLE_A}`, `${CIRCLE_A}/admin-${CIRCLE_A}`, `${CIRCLE_B}/member-${CIRCLE_B}`]);
  const repo: AttendanceRepository = {
    eventExists: async (circleId, eventId) => events.has(`${circleId}/${eventId}`),
    memberExists: async (circleId, memberId) => members.has(`${circleId}/${memberId}`),
    upsert: vi.fn(async (p) => ({ eventId: p.eventId, memberId: p.memberId, status: p.status, updatedAt: p.now })),
  };
  return { usecase: createAttendanceUsecase({ attendances: repo, now: () => NOW, newId: fakeIds() }), repo };
}

describe('attendance usecase', () => {
  it('自分の出欠は upsert できる（自分の Circle で保存する）', async () => {
    const { usecase, repo } = setup();
    const me = memberOf(CIRCLE_A);
    const row = await usecase.upsert(me, { eventId: 'event-a', memberId: me.id, status: 'attending' });
    expect(row).toEqual({ eventId: 'event-a', memberId: me.id, status: 'attending', updatedAt: NOW });
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ circleId: CIRCLE_A, id: 'id-1', now: NOW }));
  });

  it('他人の出欠は 403（保存しない）', async () => {
    const { usecase, repo } = setup();
    await expectAppError(
      usecase.upsert(memberOf(CIRCLE_A), { eventId: 'event-a', memberId: `admin-${CIRCLE_A}`, status: 'absent' }),
      'FORBIDDEN',
      '他のメンバーの出欠は変更できません',
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('admin でも他人の出欠は 403（AC-11）', async () => {
    const { usecase, repo } = setup();
    await expectAppError(
      usecase.upsert(adminOf(CIRCLE_A), { eventId: 'event-a', memberId: `member-${CIRCLE_A}`, status: 'absent' }),
      'FORBIDDEN',
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('別 Circle の Event は 404（自分の出欠でも）', async () => {
    const { usecase, repo } = setup();
    const me = memberOf(CIRCLE_A);
    await expectAppError(
      usecase.upsert(me, { eventId: 'event-b', memberId: me.id, status: 'attending' }),
      'NOT_FOUND',
      'イベントが見つかりません',
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('別 Circle の Member は 403 ではなく 404（存在を開示しない）', async () => {
    const { usecase } = setup();
    await expectAppError(
      usecase.upsert(memberOf(CIRCLE_A), { eventId: 'event-a', memberId: `member-${CIRCLE_B}`, status: 'attending' }),
      'NOT_FOUND',
      'メンバーが見つかりません',
    );
  });
});
