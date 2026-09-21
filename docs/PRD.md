# TaskFlow Pro — Product Requirements Document

**Version:** 1.0 · **Date:** 2026-09-21 · **Status:** Approved

## 1. Problem

Project tools treat tasks as independent cards. Real work has dependencies: integration tests cannot run until the API and schema are ready. Teams manually track ordering, miss blockers, and hand-adjust downstream dates when schedules slip.

## 2. Solution

A Kanban board backed by a DAG (directed acyclic graph) engine. The engine decides what is ready, what is blocked, how delays propagate, and where the critical path runs. Gemini AI suggests dependencies and assists planning, always with human approval.

## 3. Target Users

Mid-size teams (10–50). Roles: admin, member. One team workspace per user (v1).

## 4. Functional Requirements

### FR-1 Kanban Board
- Four fixed columns: Backlog, In Progress, Review, Done.
- Drag-and-drop with persisted position and status.
- Responsive: 4 columns (desktop), 2x2 (tablet), tabbed single column (mobile). No horizontal scrolling.

### FR-2 Task Management
- Fields: title, description, status, priority (critical/high/medium/low), assignee, start/end dates, duration, story points.
- Create, edit, delete (cascade removes dependency edges), reorder.

### FR-3 Dependencies
- Add/remove directed prerequisite edges between tasks.
- Cycle attempts rejected with a clear message naming the cycle path; nothing persisted.
- Self-dependency rejected.

### FR-4 Blocked / Ready Status
- Task with unsatisfied prerequisites (predecessor not Done) shows Blocked with blocker names.
- All predecessors Done → Ready. No predecessors → unmarked.
- Recalculated whenever upstream status or edges change.

### FR-5 Schedule Propagation (No Compounding)
- Upstream date changes shift downstream dates via topological-order propagation.
- Each downstream node processed once, taking the max predecessor end date. Diamond paths add the delay once (A +3 → D +3, not +6).

### FR-6 Rollback on Regression
- Moving a Done task back re-blocks downstream tasks whose prerequisites are no longer satisfied, atomically.

### FR-7 Critical Path View (bonus)
- Longest dependency chain by duration, highlighted on the DAG visualization.

### FR-8 AI Features (Gemini, 15% of evaluation)
22 features across four groups: dependency/graph intelligence (suggestions, cycle advice, optimization, strength scoring, bottleneck detection), task authoring (descriptions, decomposition, estimation, priority, duplicates), scheduling (risk, sprint planning, feasibility, workload), communication/quality (standup, reports, blocker explanation, impact summary, quality review, patterns, retrospectives, smart search).
- Grounding: structured JSON output, graph-context prompts, validation of returned IDs, confidence scores, 5-minute caching.
- Human-in-the-loop: every suggestion needs explicit Accept/Reject. Full audit trail.

### FR-9 Persistence & Real-time
- All state in PostgreSQL; survives refresh.
- Socket.IO broadcasts changes to team room; optimistic UI with reconciliation.

## 5. Non-Functional Requirements
- **Security:** Helmet, rate limits (100/min, AI 10/min), Joi validation, parameterized queries, httpOnly JWT cookies (15m access/7d refresh), bcrypt-12, CORS whitelist, CSRF, 1MB body limit, API key server-side only.
- **Reliability:** centralized Winston logging with correlation IDs; typed error hierarchy; consistent error envelope; graceful shutdown.
- **Performance:** board renders <500ms for 1000 tasks; virtualized columns at 100+; propagation O(V+E).
- **UI:** glassmorphism dark theme, no emojis (Lucide icons), 4px max radius, Inter/JetBrains Mono.

## 6. Acceptance Criteria (evaluation-critical)
1. Cycle A→B→C→A rejected with notification; graph unchanged.
2. Diamond A→{B,C}→D with A +3 days moves D exactly +3.
3. Done→In Progress regression re-blocks unsatisfied downstream tasks.
4. Drag-drop, dates, deps, positions survive refresh.
5. AI dependency suggestions shown with confidence + reasoning, require approval, never auto-applied.

## 7. Out of Scope (v1)
Custom columns, labels/tags, working-hour calendars, multi-team per user, SSO/OAuth, mobile apps, offline mode.
