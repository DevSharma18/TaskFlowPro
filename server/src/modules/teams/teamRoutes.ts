import { Router } from 'express';
import Joi from 'joi';
import { db } from '../../db';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { NotFoundError } from '../../lib/errors';

export const teamRouter = Router();
teamRouter.use(requireAuth);

const uuid = Joi.string().uuid();

teamRouter.post(
  '/',
  requireRole('admin'),
  validate({ body: Joi.object({ name: Joi.string().min(1).max(100).required(), description: Joi.string().allow('').max(2000) }) }),
  asyncHandler(async (req, res) => {
    const [team] = await db('teams').insert(req.body).returning('*');
    await db('users').where({ id: req.user!.userId }).update({ team_id: team.id });
    res.status(201).json({ success: true, data: team });
  })
);

teamRouter.get(
  '/:id',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    if (req.params.id !== req.user!.teamId) throw new NotFoundError('Team');
    const team = await db('teams').where({ id: req.params.id }).first();
    if (!team) throw new NotFoundError('Team');
    res.json({ success: true, data: team });
  })
);

teamRouter.put(
  '/:id',
  requireRole('admin'),
  validate({
    params: Joi.object({ id: uuid.required() }),
    body: Joi.object({ name: Joi.string().min(1).max(100), description: Joi.string().allow('').max(2000) }),
  }),
  asyncHandler(async (req, res) => {
    if (req.params.id !== req.user!.teamId) throw new NotFoundError('Team');
    const [team] = await db('teams').where({ id: req.params.id }).update({ ...req.body }).returning('*');
    if (!team) throw new NotFoundError('Team');
    res.json({ success: true, data: team });
  })
);

teamRouter.get(
  '/:id/members',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    if (req.params.id !== req.user!.teamId) throw new NotFoundError('Team');
    const members = await db('users')
      .select('id', 'email', 'name', 'role', 'avatar_url')
      .where({ team_id: req.params.id });
    res.json({ success: true, data: members });
  })
);
