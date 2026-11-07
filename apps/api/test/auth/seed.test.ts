import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { LIMITS } from '@minton/types';
import { buildSeedSql, hashSeedPassword, SEED_LIMITS, SEED_PBKDF2_ITERATIONS, validateSeedInput } from '../../scripts/seed-core';
import { newId } from '../../src/lib/id';
import { PBKDF2_ITERATIONS, verifyPassword } from '../../src/lib/password';
import { nowUtcIso } from '../../src/lib/time';
import { request } from '../helpers';

const validInput = {
  circleLoginId: 'seed-circle',
  circleName: 'シードサークル',
  email: 'admin@example.com',
  displayName: '管理者',
  password: 'seed-password-1',
};

describe('seed CLI（A5）', () => {
  it('制約は packages/types / lib/password.ts と一致する', () => {
    expect(SEED_PBKDF2_ITERATIONS).toBe(PBKDF2_ITERATIONS);
    expect(SEED_LIMITS.passwordMin).toBe(LIMITS.passwordMin);
    expect(SEED_LIMITS.passwordMax).toBe(LIMITS.passwordMax);
    expect(SEED_LIMITS.displayNameMin).toBe(LIMITS.displayNameMin);
    expect(SEED_LIMITS.displayNameMax).toBe(LIMITS.displayNameMax);
    expect(SEED_LIMITS.emailMax).toBe(LIMITS.emailMax);
  });

  it('seed の Password Hash は lib/password.ts の verifyPassword で検証できる', async () => {
    const hash = await hashSeedPassword('seed-password-1');
    expect(await verifyPassword('seed-password-1', hash)).toBe(true);
    expect(await verifyPassword('other-password', hash)).toBe(false);
  });

  it('入力を検証する（Email は trim + 小文字化、Password 8〜128 文字）', () => {
    const ok = validateSeedInput({ ...validInput, email: '  Admin@Example.COM ' });
    expect(ok).toEqual({ ok: true, value: { ...validInput, email: 'admin@example.com' } });

    for (const bad of [
      { password: 'short' },
      { password: 'x'.repeat(129) },
      { email: 'not-an-email' },
      { displayName: '' },
      { displayName: 'x'.repeat(51) },
      { circleLoginId: '' },
      { circleName: ' ' },
    ]) {
      const r = validateSeedInput({ ...validInput, ...bad });
      expect(r.ok).toBe(false);
    }
    // エラー文言に Password の値を含めない
    const r = validateSeedInput({ ...validInput, password: 'short' });
    expect(JSON.stringify(r)).not.toContain('short"');
  });

  it('生成した SQL で作った admin でログインできる（Quote を含む名前もエスケープされる）', async () => {
    const loginId = `seed-${newId().toLowerCase()}`;
    const input = { ...validInput, circleLoginId: loginId, circleName: "O'Brien's サークル" };
    const statements = buildSeedSql({
      circleId: newId(),
      memberId: newId(),
      now: nowUtcIso(),
      input,
      passwordHash: await hashSeedPassword(validInput.password),
    });
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));

    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { circleLoginId: loginId, email: validInput.email, password: validInput.password },
    });
    expect(res.status).toBe(200);
    const me = (await res.json()) as { member: { role: string }; circle: { name: string } };
    expect(me.member.role).toBe('admin');
    expect(me.circle.name).toBe("O'Brien's サークル");
  });

  it('同じ circleLoginId で再実行すると失敗する', async () => {
    const loginId = `seed-${newId().toLowerCase()}`;
    const make = async () =>
      buildSeedSql({
        circleId: newId(),
        memberId: newId(),
        now: nowUtcIso(),
        input: { ...validInput, circleLoginId: loginId },
        passwordHash: await hashSeedPassword(validInput.password),
      });
    await env.DB.batch((await make()).map((s) => env.DB.prepare(s)));
    const again = await make();
    await expect(env.DB.batch(again.map((s) => env.DB.prepare(s)))).rejects.toThrow();
  });
});
