import { Knex } from 'knex';

export const POSITION_GAP = 1000;

/** Position for a new card at the end of a column. */
export async function nextPosition(db: Knex, teamId: string, status: string): Promise<number> {
  const row = await db('tasks').where({ team_id: teamId, status }).max('position as max').first();
  return ((row?.max as number | null) ?? 0) + POSITION_GAP;
}

/** Position between two neighbors (either may be null for edges). */
export function betweenPosition(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_GAP;
  if (before === null) return (after as number) / 2;
  if (after === null) return before + POSITION_GAP;
  return Math.floor((before + after) / 2);
}

/**
 * Rebalance a column to POSITION_GAP increments when gaps collapse (< 1).
 * Keeps current visual order. Must run inside a transaction.
 */
export async function rebalanceColumn(db: Knex, teamId: string, status: string): Promise<void> {
  const rows = await db('tasks')
    .select('id')
    .where({ team_id: teamId, status })
    .orderBy('position', 'asc');
  for (let i = 0; i < rows.length; i++) {
    await db('tasks').where({ id: rows[i].id }).update({ position: (i + 1) * POSITION_GAP });
  }
}
