/**
 * API のエントリポイント。ルーティング登録はここで完結させる（Phase 1 では編集しない）。
 * 各機能は routes/<feature>.ts の中身だけを実装する。
 */
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import type { AppEnv } from './bindings';
import { errorHandler, notFoundHandler } from './lib/errors';
import { requestLogger } from './middleware/requestLogger';
import auth from './routes/auth';
import events from './routes/events';
import attendance from './routes/attendance';
import invitations from './routes/invitations';
import members from './routes/members';

const app = new Hono<AppEnv>();

app.use('*', requestLogger);
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

export default app;
