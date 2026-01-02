export type ConvoyErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_ARGS'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL';

export type ConvoyErrorPayload = {
  code: ConvoyErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

const ERROR_STATUS: Record<ConvoyErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_ARGS: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL: 500,
};

export class ConvoyError extends Error {
  code: ConvoyErrorCode;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: ConvoyErrorCode,
    message: string,
    options?: { status?: number; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'ConvoyError';
    this.code = code;
    this.status = options?.status ?? ERROR_STATUS[code] ?? 500;
    this.details = options?.details;
  }
}

export function convoyError(
  code: ConvoyErrorCode,
  message: string,
  options?: { status?: number; details?: Record<string, unknown> },
): ConvoyError {
  return new ConvoyError(code, message, options);
}

export function isConvoyError(error: unknown): error is ConvoyError {
  return error instanceof ConvoyError;
}

export function statusForCode(code: ConvoyErrorCode): number {
  return ERROR_STATUS[code] ?? 500;
}

export function errorPayloadFrom(error: ConvoyError): ConvoyErrorPayload {
  const payload: ConvoyErrorPayload = {
    code: error.code,
    message: error.message,
  };
  if (error.details) {
    payload.details = error.details;
  }
  return payload;
}
