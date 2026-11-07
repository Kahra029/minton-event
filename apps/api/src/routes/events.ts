/**
 * Event（担当: T2）。/api/events にマウント済み。
 * 契約: packages/types/src/events.ts
 *   GET    /           今後の Event 一覧（requireAuth）
 *   POST   /           作成（requireAdmin）
 *   GET    /:eventId   詳細（requireAuth）
 *   PUT    /:eventId   編集（requireAdmin）
 *   DELETE /:eventId   削除（requireAdmin）
 * 注意: /:eventId/attendances/* は routes/attendance.ts（T3）が担当するので登録しないこと。
 *
 * Circle は常に c.var.member.circleId から取り、別 Circle の Event は 404（B14 / AC-12）。
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
import type { AppEnv } from '../bindings';
import { getDb } from '../db/client';
import {
  deleteEvent,
  getEventDetail,
  insertEvent,
  listUpcomingEvents,
  toEvent,
  updateEvent,
} from '../db/events';
import { notFound, parseJsonBody, parseParams } from '../lib/errors';
import { newId } from '../lib/id';
import { setLogContext } from '../lib/logger';
import { nowUtcIso, toUtcIso } from '../lib/time';
import { requireAdmin, requireAuth } from '../middleware/auth';

const EVENT_NOT_FOUND = 'イベントが見つかりません';

const events = new Hono<AppEnv>();

events.get('/', requireAuth, async (c) => {
  const member = c.get('member');
  const list = await listUpcomingEvents(getDb(c.env.DB), {
    circleId: member.circleId,
    memberId: member.id,
    now: nowUtcIso(),
  });
  return c.json<EventListResponse>({ events: list });
});

events.post('/', requireAdmin, async (c) => {
  const member = c.get('member');
  const input = await parseJsonBody(c, createEventRequestSchema);
  const id = newId();
  setLogContext(c, { eventId: id });
  const row = await insertEvent(getDb(c.env.DB), {
    id,
    circleId: member.circleId,
    createdBy: member.id,
    title: input.title,
    startAt: toUtcIso(input.startAt),
    endAt: toUtcIso(input.endAt),
    location: input.location,
    now: nowUtcIso(),
  });
  return c.json<EventResponse>({ event: toEvent(row) }, 201);
});

events.get('/:eventId', requireAuth, async (c) => {
  const member = c.get('member');
  const { eventId } = parseParams(c, eventIdParamSchema);
  setLogContext(c, { eventId });
  const detail = await getEventDetail(getDb(c.env.DB), {
    circleId: member.circleId,
    eventId,
    memberId: member.id,
  });
  if (!detail) throw notFound(EVENT_NOT_FOUND);
  return c.json<EventDetailResponse>({ event: detail });
});

events.put('/:eventId', requireAdmin, async (c) => {
  const member = c.get('member');
  const { eventId } = parseParams(c, eventIdParamSchema);
  setLogContext(c, { eventId });
  const input = await parseJsonBody(c, updateEventRequestSchema);
  const row = await updateEvent(getDb(c.env.DB), {
    circleId: member.circleId,
    eventId,
    title: input.title,
    startAt: toUtcIso(input.startAt),
    endAt: toUtcIso(input.endAt),
    location: input.location,
    now: nowUtcIso(),
  });
  if (!row) throw notFound(EVENT_NOT_FOUND);
  return c.json<EventResponse>({ event: toEvent(row) });
});

events.delete('/:eventId', requireAdmin, async (c) => {
  const member = c.get('member');
  const { eventId } = parseParams(c, eventIdParamSchema);
  setLogContext(c, { eventId });
  const deleted = await deleteEvent(getDb(c.env.DB), member.circleId, eventId);
  if (!deleted) throw notFound(EVENT_NOT_FOUND);
  return c.body(null, 204);
});

export default events;
