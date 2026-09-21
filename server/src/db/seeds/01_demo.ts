import { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  await knex('audit_logs').del();
  await knex('ai_suggestions').del();
  await knex('task_dependencies').del();
  await knex('tasks').del();
  await knex('refresh_tokens').del();
  await knex('users').del();
  await knex('teams').del();

  const [team] = await knex('teams').insert({ name: 'Demo Team', description: 'Sample workspace' }).returning('*');

  const passwordHash = await bcrypt.hash('Password123!', 12);
  const [admin] = await knex('users')
    .insert({ email: 'admin@taskflow.dev', password_hash: passwordHash, name: 'Ada Admin', role: 'admin', team_id: team.id })
    .returning('*');
  const [member] = await knex('users')
    .insert({ email: 'dev@taskflow.dev', password_hash: passwordHash, name: 'Dev Member', role: 'member', team_id: team.id })
    .returning('*');

  const day = 24 * 60 * 60 * 1000;
  const base = new Date('2026-09-22T00:00:00Z').getTime();
  const d = (offset: number) => new Date(base + offset * day).toISOString().slice(0, 10);

  const mk = (title: string, status: string, position: number, startOff: number, dur: number, extra: Partial<Record<string, unknown>> = {}) => ({
    title,
    description: `${title} — demo task`,
    status,
    priority: 'medium',
    team_id: team.id,
    created_by: admin.id,
    position,
    start_date: d(startOff),
    end_date: d(startOff + dur - 1),
    duration_days: dur,
    ...extra,
  });

  // Diamond graph: schema → api → tests, schema → migrations → tests
  const [schema] = await knex('tasks').insert(mk('Database Schema', 'done', 1000, 0, 3, { assignee_id: admin.id, story_points: 5 })).returning('*');
  const [api] = await knex('tasks').insert(mk('Backend API', 'in_progress', 1000, 3, 5, { assignee_id: member.id, story_points: 8, dependency_status: 'ready' })).returning('*');
  const [migrations] = await knex('tasks').insert(mk('Data Migrations', 'in_progress', 2000, 3, 2, { dependency_status: 'ready' })).returning('*');
  const [tests] = await knex('tasks').insert(mk('Integration Tests', 'backlog', 1000, 8, 4, { dependency_status: 'blocked', story_points: 5 })).returning('*');
  const [ui] = await knex('tasks').insert(mk('Kanban UI', 'backlog', 2000, 8, 6, { assignee_id: member.id, story_points: 8, dependency_status: 'blocked' })).returning('*');
  const [deploy] = await knex('tasks').insert(mk('Deploy Pipeline', 'backlog', 3000, 14, 2, { dependency_status: 'blocked' })).returning('*');

  await knex('task_dependencies').insert([
    { predecessor_id: schema.id, successor_id: api.id, created_by: admin.id },
    { predecessor_id: schema.id, successor_id: migrations.id, created_by: admin.id },
    { predecessor_id: api.id, successor_id: tests.id, created_by: admin.id },
    { predecessor_id: migrations.id, successor_id: tests.id, created_by: admin.id },
    { predecessor_id: api.id, successor_id: ui.id, created_by: admin.id },
    { predecessor_id: tests.id, successor_id: deploy.id, created_by: admin.id },
    { predecessor_id: ui.id, successor_id: deploy.id, created_by: admin.id },
  ]);
}
