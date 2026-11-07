/**
 * Event フォームの値と API リクエストの変換（担当: T2）。
 * 入力は JST（datetime-local）。送信時に UTC ISO に変換する（B8）。
 * 検証は packages/types の eventInputSchema（B13: 終了 > 開始、C5: 文字数）に委ねる。API でも同じ検証が行われる。
 */
import { z } from 'zod';
import { eventInputSchema, type CreateEventRequest, type Event } from '@minton/types';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime';

export type EventFormValues = {
  title: string;
  startAt: string;
  endAt: string;
  location: string;
};

export const EVENT_FORM_FIELDS = ['title', 'startAt', 'endAt', 'location'] as const;

function localToIso(value: string): string {
  if (!value) return '';
  try {
    return fromDateTimeLocalValue(value);
  } catch {
    return value;
  }
}

export function toEventRequest(values: EventFormValues): CreateEventRequest {
  return {
    title: values.title,
    startAt: localToIso(values.startAt),
    endAt: localToIso(values.endAt),
    location: values.location,
  };
}

export const eventFormSchema = z
  .object({
    title: z.string(),
    startAt: z.string().min(1, '開始日時を入力してください'),
    endAt: z.string().min(1, '終了日時を入力してください'),
    location: z.string(),
  })
  .superRefine((values, ctx) => {
    const result = eventInputSchema.safeParse(toEventRequest(values));
    if (result.success) return;
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      // 未入力は上の min で報告済み
      if ((field === 'startAt' && !values.startAt) || (field === 'endAt' && !values.endAt)) continue;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: issue.path });
    }
  });

export function eventToFormValues(event: Event): EventFormValues {
  return {
    title: event.title ?? '',
    startAt: toDateTimeLocalValue(event.startAt),
    endAt: toDateTimeLocalValue(event.endAt),
    location: event.location,
  };
}

