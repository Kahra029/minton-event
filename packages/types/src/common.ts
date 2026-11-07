import { z } from 'zod';

/** 入力値の上限・下限（decisions C5） */
export const LIMITS = {
  passwordMin: 8,
  passwordMax: 128,
  displayNameMin: 1,
  displayNameMax: 50,
  locationMin: 1,
  locationMax: 100,
  titleMax: 100,
  emailMax: 254,
} as const;

/** ID（ulid） */
export const idSchema = z.string().min(1).max(64);

/**
 * Email。trim + 小文字化して保存・照合する（decisions C5）。
 * parse 後の値は正規化済み。
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.emailMax)
  .email('メールアドレスの形式が正しくありません');

/**
 * 日時。ISO 8601 文字列（タイムゾーンオフセット必須）。
 * API のレスポンスは常に UTC（末尾 Z）で返す（decisions B8）。
 */
export const dateTimeSchema = z.string().datetime({ offset: true, message: '日時の形式が正しくありません' });

export const roleSchema = z.enum(['admin', 'member']);
export type Role = z.infer<typeof roleSchema>;
