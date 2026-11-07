import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../src/bindings';
import { getDb } from '../../src/db/client';
import { conflict, errorHandler, forbidden, notFound, notFoundHandler, parseJsonBody, unauthorized, validationError } from '../../src/lib/errors';
import { createSession, destroySession } from '../../src/lib/session';
import { requireAdmin, requireAuth } from '../../src/middleware/auth';
import { requestLogger } from '../../src/middleware/requestLogger';

/** 基盤テスト用の小さな app（本番の index.ts と同じ middleware / エラーハンドラを使う） */
export function buildTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', requestLogger);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.get('/throw/validation', () => {
    throw validationError();
  });
  app.get('/throw/unauthorized', () => {
    throw unauthorized();
  });
  app.get('/throw/forbidden', () => {
    throw forbidden();
  });
  app.get('/throw/not-found', () => {
    throw notFound();
  });
  app.get('/throw/conflict', () => {
    throw conflict();
  });
  app.get('/throw/internal', () => {
    throw new Error('secret internal detail');
  });
  app.post('/parse', async (c) => {
    const body = await parseJsonBody(c, z.object({ name: z.string().min(1) }));
    return c.json(body);
  });
  app.get('/auth', requireAuth, (c) => c.json(c.get('member')));
  app.get('/admin', requireAdmin, (c) => c.json(c.get('member')));
  app.post('/session/:circleId/:memberId', async (c) => {
    await createSession(c, getDb(c.env.DB), {
      circleId: c.req.param('circleId'),
      memberId: c.req.param('memberId'),
    });
    return c.body(null, 204);
  });
  app.post('/logout', async (c) => {
    await destroySession(c, getDb(c.env.DB));
    return c.body(null, 204);
  });
  app.get('/invitations/:token', (c) => c.json({ ok: true }));
  return app;
}

export function testRequest(
  path: string,
  init: { method?: string; cookie?: string; body?: string; base?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  return buildTestApp().request(
    `${init.base ?? 'http://localhost'}${path}`,
    { method: init.method ?? 'GET', headers, body: init.body },
    env,
  );
}
