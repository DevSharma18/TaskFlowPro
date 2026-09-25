import { createRateLimiter } from './rateLimiter';
import { Request, Response, NextFunction } from 'express';

describe('createRateLimiter', () => {
  it('creates an express middleware function', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 10,
    });
    expect(typeof limiter).toBe('function');
  });

  it('supports custom keyGenerator and limits', () => {
    const keyGen = (req: Request) => req.headers['x-user-id'] as string || 'anon';
    const limiter = createRateLimiter({
      windowMs: 30_000,
      limit: 5,
      keyGenerator: keyGen,
    });
    expect(typeof limiter).toBe('function');
  });

  it('allows request within rate limit', (done) => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: 10,
    });

    const req = {
      ip: '127.0.0.1',
      headers: {},
      app: { get: () => false },
    } as unknown as Request;

    const res = {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
    } as unknown as Response;

    const next: NextFunction = (err?: unknown) => {
      expect(err).toBeUndefined();
      done();
    };

    limiter(req, res, next);
  });
});
