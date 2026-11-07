/**
 * メンバー一覧（担当: T4）。/api/members にマウント済み。
 * 契約: packages/types/src/members.ts
 *   GET / （requireAdmin）
 */
import { Hono } from 'hono';
import type { AppEnv } from '../bindings';

const members = new Hono<AppEnv>();

export default members;
