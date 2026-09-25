import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';

export interface RateLimiterConfig {
  windowMs?: number;
  limit?: number;
  keyGenerator?: Options['keyGenerator'];
  message?: string | object;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimitRequestHandler {
  const windowMs = config.windowMs ?? 60_000;
  const limit = config.limit ?? 100;
  const storeDriver = process.env.RATE_LIMIT_STORE ?? 'memory';

  if (storeDriver === 'redis' && process.env.REDIS_URL) {
    // Extensibility point: when switching to paid Redis/Upstash, plug RedisStore here
    // return rateLimit({ ...config, store: new RedisStore({ sendCommand: ... }) });
  }

  return rateLimit({
    windowMs,
    limit,
    keyGenerator: config.keyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: config.message ?? {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
    },
  });
}
