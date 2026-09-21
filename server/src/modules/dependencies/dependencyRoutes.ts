import { Router } from 'express';
import Joi from 'joi';
import { db } from '../../db';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';
import { NotFoundError } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import { dagEngine } from '../dag/dagEngine';
import { emitToTeam } from '../../realtime/socket';

export const dependencyRouter = Router();
dependencyRouter.use(requireAuth);

const uuid = Joi.string().uuid();

/** Add a dependency edge. Rejects cycles (409 + path) without persisting. */
dependencyRouter.post(
  '/',
  validate({ body: Joi.object({ predecessor_id: uuid.required(), successor_id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const { predecessor_id, successor_id } = req.body;

    // May throw CycleError / ValidationError / NotFoundError — nothing persisted yet
    dagEngine.assertEdgeValid(predecessor_id, successor_id);

    const [dep] = await db.transaction(async (trx) => {
      const [row] = await trx('task_dependencies')
        .insert({ predecessor_id, successor_id, created_by: req.user!.userId })
        .returning('*');
      dagEngine.commitEdge(predecessor_id, successor_id);
      await dagEngine.recomputeStatuses(db, [successor_id], trx);
      return [row];
    });

    const pred = await db('tasks').select('team_id').where({ id: predecessor_id }).first();
    await writeAudit(db, { userId: req.user!.userId, entityType: 'dependency', entityId: dep.id, action: 'create', newValue: dep, correlationId: req.correlationId });
    if (pred) emitToTeam(pred.team_id, 'dependency:added', { dependency: dep });
    res.status(201).json({ success: true, data: dep });
  })
);

dependencyRouter.delete(
  '/:id',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const dep = await db('task_dependencies').where({ id: req.params.id }).first();
    if (!dep) throw new NotFoundError('Dependency');

    await db.transaction(async (trx) => {
      await trx('task_dependencies').where({ id: dep.id }).del();
      dagEngine.removeEdge(dep.predecessor_id, dep.successor_id);
      const affected = [dep.successor_id, ...dagEngine.downstream(dep.successor_id)];
      await dagEngine.recomputeStatuses(db, affected, trx);
    });

    const team = await db('tasks').select('team_id').where({ id: dep.successor_id }).first();
    await writeAudit(db, { userId: req.user!.userId, entityType: 'dependency', entityId: dep.id, action: 'delete', oldValue: dep, correlationId: req.correlationId });
    if (team) emitToTeam(team.team_id, 'dependency:removed', { dependencyId: dep.id });
    res.json({ success: true });
  })
);
