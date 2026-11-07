/**
 * Event（T2）。契約: packages/types/src/events.ts
 * Circle は常にログイン中の Member の circleId を使い、別 Circle の Event は 404（B14 / AC-12）。
 */
import type { Event, EventDetail, EventListItem, EventMemberAttendance } from '@minton/types';
import { assertAdmin } from './authorization';
import { notFound } from './errors';
import type { AuthMember, NewId, Now, RequestLogger } from './ports';
import { toUtcIso } from './time';

const EVENT_NOT_FOUND = 'イベントが見つかりません';

/** 作成・編集の入力（zod で検証済み。日時は未正規化） */
export type EventInput = { title: string | null; startAt: string; endAt: string; location: string };

/** 保存する値（日時は UTC ISO に正規化済み） */
export type EventValues = EventInput;

/** すべてのメソッドは circleId で絞り込む（guardrails §2） */
export interface EventRepository {
  /** end_at > now（C4）の Event を開始日時の昇順（B7）で。自分の出欠と参加人数付き */
  listUpcoming(params: { circleId: string; memberId: string; now: string }): Promise<EventListItem[]>;
  find(circleId: string, eventId: string): Promise<Event | undefined>;
  /** Circle の全 Member（未回答含む）の出欠を Display Name 昇順（C8）で */
  listMemberAttendances(circleId: string, eventId: string): Promise<EventMemberAttendance[]>;
  insert(params: EventValues & { id: string; circleId: string; createdBy: string; now: string }): Promise<Event>;
  /** 更新した Event。自分の Circle に無ければ undefined */
  update(params: EventValues & { circleId: string; eventId: string; now: string }): Promise<Event | undefined>;
  /** 物理削除（B1。Attendance は CASCADE）。削除できたら true */
  delete(circleId: string, eventId: string): Promise<boolean>;
}

export type EventDeps = { events: EventRepository; now: Now; newId: NewId; log: RequestLogger };

function normalize(input: EventInput): EventValues {
  return { title: input.title, startAt: toUtcIso(input.startAt), endAt: toUtcIso(input.endAt), location: input.location };
}

export function createEventUsecase(deps: EventDeps) {
  return {
    async listUpcoming(member: AuthMember): Promise<EventListItem[]> {
      return deps.events.listUpcoming({ circleId: member.circleId, memberId: member.id, now: deps.now() });
    },

    /** admin のみ */
    async create(member: AuthMember, input: EventInput): Promise<Event> {
      assertAdmin(member);
      const id = deps.newId();
      deps.log.addContext({ eventId: id });
      return deps.events.insert({
        id,
        circleId: member.circleId,
        createdBy: member.id,
        ...normalize(input),
        now: deps.now(),
      });
    },

    /** 詳細。全 Member の出欠（レコードなし = 未回答: AC-10）と人数を付ける */
    async getDetail(member: AuthMember, eventId: string): Promise<EventDetail> {
      const event = await deps.events.find(member.circleId, eventId);
      if (!event) throw notFound(EVENT_NOT_FOUND);
      const members = await deps.events.listMemberAttendances(member.circleId, event.id);
      const counts = { attending: 0, absent: 0, unanswered: 0 };
      for (const m of members) {
        if (m.status === 'attending') counts.attending++;
        else if (m.status === 'absent') counts.absent++;
        else counts.unanswered++;
      }
      return {
        ...event,
        myStatus: members.find((m) => m.memberId === member.id)?.status ?? null,
        counts,
        members,
      };
    },

    /** admin のみ。全項目を置き換え */
    async update(member: AuthMember, eventId: string, input: EventInput): Promise<Event> {
      assertAdmin(member);
      const event = await deps.events.update({ circleId: member.circleId, eventId, ...normalize(input), now: deps.now() });
      if (!event) throw notFound(EVENT_NOT_FOUND);
      return event;
    },

    /** admin のみ */
    async delete(member: AuthMember, eventId: string): Promise<void> {
      assertAdmin(member);
      if (!(await deps.events.delete(member.circleId, eventId))) throw notFound(EVENT_NOT_FOUND);
    },
  };
}

export type EventUsecase = ReturnType<typeof createEventUsecase>;
