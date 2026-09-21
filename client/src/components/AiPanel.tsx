import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { AiSuggestion } from '../types';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Check,
  X,
  Bot,
  Activity,
  Search,
  Users,
  AlertTriangle,
  FileText,
  Clock,
  Layers,
} from 'lucide-react';

interface AiPanelProps {
  onClose: () => void;
}

export const AiPanel: React.FC<AiPanelProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'actions' | 'search'>('suggestions');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [standupSummary, setStandupSummary] = useState<string | null>(null);
  const [riskList, setRiskList] = useState<any[]>([]);

  // Fetch pending AI suggestions
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['ai-suggestions'],
    queryFn: async () => {
      const res = await api.get('/ai/suggestions');
      return res.data.data as AiSuggestion[];
    },
  });

  const resolveSuggestionMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'accepted' | 'rejected' }) => {
      return api.patch(`/ai/suggestions/${id}`, { decision });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dag'] });
      toast.success(`Suggestion ${variables.decision}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to resolve suggestion');
    },
  });

  // Action Triggers
  const handleGenerateStandup = async () => {
    setActionLoading('standup');
    try {
      const res = await api.post('/ai/standup');
      setStandupSummary(res.data.data.suggested_data.summary);
      toast.success('Standup summary generated');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'AI standup failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAnalyzeRisk = async () => {
    setActionLoading('risk');
    try {
      const res = await api.post('/ai/analyze-risk');
      setRiskList(res.data.data.suggested_data.risks || []);
      toast.success('Schedule risk analysis complete');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Risk analysis failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setActionLoading('search');
    try {
      const res = await api.post('/ai/search', { query: searchQuery });
      setSearchResults(res.data.data.results || []);
    } catch (err: any) {
      toast.error('AI search failed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-950/95 border-l border-surface-border backdrop-blur-xl shadow-2xl flex flex-col text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-surface-border">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 bg-brand-accent/20 border border-brand-accent/40 text-brand-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Gemini AI Workspace Suite</h2>
            <p className="text-[10px] text-slate-400">Human-in-the-loop Grounded Intelligence</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border bg-slate-900/50">
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'suggestions'
              ? 'border-brand-accent text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Pending Suggestions ({suggestions.length})
        </button>
        <button
          onClick={() => setActiveTab('actions')}
          className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'actions'
              ? 'border-brand-accent text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Workflows & Analysis
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'search'
              ? 'border-brand-accent text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Semantic Search
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'suggestions' && (
          <div className="space-y-3">
            {suggestions.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-surface-border">
                <Bot className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p>No pending suggestions.</p>
                <p className="text-[10px] mt-1 text-slate-600">
                  Click &quot;AI Suggest Prerequisites&quot; inside any task card to trigger.
                </p>
              </div>
            ) : (
              suggestions.map((s) => {
                const data = typeof s.suggested_data === 'string' ? JSON.parse(s.suggested_data) : s.suggested_data;
                const isLowConfidence = s.confidence < 0.6;

                return (
                  <div key={s.id} className="p-3.5 bg-surface-50 border border-surface-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-brand-primary/20 text-brand-primary border border-brand-primary/30 uppercase">
                          {s.suggestion_type}
                        </span>
                        <span className={`text-[10px] font-mono ${isLowConfidence ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {Math.round(s.confidence * 100)}% confidence
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-xs text-slate-200">
                      {s.suggestion_type === 'dependency' && (
                        <p>
                          Suggest linking <span className="font-mono text-brand-accent">TF-{data.predecessor_id?.slice(0, 4)}</span> as prerequisite to <span className="font-mono text-brand-accent">TF-{data.successor_id?.slice(0, 4)}</span>
                        </p>
                      )}
                      {s.reasoning && (
                        <p className="text-[11px] text-slate-400 mt-1 italic">&quot;{s.reasoning}&quot;</p>
                      )}
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-surface-border/50">
                      <button
                        onClick={() => resolveSuggestionMutation.mutate({ id: s.id, decision: 'rejected' })}
                        className="px-2.5 py-1 bg-surface-100 hover:bg-surface-200 text-slate-300 text-xs flex items-center space-x-1 border border-surface-border"
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => resolveSuggestionMutation.mutate({ id: s.id, decision: 'accepted' })}
                        className="px-3 py-1 bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-medium flex items-center space-x-1 shadow-sm"
                      >
                        <Check className="w-3 h-3" />
                        <span>Accept & Apply</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-4">
            {/* Standup action */}
            <div className="p-3.5 bg-surface-50 border border-surface-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-brand-accent" />
                  <span>Daily Standup Digest</span>
                </span>
                <button
                  onClick={handleGenerateStandup}
                  disabled={Boolean(actionLoading)}
                  className="px-2.5 py-1 bg-brand-accent/20 hover:bg-brand-accent/30 text-brand-accent border border-brand-accent/40 text-xs disabled:opacity-50"
                >
                  {actionLoading === 'standup' ? 'Generating...' : 'Generate Standup'}
                </button>
              </div>
              {standupSummary && (
                <div className="mt-2 p-2.5 bg-slate-900 border border-surface-border text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                  {standupSummary}
                </div>
              )}
            </div>

            {/* Risk analysis action */}
            <div className="p-3.5 bg-surface-50 border border-surface-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>DAG Schedule Risk Analysis</span>
                </span>
                <button
                  onClick={handleAnalyzeRisk}
                  disabled={Boolean(actionLoading)}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs disabled:opacity-50"
                >
                  {actionLoading === 'risk' ? 'Analyzing...' : 'Run Risk Check'}
                </button>
              </div>
              {riskList.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {riskList.map((r, idx) => (
                    <div key={idx} className="p-2 bg-slate-900 border border-surface-border text-xs text-slate-300">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-mono text-[10px] text-brand-accent">TF-{r.task_id?.slice(0, 4)}</span>
                        <span className="text-[10px] uppercase text-amber-400">{r.severity}</span>
                      </div>
                      <p className="text-[11px] text-slate-300">{r.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex space-x-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. 'Find backend tasks blocking release'..."
                className="glass-input flex-1 px-3 py-1.5 text-xs text-slate-100"
              />
              <button
                type="submit"
                disabled={Boolean(actionLoading)}
                className="px-3 py-1.5 bg-brand-primary text-white text-xs disabled:opacity-50"
              >
                Search
              </button>
            </form>

            <div className="space-y-2">
              {searchResults.map((task) => (
                <div key={task.id} className="p-2.5 bg-surface-50 border border-surface-border text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>TF-{task.id.slice(0, 4)}</span>
                    <span className="uppercase">{task.status}</span>
                  </div>
                  <p className="font-medium text-slate-100">{task.title}</p>
                  {task.description && <p className="text-[11px] text-slate-400 line-clamp-2">{task.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
