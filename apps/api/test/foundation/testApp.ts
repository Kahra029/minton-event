import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../src/application/env';
import { errorHandler, notFoundHandler, parseJsonBody } from '../../src/application/errors';
import { requireAdmin, requireAuth } from '../../src/application/middleware/auth';
import { requestLogger } from '../../src/application/middleware/requestLogger';
import { provideUsecases } from '../../src/application/middleware/usecases';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../../src/application/sessionCookie';
import { composeUsecases } from '../../src/composition';
import { createSessionRepository } from '../../src/datasource/d1/sessions';
import { getDb } from '../../src/datasource/db/client';
import { webCryptoTokens } from '../../src/datasource/crypto';
import { nowUtcIso } from '../../src/datasource/clock';
import { newId } from '../../src/datasource/id';
import { conflict, forbidden, notFound, unauthorized, validationError } from '../../src/usecase/errors';
import { issueSession } from '../../src/usecase/session';

/** 基盤テスト用の小さな app（本番の application/app.ts と同じ middleware / エラーハンドラを使う） */
export function buildTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', requestLogger(newId));
  app.use('*', provideUsecases(composeUsecases));
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
    const { token } = await issueSession(
      { sessions: createSessionRepository(getDb(c.env.DB)), tokens: webCryptoTokens, now: nowUtcIso },
      { circleId: c.req.param('circleId'), memberId: c.req.param('memberId') },
    );
    setSessionCookie(c, token);
    return c.body(null, 204);
  });
  app.post('/logout', async (c) => {
    await c.get('usecases').auth.logout(readSessionToken(c));
    clearSessionCookie(c);
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
