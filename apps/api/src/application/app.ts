/**
 * Hono の app を組み立てる（middleware・エラーハンドラ・全 route のマウント）。
 * datasource には依存しない。usecase の組み立て関数と ID 生成は src/index.ts（composition root）から受け取る。
 */
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { NewId } from '../usecase/ports';
import type { AppEnv } from './env';
import { errorHandler, notFoundHandler } from './errors';
import { requestLogger } from './middleware/requestLogger';
import { provideUsecases, type ComposeUsecases } from './middleware/usecases';
import auth from './routes/auth';
import events from './routes/events';
import attendance from './routes/attendance';
import invitations from './routes/invitations';
import members from './routes/members';

export function createApp(deps: { composeUsecases: ComposeUsecases; newId: NewId }) {
  const app = new Hono<AppEnv>();

  app.use('*', requestLogger(deps.newId));
  app.use('*', provideUsecases(deps.composeUsecases));
  // フォーム送信によるクロスサイト POST を拒否（JSON API は SameSite=Lax Cookie + 同一オリジン前提）
  app.use('/api/*', csrf());

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.route('/api/auth', auth);
  app.route('/api/events', events);
  app.route('/api/events', attendance);
  app.route('/api/invitations', invitations);
  app.route('/api/members', members);

  return app;
}
