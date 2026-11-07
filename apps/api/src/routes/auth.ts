/**
 * 認証（担当: T1）。/api/auth にマウント済み。
 * 契約: packages/types/src/auth.ts
 *   POST /login   → lib/session.ts の createSession / lib/password.ts の verifyPassword を使う
 *   POST /logout  → destroySession
 *   GET  /me      → requireAuth
 */
import { Hono } from 'hono';
import type { AppEnv } from '../bindings';

const auth = new Hono<AppEnv>();

export default auth;
