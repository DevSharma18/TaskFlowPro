import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_suggestions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').nullable().references('id').inTable('tasks').onDelete('CASCADE');
    t.uuid('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE');
    t.string('suggestion_type', 50).notNullable();
    t.jsonb('suggested_data').notNullable().defaultTo('{}');
    t.float('confidence').notNullable().defaultTo(0);
    t.text('reasoning').nullable();
    t.enu('status', ['pending', 'accepted', 'rejected']).notNullable().defaultTo('pending');
    t.text('prompt_used').nullable();
    t.string('model_version', 50).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['task_id', 'status']);
    t.index(['team_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_suggestions');
}
