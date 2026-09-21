/**
 * Typed error hierarchy. Every error surfaced to clients flows through the
 * global error middleware which formats AppError instances into the standard
 * envelope: { success: false, error: { code, message, details } }
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'AUTH_ERROR', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super(404, 'NOT_FOUND', `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

/** Thrown when a dependency edge would create a cycle. Details carry the cycle path. */
export class CycleError extends AppError {
  constructor(public readonly cyclePath: string[]) {
    super(
      409,
      'CYCLE_DETECTED',
      `Adding this dependency would create a circular relationship: ${cyclePath.join(' → ')}`,
      { cycle: cyclePath }
    );
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please slow down') {
    super(429, 'RATE_LIMITED', message);
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(500, 'INTERNAL_ERROR', message);
  }
}
