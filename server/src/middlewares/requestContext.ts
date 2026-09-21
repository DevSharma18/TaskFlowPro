import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { requestLogger } from '../lib/logger';
import type { Logger } from 'winston';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      log: Logger;
      user?: { userId: string; email: string; role: string; teamId: string | null };
    }
  }
}

/** Assigns a correlation id + child logger to every request, logs completion. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.header('X-Request-Id') ?? randomUUID()) as string;
  req.correlationId = correlationId;
  req.log = requestLogger(correlationId);
  res.setHeader('X-Request-Id', correlationId);

  const start = Date.now();
  res.on('finish', () => {
    req.log.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      userId: req.user?.userId,
    });
  });
  next();
}
