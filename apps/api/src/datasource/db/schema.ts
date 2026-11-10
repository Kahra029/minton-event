/**
 * Drizzle スキーマ。migrations/*.sql と常に一致させること（Migration は手書き SQL）。
 *
 * 規約:
 * - 日時はすべて UTC の ISO 8601 文字列（例: 2026-11-07T01:00:00.000Z）で保存する（B8）。
 *   文字列比較で大小比較できるよう、必ず lib/time.ts の toUtcIso() / nowUtcIso() で作る。
 * - Circle 配下のテーブルはすべて circle_id を持ち、他テーブルへの FK は (circle_id, id) の複合 FK にして
 *   別 Circle のデータを参照できないことを DB でも保証する。
 * - Token（Session / Invitation）は平文を保存せず SHA-256 ハッシュ（hex）を保存する。
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const circles = sqliteTable('circles', {
  id: text('id').primaryKey(),
  circleLoginId: text('circle_login_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    circleId: text('circle_id')
      .notNull()
      .references(() => circles.id),
    /** trim + 小文字化済み（C5） */
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    /** lib/password.ts の形式: pbkdf2_sha256$<iterations>$<salt(base64)>$<hash(base64)> */
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    unique('members_circle_id_email_unique').on(t.circleId, t.email),
    unique('members_circle_id_id_unique').on(t.circleId, t.id),
    check('members_role_check', sql`${t.role} IN ('admin', 'member')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** Session Token の SHA-256（hex）。平文 Token は Cookie にのみ存在する */
    tokenHash: text('token_hash').primaryKey(),
    circleId: text('circle_id').notNull(),
    memberId: text('member_id').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'sessions_member_fk',
      columns: [t.circleId, t.memberId],
      foreignColumns: [members.circleId, members.id],
    }).onDelete('cascade'),
    index('sessions_member_id_idx').on(t.memberId),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    circleId: text('circle_id')
      .notNull()
      .references(() => circles.id),
    /** 任意（B6） */
    title: text('title'),
    startAt: text('start_at').notNull(),
    endAt: text('end_at').notNull(),
    location: text('location').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    unique('events_circle_id_id_unique').on(t.circleId, t.id),
    foreignKey({
      name: 'events_created_by_fk',
      columns: [t.circleId, t.createdBy],
      foreignColumns: [members.circleId, members.id],
    }),
    check('events_end_after_start_check', sql`${t.endAt} > ${t.startAt}`),
    index('events_circle_id_end_at_idx').on(t.circleId, t.endAt),
  ],
);

export const attendances = sqliteTable(
  'attendances',
  {
    id: text('id').primaryKey(),
    circleId: text('circle_id').notNull(),
    eventId: text('event_id').notNull(),
    memberId: text('member_id').notNull(),
    /** 未回答はレコードなし */
    status: text('status', { enum: ['attending', 'absent'] }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    unique('attendances_event_id_member_id_unique').on(t.eventId, t.memberId),
    foreignKey({
      name: 'attendances_event_fk',
      columns: [t.circleId, t.eventId],
      foreignColumns: [events.circleId, events.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attendances_member_fk',
      columns: [t.circleId, t.memberId],
      foreignColumns: [members.circleId, members.id],
    }),
    check('attendances_status_check', sql`${t.status} IN ('attending', 'absent')`),
  ],
);

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    circleId: text('circle_id')
      .notNull()
      .references(() => circles.id),
    /** trim + 小文字化済み（C5） */
    email: text('email').notNull(),
    /** Invitation Token の SHA-256（hex） */
    tokenHash: text('token_hash').notNull().unique(),
    /** expired は保存しない（B3）。revoked は B4 の「既存 pending を無効化」で使う */
    status: text('status', { enum: ['pending', 'accepted', 'revoked'] }).notNull(),
    expiresAt: text('expires_at').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    acceptedAt: text('accepted_at'),
  },
  (t) => [
    foreignKey({
      name: 'invitations_created_by_fk',
      columns: [t.circleId, t.createdBy],
      foreignColumns: [members.circleId, members.id],
    }),
    check('invitations_status_check', sql`${t.status} IN ('pending', 'accepted', 'revoked')`),
    index('invitations_circle_id_email_idx').on(t.circleId, t.email),
  ],
);
