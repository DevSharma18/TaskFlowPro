import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tasks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('title', 255).notNullable();
    t.text('description').nullable();
    t.enu('status', ['backlog', 'in_progress', 'review', 'done']).notNullable().defaultTo('backlog');
    t.enu('priority', ['critical', 'high', 'medium', 'low']).notNullable().defaultTo('medium');
    t.uuid('assignee_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.uuid('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE');
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.integer('duration_days').nullable();
    t.integer('story_points').nullable();
    t.integer('position').notNullable().defaultTo(1000);
    t.enu('dependency_status', ['ready', 'blocked', 'none']).notNullable().defaultTo('none');
    t.uuid('created_by').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['team_id', 'status']);
    t.index(['assignee_id']);
    t.index(['status', 'position']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks');
}
