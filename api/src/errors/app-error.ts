export type ApiErrorCode =
  | 'REQUEST_MALFORMED'
  | 'INVALID_CURSOR'
  | 'CURSOR_QUERY_MISMATCH'
  | 'AUTH_REQUIRED'
  | 'ACCESS_TOKEN_INVALID'
  | 'ACCESS_TOKEN_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_REUSED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'EXPENSE_NOT_FOUND'
  | 'EXPENSE_VERSION_CONFLICT'
  | 'CATEGORY_INACTIVE'
  | 'PRECONDITION_REQUIRED'
  | 'ROUTE_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_NOT_READY';

export interface ErrorDetail {
  field: string;
  code: string;
  message: string;
}

interface AppErrorOptions {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: readonly ErrorDetail[];
  headers?: Readonly<Record<string, string>>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: readonly ErrorDetail[];
  readonly headers: Readonly<Record<string, string>>;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
    this.headers = options.headers ?? {};
  }
}

export class ServiceNotReadyError extends AppError {
  constructor(cause?: unknown) {
    super({
      status: 503,
      code: 'SERVICE_NOT_READY',
      message: 'Service is not ready',
      headers: { 'Retry-After': '5' },
      cause,
    });
    this.name = 'ServiceNotReadyError';
  }
}
