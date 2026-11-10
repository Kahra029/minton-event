import { z } from 'zod';
import { idSchema } from './common';

/** 保存される出欠状態。未回答はレコードなしで表現する */
export const attendanceStatusSchema = z.enum(['attending', 'absent']);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/**
 * PUT /api/events/:eventId/attendances/:memberId（要ログイン）
 * 自分の出欠を upsert する（UNIQUE(event_id, member_id) により新規作成 or 更新）。
 * 判定順:
 *   1. Event が自分の Circle に無い → 404
 *   2. memberId が自分の Circle の Member に無い → 404
 *   3. memberId が自分以外 → 403（admin も代理変更不可: AC-11）
 * → 200 AttendanceResponse
 */
export const attendanceParamSchema = z.object({
  eventId: idSchema,
  memberId: idSchema,
});

export const upsertAttendanceRequestSchema = z.object({
  status: attendanceStatusSchema,
});
export type UpsertAttendanceRequest = z.infer<typeof upsertAttendanceRequestSchema>;

export const attendanceSchema = z.object({
  eventId: idSchema,
  memberId: idSchema,
  status: attendanceStatusSchema,
  updatedAt: z.string(),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const attendanceResponseSchema = z.object({ attendance: attendanceSchema });
export type AttendanceResponse = z.infer<typeof attendanceResponseSchema>;
