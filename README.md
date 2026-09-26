# TaskFlow Pro — DAG-Powered Workflow Platform

TaskFlow Pro is a Kanban workflow platform backed by an in-memory Directed Acyclic Graph (DAG) engine. It eliminates the traditional flaw in project management boards where tasks are treated as independent silos, enforcing dependency topology, automatic non-compounding schedule propagation, and rollback-on-regression.

> **Technical & Audit Documentation:**
> - **Architecture, Data Model & System Design:** See [docs/DESIGN_DOCUMENT.md](docs/DESIGN_DOCUMENT.md)
> - **Full Test Suite & Known Failure Cases:** See [docs/TESTING_AND_RELIABILITY.md](docs/TESTING_AND_RELIABILITY.md)

---

## 1. Core Architectural Pillars

### 1.1 In-Memory Graphlib + PostgreSQL Sync
- Graph state is modeled via `graphlib.Graph` in Node.js for sub-millisecond cycle validation, topological traversals, and critical path computation.
- Persistence is handled by PostgreSQL with transactions, foreign-key cascades, and row-level locks.

### 1.2 Non-Compounding Schedule Propagation
When multiple dependency paths converge (e.g. Diamond Dependency: `A -> B -> D` and `A -> C -> D`), advancing Task `A` by +3 days propagates along downstream topological order with a single-visit rule. Task `D` shifts by exactly +3 days, never compounding to +6 days.

### 1.3 Rollback on Regression
If a completed prerequisite is moved back to *In Progress* or *Backlog*, the DAG engine re-evaluates all downstream nodes and flags any task whose prerequisites are no longer satisfied as **Blocked**.

### 1.4 Dual Database Architecture (Postgres + MongoDB)
- **PostgreSQL 15**: Relational entity storage for teams, users, tasks, dependencies, audit logs, and AI suggestions.
- **MongoDB 7.0**: High-throughput session storage with native TTL expiration indexes and RFC 6819 refresh token rotation with a 30-second concurrency grace window.

### 1.5 Gemini AI Workspace (Human-in-the-Loop)
- **22 AI-Assisted Capabilities:** Dependency suggestions, task decomposition into subtask graphs, automatic acceptance criteria, story point estimation, schedule risk analysis, daily standups, and semantic search.
- **Grounding:** Prompts embed exact task IDs and live dependency state. Dynamic inputs are isolated in `<task_context>` XML tags.
- **Validation Guardrails:** Every suggestion passes through cycle detection and graph node validation before presentation. No suggestions are automatically applied without human approval.

---

## 2. Tech Stack

- **Gateway:** Nginx Reverse Proxy (port 80).
- **Backend:** Express.js, TypeScript, PostgreSQL 15 (Knex.js), MongoDB 7.0, Graphlib, Socket.IO, Winston (structured JSON logging), Helmet, Joi validation.
- **Cache & Throttling:** Pluggable `ICacheStore` (`MemoryCacheStore` default, Redis-swappable via `CACHE_DRIVER=redis`), express-rate-limit.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS (matte dark/slate light themes, 4px max radius, Lucide icons, responsive layout), `@dnd-kit`, TanStack React Query, Zustand.
- **AI Integration:** Google Gemini 2.0 Flash (`@google/generative-ai`).

---

## 3. Getting Started

### 3.1 Option A: Local Containerized Deployment (Docker Compose)

Run the full multi-tier stack (Nginx, Express, PostgreSQL, MongoDB):

```bash
# 1. Build and start containers in detached mode
docker-compose up -d --build

# 2. Run migrations inside backend container
docker exec -it taskflow-backend npm run migrate

# 3. Seed demonstration data (Admin user + diamond dependency graph)
docker exec -it taskflow-backend npm run seed
```

- Web Application: `http://localhost:80`
- API Health Check: `http://localhost:80/api/health`
- Seed credentials: `admin@taskflow.dev` / `Password123!`

### 3.2 Option B: Local Native Development

#### Prerequisites
- Node.js 20+
- PostgreSQL 15+ running on port 5432
- MongoDB 7.0+ running on port 27017

#### Setup Steps
```bash
# 1. Configure environment
cp .env.example .env

# 2. Install dependencies
npm install --prefix server
npm install --prefix client

# 3. Run database migrations & seed
npm run migrate -w server
npm run seed -w server

# 4. Start development servers
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

---

## 4. Running Tests

Run the test suite verifying DAG cycle detection, diamond propagation without compounding, session grace rotation, rate limiting, and cache abstractions:

```bash
npm run test -w server
```
