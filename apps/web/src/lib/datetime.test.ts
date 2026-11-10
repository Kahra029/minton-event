import { describe, expect, it } from 'vitest';
import { formatDateTimeRange, fromDateTimeLocalValue, toDateTimeLocalValue } from './datetime';

describe('datetime（UTC ⇔ JST）', () => {
  it('UTC を JST で表示する', () => {
    // 2026-11-07T10:00Z = JST 19:00
    expect(formatDateTimeRange('2026-11-07T10:00:00.000Z', '2026-11-07T12:00:00.000Z')).toBe('11/7(土) 19:00〜21:00');
  });

  it('JST で日付をまたぐ場合は終了側にも日付を付ける', () => {
    expect(formatDateTimeRange('2026-11-07T14:00:00.000Z', '2026-11-07T16:00:00.000Z')).toBe(
      '11/7(土) 23:00〜11/8(日) 01:00',
    );
  });

  it('datetime-local（JST）と UTC ISO を相互変換する', () => {
    expect(fromDateTimeLocalValue('2026-11-07T19:00')).toBe('2026-11-07T10:00:00.000Z');
    expect(toDateTimeLocalValue('2026-11-07T10:00:00.000Z')).toBe('2026-11-07T19:00');
  });
});
