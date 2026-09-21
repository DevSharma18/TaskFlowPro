import React, { useState, useEffect } from 'react';
import { Task, TaskPriority, TaskStatus } from '../types';
import { api } from '../api/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  X,
  Trash2,
  Sparkles,
  Link as LinkIcon,
  Unlink,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';

interface TaskModalProps {
  taskId: string | null;
  initialStatus?: TaskStatus;
  onClose: () => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({ taskId, initialStatus = 'backlog', onClose }) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(taskId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [storyPoints, setStoryPoints] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationDays, setDurationDays] = useState<number | ''>('');

  const [selectedPredId, setSelectedPredId] = useState('');
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiBlockerExplanation, setAiBlockerExplanation] = useState<string | null>(null);

  // Fetch full task details if editing
  const { data: taskData, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const res = await api.get(`/tasks/${taskId}`);
      return res.data.data as Task;
    },
    enabled: isEditing,
  });

  // Fetch all tasks for dependency picker
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks');
      return res.data.data as Task[];
    },
  });

  useEffect(() => {
    if (taskData) {
      setTitle(taskData.title || '');
      setDescription(taskData.description || '');
      setStatus(taskData.status);
      setPriority(taskData.priority);
      setStoryPoints(taskData.story_points ?? '');
      setStartDate(taskData.start_date ? taskData.start_date.slice(0, 10) : '');
      setEndDate(taskData.end_date ? taskData.end_date.slice(0, 10) : '');
      setDurationDays(taskData.duration_days ?? '');
    } else if (!isEditing) {
      setStatus(initialStatus);
    }
  }, [taskData, initialStatus, isEditing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }

    const payload = {
      title,
      description: description || null,
      status,
      priority,
      story_points: storyPoints === '' ? null : Number(storyPoints),
      start_date: startDate || null,
      end_date: endDate || null,
      duration_days: durationDays === '' ? null : Number(durationDays),
    };

    try {
      if (isEditing) {
        await api.put(`/tasks/${taskId}`, payload);
        toast.success('Task updated');
      } else {
        await api.post('/tasks', payload);
        toast.success('Task created');
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to save task');
    }
  };

  const handleDelete = async () => {
    if (!taskId || !window.confirm('Delete this task and all its dependencies?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete task');
    }
  };

  const handleAddDependency = async () => {
    if (!taskId || !selectedPredId) return;
    try {
      await api.post('/dependencies', {
        predecessor_id: selectedPredId,
        successor_id: taskId,
      });
      setSelectedPredId('');
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      toast.success('Dependency linked');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to add dependency');
    }
  };

  const handleRemoveDependency = async (depId: string) => {
    try {
      await api.delete(`/dependencies/${depId}`);
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      toast.success('Dependency removed');
    } catch (err: any) {
      toast.error('Failed to remove dependency');
    }
  };

  // AI Actions
  const handleAiDescribe = async () => {
    if (!taskId) return;
    setAiLoading('describe');
    try {
      const res = await api.post('/ai/describe', { task_id: taskId });
      const data = res.data.data.suggested_data;
      if (data.description) {
        setDescription(data.description);
        toast.success('AI description generated');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'AI request failed');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAiEstimate = async () => {
    if (!taskId) return;
    setAiLoading('estimate');
    try {
      const res = await api.post('/ai/estimate', { task_id: taskId });
      const data = res.data.data.suggested_data;
      if (data.story_points) {
        setStoryPoints(data.story_points);
        toast.success(`AI estimated ${data.story_points} points (${res.data.data.reasoning || ''})`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'AI request failed');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAiSuggestDeps = async () => {
    if (!taskId) return;
    setAiLoading('deps');
    try {
      const res = await api.post('/ai/suggest-deps', { task_id: taskId });
      const count = res.data.data?.suggestions?.length || 0;
      if (count > 0) {
        toast.success(`Generated ${count} dependency suggestion(s). Review in the AI panel.`);
        queryClient.invalidateQueries({ queryKey: ['ai-suggestions'] });
      } else {
        toast(res.data.data?.note || 'No new dependency suggestions found.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'AI request failed');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAiExplainBlocker = async () => {
    if (!taskId) return;
    setAiLoading('blocker');
    try {
      const res = await api.post('/ai/search', { query: `Why is task "${title}" blocked? Trace root cause` });
      setAiBlockerExplanation(res.data.data.explanation || 'Analyzed dependency chain.');
    } catch (err: any) {
      toast.error('Could not explain blocker');
    } finally {
      setAiLoading(null);
    }
  };

  const availablePrereqs = allTasks.filter(
    (t) => t.id !== taskId && !taskData?.prerequisites?.some((p) => p.id === t.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="glass-panel w-full max-w-2xl border border-surface-border p-6 my-8 text-slate-100 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-6">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-2 py-0.5">
              {isEditing ? `TF-${taskId?.slice(0, 6)}` : 'NEW TASK'}
            </span>
            <h2 className="text-base font-semibold text-slate-100">
              {isEditing ? 'Task Details & DAG Links' : 'Create New Task'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input w-full px-3 py-2 text-sm text-slate-100 font-medium"
              placeholder="e.g. Integrate PostgreSQL Connection Pooling"
            />
          </div>

          {/* Description & AI generation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">Description</label>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleAiDescribe}
                  disabled={Boolean(aiLoading)}
                  className="flex items-center space-x-1 text-[11px] text-brand-accent hover:underline disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{aiLoading === 'describe' ? 'Generating...' : 'AI Generate Description'}</span>
                </button>
              )}
            </div>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input w-full px-3 py-2 text-xs text-slate-200 leading-relaxed"
              placeholder="Detailed acceptance criteria, dependencies, or architectural requirements..."
            />
          </div>

          {/* Status & Priority & Story Points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Status Column</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="glass-input w-full px-3 py-2 text-xs text-slate-100 bg-slate-900"
              >
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="glass-input w-full px-3 py-2 text-xs text-slate-100 bg-slate-900"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">Story Points</label>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleAiEstimate}
                    disabled={Boolean(aiLoading)}
                    className="text-[10px] text-brand-accent hover:underline"
                  >
                    AI Estimate
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                max="100"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value === '' ? '' : Number(e.target.value))}
                className="glass-input w-full px-3 py-2 text-xs text-slate-100 font-mono"
                placeholder="pts (1, 2, 3, 5, 8...)"
              />
            </div>
          </div>

          {/* Scheduling Dates */}
          <div className="p-3 bg-surface-50 border border-surface-border space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-brand-primary" />
                Schedule & Duration
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Propagation shifts automatically</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="glass-input w-full px-2 py-1.5 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="glass-input w-full px-2 py-1.5 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value === '' ? '' : Number(e.target.value))}
                  className="glass-input w-full px-2 py-1.5 text-xs text-slate-200 font-mono"
                  placeholder="e.g. 3"
                />
              </div>
            </div>
          </div>

          {/* DAG Dependencies Section (Editing Mode) */}
          {isEditing && (
            <div className="p-3 bg-surface-50 border border-surface-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <LinkIcon className="w-3.5 h-3.5 text-brand-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    DAG Prerequisites & Dependents
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAiSuggestDeps}
                  disabled={Boolean(aiLoading)}
                  className="flex items-center space-x-1 text-[11px] text-brand-accent hover:underline disabled:opacity-50"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{aiLoading === 'deps' ? 'Analyzing...' : 'AI Suggest Prerequisites'}</span>
                </button>
              </div>

              {/* Dependency Status Banner */}
              {taskData?.dependency_status === 'blocked' && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start justify-between">
                  <div className="flex items-start space-x-2">
                    <Lock className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />
                    <div>
                      <p className="font-semibold">BLOCKED by unsatisfied prerequisite tasks.</p>
                      <p className="text-[11px] text-rose-300/80">
                        Cannot proceed to Done until all prerequisites are completed.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAiExplainBlocker}
                    className="text-[11px] underline text-rose-200 hover:text-white shrink-0 ml-2"
                  >
                    Explain Chain
                  </button>
                </div>
              )}

              {aiBlockerExplanation && (
                <div className="p-2.5 bg-brand-primary/10 border border-brand-primary/30 text-slate-200 text-xs">
                  <p className="font-semibold text-brand-accent mb-1 flex items-center">
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> AI Blocker Analysis
                  </p>
                  <p>{aiBlockerExplanation}</p>
                </div>
              )}

              {/* Prerequisites List */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                  Prerequisites (Must finish BEFORE this task starts):
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {taskData?.prerequisites && taskData.prerequisites.length > 0 ? (
                    taskData.prerequisites.map((p) => (
                      <div
                        key={p.dep_id}
                        className="flex items-center justify-between p-2 bg-surface-100 border border-surface-border text-xs"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="font-mono text-[10px] text-slate-400">TF-{p.id.slice(0, 4)}</span>
                          <span className="truncate text-slate-200">{p.title}</span>
                          <span
                            className={`text-[10px] px-1 py-0.2 border ${
                              p.status === 'done'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDependency(p.dep_id)}
                          className="text-slate-400 hover:text-rose-400 p-1"
                          title="Unlink dependency"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">No prerequisites. This task is independent.</p>
                  )}
                </div>

                {/* Add Prerequisite Edge */}
                <div className="flex items-center space-x-2 mt-2">
                  <select
                    value={selectedPredId}
                    onChange={(e) => setSelectedPredId(e.target.value)}
                    className="glass-input flex-1 px-2.5 py-1.5 text-xs text-slate-100 bg-slate-900"
                  >
                    <option value="">Select prerequisite task to link...</option>
                    {availablePrereqs.map((t) => (
                      <option key={t.id} value={t.id}>
                        TF-{t.id.slice(0, 4)}: {t.title} ({t.status})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddDependency}
                    disabled={!selectedPredId}
                    className="px-3 py-1.5 bg-surface-200 hover:bg-surface-300 text-slate-200 text-xs font-medium border border-surface-border disabled:opacity-40"
                  >
                    Add Prerequisite
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-surface-border">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center space-x-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>
            ) : <div />}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-slate-300 text-xs font-medium border border-surface-border"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-medium shadow-md shadow-brand-primary/20"
              >
                {isEditing ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
