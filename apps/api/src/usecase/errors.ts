import { ERROR_STATUS, type ErrorCode, type ValidationErrorDetails } from '@minton/types';

export const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: '入力内容に誤りがあります',
  UNAUTHORIZED: 'ログインが必要です',
  FORBIDDEN: 'この操作を行う権限がありません',
  NOT_FOUND: '見つかりません',
  CONFLICT: '既に登録されています',
  TOO_MANY_REQUESTS: '試行回数が多すぎます。しばらくしてから再度お試しください',
  INTERNAL_ERROR: 'サーバーでエラーが発生しました',
};

/**
 * アプリのエラー。usecase / route / middleware から throw すると application の errorHandler が
 * ApiErrorResponse 形式に整形する。message は Client にそのまま返るので秘密情報を入れないこと。
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: (typeof ERROR_STATUS)[ErrorCode];
  readonly details?: ValidationErrorDetails;

  constructor(code: ErrorCode, message?: string, details?: ValidationErrorDetails) {
    super(message ?? DEFAULT_ERROR_MESSAGES[code]);
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
export const tooManyRequests = () => new AppError('TOO_MANY_REQUESTS');
export const internalError = () => new AppError('INTERNAL_ERROR');
