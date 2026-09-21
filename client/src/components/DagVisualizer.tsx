import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Task } from '../types';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { X, Zap, Layers } from 'lucide-react';

interface DagVisualizerProps {
  onClose: () => void;
  onSelectTask: (task: Task) => void;
}

export const DagVisualizer: React.FC<DagVisualizerProps> = ({ onClose, onSelectTask }) => {
  // Fetch full graph (nodes and edges)
  const { data: graphData } = useQuery({
    queryKey: ['dag'],
    queryFn: async () => {
      const res = await api.get('/dag/graph');
      return res.data.data as { nodes: Task[]; edges: { predecessor_id: string; successor_id: string }[] };
    },
  });

  // Fetch critical path
  const { data: criticalPathData } = useQuery({
    queryKey: ['critical-path'],
    queryFn: async () => {
      const res = await api.get('/dag/critical-path');
      return res.data.data as { path: Task[]; totalDays: number };
    },
  });

  const criticalTaskIds = useMemo(() => {
    return new Set(criticalPathData?.path?.map((t) => t.id) || []);
  }, [criticalPathData]);

  // Convert tasks into ReactFlow nodes
  const nodes: Node[] = useMemo(() => {
    if (!graphData?.nodes) return [];

    // Layout columns based on status
    const statusColIndex: Record<string, number> = {
      backlog: 0,
      in_progress: 1,
      review: 2,
      done: 3,
    };

    const statusCounts: Record<string, number> = {
      backlog: 0,
      in_progress: 0,
      review: 0,
      done: 0,
    };

    return graphData.nodes.map((task) => {
      const col = statusColIndex[task.status] ?? 0;
      const row = statusCounts[task.status]++;
      const isCritical = criticalTaskIds.has(task.id);

      return {
        id: task.id,
        position: { x: col * 260 + 40, y: row * 110 + 60 },
        data: {
          label: (
            <div
              onClick={() => onSelectTask(task)}
              className={`p-2.5 text-left rounded-none border text-xs cursor-pointer select-none transition-all ${
                isCritical
                  ? 'border-amber-400 bg-amber-950/40 text-amber-200 shadow-lg shadow-amber-500/10'
                  : 'border-surface-border bg-slate-900/90 text-slate-100 hover:border-brand-primary'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-slate-400">
                <span>TF-{task.id.slice(0, 4)}</span>
                {isCritical && (
                  <span className="text-amber-400 font-bold flex items-center">
                    <Zap className="w-2.5 h-2.5 mr-0.5" /> CP
                  </span>
                )}
              </div>
              <div className="font-medium truncate w-44">{task.title}</div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                <span className="uppercase">{task.status}</span>
                <span>{task.duration_days ? `${task.duration_days}d` : '-'}</span>
              </div>
            </div>
          ),
        },
      };
    });
  }, [graphData, criticalTaskIds, onSelectTask]);

  // Convert task_dependencies into ReactFlow edges
  const edges: Edge[] = useMemo(() => {
    if (!graphData?.edges) return [];
    return graphData.edges.map((e, idx) => {
      const isCriticalEdge =
        criticalTaskIds.has(e.predecessor_id) && criticalTaskIds.has(e.successor_id);

      return {
        id: `e-${e.predecessor_id}-${e.successor_id}-${idx}`,
        source: e.predecessor_id,
        target: e.successor_id,
        animated: isCriticalEdge,
        style: {
          stroke: isCriticalEdge ? '#f59e0b' : '#64748b',
          strokeWidth: isCriticalEdge ? 2.5 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCriticalEdge ? '#f59e0b' : '#64748b',
        },
      };
    });
  }, [graphData, criticalTaskIds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="glass-panel w-full max-w-6xl h-[85vh] flex flex-col border border-surface-border text-slate-100 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-border bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-brand-accent/10 border border-brand-accent/30 text-brand-accent flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide flex items-center space-x-2">
                <span>DAG Workflow & Critical Path Visualizer</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Direct acyclic dependency topology. Highlighted chain = longest duration (Critical Path).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {criticalPathData && (
              <div className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs text-amber-300 font-mono">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Critical Path: {criticalPathData.totalDays} days total</span>
              </div>
            )}
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 w-full h-full bg-slate-950">
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background color="#1e293b" gap={16} size={1} />
            <Controls className="bg-slate-900 border border-surface-border fill-slate-200" />
            <MiniMap
              nodeColor={(n) => (criticalTaskIds.has(n.id) ? '#f59e0b' : '#334155')}
              maskColor="rgba(0, 0, 0, 0.7)"
              className="bg-slate-900 border border-surface-border"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};
