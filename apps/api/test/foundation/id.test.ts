import { describe, expect, it } from 'vitest';
import { decodeTime, factory, randomChar } from 'ulid';
import { newId, prngFromBytes } from '../../src/datasource/id';

/** ULID の文字種（Crockford Base32） */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('ID 生成（ULID / decisions C28）', () => {
  it('C28: 1 byte の 256 通りが 32 文字に 8 通りずつ均一に写る（偏りがない）', () => {
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 256; byte++) {
      const char = randomChar(prngFromBytes(() => byte));
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([...ENCODING].sort());
    for (const char of ENCODING) expect(counts.get(char)).toBe(8);
  });

  it('C28: prng の値は常に [0, 1) に収まる（255 でも 1.0 にならない）', () => {
    expect(prngFromBytes(() => 0)()).toBe(0);
    expect(prngFromBytes(() => 255)()).toBeLessThan(1);
  });

  it('C28: newId のランダム部の文字の出現回数が均一に近い', () => {
    const counts = new Map<string, number>();
    const n = 2000;
    for (let i = 0; i < n; i++) {
      for (const char of newId().slice(10)) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    // 期待値は 2000 * 16 / 32 = 1000（標準偏差は約 31）。±200 を外れたら偏りとみなす
    for (const char of ENCODING) {
      expect(counts.get(char) ?? 0).toBeGreaterThan(800);
      expect(counts.get(char) ?? 0).toBeLessThan(1200);
    }
  });

  it('形式は変わらない: 26 文字の Crockford Base32 で、先頭 10 文字が生成時刻', () => {
    const before = Date.now();
    const id = newId();
    const after = Date.now();
    expect(id).toMatch(ULID_PATTERN);
    expect(decodeTime(id)).toBeGreaterThanOrEqual(before);
    expect(decodeTime(id)).toBeLessThanOrEqual(after);
  });

  it('時刻順に並ぶ（文字列の昇順 = 生成時刻の昇順）', () => {
    const ulid = factory(prngFromBytes(() => crypto.getRandomValues(new Uint8Array(1))[0]));
    const times = [1_700_000_000_000, 1_700_000_000_001, 1_700_000_001_000, 1_800_000_000_000];
    const ids = times.map((t) => ulid(t));
    expect([...ids].sort()).toEqual(ids);
    expect(ids.map(decodeTime)).toEqual(times);
  });
});
