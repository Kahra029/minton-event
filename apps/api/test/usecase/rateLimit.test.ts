import { describe, expect, it, vi } from 'vitest';
import { createRateLimitUsecase, rateLimitKey } from '../../src/usecase/rateLimit';
import { expectAppError } from './fakes';

describe('rateLimit usecase（C33 / C34）', () => {
  it('login と accept は別々の key で数える', () => {
    expect(rateLimitKey('login', '203.0.113.1')).toBe('login:203.0.113.1');
    expect(rateLimitKey('accept', '203.0.113.1')).toBe('accept:203.0.113.1');
  });

  it.each([null, '', '  '])('IP が分からない（%j）ときは unknown として数える', (ip) => {
    expect(rateLimitKey('login', ip)).toBe('login:unknown');
  });

  it('上限内なら通す', async () => {
    const limiter = vi.fn(async () => true);
    await createRateLimitUsecase({ limiter }).check('login', '203.0.113.1');
    expect(limiter).toHaveBeenCalledWith('login:203.0.113.1');
  });

  it('上限を超えたら 429 TOO_MANY_REQUESTS', async () => {
    const usecase = createRateLimitUsecase({ limiter: async () => false });
    await expectAppError(
      usecase.check('accept', '203.0.113.1'),
      'TOO_MANY_REQUESTS',
      '試行回数が多すぎます。しばらくしてから再度お試しください',
    );
  });
});
