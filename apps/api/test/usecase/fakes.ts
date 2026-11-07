/**
 * usecase の unit テスト用の fake port（DB・WebCrypto・Hono を使わない。guardrails §11 Unit）。
 * Repository の fake は「circleId で絞る」前提の最小実装で、usecase の判定だけを確かめる。
 * SQL の Circle 絞り込み自体は integration テスト（test/<feature>/）で確かめる。
 */
import { expect } from 'vitest';
import type { ErrorCode } from '@minton/types';
import { AppError } from '../../src/usecase/errors';
import type { AuthMember, PasswordHasher, RequestLogger, TokenService } from '../../src/usecase/ports';
import type { SessionRepository } from '../../src/usecase/session';

export const NOW = '2026-11-07T00:00:00.000Z';
export const CIRCLE_A = 'circle-a';
export const CIRCLE_B = 'circle-b';

export const adminOf = (circleId: string, id = `admin-${circleId}`): AuthMember => ({ id, circleId, role: 'admin' });
export const memberOf = (circleId: string, id = `member-${circleId}`): AuthMember => ({ id, circleId, role: 'member' });

export function fakeIds() {
  let n = 0;
  return () => `id-${++n}`;
}

/** hash は "hash:<token>"（テストで Token とハッシュの対応が分かるように） */
export const fakeTokens: TokenService = {
  generate: () => 'generated-token',
  hash: async (token) => `hash:${token}`,
};

export const fakePassword: PasswordHasher = {
  hash: async (pw) => `pw:${pw}`,
  verify: async (pw, stored) => stored !== null && stored === `pw:${pw}`,
};

export function fakeLog() {
  const context: Record<string, unknown> = {};
  const errors: { message: string; fields?: Record<string, unknown> }[] = [];
  const log: RequestLogger = {
    addContext: (fields) => Object.assign(context, fields),
    error: (message, fields) => errors.push({ message, fields }),
  };
  return { log, context, errors };
}

export function fakeSessions() {
  const rows: Parameters<SessionRepository['insert']>[0][] = [];
  const repo: SessionRepository = {
    insert: async (s) => void rows.push(s),
    deleteByTokenHash: async (h) => {
      const i = rows.findIndex((r) => r.tokenHash === h);
      if (i >= 0) rows.splice(i, 1);
    },
    findMemberByTokenHash: async () => null,
  };
  return { repo, rows };
}

/** AppError（code と message）で reject されることを確かめる */
export async function expectAppError(promise: Promise<unknown>, code: ErrorCode, message?: string) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (message !== undefined) expect((err as AppError).message).toBe(message);
}
