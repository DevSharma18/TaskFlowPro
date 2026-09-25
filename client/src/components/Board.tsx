import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Task, TaskStatus } from '../types';
import { Column } from './Column';
import { TaskCard } from './TaskCard';
import { TaskModal } from './TaskModal';
import { AiPanel } from './AiPanel';
import { useBoardStore } from '../store';
import toast from 'react-hot-toast';
import { Sparkles, Plus, Search } from 'lucide-react';

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];

export const Board: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    isAiPanelOpen,
    toggleAiPanel,
    selectedTaskId,
    setSelectedTaskId,
    searchQuery,
    setSearchQuery,
  } = useBoardStore();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<TaskStatus>('backlog');

  // Fetch team tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks');
      return res.data.data as Task[];
    },
  });

  // Task status move mutation (triggers regression rollback and downstream checks)
  const moveTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const res = await api.patch(`/tasks/${id}/status`, { status });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      if (data?.data?.regression) {
        toast('Task regression: Downstream tasks re-evaluated and blocked');
      }
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.error(err.response?.data?.error?.message || 'Cannot move task: prerequisites blocked');
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type === 'Task';
    const isOverTask = over.data.current?.type === 'Task';
    const isOverColumn = over.data.current?.type === 'Column';

    if (!isActiveTask) return;

    // Dragging over another task in a different column
    if (isOverTask) {
      const overTask = tasks.find((t) => t.id === overId);
      const activeCurrent = tasks.find((t) => t.id === activeId);
      if (activeCurrent && overTask && activeCurrent.status !== overTask.status) {
        queryClient.setQueryData(['tasks'], (prev: Task[] = []) => {
          return prev.map((t) => (t.id === activeId ? { ...t, status: overTask.status } : t));
        });
      }
    }

    // Dragging over an empty column
    if (isOverColumn) {
      const colStatus = over.data.current?.status as TaskStatus;
      const activeCurrent = tasks.find((t) => t.id === activeId);
      if (activeCurrent && activeCurrent.status !== colStatus) {
        queryClient.setQueryData(['tasks'], (prev: Task[] = []) => {
          return prev.map((t) => (t.id === activeId ? { ...t, status: colStatus } : t));
        });
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as string;
    const activeCurrent = tasks.find((t) => t.id === activeId);
    if (!activeCurrent) return;

    let destinationStatus: TaskStatus = activeCurrent.status;

    if (over.data.current?.type === 'Column') {
      destinationStatus = over.data.current.status as TaskStatus;
    } else if (over.data.current?.type === 'Task') {
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) destinationStatus = overTask.status;
    }

    // Blocked task constraint check
    if (destinationStatus === 'done' && activeCurrent.dependency_status === 'blocked') {
      toast.error('Cannot move blocked task to Done. Satisfy prerequisites first.');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      return;
    }

    if (destinationStatus === activeCurrent.status) {
      if (over.data.current?.type === 'Task' && over.id !== activeId) {
        const columnTasks = tasks
          .filter((t) => t.status === destinationStatus)
          .sort((a, b) => a.position - b.position);

        const oldIndex = columnTasks.findIndex((t) => t.id === activeId);
        const newIndex = columnTasks.findIndex((t) => t.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(columnTasks, oldIndex, newIndex);
          const currentIndex = reordered.findIndex((t) => t.id === activeId);
          const beforeTask = currentIndex > 0 ? reordered[currentIndex - 1] : null;
          const afterTask = currentIndex < reordered.length - 1 ? reordered[currentIndex + 1] : null;

          api
            .patch(`/tasks/${activeId}/position`, {
              before_id: beforeTask ? beforeTask.id : null,
              after_id: afterTask ? afterTask.id : null,
            })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['tasks'] });
            })
            .catch(() => {
              queryClient.invalidateQueries({ queryKey: ['tasks'] });
            });
        }
      }
      return;
    }

    moveTaskMutation.mutate({ id: activeId, status: destinationStatus });
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q));
  });

  const getTasksByStatus = (status: TaskStatus) => {
    return filteredTasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
  };

  const handleOpenNewModal = (status: TaskStatus = 'backlog') => {
    setSelectedTaskId(null);
    setModalStatus(status);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task: Task) => {
    setSelectedTaskId(task.id);
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Board Sub-header / Actions */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-slate-200/80 dark:border-surface-border bg-white/50 dark:bg-slate-950/40 backdrop-blur-sm gap-3">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="glass-input pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-sm w-48 md:w-64"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={toggleAiPanel}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm border text-xs font-medium transition-all ${
              isAiPanelOpen
                ? 'bg-brand-primary/25 border-brand-primary text-brand-primary shadow-sm'
                : 'bg-brand-primary/10 hover:bg-brand-primary/20 border-brand-primary/30 text-brand-primary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Copilot</span>
          </button>

          <button
            onClick={() => handleOpenNewModal('backlog')}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-sm bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-medium shadow-sm hover:shadow transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Columns Grid */}
      <div className="flex-1 p-4 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 h-full">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                title={col.title}
                tasks={getTasksByStatus(col.id)}
                onTaskClick={handleOpenEditModal}
                onAddTask={handleOpenNewModal}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <TaskCard task={activeTask} onClick={() => {}} isOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modals & Overlays */}
      {isModalOpen && (
        <TaskModal
          taskId={selectedTaskId}
          initialStatus={modalStatus}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {isAiPanelOpen && <AiPanel onClose={toggleAiPanel} />}
    </div>
  );
};
