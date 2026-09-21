import { Knex } from 'knex';

export interface AuditEntry {
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  correlationId?: string;
}

/** Append-only audit trail writer. Never throws — audit failure must not break mutations. */
export async function writeAudit(db: Knex, entry: AuditEntry): Promise<void> {
  try {
    await db('audit_logs').insert({
      user_id: entry.userId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      old_value: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
      new_value: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
      correlation_id: entry.correlationId ?? null,
    });
  } catch {
    // Swallowed intentionally; logger is not available here without a cycle,
    // so failures surface only via DB constraints (programming errors).
  }
}
