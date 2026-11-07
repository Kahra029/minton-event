import type { Now } from '../usecase/ports';

/** 現在時刻（UTC ISO 8601、末尾 Z・ミリ秒付き: B8） */
export const nowUtcIso: Now = () => new Date().toISOString();
