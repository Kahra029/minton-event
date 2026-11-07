import { describe, expect, it } from 'vitest';
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from '../../src/lib/password';

describe('password', () => {
  it('PBKDF2-SHA256 / 100,000 回の形式で保存し、平文を含まない', async () => {
    const hash = await hashPassword('correct horse');
    expect(PBKDF2_ITERATIONS).toBe(100_000);
    expect(hash).toMatch(/^pbkdf2_sha256\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('correct horse');
  });

  it('同じ Password でも Salt が異なるのでハッシュが変わる', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });

  it('正しい Password は true、誤りは false', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('保存値が null（Member なし）や不正な形式でも false を返す', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', 'plain-text')).toBe(false);
    expect(await verifyPassword('anything', 'pbkdf2_sha256$100000$!!!$!!!')).toBe(false);
  });
});
