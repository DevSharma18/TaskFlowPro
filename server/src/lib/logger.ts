import winston from 'winston';
import { env } from '../config/env';

const REDACT_KEYS = ['password', 'password_hash', 'token', 'refreshToken', 'accessToken', 'authorization', 'cookie', 'apiKey', 'gemini_api_key'];

const redactFormat = winston.format((info) => {
  const redact = (obj: Record<string, unknown>): Record<string, unknown> => {
    for (const key of Object.keys(obj)) {
      if (REDACT_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        obj[key] = redact(obj[key] as Record<string, unknown>);
      }
    }
    return obj;
  };
  return redact(info as Record<string, unknown>) as winston.Logform.TransformableInfo;
});

export const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'taskflow-server' },
  transports: [
    new winston.transports.Console({
      format: env.isProd
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    ...(env.isProd
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
          }),
        ]
      : []),
  ],
});

/** Create a child logger bound to a request correlation id. */
export function requestLogger(correlationId: string) {
  return logger.child({ correlationId });
}
