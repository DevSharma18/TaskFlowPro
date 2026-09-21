export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  team_id?: string | null;
  avatar_url?: string | null;
}

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type DependencyStatus = 'ready' | 'blocked' | 'none';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  team_id: string;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  story_points: number | null;
  position: number;
  dependency_status: DependencyStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  prerequisites?: { dep_id: string; id: string; title: string; status: TaskStatus }[];
  dependents?: { dep_id: string; id: string; title: string; status: TaskStatus }[];
}

export interface TaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  created_by?: string;
  created_at?: string;
}

export interface AiSuggestion {
  id: string;
  task_id: string | null;
  team_id: string;
  suggestion_type: string;
  suggested_data: any;
  confidence: number;
  reasoning: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface DAGGraph {
  nodes: Task[];
  edges: { predecessor_id: string; successor_id: string }[];
}
