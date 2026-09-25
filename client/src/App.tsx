import React from 'react';
import { useAuthStore, useBoardStore } from './store';
import { Board } from './components/Board';
import { AuthModal } from './components/AuthModal';
import { useSocket } from './hooks/useSocket';
import { Toaster, toast } from 'react-hot-toast';
import { Shield, LogOut, Sun, Moon } from 'lucide-react';
import { api } from './api/client';

export const App: React.FC = () => {
  const { user, isAuthenticated, isLoading, setUser, login, logout } = useAuthStore();
  const { theme, toggleTheme } = useBoardStore();

  // Try auto-refreshing session on first load
  React.useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      try {
        const res = await api.post('/auth/refresh');
        if (res.data.success && res.data.data.accessToken && mounted) {
          const token = res.data.data.accessToken;
          const meRes = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (meRes.data.success && mounted) {
            login(meRes.data.data, token);
            return;
          }
        }
        if (mounted) setUser(null);
      } catch {
        if (mounted) setUser(null);
      }
    };
    initAuth();
    return () => {
      mounted = false;
    };
  }, [login, setUser]);

  // Handle auth:expired event from Axios interceptor
  React.useEffect(() => {
    const onAuthExpired = () => {
      logout();
      toast.error('Session expired. Please sign in again.');
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, [logout]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-background flex items-center justify-center font-sans text-slate-800 dark:text-slate-100">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent animate-spin"></div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Initializing session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background flex flex-col font-sans text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
            color: theme === 'dark' ? '#f8fafc' : '#0f172a',
            border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.12)',
            backdropFilter: 'blur(12px)',
            borderRadius: '4px',
            fontSize: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          },
        }}
      />

      {!isAuthenticated ? (
        <AuthModal />
      ) : (
        <>
          {/* Top Navbar */}
          <header className="h-14 border-b border-slate-200/80 dark:border-surface-border bg-white/80 dark:bg-slate-950/60 backdrop-blur-md px-5 flex items-center justify-between z-10 shrink-0 shadow-sm dark:shadow-none">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 bg-brand-primary/15 dark:bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-brand-primary rounded-sm">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">TaskFlow Pro</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Intelligent Workflow Engine</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-surface-100 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-surface-border"
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>

              <div className="flex items-center space-x-2.5 px-2.5 py-1 bg-slate-100/80 dark:bg-surface-50 border border-slate-200/80 dark:border-surface-border rounded-sm">
                <div className="w-5 h-5 bg-brand-primary/20 dark:bg-brand-primary/30 border border-brand-primary/40 text-brand-primary text-[10px] font-mono font-bold flex items-center justify-center rounded-sm">
                  {user?.name?.slice(0, 1) || 'U'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">{user?.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize leading-tight">{user?.role}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 rounded-sm hover:bg-rose-50 dark:hover:bg-surface-100 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors border border-transparent hover:border-rose-200 dark:hover:border-surface-border"
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
