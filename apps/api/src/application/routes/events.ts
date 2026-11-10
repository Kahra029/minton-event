/**
 * Event（T2）。/api/events にマウント。業務ルールは usecase/events.ts。
 * 契約: packages/types/src/events.ts
 *   GET    /           今後の Event 一覧（requireAuth）
 *   POST   /           作成（requireAdmin）
 *   GET    /:eventId   詳細（requireAuth）
 *   PUT    /:eventId   編集（requireAdmin）
 *   DELETE /:eventId   削除（requireAdmin）
 * 注意: /:eventId/attendances/* は routes/attendance.ts が担当するので登録しないこと。
 */
import { Hono } from 'hono';
import {
  createEventRequestSchema,
  eventIdParamSchema,
  updateEventRequestSchema,
  type EventDetailResponse,
  type EventListResponse,
  type EventResponse,
} from '@minton/types';
import type { AppEnv } from '../env';
import { parseJsonBody, parseParams } from '../errors';
import { setLogContext } from '../logger';
import { requireAdmin, requireAuth } from '../middleware/auth';

const events = new Hono<AppEnv>();

events.get('/', requireAuth, async (c) => {
  const list = await c.get('usecases').events.listUpcoming(c.get('member'));
  return c.json<EventListResponse>({ events: list });
});

events.post('/', requireAdmin, async (c) => {
  const input = await parseJsonBody(c, createEventRequestSchema);
  const event = await c.get('usecases').events.create(c.get('member'), input);
  return c.json<EventResponse>({ event }, 201);
});

events.get('/:eventId', requireAuth, async (c) => {
  const { eventId } = parseParams(c, eventIdParamSchema);
  setLogContext(c, { eventId });
  const detail = await c.get('usecases').events.getDetail(c.get('member'), eventId);
  return c.json<EventDetailResponse>({ event: detail });
});

events.put('/:eventId', requireAdmin, async (c) => {
  const { eventId } = parseParams(c, eventIdParamSchema);
  setLogContext(c, { eventId });
  const input = await parseJsonBody(c, updateEventRequestSchema);
  const event = await c.get('usecases').events.update(c.get('member'), eventId, input);
  return c.json<EventResponse>({ event });
});

events.delete('/:eventId', requireAdmin, async (c) => {
  const { eventId } = parseParams(c, eventIdParamSchema);
  setLogContext(c, { eventId });
  await c.get('usecases').events.delete(c.get('member'), eventId);
  return c.body(null, 204);
});

export default events;
