import { describe, expect, it, vi } from 'vitest';
import type { Event, EventMemberAttendance } from '@minton/types';
import { createEventUsecase, type EventInput, type EventRepository } from '../../src/usecase/events';
import { adminOf, CIRCLE_A, CIRCLE_B, expectAppError, fakeIds, fakeLog, memberOf, NOW } from './fakes';

type Stored = Event & { circleId: string };

function setup(initial: Stored[] = [], attendances: EventMemberAttendance[] = []) {
  const stored = [...initial];
  const find = (circleId: string, id: string) => stored.find((e) => e.circleId === circleId && e.id === id);
  const strip = ({ circleId: _c, ...e }: Stored): Event => e;
  const repo: EventRepository = {
    listUpcoming: vi.fn(async () => []),
    find: vi.fn(async (circleId, id) => {
      const e = find(circleId, id);
      return e && strip(e);
    }),
    listMemberAttendances: vi.fn(async () => attendances),
    insert: vi.fn(async (p) => {
      const e: Stored = {
        id: p.id,
        circleId: p.circleId,
        title: p.title,
        startAt: p.startAt,
        endAt: p.endAt,
        location: p.location,
        createdAt: p.now,
        updatedAt: p.now,
      };
      stored.push(e);
      return strip(e);
    }),
    update: vi.fn(async (p) => {
      const e = find(p.circleId, p.eventId);
      if (!e) return undefined;
      Object.assign(e, { title: p.title, startAt: p.startAt, endAt: p.endAt, location: p.location, updatedAt: p.now });
      return strip(e);
    }),
    delete: vi.fn(async (circleId, id) => {
      const e = find(circleId, id);
      if (!e) return false;
      stored.splice(stored.indexOf(e), 1);
      return true;
    }),
  };
  const { log, context } = fakeLog();
  const usecase = createEventUsecase({ events: repo, now: () => NOW, newId: fakeIds(), log });
  return { usecase, repo, stored, context };
}

const eventInCircleB: Stored = {
  id: 'event-b',
  circleId: CIRCLE_B,
  title: '練習',
  startAt: '2026-11-08T01:00:00.000Z',
  endAt: '2026-11-08T03:00:00.000Z',
  location: '体育館',
  createdAt: NOW,
  updatedAt: NOW,
};

const input: EventInput = {
  title: null,
  startAt: '2026-11-08T10:00:00+09:00',
  endAt: '2026-11-08T12:00:00+09:00',
  location: '市民体育館',
};

describe('events usecase: admin のみの操作', () => {
  it('member は作成できない（403、保存しない）', async () => {
    const { usecase, repo } = setup();
    await expectAppError(usecase.create(memberOf(CIRCLE_A), input), 'FORBIDDEN');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('member は編集できない（403、更新しない）', async () => {
    const { usecase, repo } = setup([{ ...eventInCircleB, circleId: CIRCLE_A }]);
    await expectAppError(usecase.update(memberOf(CIRCLE_A), 'event-b', input), 'FORBIDDEN');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('member は削除できない（403、削除しない）', async () => {
    const { usecase, repo } = setup([{ ...eventInCircleB, circleId: CIRCLE_A }]);
    await expectAppError(usecase.delete(memberOf(CIRCLE_A), 'event-b'), 'FORBIDDEN');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('admin は自分の Circle に作成できる。日時は UTC に正規化し、ログに eventId を載せる', async () => {
    const { usecase, repo, context } = setup();
    const event = await usecase.create(adminOf(CIRCLE_A), input);
    expect(event).toMatchObject({ id: 'id-1', startAt: '2026-11-08T01:00:00.000Z', endAt: '2026-11-08T03:00:00.000Z' });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ circleId: CIRCLE_A, createdBy: adminOf(CIRCLE_A).id }));
    expect(context).toEqual({ eventId: 'id-1' });
  });
});

describe('events usecase: 別 Circle の Event は 404', () => {
  it('詳細', async () => {
    const { usecase } = setup([eventInCircleB]);
    await expectAppError(usecase.getDetail(memberOf(CIRCLE_A), 'event-b'), 'NOT_FOUND', 'イベントが見つかりません');
  });

  it('編集（admin でも）', async () => {
    const { usecase, stored } = setup([eventInCircleB]);
    await expectAppError(usecase.update(adminOf(CIRCLE_A), 'event-b', input), 'NOT_FOUND');
    expect(stored[0].location).toBe('体育館');
  });

  it('削除（admin でも）', async () => {
    const { usecase, stored } = setup([eventInCircleB]);
    await expectAppError(usecase.delete(adminOf(CIRCLE_A), 'event-b'), 'NOT_FOUND');
    expect(stored).toHaveLength(1);
  });
});

describe('events usecase: 詳細の集計', () => {
  it('参加・不参加・未回答を数え、自分の出欠を付ける', async () => {
    const me = memberOf(CIRCLE_B, 'm1');
    const { usecase } = setup(
      [eventInCircleB],
      [
        { memberId: 'm1', displayName: 'A', status: 'attending' },
        { memberId: 'm2', displayName: 'B', status: 'absent' },
        { memberId: 'm3', displayName: 'C', status: null },
        { memberId: 'm4', displayName: 'D', status: 'attending' },
      ],
    );
    const detail = await usecase.getDetail(me, 'event-b');
    expect(detail.counts).toEqual({ attending: 2, absent: 1, unanswered: 1 });
    expect(detail.myStatus).toBe('attending');
    expect(detail.members).toHaveLength(4);
  });
});
