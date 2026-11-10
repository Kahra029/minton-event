import { z } from 'zod';
import { emailSchema, idSchema, roleSchema } from './common';

/**
 * POST /api/auth/login
 * - circleLoginId が存在しない: 404 NOT_FOUND（decisions B12）
 * - Email / Password 不一致: 401 UNAUTHORIZED「メールアドレスまたはパスワードが違います」
 * - 成功: 200 MeResponse + Session Cookie を発行
 * - IP 単位の試行回数制限あり（C33 / C34）。超えたら 429 TOO_MANY_REQUESTS（入力の検証より前に判定）
 */
export const loginRequestSchema = z.object({
  circleLoginId: z.string().trim().min(1).max(64),
  email: emailSchema,
  // ログイン時は長さ制約を課さない（既存 Password との照合のみ）。空は不可。
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const LOGIN_FAILED_MESSAGE = 'メールアドレスまたはパスワードが違います';

export const meMemberSchema = z.object({
  id: idSchema,
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
});

export const meCircleSchema = z.object({
  id: idSchema,
  circleLoginId: z.string(),
  name: z.string(),
});

/**
 * GET /api/auth/me（要ログイン。未ログインは 401）
 * login / 招待からの初回登録のレスポンスも同じ形。
 */
export const meResponseSchema = z.object({
  member: meMemberSchema,
  circle: meCircleSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// POST /api/auth/logout → 204 No Content（Session をサーバー側で無効化し Cookie を消す。未ログインでも 204）
