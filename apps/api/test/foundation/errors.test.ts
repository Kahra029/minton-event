import { describe, expect, it, vi } from 'vitest';
import type { ApiErrorResponse } from '@minton/types';
import { request } from '../helpers';
import { testRequest } from './testApp';

describe('エラーハンドラ', () => {
  it.each([
    ['/throw/validation', 400, 'VALIDATION_ERROR'],
    ['/throw/unauthorized', 401, 'UNAUTHORIZED'],
    ['/throw/forbidden', 403, 'FORBIDDEN'],
    ['/throw/not-found', 404, 'NOT_FOUND'],
    ['/throw/conflict', 409, 'CONFLICT'],
  ])('%s は %i %s の形式で返す', async (path, status, code) => {
    const res = await testRequest(path);
    expect(res.status).toBe(status);
    const json = (await res.json()) as ApiErrorResponse;
    expect(json.error.code).toBe(code);
    expect(typeof json.error.message).toBe('string');
  });

  it('予期しない例外は 500 INTERNAL_ERROR で、内部メッセージや stack trace を返さない', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await testRequest('/throw/internal');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
    });
    expect(text).not.toContain('secret internal detail');
    expect(text).not.toContain('at ');
    spy.mockRestore();
  });

  it('zod の parse 失敗は 400 VALIDATION_ERROR と fieldErrors を返す', async () => {
    const res = await testRequest('/parse', { method: 'POST', body: JSON.stringify({ name: '' }) });
    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiErrorResponse;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.details?.fieldErrors.name?.length).toBeGreaterThan(0);
  });

  it('JSON として不正なボディは 400 VALIDATION_ERROR', async () => {
    const res = await testRequest('/parse', { method: 'POST', body: '{not json' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });

  it('存在しないパスは 404 NOT_FOUND 形式', async () => {
    const res = await request('/api/no-such-path');
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorResponse).error.code).toBe('NOT_FOUND');
  });

  it('/api/health は 200', async () => {
    const res = await request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
