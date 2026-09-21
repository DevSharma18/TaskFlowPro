/**
 * Second line of defense against hallucination: every Gemini response is
 * validated here before anything reaches the UI or the DB. Invented IDs are
 * dropped silently (and counted), confidence is clamped, malformed payloads
 * become empty suggestion lists rather than errors.
 */
import { dagEngine } from '../dag/dagEngine';

export interface DepSuggestion {
  predecessor_id: string;
  confidence: number;
  reasoning: string;
}

const clamp = (n: unknown): number => {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
};

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Validate dependency suggestions:
 * - id must exist in the graph
 * - must not be the target itself
 * - edge must not already exist
 * - edge must not create a cycle (checked against the live graph)
 * - deduplicated
 */
export function validateDepSuggestions(
  raw: unknown,
  targetId: string,
  existingEdges: Set<string>
): { valid: DepSuggestion[]; dropped: number } {
  const out: DepSuggestion[] = [];
  let dropped = 0;
  const arr = (raw as { suggestions?: unknown[] })?.suggestions;
  if (!Array.isArray(arr)) return { valid: [], dropped: 1 };

  const seen = new Set<string>();
  for (const item of arr.slice(0, 5)) {
    const id = str((item as DepSuggestion)?.predecessor_id, 36);
    const confidence = clamp((item as DepSuggestion)?.confidence);
    const reasoning = str((item as DepSuggestion)?.reasoning, 500);

    if (!id || !dagEngine.hasNode(id) || id === targetId || seen.has(id)) {
      dropped++;
      continue;
    }
    if (existingEdges.has(`${id}->${targetId}`)) {
      dropped++;
      continue;
    }
    // Would this create a cycle? Use the engine's pure check (target -> ... -> id path exists?)
    try {
      dagEngine.assertEdgeValid(id, targetId);
    } catch {
      dropped++;
      continue;
    }
    seen.add(id);
    out.push({ predecessor_id: id, confidence, reasoning });
  }
  return { valid: out, dropped };
}

/** Filter a list of ids to those that exist in the graph, preserving order, dedup. */
export function validateIdList(raw: unknown, field: string): string[] {
  const arr = (raw as Record<string, unknown>)?.[field];
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const id = str(v, 36);
    if (id && dagEngine.hasNode(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function validateText(raw: unknown, field: string): string {
  return str((raw as Record<string, unknown>)?.[field], 5000);
}

export function validateConfidence(raw: unknown): number {
  return clamp((raw as Record<string, unknown>)?.confidence);
}

export function validateStoryPoints(raw: unknown): number | null {
  const v = (raw as Record<string, unknown>)?.story_points;
  if (typeof v !== 'number' || ![1, 2, 3, 5, 8, 13].includes(v)) return null;
  return v;
}

export function validatePriority(raw: unknown): string | null {
  const v = str((raw as Record<string, unknown>)?.priority, 10);
  return ['critical', 'high', 'medium', 'low'].includes(v) ? v : null;
}
