import { Router } from 'express';
import Joi from 'joi';
import { db } from '../../db';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import { nextPosition, betweenPosition, rebalanceColumn } from '../../lib/position';
import { dagEngine, TaskStatus } from '../dag/dagEngine';
import { emitToTeam, emitToUser } from '../../realtime/socket';

export const taskRouter = Router();
taskRouter.use(requireAuth);

const uuid = Joi.string().uuid();
const dateStr = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('').max(20000),
  status: Joi.string().valid('backlog', 'in_progress', 'review', 'done').default('backlog'),
  priority: Joi.string().valid('critical', 'high', 'medium', 'low').default('medium'),
  assignee_id: uuid.allow(null),
  start_date: dateStr.allow(null),
  end_date: dateStr.allow(null),
  duration_days: Joi.number().integer().min(1).max(3650).allow(null),
  story_points: Joi.number().integer().min(0).max(100).allow(null),
});

const updateSchema = createSchema.fork(
  ['title', 'status', 'priority'],
  (s) => s.optional()
).append({ team_id: Joi.forbidden() });

const STATUSES: TaskStatus[] = ['backlog', 'in_progress', 'review', 'done'];

function assertDatesValid(start?: string | null, end?: string | null) {
  if (start && end && end < start) {
    throw new ValidationError('end_date must be on or after start_date');
  }
}

taskRouter.get(
  '/',
  validate({
    query: Joi.object({
      status: Joi.string().valid(...STATUSES),
      assignee_id: uuid,
      priority: Joi.string().valid('critical', 'high', 'medium', 'low'),
      team_id: uuid,
    }),
  }),
  asyncHandler(async (req, res) => {
    const teamId = (req.query.team_id as string) ?? req.user!.teamId;
    if (!teamId) throw new ValidationError('No team context; create or join a team first');
    const query = db('tasks').where({ team_id: teamId });
    if (req.query.status) query.andWhere({ status: req.query.status });
    if (req.query.assignee_id) query.andWhere({ assignee_id: req.query.assignee_id });
    if (req.query.priority) query.andWhere({ priority: req.query.priority });
    const tasks = await query.orderBy([{ column: 'status' }, { column: 'position', order: 'asc' }]);
    res.json({ success: true, data: tasks });
  })
);

taskRouter.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const teamId = req.user!.teamId;
    if (!teamId) throw new ValidationError('No team context; create or join a team first');
    assertDatesValid(req.body.start_date, req.body.end_date);

    const position = await nextPosition(db, teamId, req.body.status);
    const [task] = await db('tasks')
      .insert({ ...req.body, team_id: teamId, created_by: req.user!.userId, position })
      .returning('*');

    dagEngine.addNode(task.id);
    await dagEngine.recomputeStatuses(db, [task.id]);
    await writeAudit(db, { userId: req.user!.userId, entityType: 'task', entityId: task.id, action: 'create', newValue: task, correlationId: req.correlationId });
    emitToTeam(teamId, 'task:created', { task });
    res.status(201).json({ success: true, data: task });
  })
);

taskRouter.get(
  '/:id',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const task = await db('tasks').where({ id: req.params.id }).first();
    if (!task) throw new NotFoundError('Task');
    const deps = await db('task_dependencies as d')
      .join('tasks as p', 'p.id', 'd.predecessor_id')
      .where('d.successor_id', task.id)
      .select('d.id as dep_id', 'p.id', 'p.title', 'p.status');
    const dependents = await db('task_dependencies as d')
      .join('tasks as s', 's.id', 'd.successor_id')
      .where('d.predecessor_id', task.id)
      .select('d.id as dep_id', 's.id', 's.title', 's.status');
    res.json({ success: true, data: { ...task, prerequisites: deps, dependents } });
  })
);

taskRouter.put(
  '/:id',
  validate({ params: Joi.object({ id: uuid.required() }), body: updateSchema }),
  asyncHandler(async (req, res) => {
    const old = await db('tasks').where({ id: req.params.id }).first();
    if (!old) throw new NotFoundError('Task');
    assertDatesValid(req.body.start_date ?? old.start_date, req.body.end_date ?? old.end_date);

    const [task] = await db('tasks')
      .where({ id: req.params.id, updated_at: old.updated_at }) // optimistic lock
      .update({ ...req.body, updated_at: new Date() })
      .returning('*');
    if (!task) throw new ValidationError('Task was modified by someone else; refresh and retry');

    const dateChanged =
      (req.body.start_date && req.body.start_date !== old.start_date) ||
      (req.body.end_date && req.body.end_date !== old.end_date);

    let propagated: { id: string; start_date: string; end_date: string }[] = [];
    await db.transaction(async (trx) => {
      if (dateChanged) propagated = await dagEngine.propagateSchedule(db, task.id, trx);
    });

    await writeAudit(db, { userId: req.user!.userId, entityType: 'task', entityId: task.id, action: 'update', oldValue: old, newValue: task, correlationId: req.correlationId });
    emitToTeam(old.team_id, 'task:updated', { task });
    if (propagated.length) emitToTeam(old.team_id, 'schedule:propagated', { sourceId: task.id, changes: propagated });
    res.json({ success: true, data: { task, propagated } });
  })
);

taskRouter.delete(
  '/:id',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const old = await db('tasks').where({ id: req.params.id }).first();
    if (!old) throw new NotFoundError('Task');
    const affected = dagEngine.downstream(req.params.id);
    await db('tasks').where({ id: req.params.id }).del(); // cascade removes edges
    dagEngine.removeNode(req.params.id);
    await dagEngine.recomputeStatuses(db, affected);
    await writeAudit(db, { userId: req.user!.userId, entityType: 'task', entityId: old.id, action: 'delete', oldValue: old, correlationId: req.correlationId });
    emitToTeam(old.team_id, 'task:deleted', { taskId: old.id, affected });
    res.json({ success: true });
  })
);

taskRouter.patch(
  '/:id/status',
  validate({
    params: Joi.object({ id: uuid.required() }),
    body: Joi.object({ status: Joi.string().valid(...STATUSES).required() }),
  }),
  asyncHandler(async (req, res) => {
    const old = await db('tasks').where({ id: req.params.id }).first();
    if (!old) throw new NotFoundError('Task');
    const newStatus = req.body.status as TaskStatus;

    // Blocked tasks cannot be moved to done
    if (newStatus === 'done' && old.dependency_status === 'blocked') {
      const blockers = await db('task_dependencies as d')
        .join('tasks as p', 'p.id', 'd.predecessor_id')
        .where('d.successor_id', old.id)
        .whereNot('p.status', 'done')
        .select('p.id', 'p.title');
      throw new ValidationError(
        `Task is blocked by: ${blockers.map((b) => b.title).join(', ')}. Complete prerequisites first.`,
        { blockers }
      );
    }

    const isRegression = STATUSES.indexOf(newStatus) < STATUSES.indexOf(old.status as TaskStatus);
    const [task] = await db('tasks')
      .where({ id: old.id })
      .update({ status: newStatus, updated_at: new Date() })
      .returning('*');

    // Rollback on regression: recompute ALL downstream statuses; on any
    // status change downstream tasks may flip to blocked or ready.
    const affected = dagEngine.downstream(old.id);
    const changes = await db.transaction((trx) => dagEngine.recomputeStatuses(db, affected, trx));

    await writeAudit(db, { userId: req.user!.userId, entityType: 'task', entityId: old.id, action: isRegression ? 'regress' : 'advance', oldValue: { status: old.status }, newValue: { status: newStatus }, correlationId: req.correlationId });
    emitToTeam(old.team_id, 'task:moved', { task, regression: isRegression, statusChanges: changes });
    res.json({ success: true, data: { task, regression: isRegression, statusChanges: changes } });
  })
);

taskRouter.patch(
  '/:id/position',
  validate({
    params: Joi.object({ id: uuid.required() }),
    body: Joi.object({ before_id: uuid.allow(null), after_id: uuid.allow(null) }),
  }),
  asyncHandler(async (req, res) => {
    const task = await db('tasks').where({ id: req.params.id }).first();
    if (!task) throw new NotFoundError('Task');
    const before = req.body.after_id ? ((await db('tasks').where({ id: req.body.after_id }).first())?.position ?? null) : null;
    const after = req.body.before_id ? ((await db('tasks').where({ id: req.body.before_id }).first())?.position ?? null) : null;
    let position = betweenPosition(before as number | null, after as number | null);
    if (before !== null && after !== null && after - before < 2) {
      await rebalanceColumn(db, task.team_id, task.status);
      position = await nextPosition(db, task.team_id, task.status);
    }
    const [updated] = await db('tasks').where({ id: task.id }).update({ position, updated_at: new Date() }).returning('*');
    emitToTeam(task.team_id, 'task:reordered', { task: updated });
    res.json({ success: true, data: updated });
  })
);

taskRouter.patch(
  '/bulk-position',
  validate({
    body: Joi.object({
      moves: Joi.array()
        .items(Joi.object({ id: uuid.required(), status: Joi.string().valid(...STATUSES).required(), position: Joi.number().integer().min(0).required() }))
        .min(1)
        .max(500)
        .required(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const ids = req.body.moves.map((m: { id: string }) => m.id);
    const tasks = await db('tasks').whereIn('id', ids);
    const oldById = new Map(tasks.map((t) => [t.id, t]));
    const statusChanged: string[] = [];

    await db.transaction(async (trx) => {
      for (const m of req.body.moves as { id: string; status: TaskStatus; position: number }[]) {
        const old = oldById.get(m.id);
        if (!old) throw new NotFoundError(`Task ${m.id}`);
        if (m.status === 'done' && old.dependency_status === 'blocked') {
          throw new ValidationError(`Cannot move blocked task "${old.title}" to Done`);
        }
        await trx('tasks').where({ id: m.id }).update({ status: m.status, position: m.position, updated_at: new Date() });
        if (old.status !== m.status) statusChanged.push(m.id);
      }
      for (const id of statusChanged) {
        await dagEngine.recomputeStatuses(db, dagEngine.downstream(id), trx);
      }
    });

    const teamId = tasks[0]?.team_id;
    if (teamId) emitToTeam(teamId, 'task:reordered', { ids, statusChanged });
    res.json({ success: true });
  })
);

// Recursive upstream/downstream (kept on task router per API spec)
taskRouter.get(
  '/:id/upstream',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const ids = dagEngine.upstream(req.params.id);
    const tasks = await db('tasks').select('id', 'title', 'status', 'start_date', 'end_date').whereIn('id', ids);
    res.json({ success: true, data: tasks });
  })
);

taskRouter.get(
  '/:id/downstream',
  validate({ params: Joi.object({ id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const ids = dagEngine.downstream(req.params.id);
    const tasks = await db('tasks').select('id', 'title', 'status', 'start_date', 'end_date').whereIn('id', ids);
    res.json({ success: true, data: tasks });
  })
);
