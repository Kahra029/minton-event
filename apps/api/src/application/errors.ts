/**
 * HTTP 層のエラー処理とリクエスト検証。エラー型（AppError など）は usecase/errors.ts。
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodError, ZodType, ZodTypeDef } from 'zod';
import { ERROR_STATUS, type ApiErrorResponse, type ErrorCode, type ValidationErrorDetails } from '@minton/types';
import { AppError, DEFAULT_ERROR_MESSAGES, validationError } from '../usecase/errors';
import type { AppEnv } from './env';
import { logError } from './logger';

export function zodErrorToValidationError(error: ZodError): AppError {
  const flat = error.flatten();
  return validationError(undefined, {
    formErrors: flat.formErrors,
    fieldErrors: flat.fieldErrors as Record<string, string[]>,
  });
}

/** zod で検証し、失敗したら VALIDATION_ERROR(400) を throw する */
export function parseOrThrow<Output, Input>(
  schema: ZodType<Output, ZodTypeDef, Input>,
  data: unknown,
): Output {
  const result = schema.safeParse(data);
  if (!result.success) throw zodErrorToValidationError(result.error);
  return result.data;
}

/** JSON ボディを読み、zod で検証する。JSON として不正なら 400 */
export async function parseJsonBody<Output, Input>(
  c: Context,
  schema: ZodType<Output, ZodTypeDef, Input>,
): Promise<Output> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw validationError('リクエストボディが JSON ではありません');
  }
  return parseOrThrow(schema, body);
}

/** パスパラメータを zod で検証する */
export function parseParams<Output, Input>(
  c: Context,
  schema: ZodType<Output, ZodTypeDef, Input>,
): Output {
  return parseOrThrow(schema, c.req.param());
}

function errorBody(code: ErrorCode, message: string, details?: ValidationErrorDetails): ApiErrorResponse {
  return { error: details ? { code, message, details } : { code, message } };
}

/**
 * app.onError に登録するハンドラ。
 * - AppError: そのコード・メッセージで返す
 * - Hono の HTTPException（不正な JSON 等）: ステータスから対応するコードに変換
 * - それ以外: 500 INTERNAL_ERROR（内部メッセージや stack trace は返さない。ログには種別を出す）
 */
export function errorHandler(err: Error, c: Context<AppEnv>): Response {
  if (err instanceof AppError) {
    c.set('logContext', { ...c.get('logContext'), errorCode: err.code });
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException && err.status < 500) {
    const code = statusToCode(err.status);
    c.set('logContext', { ...c.get('logContext'), errorCode: code });
    return c.json(errorBody(code, DEFAULT_ERROR_MESSAGES[code]), ERROR_STATUS[code]);
  }
  logError(c, err);
  c.set('logContext', { ...c.get('logContext'), errorCode: 'INTERNAL_ERROR' });
  return c.json(errorBody('INTERNAL_ERROR', DEFAULT_ERROR_MESSAGES.INTERNAL_ERROR), 500);
}

/** 存在しないパスは NOT_FOUND 形式で返す（app.notFound に登録） */
export function notFoundHandler(c: Context<AppEnv>): Response {
  return c.json(errorBody('NOT_FOUND', DEFAULT_ERROR_MESSAGES.NOT_FOUND), 404);
}

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'VALIDATION_ERROR';
  }
}
