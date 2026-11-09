import { describe, expect, it } from 'vitest';
import { upTarget } from './upTarget';

describe('upTarget（ヘッダーの「‹」の行き先: decisions C39）', () => {
  it.each([
    ['/events', null],
    ['/', null],
    ['/events/new', { to: '/events', label: 'イベント一覧' }],
    ['/events/e1', { to: '/events', label: 'イベント一覧' }],
    ['/events/e1/edit', { to: '/events/e1', label: 'イベント詳細' }],
    ['/members', { to: '/events', label: 'イベント一覧' }],
    ['/unknown', { to: '/events', label: 'イベント一覧' }],
  ])('%s', (path, expected) => {
    expect(upTarget(path)).toEqual(expected);
  });
});
