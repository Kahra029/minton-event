import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodError, ZodType, ZodTypeDef } from 'zod';
import {
  ERROR_STATUS,
  type ApiErrorResponse,
  type ErrorCode,
  type ValidationErrorDetails,
} from '@minton/types';
import type { AppEnv } from '../bindings';
import { logError } from './logger';

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: '入力内容に誤りがあります',
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: 'この操作を行う権限がありません',
  NOT_FOUND: '見つかりません',
  CONFLICT: '既に登録されています',
  INTERNAL_ERROR: 'サーバーでエラーが発生しました',
};

/**
 * アプリのエラー。route / middleware から throw すると errorHandler が
 * ApiErrorResponse 形式に整形する。message は Client にそのまま返るので秘密情報を入れないこと。
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: (typeof ERROR_STATUS)[ErrorCode];
  readonly details?: ValidationErrorDetails;

  constructor(code: ErrorCode, message?: string, details?: ValidationErrorDetails) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export const validationError = (message?: string, details?: ValidationErrorDetails) =>
  new AppError('VALIDATION_ERROR', message, details);
export const unauthorized = (message?: string) => new AppError('UNAUTHORIZED', message);
export const forbidden = (message?: string) => new AppError('FORBIDDEN', message);
export const notFound = (message?: string) => new AppError('NOT_FOUND', message);
export const conflict = (message?: string) => new AppError('CONFLICT', message);
export const internalError = () => new AppError('INTERNAL_ERROR');

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
    return c.json(errorBody(code, DEFAULT_MESSAGES[code]), ERROR_STATUS[code]);
  }
  logError(c, err);
  c.set('logContext', { ...c.get('logContext'), errorCode: 'INTERNAL_ERROR' });
  return c.json(errorBody('INTERNAL_ERROR', DEFAULT_MESSAGES.INTERNAL_ERROR), 500);
}

/** 存在しないパスは NOT_FOUND 形式で返す（app.notFound に登録） */
export function notFoundHandler(c: Context<AppEnv>): Response {
  return c.json(errorBody('NOT_FOUND', DEFAULT_MESSAGES.NOT_FOUND), 404);
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

/** D1 の UNIQUE 制約違反か（同時リクエストの競合を CONFLICT に変換する用途） */
export function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : '';
  return msg.includes('UNIQUE constraint failed');
}
