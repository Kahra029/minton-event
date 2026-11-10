import { describe, expect, it, vi } from 'vitest';
import { LOGIN_FAILED_MESSAGE, type MeResponse } from '@minton/types';
import { createAuthUsecase, type AuthRepository } from '../../src/usecase/auth';
import { SESSION_TTL_MS } from '../../src/usecase/session';
import { addMs } from '../../src/usecase/time';
import { CIRCLE_A, expectAppError, fakeLog, fakePassword, fakeSessions, fakeTokens, memberOf, NOW } from './fakes';

const me: MeResponse = {
  member: { id: 'm1', email: 'm1@example.com', displayName: 'M1', role: 'member' },
  circle: { id: CIRCLE_A, circleLoginId: 'circle-a-login', name: 'サークルA' },
};

function setup() {
  const repo: AuthRepository = {
    findCircleByLoginId: async (loginId) => (loginId === 'circle-a-login' ? { id: CIRCLE_A } : undefined),
    findMemberByEmail: async (circleId, email) =>
      circleId === CIRCLE_A && email === 'm1@example.com' ? { id: 'm1', passwordHash: 'pw:correct-password' } : undefined,
    findMe: async (circleId, memberId) => (circleId === CIRCLE_A && memberId === 'm1' ? me : null),
  };
  const sessions = fakeSessions();
  const password = { hash: fakePassword.hash, verify: vi.fn(fakePassword.verify) };
  const { log, context } = fakeLog();
  const usecase = createAuthUsecase({ auth: repo, sessions: sessions.repo, tokens: fakeTokens, password, now: () => NOW, log });
  return { usecase, sessions, password, context };
}

describe('auth usecase: login', () => {
  it('成功すると Session（ハッシュのみ、30 日）を作り、平文 Token を返す', async () => {
    const { usecase, sessions, context } = setup();
    const result = await usecase.login({ circleLoginId: 'circle-a-login', email: 'm1@example.com', password: 'correct-password' });
    expect(result).toEqual({ me, sessionToken: 'generated-token' });
    expect(sessions.rows).toEqual([
      { tokenHash: 'hash:generated-token', circleId: CIRCLE_A, memberId: 'm1', expiresAt: addMs(NOW, SESSION_TTL_MS), createdAt: NOW },
    ]);
    expect(context).toEqual({ circleId: CIRCLE_A, memberId: 'm1' });
  });

  it('存在しない circleLoginId は 404', async () => {
    const { usecase } = setup();
    await expectAppError(
      usecase.login({ circleLoginId: 'unknown', email: 'm1@example.com', password: 'correct-password' }),
      'NOT_FOUND',
    );
  });

  it('Password 違いと Email 違いは同じ 401。Member がいなくても照合する（B12）', async () => {
    const { usecase, sessions, password } = setup();
    await expectAppError(
      usecase.login({ circleLoginId: 'circle-a-login', email: 'm1@example.com', password: 'wrong' }),
      'UNAUTHORIZED',
      LOGIN_FAILED_MESSAGE,
    );
    await expectAppError(
      usecase.login({ circleLoginId: 'circle-a-login', email: 'nobody@example.com', password: 'correct-password' }),
      'UNAUTHORIZED',
      LOGIN_FAILED_MESSAGE,
    );
    expect(password.verify).toHaveBeenLastCalledWith('correct-password', null);
    expect(sessions.rows).toHaveLength(0);
  });
});

describe('auth usecase: authenticate / logout / getMe', () => {
  it('Token が無ければ null（Repository を呼ばない）', async () => {
    const { usecase, sessions } = setup();
    const spy = vi.spyOn(sessions.repo, 'findMemberByTokenHash');
    expect(await usecase.authenticate(undefined)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('Token はハッシュにして現在時刻とともに照合する', async () => {
    const { usecase, sessions } = setup();
    const spy = vi.spyOn(sessions.repo, 'findMemberByTokenHash').mockResolvedValue(memberOf(CIRCLE_A, 'm1'));
    expect(await usecase.authenticate('tok')).toEqual(memberOf(CIRCLE_A, 'm1'));
    expect(spy).toHaveBeenCalledWith('hash:tok', NOW);
  });

  it('logout は Token のハッシュで Session を削除する。Token が無くてもエラーにしない', async () => {
    const { usecase, sessions } = setup();
    sessions.rows.push({ tokenHash: 'hash:tok', circleId: CIRCLE_A, memberId: 'm1', expiresAt: NOW, createdAt: NOW });
    await usecase.logout(undefined);
    expect(sessions.rows).toHaveLength(1);
    await usecase.logout('tok');
    expect(sessions.rows).toHaveLength(0);
  });

  it('getMe は Member が見つからなければ 401', async () => {
    const { usecase } = setup();
    expect(await usecase.getMe(memberOf(CIRCLE_A, 'm1'))).toEqual(me);
    await expectAppError(usecase.getMe(memberOf(CIRCLE_A, 'gone')), 'UNAUTHORIZED');
  });
});
