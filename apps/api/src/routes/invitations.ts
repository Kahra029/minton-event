/**
 * 招待（担当: T4）。/api/invitations にマウント済み。
 * 契約: packages/types/src/invitations.ts
 *   POST /                 作成（requireAdmin）
 *   GET  /:token           招待情報（ログイン不要）
 *   POST /:token/accept    初回登録 → createSession（ログイン不要）
 */
import { Hono } from 'hono';
import type { AppEnv } from '../bindings';

const invitations = new Hono<AppEnv>();

export default invitations;
