# TaskFlow Pro — TODO

## Phase 0 — Scaffold
- [ ] Monorepo root package.json (npm workspaces, scripts: dev, build, test, lint)
- [ ] server/ Express + TS + nodemon bootstrap, health route
- [ ] client/ Vite React TS bootstrap
- [ ] .env.example, .gitignore, docker-compose.yml (Postgres 15)
- [ ] ESLint + Prettier shared config
- [ ] README stub

## Phase 1 — Data Layer
- [ ] Knexfile + db client (env-driven)
- [ ] Migrations: teams, users, refresh_tokens, tasks, task_dependencies, ai_suggestions, audit_logs
- [ ] Indexes per spec
- [ ] Seed: demo team, users, sample DAG incl. diamond A→B/C→D + dates

## Phase 2 — Backend Infra
- [ ] Winston logger (JSON, correlation ID, redaction, file rotation)
- [ ] Error classes + global error middleware + asyncHandler
- [ ] Joi validate middleware
- [ ] Helmet, CORS whitelist, rate limit, body limit, request-id middleware
- [ ] Process handlers (unhandledRejection/uncaughtException, graceful shutdown)

## Phase 3 — Auth
- [ ] POST /api/auth/register (Joi, bcrypt-12, email validation)
- [ ] POST /api/auth/login (httpOnly cookie refresh + access JWT)
- [ ] POST /api/auth/refresh (rotation)
- [ ] POST /api/auth/logout (invalidate)
- [ ] requireAuth + requireRole middleware
- [ ] Auth integration tests

## Phase 4 — Tasks & Teams
- [ ] Teams CRUD routes
- [ ] Tasks CRUD routes (list w/ filters, create, get w/ deps, update, delete cascade)
- [ ] PATCH status (calls DAG rollback logic), PATCH position, bulk-position
- [ ] Position helper (gap-based + rebalance) + unit tests
- [ ] Audit log writer on every mutation
- [ ] Integration tests

## Phase 5 — DAG Engine (TDD)
- [ ] graphlib singleton + hydration from DB at boot
- [ ] Tests first: self-dep, direct cycle, indirect cycle, diamond, deep chain, orphan
- [ ] addDependency w/ cycle detection + CycleError(409, path)
- [ ] removeDependency + downstream recompute
- [ ] dependency_status computation (none/ready/blocked)
- [ ] propagate(taskId): toposort, visited set, max-pred-end shift, batch persist — test A+3→D+3
- [ ] Rollback on regression: setStatus re-blocks downstream — test done→in_progress
- [ ] criticalPath(): DP longest path + backtrack — test known graph
- [ ] Dependency routes: POST/DELETE /api/dependencies, GET upstream/downstream
- [ ] DAG routes: GET graph, GET critical-path, POST propagate/:id
- [ ] Transactions + row locking on graph mutations

## Phase 6 — Real-time
- [ ] Socket.IO server + JWT handshake auth
- [ ] team:{id} rooms, user:{userId} room
- [ ] Emitters wired into task/dependency/dag/ai services (post-commit)
- [ ] schedule:propagated batch event

## Phase 7 — Frontend Foundation
- [ ] Tailwind + glassmorphism design tokens (4px radius, Inter/JetBrains Mono, dark navy base)
- [ ] Layout shell: header, responsive grid, mobile tabs
- [ ] axios instance + TanStack Query + auth token refresh interceptor
- [ ] Zustand stores (auth, board)
- [ ] useSocket hook w/ reconnect + re-auth
- [ ] Login/Register pages

## Phase 8 — Board UI
- [ ] Column components (no h-scroll; 4/2x2/1 responsive)
- [ ] Glass TaskCard: ID, title, priority dot, Lucide status icons, assignee initials, points, dates
- [ ] Blocked indicator + blocker tooltip; Ready pulse dot
- [ ] dnd-kit drag/drop w/ optimistic update + socket reconciliation
- [ ] Reject drag blocked→Done w/ toast
- [ ] Task create/edit modal (Joi-validated form)
- [ ] Task delete w/ confirm
- [ ] react-window virtualization for 100+ columns
- [ ] Persistence E2E check (refresh)

## Phase 9 — DAG View
- [ ] ReactFlow panel (sidebar desktop / overlay mobile)
- [ ] Critical path highlight toggle
- [ ] Hover: upstream/downstream highlight
- [ ] Click edge: remove dependency (confirm)

## Phase 10 — AI Service
- [ ] Gemini client wrapper: JSON schema mode, temp 0.2, 10s timeout, retry/backoff, 5-min cache
- [ ] Prompt template registry (graph-grounded context builder)
- [ ] Response validator: ID existence, cycle pre-check, dedupe, confidence clamp
- [ ] ai_suggestions persistence + audit
- [ ] POST /api/ai/suggest-deps, describe, decompose, estimate, analyze-risk, standup, search
- [ ] GET /api/ai/suggestions, PATCH accept/reject (accept routes through core services)
- [ ] AI rate limit (10/min)
- [ ] Remaining features: cycle advisor, critical-path optimization, strength scoring, bottleneck, priority rec, duplicate detection, sprint planning, feasibility, workload, status report, blocker explanation, impact summary, quality review, patterns, retrospective
- [ ] Unit tests for validator + grounding

## Phase 11 — AI UI
- [ ] Suggestion bar (desktop) / FAB (mobile): accept/reject, confidence meter, reasoning expand
- [ ] Sparkle icon on cards w/ pending suggestions
- [ ] AI panel: describe/decompose/estimate/standup/search actions
- [ ] ai:suggestion-ready socket handling
- [ ] Low-confidence visual indicator (<0.6)

## Phase 12 — Hardening
- [ ] Walk spec section 11 edge cases → test or fix each (27 items)
- [ ] Security pass: CSP check, cookie flags, CORS, secret scan, npm audit
- [ ] Error envelope consistency audit
- [ ] Concurrent-edit handling (optimistic locking via updated_at)
- [ ] Responsive QA at 1280/768/480

## Phase 13 — Polish & Docs
- [ ] README: setup, env, scripts, architecture, AI grounding explanation (for evaluation)
- [ ] Demo walkthrough in README (diamond no-compounding example)
- [ ] Final acceptance run: 5 PRD criteria
- [ ] Tag v1.0
