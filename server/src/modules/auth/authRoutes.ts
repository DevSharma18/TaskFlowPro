import { Router } from 'express';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../../db';
import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { AuthError, ConflictError, ValidationError } from '../../lib/errors';
import { requireAuth, signAccessToken } from '../../middlewares/auth';
import { writeAudit } from '../../lib/audit';

export const authRouter = Router();

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

function issueRefreshToken(userId: string): { raw: string; expiresAt: Date } {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 86400_000);
  // stored async by caller
  (issueRefreshToken as unknown as Record<string, unknown>).lastHash = bcrypt.hashSync(raw, 10);
  void userId;
  return { raw, expiresAt };
}

async function createRefreshToken(userId: string, res: import('express').Response): Promise<void> {
  const raw = crypto.randomBytes(48).toString('hex');
  const tokenHash = await bcrypt.hash(raw, 10);
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 86400_000);
  await db('refresh_tokens').insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  });
}

async function sendTokens(userId: string, email: string, role: string, teamId: string | null, res: import('express').Response) {
  const accessToken = signAccessToken({ userId, email, role, teamId });
  await createRefreshToken(userId, res);
  return { accessToken, user: { id: userId, email, name: role, role, teamId } };
}

authRouter.post(
  '/register',
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const existing = await db('users').where({ email: email.toLowerCase() }).first();
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
    const [user] = await db('users')
      .insert({ email: email.toLowerCase(), password_hash: passwordHash, name, role: 'admin' })
      .returning('*');

    await writeAudit(db, { userId: user.id, entityType: 'user', entityId: user.id, action: 'register', correlationId: req.correlationId });
    const body = await sendTokens(user.id, user.email, user.role, user.team_id, res);
    res.status(201).json({ success: true, data: body });
  })
);

authRouter.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await db('users').where({ email: email.toLowerCase() }).first();
    if (!user) throw new AuthError('Invalid email or password');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new AuthError('Invalid email or password');

    const body = await sendTokens(user.id, user.email, user.role, user.team_id, res);
    req.log.info('login', { userId: user.id });
    res.json({ success: true, data: { ...body, user: { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.team_id } } });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw new AuthError('Missing refresh token');
    const rows = await db('refresh_tokens').where('expires_at', '>', new Date());
    let match: (typeof rows)[number] | null = null;
    for (const row of rows) {
      if (await bcrypt.compare(raw, row.token_hash)) {
        match = row;
        break;
      }
    }
    if (!match) throw new AuthError('Invalid refresh token');

    const user = await db('users').where({ id: match.user_id }).first();
    if (!user) throw new AuthError('User no longer exists');

    // Rotate: delete old, issue new
    await db('refresh_tokens').where({ id: match.id }).del();
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role, teamId: user.team_id });
    await createRefreshToken(user.id, res);
    res.json({ success: true, data: { accessToken } });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) {
      const rows = await db('refresh_tokens').where('expires_at', '>', new Date());
      for (const row of rows) {
        if (await bcrypt.compare(raw, row.token_hash)) {
          await db('refresh_tokens').where({ id: row.id }).del();
          break;
        }
      }
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ success: true });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db('users').select('id', 'email', 'name', 'role', 'team_id', 'avatar_url').where({ id: req.user!.userId }).first();
    if (!user) throw new ValidationError('User not found');
    res.json({ success: true, data: user });
  })
);
