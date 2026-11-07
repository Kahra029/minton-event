import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/** D1 バインディングから Drizzle インスタンスを生成する */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof getDb>;
