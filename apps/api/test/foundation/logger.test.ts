import { afterEach, describe, expect, it, vi } from 'vitest';
import { redact } from '../../src/application/logger';
import { setupCircle } from '../helpers';
import { testRequest } from './testApp';

afterEach(() => vi.restoreAllMocks());

function captureLogs() {
  const lines: string[] = [];
  const push = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(push);
  vi.spyOn(console, 'warn').mockImplementation(push);
  vi.spyOn(console, 'error').mockImplementation(push);
  return lines;
}

describe('構造化ログ', () => {
  it('秘密情報らしいキーは [REDACTED] にする', () => {
    expect(
      redact({ password: 'p', token: 't', sessionToken: 's', nested: { passwordHash: 'h', ok: 1 } }),
    ).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      sessionToken: '[REDACTED]',
      nested: { passwordHash: '[REDACTED]', ok: 1 },
    });
  });

  it('リクエストログは JSON 1 行で、route パターン・Circle・Member・status・errorCode・timestamp を含む', async () => {
    const { circle, member, memberCookie } = await setupCircle();
    const lines = captureLogs();
    await testRequest('/admin', { cookie: memberCookie });
    const entry = JSON.parse(lines.find((l) => l.includes('"request"'))!);
    expect(entry).toMatchObject({
      level: 'info',
      message: 'request',
      method: 'GET',
      route: '/admin',
      status: 403,
      circleId: circle.id,
      memberId: member.id,
      errorCode: 'FORBIDDEN',
    });
    expect(Date.parse(entry.timestamp)).not.toBeNaN();
    // Session Token はログに出ない
    expect(lines.join('\n')).not.toContain(memberCookie.split('=')[1]);
  });

  it('URL 中の Token はログに出さず、route はパターンで出す', async () => {
    const lines = captureLogs();
    await testRequest('/invitations/very-secret-invitation-token');
    const all = lines.join('\n');
    expect(all).not.toContain('very-secret-invitation-token');
    expect(JSON.parse(lines.find((l) => l.includes('"request"'))!).route).toBe('/invitations/:token');
  });

  it('500 のときは error レベルで Error 種別を出す', async () => {
    const lines = captureLogs();
    await testRequest('/throw/internal');
    const entry = JSON.parse(lines.find((l) => l.includes('"request"'))!);
    expect(entry).toMatchObject({ level: 'error', status: 500, errorCode: 'INTERNAL_ERROR' });
    expect(lines.some((l) => l.includes('"unhandled_error"'))).toBe(true);
  });
});
