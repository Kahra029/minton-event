import { z } from 'zod';

/**
 * API のエラー種別（guardrails §7）。HTTP ステータスとの対応は ERROR_STATUS を参照。
 */
export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ErrorCode, number>;

/**
 * Validation エラーの詳細。zod の flatten() と同じ形。
 * - formErrors: 特定フィールドに紐づかないエラー
 * - fieldErrors: フィールド名 → メッセージ配列
 */
export const validationErrorDetailsSchema = z.object({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.array(z.string())),
});
export type ValidationErrorDetails = z.infer<typeof validationErrorDetailsSchema>;

/**
 * すべてのエラーレスポンスの形式。stack trace や内部メッセージは含めない。
 * details は VALIDATION_ERROR のときのみ ValidationErrorDetails が入る。
 */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: validationErrorDetailsSchema.optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
