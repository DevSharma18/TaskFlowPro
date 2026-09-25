import { create } from 'zustand';
import { User, Task } from '../types';
import { setAccessToken, setOnTokenUpdate } from '../api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => {
    if (!user) setAccessToken(null);
    set({ user, token: user ? useAuthStore.getState().token : null, isAuthenticated: !!user, isLoading: false });
  },
  login: (user, token) => {
    setAccessToken(token);
    set({ user, token, isAuthenticated: true, isLoading: false });
  },
  logout: () => {
    setAccessToken(null);
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },
}));

setOnTokenUpdate((token) => {
  const currentToken = useAuthStore.getState().token;
  if (currentToken !== token) {
    useAuthStore.setState({ token, isAuthenticated: Boolean(token) });
  }
});

interface BoardState {
  theme: 'dark' | 'light';
  selectedTaskId: string | null;
  isAiPanelOpen: boolean;
  filterAssignee: string | null;
  filterPriority: string | null;
  searchQuery: string;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setSelectedTaskId: (id: string | null) => void;
  toggleAiPanel: () => void;
  setFilterAssignee: (id: string | null) => void;
  setFilterPriority: (priority: string | null) => void;
  setSearchQuery: (query: string) => void;
}

const getInitialTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('taskflow_theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.classList.toggle('dark', saved === 'dark');
      return saved;
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = prefersDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', initial === 'dark');
    return initial;
  }
  return 'dark';
};

const initialTheme = getInitialTheme();

export const useBoardStore = create<BoardState>((set) => ({
  theme: initialTheme,
  selectedTaskId: null,
  isAiPanelOpen: false,
  filterAssignee: null,
  filterPriority: null,
  searchQuery: '',
  setTheme: (theme) => {
    localStorage.setItem('taskflow_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('taskflow_theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  toggleAiPanel: () => set((state) => ({ isAiPanelOpen: !state.isAiPanelOpen })),
  setFilterAssignee: (id) => set({ filterAssignee: id }),
  setFilterPriority: (priority) => set({ filterPriority: priority }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
