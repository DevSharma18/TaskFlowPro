import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import { db } from '../../db';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import { callGemini } from './geminiService';
import { prompts, TaskContext, DepContext } from './prompts';
import {
  validateDepSuggestions,
  validateIdList,
  validateText,
  validateConfidence,
  validateStoryPoints,
  validatePriority,
} from './validators';
import { dagEngine } from '../dag/dagEngine';
import { emitToUser } from '../../realtime/socket';

export const aiRouter = Router();
aiRouter.use(requireAuth);

// AI endpoints: stricter limit (10/min) — Gemini calls are expensive
aiRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'AI rate limit reached (10/min). Try again shortly.' } },
  })
);

const uuid = Joi.string().uuid();

const TASK_SELECT = 'id, title, description, status, start_date, end_date, duration_days, story_points, priority';

async function buildContext(teamId: string): Promise<{ tasks: TaskContext[]; deps: DepContext[] }> {
  const tasks = (await db('tasks').select(TASK_SELECT).where({ team_id: teamId })) as TaskContext[];
  const ids = new Set(tasks.map((t) => t.id));
  const allDeps = (await db('task_dependencies').select('predecessor_id', 'successor_id')) as DepContext[];
  const deps = allDeps.filter((d) => ids.has(d.predecessor_id) && ids.has(d.successor_id));
  return { tasks, deps };
}

async function getTargetTask(taskId: string, teamId: string): Promise<TaskContext> {
  const task = await db('tasks').select(TASK_SELECT).where({ id: taskId, team_id: teamId }).first();
  if (!task) throw new NotFoundError('Task');
  return task as TaskContext;
}

async function recordSuggestion(teamId: string, type: string, taskId: string | null, data: unknown, confidence: number, reasoning: string, prompt: string) {
  const [row] = await db('ai_suggestions')
    .insert({
      task_id: taskId,
      team_id: teamId,
      suggestion_type: type,
      suggested_data: JSON.stringify(data),
      confidence,
      reasoning,
      prompt_used: prompt,
      model_version: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    })
    .returning('*');
  return row;
}

function requireTeam(req: { user?: { teamId: string | null } }): string {
  const teamId = req.user?.teamId;
  if (!teamId) throw new ValidationError('No team context; create or join a team first');
  return teamId;
}

/** POST /api/ai/suggest-deps — dependency suggestions for a task (human must accept). */
aiRouter.post(
  '/suggest-deps',
  validate({ body: Joi.object({ task_id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const target = await getTargetTask(req.body.task_id, teamId);
    if (!target.description && target.title.length < 8) {
      throw new ValidationError('Task needs a richer title or description for AI suggestions');
    }
    const { tasks, deps } = await buildContext(teamId);
    const prompt = prompts.suggestDeps(tasks, deps, target);
    const raw = await callGemini<unknown>('suggestDeps', prompt);

    const existing = new Set(deps.filter((d) => d.successor_id === target.id).map((d) => `${d.predecessor_id}->${d.successor_id}`));
    const { valid, dropped } = validateDepSuggestions(raw, target.id, existing);
    if (valid.length === 0) {
      return res.json({ success: true, data: { suggestions: [], dropped, note: 'No valid suggestions (AI may have referenced unknown tasks or cycles).' } });
    }

    const saved = [];
    for (const s of valid) {
      saved.push(await recordSuggestion(teamId, 'dependency', target.id, { predecessor_id: s.predecessor_id, successor_id: target.id }, s.confidence, s.reasoning, prompt));
    }
    emitToUser(req.user!.userId, 'ai:suggestion-ready', { type: 'dependency', taskId: target.id, count: saved.length });
    res.json({ success: true, data: { suggestions: saved, dropped } });
  })
);

/** POST /api/ai/describe — generate description + acceptance criteria. */
aiRouter.post(
  '/describe',
  validate({ body: Joi.object({ task_id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const target = await getTargetTask(req.body.task_id, teamId);
    const prompt = prompts.describe(target);
    const raw = await callGemini<unknown>('describe', prompt);
    const description = validateText(raw, 'description');
    const criteria = (raw as { acceptance_criteria?: unknown }).acceptance_criteria;
    const confidence = validateConfidence(raw);
    const saved = await recordSuggestion(teamId, 'describe', target.id, { description, acceptance_criteria: Array.isArray(criteria) ? criteria.map((c) => String(c).slice(0, 500)) : [] }, confidence, 'Generated description', prompt);
    res.json({ success: true, data: saved });
  })
);

/** POST /api/ai/decompose — break task into subtasks. */
aiRouter.post(
  '/decompose',
  validate({ body: Joi.object({ task_id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const target = await getTargetTask(req.body.task_id, teamId);
    const prompt = prompts.decompose(target);
    const raw = await callGemini<unknown>('decompose', prompt);
    const subtasks = Array.isArray((raw as { subtasks?: unknown }).subtasks)
      ? ((raw as { subtasks: { title?: unknown; story_points?: unknown; depends_on_indices?: unknown }[] }).subtasks)
          .slice(0, 6)
          .map((s, i) => ({
            index: i,
            title: String(s.title ?? `Subtask ${i + 1}`).slice(0, 255),
            story_points: validateStoryPoints(s) ?? 3,
            depends_on_indices: Array.isArray(s.depends_on_indices)
              ? (s.depends_on_indices as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < i)
              : [],
          }))
      : [];
    const confidence = validateConfidence(raw);
    if (subtasks.length === 0) throw new ValidationError('AI returned no usable subtasks; try again or refine the task title');
    const saved = await recordSuggestion(teamId, 'decompose', target.id, { subtasks }, confidence, 'Task decomposition', prompt);
    res.json({ success: true, data: saved });
  })
);

/** POST /api/ai/estimate — story point estimation. */
aiRouter.post(
  '/estimate',
  validate({ body: Joi.object({ task_id: uuid.required() }) }),
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const target = await getTargetTask(req.body.task_id, teamId);
    const { tasks } = await buildContext(teamId);
    const prompt = prompts.estimate(tasks, target);
    const raw = await callGemini<unknown>('estimate', prompt);
    const points = validateStoryPoints(raw);
    if (points === null) throw new ValidationError('AI returned an invalid estimate; try again');
    const saved = await recordSuggestion(teamId, 'estimate', target.id, { story_points: points }, validateConfidence(raw), validateText(raw, 'reasoning'), prompt);
    res.json({ success: true, data: saved });
  })
);

/** POST /api/ai/analyze-risk — schedule risk analysis. */
aiRouter.post(
  '/analyze-risk',
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const { tasks, deps } = await buildContext(teamId);
    const { path } = await dagEngine.criticalPath(db);
    const prompt = prompts.analyzeRisk(tasks, deps, path);
    const raw = await callGemini<unknown>('analyzeRisk', prompt);
    const risks = Array.isArray((raw as { risks?: unknown }).risks)
      ? ((raw as { risks: { task_id?: unknown; severity?: unknown; description?: unknown }[] }).risks)
          .slice(0, 5)
          .map((r) => ({ task_id: String(r.task_id ?? ''), severity: String(r.severity ?? 'medium'), description: String(r.description ?? '').slice(0, 500) }))
          .filter((r) => tasks.some((t) => t.id === r.task_id)) // drop invented ids
      : [];
    const saved = await recordSuggestion(teamId, 'risk', null, { risks }, validateConfidence(raw), 'Schedule risk analysis', prompt);
    res.json({ success: true, data: saved });
  })
);

/** POST /api/ai/standup — daily standup summary. */
aiRouter.post(
  '/standup',
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const { tasks, deps } = await buildContext(teamId);
    const prompt = prompts.standup(tasks, deps);
    const raw = await callGemini<unknown>('standup', prompt);
    const summary = validateText(raw, 'summary');
    const blockedIds = validateIdList(raw, 'blocked_task_ids');
    const saved = await recordSuggestion(teamId, 'standup', null, { summary, blocked_task_ids: blockedIds }, validateConfidence(raw), 'Standup summary', prompt);
    res.json({ success: true, data: saved });
  })
);

/** POST /api/ai/search — natural language search. */
aiRouter.post(
  '/search',
  validate({ body: Joi.object({ query: Joi.string().min(2).max(500).required() }) }),
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const { tasks } = await buildContext(teamId);
    const prompt = prompts.search(tasks, req.body.query);
    const raw = await callGemini<unknown>('search', prompt);
    const ids = validateIdList(raw, 'task_ids').slice(0, 10);
    const matched = await db('tasks').select(TASK_SELECT).whereIn('id', ids);
    const byId = new Map(matched.map((m) => [m.id, m]));
    res.json({ success: true, data: { results: ids.map((id) => byId.get(id)).filter(Boolean), explanation: validateText(raw, 'explanation'), confidence: validateConfidence(raw) } });
  })
);

/** GET /api/ai/suggestions — pending suggestions for the team. */
aiRouter.get(
  '/suggestions',
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const rows = await db('ai_suggestions')
      .where({ team_id: teamId, status: 'pending' })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ success: true, data: rows });
  })
);

/**
 * PATCH /api/ai/suggestions/:id — accept or reject.
 * Accept executes through the SAME core services as manual actions:
 * dependency accepts go through cycle validation again; decompose creates
 * real tasks + edges via the task service path. Nothing is auto-applied.
 */
aiRouter.patch(
  '/suggestions/:id',
  validate({
    params: Joi.object({ id: uuid.required() }),
    body: Joi.object({ decision: Joi.string().valid('accepted', 'rejected').required() }),
  }),
  asyncHandler(async (req, res) => {
    const teamId = requireTeam(req);
    const suggestion = await db('ai_suggestions').where({ id: req.params.id, team_id: teamId }).first();
    if (!suggestion) throw new NotFoundError('Suggestion');
    if (suggestion.status !== 'pending') throw new ValidationError('Suggestion was already resolved');

    const data = typeof suggestion.suggested_data === 'string' ? JSON.parse(suggestion.suggested_data) : suggestion.suggested_data;
    let applied: unknown = null;

    await db.transaction(async (trx) => {
      if (req.body.decision === 'accepted') {
        if (suggestion.suggestion_type === 'dependency') {
          // Re-validate against the CURRENT graph — it may have changed since suggestion time
          dagEngine.assertEdgeValid(data.predecessor_id, data.successor_id);
          const [dep] = await trx('task_dependencies')
            .insert({ predecessor_id: data.predecessor_id, successor_id: data.successor_id, created_by: req.user!.userId })
            .returning('*');
          dagEngine.commitEdge(data.predecessor_id, data.successor_id);
          await dagEngine.recomputeStatuses(db, [data.successor_id], trx);
          applied = dep;
        } else if (suggestion.suggestion_type === 'decompose') {
          const created: { id: string; title: string }[] = [];
          const subtasks = data.subtasks as { index: number; title: string; story_points: number; depends_on_indices: number[] }[];
          for (const sub of subtasks) {
            const [task] = await trx('tasks')
              .insert({
                title: sub.title,
                description: `Decomposed from task (AI suggestion ${suggestion.id})`,
                status: 'backlog',
                priority: 'medium',
                team_id: teamId,
                created_by: req.user!.userId,
                position: 1000 * (created.length + 1),
                story_points: sub.story_points,
                dependency_status: 'none',
              })
              .returning('*');
            dagEngine.addNode(task.id);
            created.push({ id: task.id, title: task.title });
          }
          // Wire subtask chain by index
          for (const sub of subtasks) {
            for (const depIdx of sub.depends_on_indices) {
              const pred = created[depIdx];
              const succ = created[sub.index];
              if (pred && succ && pred.id !== succ.id) {
                dagEngine.assertEdgeValid(pred.id, succ.id);
                await trx('task_dependencies').insert({ predecessor_id: pred.id, successor_id: succ.id, created_by: req.user!.userId });
                dagEngine.commitEdge(pred.id, succ.id);
                await dagEngine.recomputeStatuses(db, [succ.id], trx);
              }
            }
          }
          applied = created;
        } else if (suggestion.suggestion_type === 'estimate') {
          await trx('tasks').where({ id: suggestion.task_id }).update({ story_points: data.story_points, updated_at: new Date() });
          applied = { task_id: suggestion.task_id, story_points: data.story_points };
        } else if (suggestion.suggestion_type === 'describe') {
          await trx('tasks').where({ id: suggestion.task_id }).update({ description: data.description, updated_at: new Date() });
          applied = { task_id: suggestion.task_id };
        }
        // Other types (risk, standup, search, priority) are informational — acceptance just records the decision.
      }

      await trx('ai_suggestions').where({ id: suggestion.id }).update({ status: req.body.decision });
    });

    await writeAudit(db, { userId: req.user!.userId, entityType: 'ai_suggestion', entityId: suggestion.id, action: req.body.decision, newValue: applied, correlationId: req.correlationId });
    res.json({ success: true, data: { suggestion: { ...suggestion, status: req.body.decision }, applied } });
  })
);
