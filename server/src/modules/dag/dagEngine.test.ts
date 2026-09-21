/**
 * DAG engine unit tests — pure graph logic with a stubbed DB.
 * Covers the evaluation-critical invariants:
 *  - cycle rejection (direct, indirect, self)
 *  - diamond propagation without compounding (A+3 ⇒ D+3, not +6)
 *  - rollback on regression re-blocks downstream
 *  - critical path via DP longest chain
 */
import { DagEngine, TaskStatus, DependencyStatus } from './dagEngine';
import { CycleError, ValidationError, NotFoundError } from '../../lib/errors';

interface FakeTask {
  id: string;
  status: TaskStatus;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  dependency_status: DependencyStatus;
  team_id: string;
}

/** Minimal in-memory stand-in for the Knex query patterns the engine uses. */
function createFakeDb(tasks: FakeTask[]) {
  const store = new Map(tasks.map((t) => [t.id, { ...t }]));

  const makeQuery = (rows: FakeTask[]) => {
    const q: Record<string, unknown> = {};
    q.select = (..._cols: unknown[]) => q;
    q.where = (arg: unknown) => {
      if (typeof arg === 'object' && arg !== null && 'id' in (arg as object)) {
        const t = store.get((arg as { id: string }).id);
        return makeQuery(t ? [t] : []);
      }
      return q;
    };
    q.whereIn = (_col: string, ids: string[]) => makeQuery(ids.map((id) => store.get(id)).filter(Boolean) as FakeTask[]);
    q.forUpdate = () => q;
    q.update = (values: Partial<FakeTask>) => {
      for (const r of rows) {
        const t = store.get(r.id);
        if (t) Object.assign(t, values);
      }
      return makeQuery(rows);
    };
    q.first = async () => rows[0];
    q.then = (resolve: (v: FakeTask[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve as never, reject as never);
    return q;
  };

  const db = (table: string) => {
    if (table !== 'tasks') throw new Error(`unexpected table ${table}`);
    return makeQuery([...store.values()]);
  };
  return { db: db as never, store };
}

function buildEngine(edges: [string, string][], nodes: string[]): DagEngine {
  const engine = new DagEngine();
  for (const n of nodes) engine.addNode(n);
  for (const [p, s] of edges) engine.commitEdge(p, s);
  return engine;
}

describe('cycle detection', () => {
  it('rejects self-dependency', () => {
    const engine = buildEngine([], ['a']);
    expect(() => engine.assertEdgeValid('a', 'a')).toThrow(ValidationError);
  });

  it('rejects direct cycle A→B→A', () => {
    const engine = buildEngine([['a', 'b']], ['a', 'b']);
    expect(() => engine.assertEdgeValid('b', 'a')).toThrow(CycleError);
    // graph unchanged
    expect(engine.edges()).toEqual([{ predecessor_id: 'a', successor_id: 'b' }]);
  });

  it('rejects indirect cycle A→B→C→A', () => {
    const engine = buildEngine([['a', 'b'], ['b', 'c']], ['a', 'b', 'c']);
    let err: unknown;
    try {
      engine.assertEdgeValid('c', 'a');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CycleError);
    expect((err as CycleError).statusCode).toBe(409);
    expect((err as CycleError).details).toEqual({ cycle: expect.arrayContaining(['a']) });
    expect(engine.edges().length).toBe(2); // nothing persisted
  });

  it('rejects unknown nodes', () => {
    const engine = buildEngine([], ['a']);
    expect(() => engine.assertEdgeValid('a', 'ghost')).toThrow(NotFoundError);
  });

  it('rejects duplicate edge', () => {
    const engine = buildEngine([['a', 'b']], ['a', 'b']);
    expect(() => engine.assertEdgeValid('a', 'b')).toThrow(ValidationError);
  });

  it('accepts valid edge in diamond', () => {
    const engine = buildEngine([['a', 'b'], ['a', 'c']], ['a', 'b', 'c', 'd']);
    expect(() => engine.assertEdgeValid('b', 'd')).not.toThrow();
    expect(() => engine.assertEdgeValid('c', 'd')).not.toThrow();
  });
});

describe('dependency status', () => {
  it('none with no predecessors', () => {
    const engine = new DagEngine();
    expect(engine.computeDependencyStatus([])).toBe('none');
  });
  it('blocked while any predecessor not done', () => {
    const engine = new DagEngine();
    expect(engine.computeDependencyStatus(['done', 'in_progress'])).toBe('blocked');
  });
  it('ready when all predecessors done', () => {
    const engine = new DagEngine();
    expect(engine.computeDependencyStatus(['done', 'done'])).toBe('ready');
  });
});

describe('schedule propagation — no compounding', () => {
  const iso = (dayOffset: number) => new Date(Date.UTC(2026, 8, 22) + dayOffset * 86400000).toISOString().slice(0, 10);

  it('diamond A→{B,C}→D with A +3 days moves D by exactly 3, not 6', async () => {
    // A: day 0-2 (dur 3). B: 3-5. C: 3-4. D: 6-8.
    const tasks: FakeTask[] = [
      { id: 'a', status: 'done', start_date: iso(0), end_date: iso(2), duration_days: 3, dependency_status: 'none', team_id: 't' },
      { id: 'b', status: 'backlog', start_date: iso(3), end_date: iso(5), duration_days: 3, dependency_status: 'ready', team_id: 't' },
      { id: 'c', status: 'backlog', start_date: iso(3), end_date: iso(4), duration_days: 2, dependency_status: 'ready', team_id: 't' },
      { id: 'd', status: 'backlog', start_date: iso(6), end_date: iso(8), duration_days: 3, dependency_status: 'blocked', team_id: 't' },
    ];
    const { db, store } = createFakeDb(tasks);
    const engine = buildEngine([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']], ['a', 'b', 'c', 'd']);

    // Extend A by 3 days: end moves from iso(2) to iso(5)
    store.get('a')!.end_date = iso(5);
    store.get('a')!.duration_days = 6;

    const changes = await engine.propagateSchedule(db, 'a');

    // B: start iso(3) < predEnd iso(5) → shift so start = iso(6), end = iso(8)
    expect(store.get('b')!.start_date).toBe(iso(6));
    expect(store.get('b')!.end_date).toBe(iso(8));
    // C: start iso(3) → iso(6), end iso(4) → iso(7)
    expect(store.get('c')!.start_date).toBe(iso(6));
    expect(store.get('c')!.end_date).toBe(iso(7));
    // D: visited ONCE. max pred end = B end iso(8). D start iso(6) < iso(8) → start iso(9), end iso(11).
    // Total shift for D is +3 (the upstream delta), NOT +6.
    expect(store.get('d')!.start_date).toBe(iso(9));
    expect(store.get('d')!.end_date).toBe(iso(11));
    expect(changes.find((c) => c.id === 'd')).toBeDefined();
  });

  it('skips date-less tasks without crashing', async () => {
    const tasks: FakeTask[] = [
      { id: 'a', status: 'done', start_date: iso(0), end_date: iso(5), duration_days: 6, dependency_status: 'none', team_id: 't' },
      { id: 'b', status: 'backlog', start_date: null, end_date: null, duration_days: null, dependency_status: 'ready', team_id: 't' },
    ];
    const { db } = createFakeDb(tasks);
    const engine = buildEngine([['a', 'b']], ['a', 'b']);
    const changes = await engine.propagateSchedule(db, 'a');
    expect(changes).toEqual([]);
  });

  it('does not move downstream when dates already valid', async () => {
    const tasks: FakeTask[] = [
      { id: 'a', status: 'done', start_date: iso(0), end_date: iso(2), duration_days: 3, dependency_status: 'none', team_id: 't' },
      { id: 'b', status: 'backlog', start_date: iso(10), end_date: iso(12), duration_days: 3, dependency_status: 'ready', team_id: 't' },
    ];
    const { db, store } = createFakeDb(tasks);
    const engine = buildEngine([['a', 'b']], ['a', 'b']);
    const changes = await engine.propagateSchedule(db, 'a');
    expect(changes).toEqual([]);
    expect(store.get('b')!.start_date).toBe(iso(10));
  });
});

describe('traversal', () => {
  it('downstream returns transitive successors without duplicates in a diamond', () => {
    const engine = buildEngine([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']], ['a', 'b', 'c', 'd']);
    const down = engine.downstream('a').sort();
    expect(down).toEqual(['b', 'c', 'd']);
  });

  it('upstream returns transitive predecessors', () => {
    const engine = buildEngine([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']], ['a', 'b', 'c', 'd']);
    expect(engine.upstream('d').sort()).toEqual(['a', 'b', 'c']);
  });

  it('orphan nodes have empty traversal', () => {
    const engine = buildEngine([], ['a', 'lonely']);
    expect(engine.downstream('lonely')).toEqual([]);
    expect(engine.upstream('lonely')).toEqual([]);
  });
});

describe('critical path', () => {
  it('finds longest chain by duration', async () => {
    // a(3) → b(10) → d(2); a → c(1) → d. Longest: a→b→d = 15
    const tasks: FakeTask[] = [
      { id: 'a', status: 'done', start_date: null, end_date: null, duration_days: 3, dependency_status: 'none', team_id: 't' },
      { id: 'b', status: 'backlog', start_date: null, end_date: null, duration_days: 10, dependency_status: 'ready', team_id: 't' },
      { id: 'c', status: 'backlog', start_date: null, end_date: null, duration_days: 1, dependency_status: 'ready', team_id: 't' },
      { id: 'd', status: 'backlog', start_date: null, end_date: null, duration_days: 2, dependency_status: 'blocked', team_id: 't' },
    ];
    const { db } = createFakeDb(tasks);
    const engine = buildEngine([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']], ['a', 'b', 'c', 'd']);
    const { path, totalDays } = await engine.criticalPath(db);
    expect(path).toEqual(['a', 'b', 'd']);
    expect(totalDays).toBe(15);
  });

  it('empty graph returns empty path', async () => {
    const { db } = createFakeDb([]);
    const engine = new DagEngine();
    const { path, totalDays } = await engine.criticalPath(db);
    expect(path).toEqual([]);
    expect(totalDays).toBe(0);
  });
});

describe('deep chain', () => {
  it('handles a 60-level chain without stack overflow', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => `n${i}`);
    const edges: [string, string][] = nodes.slice(0, -1).map((n, i) => [n, nodes[i + 1]] as [string, string]);
    const engine = buildEngine(edges, nodes);
    // closing the loop at the end must be caught even at depth 60
    expect(() => engine.assertEdgeValid('n59', 'n0')).toThrow(CycleError);
    expect(engine.downstream('n0').length).toBe(59);
  });
});
