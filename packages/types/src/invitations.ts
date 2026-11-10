import { z } from 'zod';
import { LIMITS, emailSchema, idSchema } from './common';

/** 保存される Invitation の状態。expired は保存せず expires_at と比較して判定（B3） */
export const invitationStoredStatusSchema = z.enum(['pending', 'accepted', 'revoked']);
export type InvitationStoredStatus = z.infer<typeof invitationStoredStatusSchema>;

/** 表示用の状態（expired は expires_at <= 現在 の pending） */
export const invitationDisplayStatusSchema = z.enum(['pending', 'expired']);
export type InvitationDisplayStatus = z.infer<typeof invitationDisplayStatusSchema>;

/** Invitation の有効期限（decisions B2） */
export const INVITATION_TTL_DAYS = 7;

/**
 * POST /api/invitations（admin のみ。member は 403）→ 201 CreateInvitationResponse
 * - 同じ Circle に同じ Email の Member が存在: 409 CONFLICT（B5）
 * - 同じ Email の pending Invitation があれば revoked にしてから新規作成（B4）
 * - メールは送らない（C31 / C32）。レスポンスの invitationUrl（Token を含む。APP_BASE_URL から生成: C17）を
 *   作成した admin の画面にだけ表示する。Token はハッシュだけ保存するため、あとから再取得はできない
 * Token / 招待 URL を返すのはこのレスポンスだけ（一覧などでは返さない）。
 */
export const createInvitationRequestSchema = z.object({
  email: emailSchema,
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationSchema = z.object({
  id: idSchema,
  email: z.string(),
  status: invitationDisplayStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const createInvitationResponseSchema = z.object({
  invitation: invitationSchema,
  /** 例: https://minton-event-api.<account>.workers.dev/invitations/<token> */
  invitationUrl: z.string(),
});
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

export const invitationTokenParamSchema = z.object({
  token: z.string().min(1).max(256),
});

/**
 * GET /api/invitations/:token（ログイン不要）→ 200 InvitationInfoResponse
 * Token が使えない場合は 404（INVITATION_INVALID_MESSAGE、decisions C11）。
 */
export const invitationInfoResponseSchema = z.object({
  circleName: z.string(),
  email: z.string(),
});
export type InvitationInfoResponse = z.infer<typeof invitationInfoResponseSchema>;

/**
 * POST /api/invitations/:token/accept（ログイン不要）→ 201 MeResponse + Session Cookie（C9）
 * IP 単位の試行回数制限あり（C33 / C34）。超えたら 429 TOO_MANY_REQUESTS（Token・入力の検証より前に判定）。
 * Email は Invitation のものを使う（入力させない: AC-16）。
 * 同じ Circle + Email の Member が既に存在する場合は 409 CONFLICT。
 */
export const acceptInvitationRequestSchema = z
  .object({
    displayName: z.string().trim().min(LIMITS.displayNameMin, '表示名を入力してください').max(LIMITS.displayNameMax),
    password: z
      .string()
      .min(LIMITS.passwordMin, `パスワードは${LIMITS.passwordMin}文字以上にしてください`)
      .max(LIMITS.passwordMax),
    passwordConfirmation: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    message: 'パスワードが一致しません',
    path: ['passwordConfirmation'],
  });
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

/**
 * Token が使えない場合（存在しない / accepted 済み / revoked / 期限切れ）は、
 * GET・accept ともにすべて 404 NOT_FOUND でこのメッセージを返す（decisions C11）。
 */
export const INVITATION_INVALID_MESSAGE = 'この招待URLは無効です';
