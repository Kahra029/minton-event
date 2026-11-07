/**
 * Event（担当: T2）。/api/events にマウント済み。
 * 契約: packages/types/src/events.ts
 *   GET    /           今後の Event 一覧（requireAuth）
 *   POST   /           作成（requireAdmin）
 *   GET    /:eventId   詳細（requireAuth）
 *   PUT    /:eventId   編集（requireAdmin）
 *   DELETE /:eventId   削除（requireAdmin）
 * 注意: /:eventId/attendances/* は routes/attendance.ts（T3）が担当するので登録しないこと。
 */
import { Hono } from 'hono';
import type { AppEnv } from '../bindings';

const events = new Hono<AppEnv>();

export default events;
