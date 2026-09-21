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
  backlog: { border: 'border-slate-700/50', dot: 'bg-slate-400', count: 'text-slate-400' },
  in_progress: { border: 'border-brand-primary/40', dot: 'bg-brand-primary', count: 'text-brand-primary' },
  review: { border: 'border-brand-accent/40', dot: 'bg-brand-accent', count: 'text-brand-accent' },
  done: { border: 'border-emerald-500/40', dot: 'bg-emerald-500', count: 'text-emerald-400' },
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
    <div className="flex flex-col h-full min-w-0 bg-surface-50/40 border border-surface-border p-3">
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-border">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 ${config.dot}`} />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">{title}</h2>
          <span className={`text-[11px] font-mono px-1.5 py-0.2 bg-surface-100 border border-surface-border ${config.count}`}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(id)}
          className="p-1 hover:bg-surface-200 text-slate-400 hover:text-slate-100 transition-colors border border-transparent hover:border-surface-border"
          title="Create task in this column"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Droppable Task Container */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[150px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="h-28 border border-dashed border-surface-border/40 flex flex-col items-center justify-center text-slate-500 text-xs">
            <span>No tasks</span>
          </div>
        )}
      </div>
    </div>
  );
};
