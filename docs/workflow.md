# TaskFlow Pro — Workflow

## Branching & Commits
- `main` is the working branch (solo project). Feature branches `feat/<module>` for larger slices (dag-engine, ai-service, board-ui).
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Commit after each completed module task with passing tests.

## Development Order (dependency-aware)
1. **Phase 0 — Scaffold:** monorepo, server + client bootstraps, env, docker/compose for Postgres, ESLint/Prettier.
2. **Phase 1 — Data layer:** Knex config, migrations (all 7 tables), seeds (demo DAG with diamond), db client.
3. **Phase 2 — Core backend infra:** logger, error classes, asyncHandler, validation middleware, request-id, helmet/rate-limit/cors wiring, health route.
4. **Phase 3 — Auth:** register/login/refresh/logout, JWT cookies, RBAC middleware, refresh_tokens rotation.
5. **Phase 4 — Tasks & teams CRUD:** full endpoints + Joi schemas + audit logging.
6. **Phase 5 — DAG engine:** graphlib singleton, hydration, cycle detection, dependency CRUD, status computation, propagation (no compounding), rollback on regression, critical path. Unit tests for every acceptance-criteria case BEFORE wiring routes (TDD).
7. **Phase 6 — Real-time:** Socket.IO server, JWT handshake, team rooms, event emitters hooked into task/dependency/dag services.
8. **Phase 7 — Frontend foundation:** Vite React TS app, Tailwind + glassmorphism tokens, layout shell, auth pages, axios + query client, socket hook.
9. **Phase 8 — Board UI:** columns, glass task cards, dnd-kit drag/drop with optimistic updates, task create/edit modal, blocked/ready indicators, position reorder.
10. **Phase 9 — DAG view:** ReactFlow panel, critical path highlight, upstream/downstream hover, edge removal.
11. **Phase 10 — AI service:** Gemini client, prompt templates, response validation, caching, rate limit; wire top features first (dependency suggestions, description generator, decomposition, standup, smart search), then remaining 22.
12. **Phase 11 — AI UI:** suggestion bar, accept/reject flow, confidence meters, AI panel per feature group.
13. **Phase 12 — Hardening:** security review pass, edge-case tests from spec section 11, virtualization, responsive QA, npm audit.
14. **Phase 13 — Polish & docs:** README, demo seed walkthrough, final E2E acceptance run.

## Per-Task Loop
- Pick task from `todo.md` → write failing tests where logic-bearing → implement → run module tests → lint → commit → check off todo.

## Verification Gates
- After Phase 5: DAG acceptance tests (cycle, diamond, rollback) green.
- After Phase 8: persistence across refresh verified manually.
- After Phase 13: all 5 PRD acceptance criteria demonstrated.
