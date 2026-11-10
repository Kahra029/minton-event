/**
 * 出欠（T3）。/api/events にマウント（events.ts と同じプレフィックス）。業務ルールは usecase/attendance.ts。
 * 契約: packages/types/src/attendance.ts
 *   PUT /:eventId/attendances/:memberId   自分の出欠を upsert（requireAuth）
 * 注意: このファイルでは /:eventId/attendances/* 以外のパスを登録しないこと。
 */
import { Hono } from 'hono';
import { attendanceParamSchema, upsertAttendanceRequestSchema, type AttendanceResponse } from '@minton/types';
import type { AppEnv } from '../env';
import { parseJsonBody, parseParams } from '../errors';
import { setLogContext } from '../logger';
import { requireAuth } from '../middleware/auth';

const attendance = new Hono<AppEnv>();

attendance.put('/:eventId/attendances/:memberId', requireAuth, async (c) => {
  const { eventId, memberId } = parseParams(c, attendanceParamSchema);
  setLogContext(c, { eventId });
  const { status } = await parseJsonBody(c, upsertAttendanceRequestSchema);
  const row = await c.get('usecases').attendance.upsert(c.get('member'), { eventId, memberId, status });
  return c.json<AttendanceResponse>({ attendance: row }, 200);
});

export default attendance;
