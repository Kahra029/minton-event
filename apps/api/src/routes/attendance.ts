/**
 * 出欠（担当: T3）。/api/events にマウント済み（events.ts と同じプレフィックス）。
 * 契約: packages/types/src/attendance.ts
 *   PUT /:eventId/attendances/:memberId   自分の出欠を upsert（requireAuth）
 * 注意: このファイルでは /:eventId/attendances/* 以外のパスを登録しないこと。
 */
import { Hono } from 'hono';
import {
  attendanceParamSchema,
  upsertAttendanceRequestSchema,
  type AttendanceResponse,
} from '@minton/types';
import type { AppEnv } from '../bindings';
import { getDb } from '../db/client';
import { eventExistsInCircle, memberExistsInCircle, upsertAttendance } from '../db/attendance';
import { forbidden, internalError, notFound, parseJsonBody, parseParams } from '../lib/errors';
import { setLogContext } from '../lib/logger';
import { requireAuth } from '../middleware/auth';

const attendance = new Hono<AppEnv>();

attendance.put('/:eventId/attendances/:memberId', requireAuth, async (c) => {
  const { eventId, memberId } = parseParams(c, attendanceParamSchema);
  setLogContext(c, { eventId });
  const { status } = await parseJsonBody(c, upsertAttendanceRequestSchema);

  const me = c.get('member');
  const db = getDb(c.env.DB);

  // 判定順は契約どおり: Event 404 → Member 404 → 本人以外 403（admin も代理変更不可: AC-11）
  if (!(await eventExistsInCircle(db, me.circleId, eventId))) throw notFound('イベントが見つかりません');
  if (!(await memberExistsInCircle(db, me.circleId, memberId))) throw notFound('メンバーが見つかりません');
  if (memberId !== me.id) throw forbidden('他のメンバーの出欠は変更できません');

  const row = await upsertAttendance(db, { circleId: me.circleId, eventId, memberId, status });
  if (!row) throw internalError();

  return c.json<AttendanceResponse>({ attendance: row }, 200);
});

export default attendance;
