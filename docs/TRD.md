# TaskFlow Pro — Technical Requirements Document

**Version:** 1.0 · **Date:** 2026-09-21 · Companion to `docs/PRD.md` and `docs/superpowers/specs/2026-09-21-taskflow-pro-design.md`

## 1. Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Zustand, TanStack Query, @dnd-kit, ReactFlow, Framer Motion, socket.io-client, axios, lucide-react, react-window, react-hot-toast |
| Backend | Node 20, Express, TypeScript, Knex.js, graphlib, Socket.IO, Winston, Joi, Helmet, bcrypt, jsonwebtoken, dotenv, @google/generative-ai |
| Database | PostgreSQL 15+ |
| Tooling | npm workspaces monorepo, ESLint, Prettier, Jest/Vitest, concurrently |

## 2. Repository Layout

```
taskflow-pro/
  package.json            # workspaces root
  server/
    src/
      config/             # env, db, logger config
      db/                 # knexfile, migrations, seeds
      middlewares/        # auth, error, validate, rateLimit, requestId
      modules/
        auth/             # routes, controller, service, validation
        teams/
        tasks/
        dependencies/
        dag/              # graph engine (graphlib singleton)
        ai/               # gemini service, prompt templates, routes
      lib/                # errors, asyncHandler, position, redact
      realtime/           # socket setup, auth handshake, emitters
      app.ts, server.ts
  client/
    src/
      api/                # axios instance, endpoint fns
      components/         # board, card, dag, ai, auth, ui primitives
      features/           # board/, dag/, ai/, auth/ slices
      hooks/              # useSocket, useBoard, useAiSuggestions
      store/              # zustand stores
      styles/             # glassmorphism tokens, tailwind config
      App.tsx, main.tsx
  docs/                   # PRD, TRD, workflow, specs
  .env.example
```

## 3. DAG Engine (server/src/modules/dag)

Singleton `graphlib.Graph` (directed, compound=false), hydrated from DB at boot.

- `addEdge(pred, succ)` — tentative insert → `alg.isAcyclic` → on failure remove + `alg.findCycle`-style path extraction → `CycleError(409, path)`. On success persist inside transaction, recompute successor status.
- `removeEdge`, `removeNode(taskId)` — mirror DB cascade; recompute all affected successors.
- `setStatus(taskId, status)` — recompute successor dependency_status recursively (only status changes matter).
- `propagate(taskId)` — `alg.postorder`/toposort of downstream subgraph; visited-set single pass; `start = max(pred.end_date)`; shift start+end by delta; batch persist; one aggregated socket event. Nodes with null dates skipped. Depth cap 100.
- `criticalPath()` — toposort + DP longest path weighted by duration_days; backtrack; returns ordered IDs + total days.
- Concurrency: all mutations inside Knex transactions with `SELECT ... FOR UPDATE` on touched task rows; graph mutated only after commit.

dependency_status values: `none` (no preds), `ready` (all preds done), `blocked`.

## 4. Position Ordering

Gap-based integers: new card at max+1000; insert between at midpoint; when gap < 2, rebalance column to 1000-increments in one transaction. Bulk endpoint for drag reorder.

## 5. Auth

- Access JWT 15 min in memory; refresh token 7d in httpOnly Secure SameSite=Strict cookie, hash stored in `refresh_tokens`, rotated on use.
- Socket.IO handshake authenticates with access token; joins `team:{id}` room.
- RBAC middleware: admin vs member per spec.

## 6. AI Service (Gemini)

- `geminiService.call(templateKey, context, schema)` — model `gemini-3.6-flash`, `responseMimeType: application/json`, `responseSchema` enforced, temperature 0.2, 10s timeout, 3 retries w/ backoff, 5-min cache keyed on hash(template+context).
- Prompt templates in `modules/ai/prompts/` — each embeds task list (id/title/status/dates) + current edges; instructions forbid inventing IDs.
- Response validation layer: IDs must exist in DB, suggested edges re-run cycle check before being offered as acceptable, dedupe against existing edges, confidence clamped 0–1.
- Every call logs prompt+response to `ai_suggestions` (or dedicated `ai_logs`).
- Accept flow: PATCH suggestion → executes through the normal dependency/task services (full validation, audit, socket events).

## 7. Logging & Errors

- Winston JSON, correlation ID (`X-Request-Id`) via middleware, redaction of password/token/key fields.
- Error classes: AppError → ValidationError(400), AuthError(401), ForbiddenError(403), NotFoundError(404), ConflictError(409)/CycleError(409), RateLimitError(429), InternalError(500). Envelope `{ success:false, error:{ code, message, details } }`.
- asyncHandler wrapper; global error middleware last; process-level handlers flush logs then exit(1).

## 8. Real-time Events

`task:created|updated|deleted|moved|reordered`, `dependency:added|removed`, `schedule:propagated` (batch payload), `ai:suggestion-ready`. Emitted post-commit only.

## 9. Database

Per spec section 3: users, teams, tasks, task_dependencies, ai_suggestions, refresh_tokens, audit_logs. Knex migrations versioned; seed script with demo team + sample DAG (incl. diamond) for development.

## 10. Security Controls

Helmet (CSP tuned for Vite), express-rate-limit, Joi on all inputs, Knex parameterized only, CORS whitelist from env, 1MB body cap, npm audit in CI, no secrets in client bundle, audit_logs on every mutation.

## 11. Testing Strategy

- Unit (Jest): DAG engine — cycle cases, diamond no-compounding, rollback re-block, critical path, deep chain, orphan, date-less nodes; position rebalance; AI response validator.
- Integration (Supertest): auth flow, task CRUD, dependency endpoints (409 on cycle), status move side-effects.
- Frontend: Vitest + Testing Library for card/blocked rendering; manual E2E pass for drag-drop and persistence.
- Acceptance: the 5 PRD acceptance criteria as named tests.

## 12. Environment

`.env`: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GEMINI_API_KEY`, `PORT`, `CLIENT_ORIGIN`, `LOG_LEVEL`. Docker Compose for Postgres (optional), otherwise local install.
