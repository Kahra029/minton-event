/**
 * 日時は DB・API ともに UTC の ISO 8601（末尾 Z、ミリ秒付き）で扱う（B8）。
 * 文字列のまま大小比較できるよう、保存前に必ず toUtcIso() で正規化すること。
 * 現在時刻は port の Now（datasource/clock.ts）から受け取る。
 */
export function toUtcIso(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid date');
  return d.toISOString();
}

export function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

export const DAY_MS = 24 * 60 * 60 * 1000;
