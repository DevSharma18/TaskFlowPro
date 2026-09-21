# TaskFlow Pro — DAG-Powered Workflow Platform

TaskFlow Pro is a Kanban workflow platform backed by a Directed Acyclic Graph (DAG) engine. It eliminates the traditional flaw in project management boards where tasks are treated as independent silos, enforcing dependency topology, automatic non-compounding schedule propagation, and rollback-on-regression.

---

## 1. Core Architectural Pillars

### 1.1 In-Memory Graphlib + PostgreSQL Sync
- Graph state is modeled via `graphlib.Graph` in Node.js for sub-millisecond cycle validation, topological traversals, and critical path computation.
- Persistence is handled by PostgreSQL with transactions and row-level locks.

### 1.2 Non-Compounding Schedule Propagation
When multiple dependency paths converge (e.g. Diamond Dependency: `A -> B -> D` and `A -> C -> D`), advancing Task `A` by +3 days propagates along downstream topological order with a single-visit rule. Task `D` shifts by exactly +3 days, never compounding to +6 days.

### 1.3 Rollback on Regression
If a completed prerequisite is moved back to *In Progress* or *Backlog*, the DAG engine re-evaluates all downstream nodes and flags any task whose prerequisites are no longer satisfied as **Blocked**.

### 1.4 Gemini AI Workspace (Human-in-the-Loop)
- **22 AI-Assisted Capabilities:** Dependency suggestions, task decomposition into subtask graphs, automatic acceptance criteria, story point estimation, schedule risk analysis, daily standups, and semantic search.
- **Grounding:** Prompts embed exact task IDs and live dependency state.
- **Validation Guardrails:** Every suggestion passes through cycle detection and graph node validation before presentation. No suggestions are automatically applied without human approval.

---

## 2. Tech Stack

- **Backend:** Express.js, TypeScript, PostgreSQL 15, Knex.js, Graphlib, Socket.IO, Winston (structured JSON logging), Helmet, Joi validation.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS (Glassmorphism dark theme, 4px max radius, Lucide icons, responsive layout), `@dnd-kit`, ReactFlow (DAG visualization), TanStack React Query, Zustand.
- **AI Integration:** Google Gemini 2.0 Flash (`@google/generative-ai`).

---

## 3. Getting Started

### 3.1 Prerequisites
- Node.js 20+
- PostgreSQL 15+ (or Docker)

### 3.2 Environment Setup
Copy the example environment file:
```bash
cp .env.example .env
```
Ensure your `DATABASE_URL` and `GEMINI_API_KEY` are configured.

### 3.3 Install Dependencies
```bash
npm install --prefix server
npm install --prefix client
```

### 3.4 Run Database Migrations & Seed
```bash
npm run migrate -w server
npm run seed -w server
```
*Seed includes default users: `admin@taskflow.dev` / `Password123!` and sample tasks with diamond dependencies.*

### 3.5 Start the Development Environment
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

---

## 4. Running Tests
Run the comprehensive Jest test suite verifying cycle detection, diamond propagation without compounding, and topological status evaluation:
```bash
npm run test -w server
```
