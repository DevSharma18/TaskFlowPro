import { Request, Response, NextFunction } from 'express';
import { AppError, InternalError } from '../lib/errors';

/** 404 for unmatched routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

/** Global error middleware — always registered last. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const error = err instanceof AppError ? err : new InternalError();

  if (!(err instanceof AppError)) {
    req.log?.error('unhandled_error', { err });
  } else if (error.statusCode >= 500) {
    req.log?.error('server_error', { code: error.code, message: error.message });
  } else {
    req.log?.warn('client_error', { code: error.code, message: error.message });
  }

  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  });
}
