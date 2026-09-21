import React from 'react';
import { useAuthStore } from './store';
import { Board } from './components/Board';
import { AuthModal } from './components/AuthModal';
import { useSocket } from './hooks/useSocket';
import { Toaster } from 'react-hot-toast';
import { Shield, LogOut, User, CheckCircle2, Zap } from 'lucide-react';
import { api } from './api/client';

export const App: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuthStore();

  // Initialize live WebSocket listener
  useSocket();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Swallowed
    }
    logout();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-slate-100">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            borderRadius: '4px',
            fontSize: '12px',
          },
        }}
      />

      {!isAuthenticated ? (
        <AuthModal />
      ) : (
        <>
          {/* Top Navbar */}
          <header className="h-16 border-b border-surface-border bg-slate-950/60 backdrop-blur-md px-6 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-brand-primary">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm tracking-tight text-slate-100">TaskFlow Pro</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-surface-100 border border-surface-border text-brand-accent">
                    DAG Active
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Non-Compounding Dependency Engine</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2.5 px-3 py-1.5 bg-surface-50 border border-surface-border">
                <div className="w-5 h-5 bg-brand-primary/30 border border-brand-primary text-brand-primary text-[10px] font-mono font-bold flex items-center justify-center">
                  {user?.name?.slice(0, 1) || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-slate-200">{user?.name}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{user?.role}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-surface-100 text-slate-400 hover:text-rose-400 transition-colors border border-transparent hover:border-surface-border"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Main Board View */}
          <main className="flex-1 flex flex-col min-h-0">
            <Board />
          </main>
        </>
      )}
    </div>
  );
};
