/**
 * 日時の表示・入力（decisions B8: DB / API は UTC、表示は JST）。
 * API の値（UTC ISO）を表示するときと、フォーム入力（JST）を API に送るときは必ずここを通す。
 */
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import 'dayjs/locale/ja';

dayjs.extend(utc);
dayjs.extend(timezone);

export const DISPLAY_TZ = 'Asia/Tokyo';

const inJst = (iso: string) => dayjs(iso).tz(DISPLAY_TZ).locale('ja');

/** 例: 11/7(土) */
export const formatDate = (iso: string) => inJst(iso).format('M/D(dd)');
/** 例: 19:00 */
export const formatTime = (iso: string) => inJst(iso).format('HH:mm');
/** 例: 11/7(土) 19:00〜21:00（日付をまたぐ場合は終了側にも日付を付ける） */
export function formatDateTimeRange(startIso: string, endIso: string): string {
  const s = inJst(startIso);
  const e = inJst(endIso);
  const end = s.isSame(e, 'day') ? e.format('HH:mm') : e.format('M/D(dd) HH:mm');
  return `${s.format('M/D(dd) HH:mm')}〜${end}`;
}

/** UTC ISO → <input type="datetime-local"> の値（JST、例: 2026-11-07T19:00） */
export const toDateTimeLocalValue = (iso: string) => inJst(iso).format('YYYY-MM-DDTHH:mm');

/** <input type="datetime-local"> の値（JST）→ UTC ISO（API に送る値） */
export function fromDateTimeLocalValue(value: string): string {
  return dayjs.tz(value, DISPLAY_TZ).utc().toISOString();
}
