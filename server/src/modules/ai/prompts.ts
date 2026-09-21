/**
 * Grounded prompt templates. Every template embeds the actual task list and
 * current dependency edges so Gemini can only reference real IDs, and
 * instructs strict JSON output. The response validator (validators.ts) is the
 * second line of defense: any invented ID is discarded before a human sees it.
 */

export interface TaskContext {
  id: string;
  title: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  story_points: number | null;
  priority: string;
}

export interface DepContext {
  predecessor_id: string;
  successor_id: string;
}

const groundingPreamble = (tasks: TaskContext[], deps: DepContext[]) => `You are a project management assistant for a Kanban board with a task dependency DAG.

TASKS (the ONLY tasks that exist — never invent or reference any other id):
${JSON.stringify(tasks, null, 1)}

CURRENT DEPENDENCY EDGES (predecessor must finish before successor starts):
${JSON.stringify(deps, null, 1)}
`;

export const prompts = {
  suggestDeps: (tasks: TaskContext[], deps: DepContext[], target: TaskContext) =>
    `${groundingPreamble(tasks, deps)}
For the TARGET task: ${JSON.stringify(target)}

Suggest up to 5 tasks from the list above that should be PREREQUISITES of the target (must be completed before it can start). Only suggest edges that do not already exist and would not create a cycle. If none are plausible, return an empty array.

Respond ONLY with JSON:
{"suggestions":[{"predecessor_id":"<uuid from list>","confidence":<0.0-1.0>,"reasoning":"<one sentence>"}]}`,

  describe: (task: TaskContext) =>
    `${groundingPreamble([task], [])}
Write a clear task description and 3-5 acceptance criteria for the target task based on its title.

Respond ONLY with JSON:
{"description":"<markdown text>","acceptance_criteria":["<criterion>",...],"confidence":<0.0-1.0>}`,

  decompose: (task: TaskContext) =>
    `${groundingPreamble([task], [])}
Break the target task into 3-6 smaller subtasks. For each subtask give a title, a suggested order (subtasks with a lower index generally precede later ones), an effort estimate in story points (1,2,3,5,8), and which earlier subtask indices it depends on.

Respond ONLY with JSON:
{"subtasks":[{"title":"<title>","story_points":<int>,"depends_on_indices":[<int>,...],"reasoning":"<one sentence>"}],"confidence":<0.0-1.0>}`,

  estimate: (tasks: TaskContext[], target: TaskContext) =>
    `${groundingPreamble(tasks, [])}
Estimate story points (1,2,3,5,8,13) for the target task, using the other tasks' points as calibration where comparable.

Respond ONLY with JSON:
{"story_points":<int>,"reasoning":"<one or two sentences>","confidence":<0.0-1.0>}`,

  priority: (tasks: TaskContext[], deps: DepContext[], target: TaskContext) =>
    `${groundingPreamble(tasks, deps)}
Recommend a priority (critical|high|medium|low) for the target task, considering how many tasks depend on it (its downstream count in the DAG).

Respond ONLY with JSON:
{"priority":"critical|high|medium|low","reasoning":"<one sentence>","confidence":<0.0-1.0>}`,

  analyzeRisk: (tasks: TaskContext[], deps: DepContext[], criticalPath: string[]) =>
    `${groundingPreamble(tasks, deps)}
The critical path (longest dependency chain by duration) is: ${JSON.stringify(criticalPath)}

Identify up to 5 schedule risks: tasks on the critical path with no slack, overdue tasks, blocked chains, or single points of failure (high fan-in tasks).

Respond ONLY with JSON:
{"risks":[{"task_id":"<uuid from list>","severity":"high|medium|low","description":"<one sentence>"}],"confidence":<0.0-1.0>}`,

  standup: (tasks: TaskContext[], deps: DepContext[]) =>
    `${groundingPreamble(tasks, deps)}
Write a daily standup summary: what was recently completed (status done), what is in progress, and what is blocked (infer blocked tasks from edges whose predecessors are not done). Keep it under 150 words, plain text with short bullet lines.

Respond ONLY with JSON:
{"summary":"<text>","blocked_task_ids":["<uuid>",...],"confidence":<0.0-1.0>}`,

  blockerExplanation: (tasks: TaskContext[], deps: DepContext[], target: TaskContext) =>
    `${groundingPreamble(tasks, deps)}
Explain in plain English why the target task is blocked. Trace the chain of unfinished prerequisites back to the root cause task(s).

Respond ONLY with JSON:
{"explanation":"<text>","root_cause_ids":["<uuid>",...],"confidence":<0.0-1.0>}`,

  impactSummary: (tasks: TaskContext[], deps: DepContext[], changed: TaskContext, affectedIds: string[]) =>
    `${groundingPreamble(tasks, deps)}
The target task's schedule just changed. The affected downstream tasks are: ${JSON.stringify(affectedIds)}. Summarize the impact in plain English for the team.

Respond ONLY with JSON:
{"summary":"<text>","confidence":<0.0-1.0>}`,

  search: (tasks: TaskContext[], query: string) =>
    `${groundingPreamble(tasks, [])}
User search query: "${query}"

Return the ids of tasks matching the intent of the query (semantic match on title/description/status/priority), most relevant first, max 10.

Respond ONLY with JSON:
{"task_ids":["<uuid>",...],"explanation":"<one sentence>","confidence":<0.0-1.0>}`,

  bottleneck: (tasks: TaskContext[], deps: DepContext[]) =>
    `${groundingPreamble(tasks, deps)}
Identify up to 5 bottleneck tasks: high fan-in (many successors waiting on them) or long-duration tasks that many chains pass through.

Respond ONLY with JSON:
{"bottlenecks":[{"task_id":"<uuid from list>","reasoning":"<one sentence>","severity":"high|medium|low"}],"confidence":<0.0-1.0>}`,

  duplicates: (tasks: TaskContext[], target: TaskContext) =>
    `${groundingPreamble(tasks, [])}
Find tasks from the list that are likely duplicates of the target task (semantically same work, different wording). Only flag genuine likely duplicates.

Respond ONLY with JSON:
{"duplicates":[{"task_id":"<uuid from list>","confidence":<0.0-1.0>,"reasoning":"<one sentence>"}]}`,

  qualityReview: (task: TaskContext) =>
    `${groundingPreamble([task], [])}
Review the target task's quality: is the title specific, is the description actionable, are dates and estimates present? List concrete improvements.

Respond ONLY with JSON:
{"issues":["<issue>",...],"suggested_title":"<improved title or empty string>","confidence":<0.0-1.0>}`,

  sprintPlanning: (tasks: TaskContext[], deps: DepContext[], capacityPoints: number) =>
    `${groundingPreamble(tasks, deps)}
Team capacity for the next sprint: ${capacityPoints} story points. Select backlog tasks that (a) are unblocked given current statuses and edges, and (b) fit within capacity, respecting dependency order.

Respond ONLY with JSON:
{"selected_task_ids":["<uuid>",...],"total_points":<int>,"reasoning":"<one sentence>","confidence":<0.0-1.0>}`,

  workload: (tasks: TaskContext[], assigneeNames: Record<string, string>) =>
    `${groundingPreamble(tasks, [])}
Assignee id -> name map: ${JSON.stringify(assigneeNames)}

Identify overloaded assignees (by count and story points of non-done tasks) and suggest which tasks could move to underloaded teammates. Only suggest reassignments between listed assignees.

Respond ONLY with JSON:
{"suggestions":[{"task_id":"<uuid from list>","to_assignee_id":"<uuid from map>","reasoning":"<one sentence>"}],"confidence":<0.0-1.0>}`,
};
