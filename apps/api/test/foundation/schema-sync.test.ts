import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../../src/db/schema';

const tables: SQLiteTable[] = Object.values(schema).filter((v) => is(v, SQLiteTable));

describe('Drizzle スキーマと Migration の一致', () => {
  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    '%s のカラム名・NOT NULL が Migration 適用後の DB と一致する',
    async (name, table) => {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${name})`).all<{
        name: string;
        notnull: number;
        pk: number;
      }>();
      const actual = results
        .map((r) => ({ name: r.name, notNull: r.notnull === 1 || r.pk === 1 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const expected = getTableConfig(table)
        .columns.map((c) => ({ name: c.name, notNull: c.notNull || c.primary }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect(actual).toEqual(expected);
    },
  );
});
