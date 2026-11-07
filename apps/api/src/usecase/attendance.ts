/**
 * 出欠（T3）。契約: packages/types/src/attendance.ts
 * 自分の出欠だけを upsert できる（admin も代理変更不可: AC-11）。未回答はレコードなし。
 */
import type { Attendance, AttendanceStatus } from '@minton/types';
import { forbidden, internalError, notFound } from './errors';
import type { AuthMember, NewId, Now } from './ports';

/** すべてのメソッドは circleId で絞り込む（guardrails §2） */
export interface AttendanceRepository {
  eventExists(circleId: string, eventId: string): Promise<boolean>;
  memberExists(circleId: string, memberId: string): Promise<boolean>;
  /**
   * UNIQUE(event_id, member_id) で競合したら既存レコードの status を更新する（新規レコードは作らない: AC-09）。
   * 呼び出し側で Event / Member が circleId に属することを確認済みであること。
   */
  upsert(params: {
    id: string;
    circleId: string;
    eventId: string;
    memberId: string;
    status: AttendanceStatus;
    now: string;
  }): Promise<Attendance | undefined>;
}

export type AttendanceDeps = { attendances: AttendanceRepository; now: Now; newId: NewId };

export function createAttendanceUsecase(deps: AttendanceDeps) {
  return {
    async upsert(
      member: AuthMember,
      params: { eventId: string; memberId: string; status: AttendanceStatus },
    ): Promise<Attendance> {
      const { circleId } = member;
      // 判定順は契約どおり: Event 404 → Member 404 → 本人以外 403
      if (!(await deps.attendances.eventExists(circleId, params.eventId))) throw notFound('イベントが見つかりません');
      if (!(await deps.attendances.memberExists(circleId, params.memberId))) throw notFound('メンバーが見つかりません');
      if (params.memberId !== member.id) throw forbidden('他のメンバーの出欠は変更できません');

      const row = await deps.attendances.upsert({ id: deps.newId(), circleId, ...params, now: deps.now() });
      if (!row) throw internalError();
      return row;
    },
  };
}

export type AttendanceUsecase = ReturnType<typeof createAttendanceUsecase>;
