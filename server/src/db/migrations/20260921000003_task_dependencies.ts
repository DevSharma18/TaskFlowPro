import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('task_dependencies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('predecessor_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.uuid('successor_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['predecessor_id', 'successor_id']);
    t.index(['successor_id']);
  });
  // Self-dependency guard at the DB level
  await knex.raw(`ALTER TABLE task_dependencies
    ADD CONSTRAINT no_self_dependency CHECK (predecessor_id <> successor_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_dependencies');
}
