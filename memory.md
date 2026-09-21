# TaskFlow Pro — Project Memory

## Key Decisions (with rationale)
- **DAG engine: graphlib in-memory graph + PostgreSQL persistence** (user chose over adjacency-list BFS and recursive CTEs). Graph hydrated at boot, mutated only post-commit inside transactions.
- **Auth: local JWT only** (no OAuth) — bcrypt-12, 15m access in memory, 7d rotating refresh in httpOnly cookie, hashes in `refresh_tokens` table.
- **Gemini key: server-side only**, proxied, rate-limited 10/min, 5-min response cache, never in client bundle.
- **Real-time: Socket.IO** with JWT handshake, `team:{id}` rooms; optimistic UI + server reconciliation.
- **Scheduling model: start_date/end_date/duration_days** (calendar days; no working-hours/holidays).
- **Fixed 4 columns** (Backlog/In Progress/Review/Done); custom columns out of scope v1.
- **Task metadata:** priority levels, assignees, story points. No labels/tags.
- **Scale target:** mid-size teams 10–50, ~1000s of tasks; single-process DAG (no Redis sync in v1).

## UI Rules (user-specified, hard constraints)
- **No emojis anywhere** — Lucide React icons only.
- **Border radius max 4px** — sharp professional look.
- **No horizontal scrolling** — responsive: 4 cols @1280+, 2x2 @768+, tabbed single col @480.
- Glassmorphism dark theme: blur(16px), rgba(255,255,255,0.08) bg, navy #0a0e1a base, violet→cyan accents, Inter + JetBrains Mono.

## Invariants (evaluation-critical, never break)
1. Cycles rejected (409 + path in message), nothing persisted, graph unchanged.
2. No compounding: diamond A→{B,C}→D with A+3 ⇒ D+3 exactly. Visited-set topological propagation, max-pred-end rule.
3. Done→earlier column regression re-blocks unsatisfied downstream, atomically.
4. AI suggestions never auto-applied; human Accept/Reject; IDs validated against DB; confidence shown.
5. All state persists to Postgres; board identical after refresh.

## Docs Map
- `docs/PRD.md` — requirements + 5 acceptance criteria
- `docs/TRD.md` — architecture, module layout, engine algorithms, testing
- `docs/workflow.md` — 14-phase build order, verification gates
- `docs/superpowers/specs/2026-09-21-taskflow-pro-design.md` — full approved design spec
- `todo.md` — phase-by-phase checklist (source of truth for progress)

## Environment
- Windows 11, bash shell, project root `D:\TaskFlowPro`, git `main`.
- Needs local PostgreSQL 15+ (or docker-compose) and `GEMINI_API_KEY` in `.env`.
