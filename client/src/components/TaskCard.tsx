import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../types';
import { Lock, ArrowRight, CheckCircle2, Clock, Sparkles, User, Link as LinkIcon, AlertCircle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isOverlay?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isOverlay = false }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return <span className="flex items-center text-[10px] font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-sm"><span className="w-1.5 h-1.5 rounded-sm bg-rose-500 mr-1"></span>Critical</span>;
      case 'high':
        return <span className="flex items-center text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-sm"><span className="w-1.5 h-1.5 rounded-sm bg-amber-500 mr-1"></span>High</span>;
      case 'medium':
        return <span className="flex items-center text-[10px] font-mono uppercase tracking-wider text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 rounded-sm"><span className="w-1.5 h-1.5 rounded-sm bg-cyan-500 mr-1"></span>Med</span>;
      default:
        return <span className="flex items-center text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-500/10 border border-slate-500/30 px-1.5 py-0.5 rounded-sm"><span className="w-1.5 h-1.5 rounded-sm bg-slate-400 mr-1"></span>Low</span>;
    }
  };

  const getDependencyBadge = () => {
    if (task.dependency_status === 'blocked') {
      return (
        <div className="flex items-center text-xs text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-sm" title="Prerequisites not satisfied">
          <Lock className="w-3 h-3 mr-1" />
          <span className="font-mono text-[11px] font-medium">Blocked</span>
        </div>
      );
    }
    if (task.dependency_status === 'ready') {
      return (
        <div className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-sm">
          <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500 mr-1.5 animate-pulse"></span>
          <span className="font-mono text-[11px] font-medium">Ready</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`glass-card p-3 cursor-grab active:cursor-grabbing select-none relative group rounded-sm transition-all duration-200 ${
        isDragging ? 'opacity-30' : ''
      } ${isOverlay ? 'shadow-2xl border-brand-primary/60 scale-[1.02]' : ''}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">TF-{task.id.slice(0, 4)}</span>
          {getPriorityBadge(task.priority)}
        </div>
        {getDependencyBadge()}
      </div>

      <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1 line-clamp-2 leading-snug">
        {task.title}
      </h3>

      {task.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2.5 leading-normal">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-surface-border/50 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center space-x-2.5">
          {task.story_points !== null && (
            <span className="font-mono bg-slate-100 dark:bg-surface-100 px-1.5 py-0.5 border border-slate-200 dark:border-surface-border text-slate-700 dark:text-slate-300 rounded-sm">
              {task.story_points} pts
            </span>
          )}
          {task.start_date && task.end_date && (
            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 flex items-center">
              <Clock className="w-3 h-3 mr-1 text-slate-400 dark:text-slate-500" />
              {task.start_date.slice(5)} → {task.end_date.slice(5)}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5">
          {task.assignee_id ? (
            <div className="w-5 h-5 bg-brand-primary/15 dark:bg-brand-primary/20 border border-brand-primary/40 text-brand-primary flex items-center justify-center text-[10px] font-mono font-bold rounded-sm">
              U
            </div>
          ) : (
            <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
          )}
        </div>
      </div>
    </div>
  );
};
