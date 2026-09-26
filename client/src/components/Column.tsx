import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '../types';
import { TaskCard } from './TaskCard';
import { Plus, Circle } from 'lucide-react';

interface ColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
}

const statusColors: Record<TaskStatus, { border: string; dot: string; count: string }> = {
  backlog: { border: 'border-slate-300 dark:border-slate-700/50', dot: 'bg-slate-400 dark:bg-slate-500', count: 'text-slate-600 dark:text-slate-400' },
  in_progress: { border: 'border-blue-500/40 dark:border-blue-500/40', dot: 'bg-blue-600 dark:bg-blue-500', count: 'text-blue-600 dark:text-blue-400' },
  review: { border: 'border-sky-500/40 dark:border-sky-500/40', dot: 'bg-sky-600 dark:bg-sky-500', count: 'text-sky-600 dark:text-sky-400' },
  done: { border: 'border-emerald-500/40 dark:border-emerald-500/40', dot: 'bg-emerald-600 dark:bg-emerald-500', count: 'text-emerald-600 dark:text-emerald-400' },
};

export const Column: React.FC<ColumnProps> = ({ id, title, tasks, onTaskClick, onAddTask }) => {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: 'Column',
      status: id,
    },
  });

  const config = statusColors[id];

  return (
    <div className="flex flex-col h-full min-w-0 bg-slate-100/70 dark:bg-surface-50/40 border border-slate-200/80 dark:border-surface-border p-3 rounded-sm shadow-sm dark:shadow-none transition-colors">
      {/* Column Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-surface-border">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-sm ${config.dot}`} />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">{title}</h2>
          <span className={`text-[11px] font-mono px-1.5 py-0.2 bg-white dark:bg-surface-100 border border-slate-200 dark:border-surface-border rounded-sm ${config.count}`}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(id)}
          className="p-1 rounded-sm hover:bg-slate-200/70 dark:hover:bg-surface-200 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors border border-transparent hover:border-slate-300 dark:hover:border-surface-border"
          title="Create task in this column"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Droppable Task Container */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="h-28 border border-dashed border-slate-300/80 dark:border-surface-border/40 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs rounded-sm">
            <span>No tasks</span>
          </div>
        )}
      </div>
    </div>
  );
};
