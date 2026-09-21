import { Router } from 'express';
import Joi from 'joi';
import { db } from '../../db';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';
import { NotFoundError } from '../../lib/errors';
import { dagEngine } from './dagEngine';
import { emitToTeam } from '../../realtime/socket';

export const dagRouter = Router();
dagRouter.use(requireAuth);

const uuid = Joi.string().uuid();

/** Full graph payload for the ReactFlow visualization. */
dagRouter.get(
  '/graph',
  asyncHandler(async (req, res) => {
    const teamId = req.user!.teamId;
    if (!teamId) return res.json({ success: true, data: { nodes: [], edges: [] } });
    const tasks = await db('tasks')
      .select('id', 'title', 'status', 'priority', 'dependency_status', 'start_date', 'end_date', 'duration_days', 'assignee_id')
      .where({ team_id: teamId });
    const ids = new Set(tasks.map((t) => t.id));
    const edges = dagEngine.edges().filter((e) => ids.has(e.predecessor_id) && ids.has(e.successor_id));
    res.json({ success: true, data: { nodes: tasks, edges } });
  })
);

dagRouter.get(
  '/critical-path',
  asyncHandler(async (_req, res) => {
    const { path, totalDays } = await dagEngine.criticalPath(db);
    const tasks = path.length
      ? await db('tasks').select('id', 'title', 'status', 'duration_days', 'start_date', 'end_date').whereIn('id', path)
      : [];
    // preserve path order
    const byId = new Map(tasks.map((t) => [t.id, t]));
    res.json({ success: true, data: { path: path.map((id) => byId.get(id)).filter(Boolean), totalDays } });
  })
);

dagRouter.post(
  '/propagate/:id',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const task = await db('tasks').where({ id: req.params.id }).first();
    if (!task) throw new NotFoundError('Task');
    const changes = await db.transaction((trx) => dagEngine.propagateSchedule(db, task.id, trx));
    if (changes.length) emitToTeam(task.team_id, 'schedule:propagated', { sourceId: task.id, changes });
    res.json({ success: true, data: { changes } });
  })
);
