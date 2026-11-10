import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiFetch } from './api';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('JSON を送って JSON を受け取る（Cookie は same-origin で送る）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.post('/api/x', { a: 1 })).resolves.toEqual({ ok: true });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/x');
    expect(init).toMatchObject({ method: 'POST', body: '{"a":1}', credentials: 'same-origin' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('204 は undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.delete('/api/x')).resolves.toBeUndefined();
  });

  it('エラー形式のレスポンスは ApiError（code / message / details）にする', async () => {
    const details = { formErrors: [], fieldErrors: { email: ['不正'] } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: '入力エラー', details } })),
    );
    const err = (await apiFetch('/api/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: '入力エラー', details });
  });

  it('形式外のエラーレスポンスは INTERNAL_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
  });

  it('通信エラーは status 0 の ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 0, code: 'INTERNAL_ERROR' });
  });
});
