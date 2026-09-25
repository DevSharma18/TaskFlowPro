import { Router, Request, Response } from 'express';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../../db';
import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { AuthError, ConflictError, ValidationError } from '../../lib/errors';
import { requireAuth, signAccessToken } from '../../middlewares/auth';
import { writeAudit } from '../../lib/audit';
import { sessionStore } from './sessionStore';
import { createRateLimiter } from '../../middlewares/rateLimiter';

export const authRouter = Router();

// Auth rate limiter: 15 req/min against credential stuffing
const authLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 15,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Please wait a minute.' } },
});

const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string()
    .min(8)
    .pattern(/[A-Z]/, 'uppercase letter')
    .pattern(/[0-9]/, 'digit')
    .required(),
  name: Joi.string().min(1).max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const REFRESH_COOKIE = 'tf_refresh';

async function createRefreshToken(userId: string, req: Request, res: Response): Promise<void> {
  const raw = crypto.randomBytes(48).toString('hex');
  const tokenHash = await bcrypt.hash(raw, 10);
  const tokenPrefix = raw.slice(0, 16);
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 86400_000);

  await sessionStore.createSession({
    userId,
    tokenHash,
    tokenPrefix,
    expiresAt,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  });
}

async function sendTokens(userId: string, email: string, role: string, teamId: string | null, name: string, req: Request, res: Response) {
  const accessToken = signAccessToken({ userId, email, role, teamId });
  await createRefreshToken(userId, req, res);
  return { accessToken, user: { id: userId, email, name, role, teamId } };
}

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const existing = await db('users').where({ email: email.toLowerCase() }).first();
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
    const [user] = await db('users')
      .insert({ email: email.toLowerCase(), password_hash: passwordHash, name, role: 'member' })
      .returning('*');

    // Create a default workspace team for the new user
    const [team] = await db('teams')
      .insert({ name: `${name}'s Workspace`, description: 'Personal workspace' })
      .returning('*');
    await db('users').where({ id: user.id }).update({ team_id: team.id });
    user.team_id = team.id;

    await writeAudit(db, { userId: user.id, entityType: 'user', entityId: user.id, action: 'register', correlationId: req.correlationId });
    const body = await sendTokens(user.id, user.email, user.role, user.team_id, user.name, req, res);
    res.status(201).json({ success: true, data: body });
  })
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await db('users').where({ email: email.toLowerCase() }).first();
    if (!user) throw new AuthError('Invalid email or password');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new AuthError('Invalid email or password');

    const body = await sendTokens(user.id, user.email, user.role, user.team_id, user.name, req, res);
    req.log.info('login', { userId: user.id });
    res.json({ success: true, data: { ...body, user: { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.team_id } } });
  })
);

authRouter.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw new AuthError('Missing refresh token');
    const prefix = raw.slice(0, 16);
    const sessions = await sessionStore.findSessionsByPrefix(prefix);
    let match: (typeof sessions)[number] | null = null;
    for (const session of sessions) {
      if (await bcrypt.compare(raw, session.tokenHash)) {
        match = session;
        break;
      }
    }
    if (!match) throw new AuthError('Invalid refresh token');

    const user = await db('users').where({ id: match.userId }).first();
    if (!user) throw new AuthError('User no longer exists');

    // Rotate: remove old session atomically, issue new
    const deleted = await sessionStore.deleteSession(match.sessionId);
    if (!deleted) throw new AuthError('Invalid refresh token');
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role, teamId: user.team_id });
    await createRefreshToken(user.id, req, res);
    res.json({ success: true, data: { accessToken } });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      const prefix = raw.slice(0, 16);
      const sessions = await sessionStore.findSessionsByPrefix(prefix);
      for (const session of sessions) {
        if (await bcrypt.compare(raw, session.tokenHash)) {
          await sessionStore.deleteSession(session.sessionId);
          break;
        }
      }
    }
    res.clearCookie(REFRESH_COOKIE, {
      path: '/api/auth',
      httpOnly: true,
      secure: env.isProd,
      sameSite: 'strict',
    });
    res.json({ success: true });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db('users').select('id', 'email', 'name', 'role', 'team_id as teamId', 'avatar_url').where({ id: req.user!.userId }).first();
    if (!user) throw new ValidationError('User not found');
    res.json({ success: true, data: user });
  })
);
