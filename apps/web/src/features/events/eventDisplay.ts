import type { AttendanceStatus, Event } from '@minton/types';
import { formatDateTimeRange } from '@/lib/datetime';

/** 自分 / 各 Member の出欠の表示名。null = 未回答（Attendance レコードなし） */
export function attendanceLabel(status: AttendanceStatus | null): string {
  if (status === 'attending') return '参加';
  if (status === 'absent') return '不参加';
  return '未回答';
}

/**
 * Event の見出し（decisions B6）。
 * Title があれば Title、無ければ日時を見出しにする（場所は見出しのすぐ下に必ず表示する）。
 */
export function eventHeading(event: Pick<Event, 'title' | 'startAt' | 'endAt'>): string {
  return event.title ?? formatDateTimeRange(event.startAt, event.endAt);
}
