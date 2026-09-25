import { Graph, alg } from 'graphlib';
import { Knex } from 'knex';
import { CycleError, NotFoundError, ValidationError } from '../../lib/errors';

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done';
export type DependencyStatus = 'ready' | 'blocked' | 'none';

interface TaskRow {
  id: string;
  status: TaskStatus;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  dependency_status: DependencyStatus;
  team_id: string;
}

const MAX_PROPAGATION_DEPTH = 100;

/**
 * In-memory DAG backed by PostgreSQL. Mutate through this class only:
 * it keeps the graphlib instance and the DB in sync, and enforces
 * acyclicity, blocked/ready status, non-compounding schedule propagation,
 * and rollback-on-regression.
 */
export class DagEngine {
  private graph = new Graph({ directed: true });

  /** Load all tasks + edges into memory. Call at boot and after bulk imports. */
  async hydrate(db: Knex): Promise<void> {
    const g = new Graph({ directed: true });
    const tasks = await db('tasks').select('id');
    for (const t of tasks) g.setNode(t.id);
    const edges = await db('task_dependencies').select('predecessor_id', 'successor_id');
    for (const e of edges) g.setEdge(e.predecessor_id, e.successor_id);
    this.graph = g;
  }

  hasNode(id: string): boolean {
    return this.graph.hasNode(id);
  }

  addNode(id: string): void {
    this.graph.setNode(id);
  }

  /** Remove node + its edges (mirrors DB ON DELETE CASCADE). Returns affected successors. */
  removeNode(id: string): string[] {
    const successors = this.graph.successors(id) ?? [];
    this.graph.removeNode(id);
    return successors;
  }

  /** Full edge list for visualization. */
  edges(): { predecessor_id: string; successor_id: string }[] {
    return this.graph.edges().map((e) => ({ predecessor_id: e.v, successor_id: e.w }));
  }

  successors(id: string): string[] {
    return this.graph.successors(id) ?? [];
  }

  predecessors(id: string): string[] {
    return this.graph.predecessors(id) ?? [];
  }

  /** All transitive successors (BFS, visited set). */
  downstream(id: string): string[] {
    const visited = new Set<string>();
    const queue = [...this.successors(id)];
    while (queue.length) {
      const cur = queue.shift() as string;
      if (visited.has(cur)) continue;
      visited.add(cur);
      queue.push(...this.successors(cur));
    }
    return [...visited];
  }

  /** All transitive predecessors. */
  upstream(id: string): string[] {
    const visited = new Set<string>();
    const queue = [...this.predecessors(id)];
    while (queue.length) {
      const cur = queue.shift() as string;
      if (visited.has(cur)) continue;
      visited.add(cur);
      queue.push(...this.predecessors(cur));
    }
    return [...visited];
  }

  /**
   * Validate a prospective edge. Throws CycleError (with the cycle path)
   * if it would violate the DAG property. Does NOT persist.
   */
  assertEdgeValid(predecessorId: string, successorId: string): void {
    if (predecessorId === successorId) {
      throw new ValidationError('A task cannot depend on itself');
    }
    if (!this.graph.hasNode(predecessorId) || !this.graph.hasNode(successorId)) {
      throw new NotFoundError('Task');
    }
    if (this.graph.hasEdge(predecessorId, successorId)) {
      throw new ValidationError('This dependency already exists');
    }
    // If successor already reaches predecessor, adding the edge closes a cycle.
    this.graph.setEdge(predecessorId, successorId);
    if (!alg.isAcyclic(this.graph)) {
      this.graph.removeEdge(predecessorId, successorId);
      const cycle = this.findCyclePath(predecessorId, successorId);
      throw new CycleError(cycle);
    }
    this.graph.removeEdge(predecessorId, successorId);
  }

  /** Commit a validated edge to the in-memory graph. */
  commitEdge(predecessorId: string, successorId: string): void {
    this.graph.setEdge(predecessorId, successorId);
  }

  removeEdge(predecessorId: string, successorId: string): void {
    this.graph.removeEdge(predecessorId, successorId);
  }

  /** Human-readable cycle path: successor → ... → predecessor → successor. */
  private findCyclePath(predecessorId: string, successorId: string): string[] {
    // Walk from successor back to predecessor through existing edges (DFS).
    const path: string[] = [successorId];
    const visited = new Set<string>();
    const dfs = (node: string): boolean => {
      if (node === predecessorId) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      for (const next of this.successors(node)) {
        path.push(next);
        if (dfs(next)) return true;
        path.pop();
      }
      return false;
    };
    dfs(successorId);
    path.push(predecessorId === path[path.length - 1] ? successorId : predecessorId);
    if (path[path.length - 1] !== successorId) path.push(successorId);
    return path;
  }

  /** dependency_status from predecessor statuses. */
  computeDependencyStatus(predStatuses: TaskStatus[]): DependencyStatus {
    if (predStatuses.length === 0) return 'none';
    return predStatuses.every((s) => s === 'done') ? 'ready' : 'blocked';
  }

  /**
   * Recompute dependency_status for a set of tasks from current DB statuses.
   * Returns the changed rows as { id, dependency_status }.
   */
  async recomputeStatuses(db: Knex, taskIds: string[], trx?: Knex.Transaction): Promise<{ id: string; dependency_status: DependencyStatus }[]> {
    const conn = trx ?? db;
    const changes: { id: string; dependency_status: DependencyStatus }[] = [];
    for (const id of new Set(taskIds)) {
      if (!this.graph.hasNode(id)) continue;
      const preds = this.predecessors(id);
      let status: DependencyStatus;
      if (preds.length === 0) {
        status = 'none';
      } else {
        const rows = await conn('tasks').select('status').whereIn('id', preds);
        status = this.computeDependencyStatus(rows.map((r) => r.status));
      }
      const [current] = await conn('tasks').select('dependency_status').where({ id });
      if (!current || current.dependency_status !== status) {
        changes.push({ id, dependency_status: status });
      }
    }
    for (const c of changes) {
      await conn('tasks').where({ id: c.id }).update({ dependency_status: c.dependency_status, updated_at: new Date() });
    }
    return changes;
  }

  /**
   * Schedule propagation without compounding.
   *
   * Processes downstream nodes in topological order, each exactly once,
   * setting start_date to the max predecessor end_date when violated and
   * shifting end_date by the same delta. Diamond paths therefore apply the
   * upstream delay once, not per path.
   *
   * Returns the list of tasks whose dates changed.
   */
  async propagateSchedule(db: Knex, changedTaskId: string, trx?: Knex.Transaction): Promise<{ id: string; start_date: string; end_date: string }[]> {
    const conn = trx ?? db;
    const downstream = this.downstream(changedTaskId);
    if (downstream.length === 0) return [];

    // Topological order restricted to the downstream subgraph.
    const sub = new Graph({ directed: true });
    for (const id of downstream) sub.setNode(id);
    for (const id of downstream) {
      for (const pred of this.predecessors(id)) {
        if (downstream.includes(pred)) sub.setEdge(pred, id);
      }
    }
    let ordered: string[];
    try {
      ordered = alg.topsort(sub);
    } catch {
      return []; // defensive: subgraph should always be acyclic
    }
    if (ordered.length > MAX_PROPAGATION_DEPTH * 10) {
      ordered = ordered.slice(0, MAX_PROPAGATION_DEPTH * 10);
    }

    const changed: { id: string; start_date: string; end_date: string }[] = [];
    const visited = new Set<string>();

    for (const id of ordered) {
      if (visited.has(id)) continue; // no compounding: one pass per node
      visited.add(id);

      const [task] = (await conn('tasks').select('*').where({ id }).forUpdate()) as TaskRow[];
      if (!task || !task.start_date || !task.end_date) continue; // date-less tasks skipped

      const predIds = this.predecessors(id);
      if (predIds.length === 0) continue;
      const preds = (await conn('tasks').select('id', 'end_date').whereIn('id', predIds)) as { id: string; end_date: string | null }[];
      const predEnds = preds.map((p) => p.end_date).filter((e): e is string => e !== null);
      if (predEnds.length === 0) continue;

      const maxPredEnd = predEnds.sort().at(-1) as string; // ISO dates sort lexicographically
      if (task.start_date < maxPredEnd) {
        const start = new Date(task.start_date);
        const required = new Date(maxPredEnd);
        const deltaDays = Math.round((required.getTime() - start.getTime()) / 86400000) + 1; // start must be after pred end
        const newStart = new Date(start.getTime() + deltaDays * 86400000).toISOString().slice(0, 10);
        const newEnd = new Date(new Date(task.end_date).getTime() + deltaDays * 86400000).toISOString().slice(0, 10);
        await conn('tasks').where({ id }).update({ start_date: newStart, end_date: newEnd, updated_at: new Date() });
        changed.push({ id, start_date: newStart, end_date: newEnd });
      }
    }
    return changed;
  }

  /**
   * Critical path: longest chain by duration_days via toposort + DP.
   * Returns ordered task ids and total duration. Scoped to teamId when provided.
   */
  async criticalPath(db: Knex, teamId?: string): Promise<{ path: string[]; totalDays: number }> {
    if (this.graph.nodeCount() === 0) return { path: [], totalDays: 0 };

    let taskQuery = db('tasks').select('id', 'duration_days');
    if (teamId) {
      taskQuery = taskQuery.where({ team_id: teamId });
    }
    const tasks = (await taskQuery) as { id: string; duration_days: number | null }[];
    if (tasks.length === 0) return { path: [], totalDays: 0 };

    const teamTaskIds = new Set(tasks.map((t) => t.id));
    const duration = new Map(tasks.map((t) => [t.id, t.duration_days ?? 1]));

    let targetGraph = this.graph;
    if (teamId) {
      targetGraph = new Graph({ directed: true });
      for (const id of teamTaskIds) {
        targetGraph.setNode(id);
      }
      for (const id of teamTaskIds) {
        for (const pred of this.predecessors(id)) {
          if (teamTaskIds.has(pred)) {
            targetGraph.setEdge(pred, id);
          }
        }
      }
    }

    let ordered: string[];
    try {
      ordered = alg.topsort(targetGraph);
    } catch {
      return { path: [], totalDays: 0 };
    }

    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    for (const id of ordered) {
      let best = 0;
      let bestPred: string | null = null;
      const preds = teamId ? (targetGraph.predecessors(id) ?? []) : this.predecessors(id);
      for (const p of preds) {
        const d = dist.get(p) ?? 0;
        if (d > best) {
          best = d;
          bestPred = p;
        }
      }
      dist.set(id, best + (duration.get(id) ?? 1));
      prev.set(id, bestPred);
    }

    let endNode: string | null = null;
    let maxDist = -1;
    for (const [id, d] of dist) {
      if (d > maxDist) {
        maxDist = d;
        endNode = id;
      }
    }
    const path: string[] = [];
    let cur = endNode;
    while (cur) {
      path.unshift(cur);
      cur = prev.get(cur) ?? null;
    }
    return { path, totalDays: Math.max(maxDist, 0) };
  }
}

/** Singleton shared across the app. */
export const dagEngine = new DagEngine();
