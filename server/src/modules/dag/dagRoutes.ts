import { Router } from 'express';
import Joi from 'joi';
import { db } from '../../db';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';
import { NotFoundError } from '../../lib/errors';
import { dagEngine } from './dagEngine';
import { emitToTeam } from '../../realtime/socket';
import { cached, getCacheStore } from '../../lib/cache';

export const dagRouter = Router();
dagRouter.use(requireAuth);

export async function invalidateDagCache(teamId: string): Promise<void> {
  const store = getCacheStore();
  await store.del(`dag:graph:${teamId}`);
  await store.del(`dag:cp:${teamId}`);
  if (store.delPattern) {
    await store.delPattern(`dag:*:${teamId}*`);
  }
}

const uuid = Joi.string().uuid();

/** Full graph payload for the ReactFlow visualization. */
dagRouter.get(
  '/graph',
  asyncHandler(async (req, res) => {
    const teamId = req.user!.teamId;
    if (!teamId) return res.json({ success: true, data: { nodes: [], edges: [] } });

    const data = await cached(`dag:graph:${teamId}`, 60, async () => {
      const tasks = await db('tasks')
        .select('id', 'title', 'status', 'priority', 'dependency_status', 'start_date', 'end_date', 'duration_days', 'assignee_id')
        .where({ team_id: teamId });
      const ids = new Set(tasks.map((t) => t.id));
      const edges = dagEngine.edges().filter((e) => ids.has(e.predecessor_id) && ids.has(e.successor_id));
      return { nodes: tasks, edges };
    });

    res.json({ success: true, data });
  })
);

dagRouter.get(
  '/critical-path',
  asyncHandler(async (req, res) => {
    const teamId = req.user?.teamId;
    if (!teamId) {
      return res.json({ success: true, data: { path: [], totalDays: 0 } });
    }
    const cacheKey = `dag:cp:${teamId}`;

    const data = await cached(cacheKey, 60, async () => {
      const { path, totalDays } = await dagEngine.criticalPath(db, teamId);
      const tasks = path.length
        ? await db('tasks').select('id', 'title', 'status', 'duration_days', 'start_date', 'end_date').whereIn('id', path)
        : [];
      const byId = new Map(tasks.map((t) => [t.id, t]));
      return { path: path.map((id) => byId.get(id)).filter(Boolean), totalDays };
    });

    res.json({ success: true, data });
  })
);

dagRouter.post(
  '/propagate/:id',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const teamId = req.user!.teamId;
    const task = await db('tasks').where({ id: req.params.id }).first();
    if (!task || task.team_id !== teamId) throw new NotFoundError('Task');
    const changes = await db.transaction((trx) => dagEngine.propagateSchedule(db, task.id, trx));
    if (changes.length) {
      emitToTeam(task.team_id, 'schedule:propagated', { sourceId: task.id, changes });
      await invalidateDagCache(task.team_id);
    }
    res.json({ success: true, data: { changes } });
  })
);
