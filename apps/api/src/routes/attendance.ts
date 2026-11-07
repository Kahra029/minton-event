/**
 * 出欠（担当: T3）。/api/events にマウント済み（events.ts と同じプレフィックス）。
 * 契約: packages/types/src/attendance.ts
 *   PUT /:eventId/attendances/:memberId   自分の出欠を upsert（requireAuth）
 * 注意: このファイルでは /:eventId/attendances/* 以外のパスを登録しないこと。
 */
import { Hono } from 'hono';
import type { AppEnv } from '../bindings';

const attendance = new Hono<AppEnv>();

export default attendance;
