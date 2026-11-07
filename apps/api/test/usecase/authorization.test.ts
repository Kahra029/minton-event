import { describe, expect, it } from 'vitest';
import { assertAdmin } from '../../src/usecase/authorization';
import { AppError } from '../../src/usecase/errors';
import { adminOf, CIRCLE_A, memberOf } from './fakes';

describe('assertAdmin', () => {
  it('admin は通る', () => {
    expect(() => assertAdmin(adminOf(CIRCLE_A))).not.toThrow();
  });

  it('member は 403 FORBIDDEN', () => {
    expect(() => assertAdmin(memberOf(CIRCLE_A))).toThrow(AppError);
    try {
      assertAdmin(memberOf(CIRCLE_A));
    } catch (e) {
      expect((e as AppError).code).toBe('FORBIDDEN');
      expect((e as AppError).status).toBe(403);
    }
  });
});
