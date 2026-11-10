import { z } from 'zod';
import { LIMITS, dateTimeSchema, idSchema } from './common';
import { attendanceStatusSchema } from './attendance';

/**
 * Event の作成・編集の入力。
 * - title は任意（decisions B6）。空文字は null として扱う。
 * - endAt > startAt のみ検証（decisions B13）。
 */
export const eventInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(LIMITS.titleMax)
      .nullish()
      .transform((v) => (v ? v : null)),
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
    location: z.string().trim().min(LIMITS.locationMin, '場所を入力してください').max(LIMITS.locationMax),
  })
  .refine((v) => Date.parse(v.endAt) > Date.parse(v.startAt), {
    message: '終了日時は開始日時より後にしてください',
    path: ['endAt'],
  });

/** POST /api/events（admin のみ。member は 403）→ 201 EventResponse */
export const createEventRequestSchema = eventInputSchema;
export type CreateEventRequest = z.input<typeof createEventRequestSchema>;

/** PUT /api/events/:eventId（admin のみ。全項目を置き換え）→ 200 EventResponse */
export const updateEventRequestSchema = eventInputSchema;
export type UpdateEventRequest = z.input<typeof updateEventRequestSchema>;

// DELETE /api/events/:eventId（admin のみ）→ 204 No Content。物理削除、Attendance は CASCADE（B1）

export const eventIdParamSchema = z.object({ eventId: idSchema });

/** Event の基本情報。日時は UTC の ISO 8601 文字列（末尾 Z） */
export const eventSchema = z.object({
  id: idSchema,
  title: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  location: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Event = z.infer<typeof eventSchema>;

export const eventResponseSchema = z.object({ event: eventSchema });
export type EventResponse = z.infer<typeof eventResponseSchema>;

/** 自分の出欠。null = 未回答（Attendance レコードなし） */
export const myAttendanceStatusSchema = attendanceStatusSchema.nullable();

/**
 * GET /api/events（要ログイン）
 * 今後の Event（end_at > 現在: decisions C4）を開始日時の昇順（B7）。
 */
export const eventListItemSchema = eventSchema.extend({
  myStatus: myAttendanceStatusSchema,
  attendingCount: z.number().int().nonnegative(),
});
export type EventListItem = z.infer<typeof eventListItemSchema>;

export const eventListResponseSchema = z.object({ events: z.array(eventListItemSchema) });
export type EventListResponse = z.infer<typeof eventListResponseSchema>;

/**
 * GET /api/events/:eventId（要ログイン。別 Circle / 存在しない Event は 404）
 * members は Circle の全 Member（未回答含む）を Display Name 昇順（decisions C8）。
 */
export const eventMemberAttendanceSchema = z.object({
  memberId: idSchema,
  displayName: z.string(),
  status: myAttendanceStatusSchema,
});
export type EventMemberAttendance = z.infer<typeof eventMemberAttendanceSchema>;

export const eventDetailSchema = eventSchema.extend({
  myStatus: myAttendanceStatusSchema,
  counts: z.object({
    attending: z.number().int().nonnegative(),
    absent: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
  }),
  members: z.array(eventMemberAttendanceSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const eventDetailResponseSchema = z.object({ event: eventDetailSchema });
export type EventDetailResponse = z.infer<typeof eventDetailResponseSchema>;
