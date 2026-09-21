# TaskFlow Pro - Design Specification

**Date:** 2026-09-21
**Status:** Draft
**Tech Stack:** PostgreSQL 15+, Express.js, React 18, Socket.IO, graphlib, Gemini API

---

## 1. Overview

TaskFlow Pro is a DAG-powered Kanban workflow platform for mid-size teams (10-50 users). Tasks are managed on a 4-column board (Backlog, In Progress, Review, Done) with directed dependency relationships forming a DAG. The DAG engine enforces acyclicity, computes blocked/ready status, propagates schedule changes without compounding, and supports rollback on regression. Gemini AI provides 22 augmentation features with human-in-the-loop validation.

## 2. System Architecture

```
React Frontend (Glassmorphism, DnD Kit, Socket.IO, Zustand, React Query)
        |
        | REST API + Socket.IO (WebSocket)
        v
Express Backend (graphlib DAG, Gemini AI Service, Winston Logger)
        |
        | Knex.js (parameterized queries)
        v
PostgreSQL 15+ (tasks, dependencies, audit_logs, ai_suggestions)
```

### Layers

- **Frontend:** React 18 + @dnd-kit/core + Socket.IO client + Zustand (client state) + @tanstack/react-query (server state) + Framer Motion (animations) + ReactFlow (DAG viz) + Tailwind CSS
- **Backend:** Express + graphlib (in-memory DAG) + Socket.IO + Winston (logging) + Knex.js (query builder/migrations) + Joi (validation) + Helmet.js (security headers)
- **Database:** PostgreSQL with JSONB metadata, UUID primary keys
- **AI:** Gemini API proxied through backend, rate-limited, response-cached

### Key Constraints

- No emojis anywhere in UI — Lucide React icons only
- Maximum border-radius: 4px (sharp, professional)
- No horizontal scrolling — responsive columns
- Responsive breakpoints: 1280px, 768px, 480px

## 3. Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt, cost 12 |
| name | VARCHAR(100) | |
| role | ENUM('admin','member') | |
| team_id | FK -> teams | |
| avatar_url | TEXT | nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### teams
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(100) | |
| description | TEXT | nullable |
| created_at | TIMESTAMPTZ | |

### tasks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| title | VARCHAR(255) NOT NULL | |
| description | TEXT | nullable |
| status | ENUM('backlog','in_progress','review','done') | |
| priority | ENUM('critical','high','medium','low') | default 'medium' |
| assignee_id | FK -> users | nullable |
| team_id | FK -> teams | |
| start_date | DATE | nullable |
| end_date | DATE | nullable |
| duration_days | INT | nullable |
| story_points | INT | nullable |
| position | INT | ordering within column, gap-based (1000, 2000, ...). Insert at midpoint. Rebalance to 1000-increments when gap < 1 |
| dependency_status | ENUM('ready','blocked','none') | computed, cached |
| created_by | FK -> users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### task_dependencies
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| predecessor_id | FK -> tasks | ON DELETE CASCADE |
| successor_id | FK -> tasks | ON DELETE CASCADE |
| created_by | FK -> users | |
| created_at | TIMESTAMPTZ | |
| | UNIQUE | (predecessor_id, successor_id) |
| | CHECK | predecessor_id != successor_id |

### refresh_tokens
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | FK -> users | ON DELETE CASCADE |
| token_hash | VARCHAR(255) | bcrypt hash of refresh token |
| expires_at | TIMESTAMPTZ | 7 days from creation |
| created_at | TIMESTAMPTZ | |

### ai_suggestions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| task_id | FK -> tasks | |
| suggestion_type | VARCHAR(50) | 'dependency','decompose','estimate',etc |
| suggested_data | JSONB | flexible payload per type |
| confidence | FLOAT | 0.0-1.0 |
| reasoning | TEXT | AI explanation |
| status | ENUM('pending','accepted','rejected') | default 'pending' |
| prompt_used | TEXT | for audit |
| model_version | VARCHAR(50) | |
| created_at | TIMESTAMPTZ | |

### audit_logs
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | FK -> users | |
| entity_type | VARCHAR(50) | 'task','dependency','team' |
| entity_id | UUID | |
| action | VARCHAR(50) | 'create','update','delete','move' |
| old_value | JSONB | nullable |
| new_value | JSONB | nullable |
| created_at | TIMESTAMPTZ | |

### Indexes
- tasks: (team_id, status), (assignee_id), (status, position)
- task_dependencies: (predecessor_id), (successor_id)
- ai_suggestions: (task_id, status)
- audit_logs: (entity_type, entity_id), (created_at)

## 4. DAG Engine

Built on `graphlib` library. Graph loaded into memory on server start, kept in sync with DB.

### Graph Initialization
1. Load all tasks as nodes, all task_dependencies as directed edges
2. Maintain singleton graph instance in DAG service module
3. On cluster/multi-process: single DAG process or Redis pub/sub sync (out of scope for v1)

### Cycle Detection
```
addDependency(predecessorId, successorId):
  1. Add edge temporarily to in-memory graph
  2. Check graphlib.alg.isAcyclic(graph)
  3. If cycle detected:
     a. Remove edge from graph
     b. Find the cycle path for error message
     c. Throw CycleError with path details
     d. Return 409 Conflict with cycle explanation
  4. If valid:
     a. Persist to task_dependencies table
     b. Recalculate successor's dependency_status
     c. Emit socket event
```

### Schedule Propagation (No Compounding)
```
propagateScheduleChange(changedTaskId):
  1. Get topological ordering of all downstream nodes from changedTaskId
  2. visited = new Set()
  3. For each node in topological order:
     a. If visited.has(node) -> skip
     b. visited.add(node)
     c. Get ALL predecessors of this node
     d. maxPredecessorEndDate = max(predecessor.end_date for all predecessors)
     e. If node.start_date < maxPredecessorEndDate:
        - shift = maxPredecessorEndDate - node.start_date
        - node.start_date += shift
        - node.end_date += shift
     f. Persist updated dates
  4. Batch emit socket updates
```

This ensures Task D in a diamond (A->B->D, A->C->D) gets +3 days when A shifts +3, not +6.

### Rollback on Regression
```
moveTaskBack(taskId, fromStatus, toStatus):
  1. Validate transition is a regression (done->review, review->in_progress, etc.)
  2. Update task status
  3. Get all downstream successors (recursive)
  4. For each successor:
     a. Check ALL predecessors' statuses
     b. If any predecessor NOT 'done' -> set dependency_status = 'blocked'
     c. Else -> set dependency_status = 'ready'
  5. Persist all changes in single transaction
  6. Emit socket events for all affected tasks
```

### Critical Path
```
findCriticalPath():
  1. Get topological sort of entire graph
  2. Initialize dist[] = 0 for all nodes
  3. For each node in topological order:
     dist[node] = max(dist[predecessor] + predecessor.duration_days) for all predecessors
  4. Find node with maximum dist value (sink)
  5. Backtrack from sink through predecessors choosing max dist at each step
  6. Return ordered path with total duration
```

### Dependency Status Computation
```
computeDependencyStatus(taskId):
  predecessors = graph.predecessors(taskId)
  if (predecessors.length === 0) return 'none'
  allDone = predecessors.every(p => p.status === 'done')
  return allDone ? 'ready' : 'blocked'
```

## 5. AI/LLM Integration (Gemini API)

### 22 AI Features

**Dependency and Graph Intelligence:**
1. Dependency Suggestion — suggest prerequisites from title/description analysis
2. Cycle Resolution Advisor — suggest which edge to remove when cycle detected
3. Critical Path Optimization — suggest parallelizable tasks
4. Dependency Strength Scoring — rate hard-blocker vs nice-to-have
5. Bottleneck Detection — identify high fan-in risk tasks

**Task Authoring and Management:**
6. Task Description Generator — generate description + acceptance criteria from title
7. Task Decomposition — break large task into subtasks with dependencies
8. Effort Estimation — suggest story points from description complexity
9. Priority Recommendation — suggest priority from dependency position
10. Duplicate Detection — flag semantically similar tasks

**Scheduling and Planning:**
11. Schedule Risk Analysis — flag risky date configurations
12. Sprint Planning Assistant — suggest tasks fitting capacity + dependencies
13. Deadline Feasibility Check — validate target date against dependency chain
14. Workload Balancing — suggest reassignments for overloaded assignees

**Communication and Reporting:**
15. Daily Standup Summary — progress + blockers summary
16. Status Report Generator — weekly/milestone reports
17. Blocker Explanation — plain English dependency chain trace
18. Change Impact Summary — explain downstream impact of date shift

**Quality and Insights:**
19. Task Quality Review — flag vague descriptions, missing criteria
20. Workflow Pattern Recognition — identify recurring patterns, suggest templates
21. Retrospective Insights — velocity trends, common blockers
22. Smart Search — natural language search across tasks

### Grounding and Hallucination Prevention

- **Constrained output schemas:** Every Gemini call uses structured JSON with `response_schema` parameter. Task IDs returned must exist in the provided context.
- **Graph-grounded prompts:** Every prompt includes the current task list (id, title, status, dates) and dependency edges as structured context. Gemini cannot invent tasks.
- **Confidence thresholds:** Suggestions scored 0.0-1.0. Below 0.6 shown with "low confidence" visual indicator.
- **Human-in-the-loop:** Every suggestion requires explicit Accept/Reject click. Zero auto-apply.
- **Validation layer:** Before surfacing suggestions, backend validates all referenced task IDs exist, no cycles would be created, dates are valid.
- **Audit trail:** Every prompt + raw response + parsed result logged in ai_suggestions table.
- **Rate limiting:** 10 req/min per user for AI endpoints.
- **Timeout:** 10s per Gemini call, graceful fallback on timeout.
- **Caching:** Identical requests cached for 5 minutes to avoid redundant API calls.

### Example Prompt Structure (Dependency Suggestion)
```
You are a project management assistant analyzing task dependencies.

Given these tasks:
${JSON.stringify(taskList, null, 2)}

Current dependencies:
${JSON.stringify(currentDeps, null, 2)}

For the task: "${targetTask.title}" (${targetTask.description})

Suggest up to 5 tasks that should be prerequisites for this task.
Return ONLY task IDs from the provided list. Do not invent tasks.

Respond in this exact JSON format:
{
  "suggestions": [
    { "predecessor_id": "<uuid>", "confidence": 0.0-1.0, "reasoning": "<why>" }
  ]
}
```

## 6. Frontend Design

### Design System
- **Theme:** Dark, glassmorphism (frosted glass cards)
- **Glass effect:** `backdrop-filter: blur(16px)`, `background: rgba(255,255,255,0.08)`, `border: 1px solid rgba(255,255,255,0.15)`
- **Border radius:** 4px maximum everywhere
- **Icons:** Lucide React (no emojis)
- **Typography:** Inter (UI), JetBrains Mono (task IDs, metadata)
- **Colors:** Deep navy/charcoal base (#0a0e1a), violet-cyan accent gradient
- **Motion:** Framer Motion for drag, status transitions, panel reveals

### Responsive Layout
- **Desktop (1280px+):** 4 columns side-by-side, DAG panel as right sidebar
- **Tablet (768-1279px):** 2x2 column grid, DAG panel as overlay
- **Mobile (< 768px):** Single column with tab switcher, DAG as full-screen overlay, AI bar as floating action button

### Task Card (Glass)
```
+----------------------------+  4px radius
| TF-042  [dot] High         |  Task ID + priority color dot
| Database Schema Migration   |  Title
| > 2 dependencies            |  Lucide icon + count
| [lock] Blocked by TF-039   |  Lock icon + blocker name
| JD  3 pts  Mar 15-18        |  Initials, effort, date range
+----------------------------+
```

Status indicators (no emojis):
- Ready: green dot pulse animation
- Blocked: red lock icon + blocker tooltip
- In Progress: blue activity icon
- Done: green check icon

### DAG Visualization
- ReactFlow for interactive node-edge rendering
- Toggle-able side panel (desktop) or overlay (mobile)
- Critical path highlighted in accent color
- Hover node: highlight upstream + downstream chain
- Click edge: option to remove dependency

### AI Suggestion Bar
- Bottom bar on desktop, FAB on mobile
- Shows latest AI suggestions with Accept/Reject buttons
- Confidence meter (gradient bar)
- Expandable reasoning panel
- Sparkle icon on cards that have pending AI suggestions

### Virtual Scrolling
- react-window for columns with 100+ tasks
- Maintains drag-and-drop compatibility

### Frontend Packages
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag and drop
- `zustand` — client state management
- `@tanstack/react-query` — server state, caching, optimistic updates
- `framer-motion` — animations
- `reactflow` — DAG visualization
- `socket.io-client` — real-time updates
- `tailwindcss` — styling foundation
- `lucide-react` — icons
- `react-window` — virtual scrolling
- `react-hot-toast` — notifications (no emojis)
- `axios` — HTTP client

## 7. API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Get JWT + refresh token |
| POST | /api/auth/refresh | Refresh JWT |
| POST | /api/auth/logout | Invalidate refresh token |

### Teams
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/teams | Create team |
| GET | /api/teams/:id | Get team details |
| PUT | /api/teams/:id | Update team |
| GET | /api/teams/:id/members | List team members |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tasks | List tasks (filter: status, assignee, priority) |
| POST | /api/tasks | Create task |
| GET | /api/tasks/:id | Get task with dependencies |
| PUT | /api/tasks/:id | Update task fields |
| DELETE | /api/tasks/:id | Delete task + cascade dependencies |
| PATCH | /api/tasks/:id/status | Move task status (triggers rollback) |
| PATCH | /api/tasks/:id/position | Reorder within column |
| PATCH | /api/tasks/bulk-position | Bulk reorder after drag |

### Dependencies
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/dependencies | Add dependency (cycle check) |
| DELETE | /api/dependencies/:id | Remove dependency |
| GET | /api/tasks/:id/upstream | All predecessors (recursive) |
| GET | /api/tasks/:id/downstream | All successors (recursive) |

### DAG
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/dag/graph | Full graph for visualization |
| GET | /api/dag/critical-path | Critical path computation |
| POST | /api/dag/propagate/:id | Trigger schedule propagation |

### AI
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/ai/suggest-deps | Dependency suggestions |
| POST | /api/ai/decompose | Task decomposition |
| POST | /api/ai/estimate | Effort estimation |
| POST | /api/ai/describe | Generate description from title |
| POST | /api/ai/analyze-risk | Schedule risk analysis |
| POST | /api/ai/standup | Standup summary |
| POST | /api/ai/search | Natural language search |
| GET | /api/ai/suggestions | List pending suggestions |
| PATCH | /api/ai/suggestions/:id | Accept/reject suggestion |

### Socket.IO Events
- `task:created`, `task:updated`, `task:deleted`
- `task:moved`, `task:reordered`
- `dependency:added`, `dependency:removed`
- `schedule:propagated`
- `ai:suggestion-ready`

## 8. Security

- **Headers:** Helmet.js (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- **Rate Limiting:** 100 req/min general, 10 req/min AI endpoints (express-rate-limit)
- **Input Validation:** Joi schemas on every endpoint, reject unvalidated input
- **SQL Injection:** Knex parameterized queries only, no raw string interpolation
- **XSS:** React auto-escaping + DOMPurify for any rendered user HTML
- **CORS:** Whitelist specific origins (no wildcard in production)
- **Authentication:** JWT in httpOnly/Secure/SameSite=Strict cookies, 15min access + 7d refresh
- **Passwords:** bcrypt cost factor 12
- **CSRF:** SameSite cookies + double-submit token pattern
- **API Keys:** Gemini key server-side only (env var), never in client bundle
- **Request Size:** 1MB body limit
- **Dependency Audit:** npm audit in CI pipeline

## 9. Centralized Logging

- **Library:** Winston with structured JSON format
- **Correlation IDs:** UUID per request via middleware, propagated through all log calls
- **Levels:** error, warn, info, debug
- **Request Logger:** method, path, status, duration_ms, user_id, correlation_id
- **Sensitive Redaction:** Passwords, tokens, API keys automatically stripped
- **Transports:** Console (dev), rotating file (prod, 10MB max, 5 files retained)
- **Error Context:** Stack traces included for error level, omitted for info/debug

## 10. Centralized Error Handling

### Error Classes
```
AppError (base) -> status, code, message, details
  ValidationError (400)
  AuthError (401)
  ForbiddenError (403)
  NotFoundError (404)
  CycleError (409) -> includes cycle path
  RateLimitError (429)
  InternalError (500)
```

### Response Format
```json
{
  "success": false,
  "error": {
    "code": "CYCLE_DETECTED",
    "message": "Adding this dependency would create a circular relationship",
    "details": {
      "cycle": ["task-a", "task-b", "task-c", "task-a"]
    }
  }
}
```

### Middleware Chain
1. Async handler wrapper (catches rejected promises)
2. Joi validation middleware (transforms Joi errors to ValidationError)
3. Global error handler (logs + formats response)
4. Unhandled rejection handler (graceful shutdown)

## 11. Edge Cases

### DAG
1. Self-dependency (A->A) — CHECK constraint rejects
2. Direct cycle (A->B->A) — cycle detection rejects
3. Indirect cycle (A->B->C->A) — full DFS catches
4. Diamond dependency — visited set prevents compounding
5. Orphan tasks — dependency_status = 'none', always movable
6. Deep chains (50+) — iterative BFS with depth limit (100)
7. Concurrent dependency edits — DB transaction + optimistic locking via updated_at
8. Delete task with dependents — CASCADE edges, recalc downstream status
9. Mass date shift — batch propagation, single aggregated socket event

### Board
10. Drag blocked task to Done — reject, show toast explaining which deps unsatisfied
11. Drag task to same column — reorder only
12. Concurrent drag same task — last-write-wins + conflict notification toast
13. Empty board — onboarding empty state with CTA
14. Large column (500+) — react-window virtual scrolling
15. Background tab — Socket.IO reconnect on focus, state reconciliation

### Schedule
16. Task with no dates — skip in propagation
17. Predecessor ends after successor starts — auto-adjust with warning
18. Negative duration — Joi validation rejects
19. Date in past — allow with visual warning badge

### AI
20. Gemini timeout — 10s timeout, return empty suggestions with error toast
21. Invalid task IDs in response — filter out before surfacing
22. Rate limited — queue with exponential backoff, show "AI busy" indicator
23. Empty descriptions — skip AI suggestion, prompt to add description
24. Duplicate suggestions — deduplicate against existing dependencies

### Auth
25. Expired JWT mid-session — silent refresh, Socket.IO re-auth
26. Deleted user while active — middleware force-logout
27. Concurrent logins — allowed (no session limit)

## 12. Authentication Flow

### Registration
1. Validate email format + password strength (min 8 chars, 1 upper, 1 number)
2. Hash password with bcrypt (cost 12)
3. Create user record
4. Return JWT access token (15min) + refresh token (7d, stored in DB)

### Login
1. Validate credentials
2. Compare bcrypt hash
3. Generate JWT with payload: { userId, email, role, teamId }
4. Set httpOnly/Secure/SameSite=Strict cookie for access token
5. Store refresh token hash in DB

### Token Refresh
1. Validate refresh token against DB hash
2. Check expiry
3. Issue new access token
4. Rotate refresh token (invalidate old, issue new)

### Role-Based Access
- Admin: CRUD on team, manage members, all task operations
- Member: CRUD on own tasks, view all team tasks, manage dependencies

## 13. Real-Time (Socket.IO)

### Connection
1. Client connects with JWT in auth handshake
2. Server validates token, joins user to team room
3. On token expiry: client refreshes, re-authenticates socket

### Event Flow
- Task CRUD operations emit to team room after DB persistence
- Optimistic updates on client: apply immediately, reconcile on server ack
- Conflict: if server rejects, revert optimistic update + show toast

### Rooms
- `team:{teamId}` — all team members receive board updates
- `user:{userId}` — personal notifications (AI suggestions ready)
