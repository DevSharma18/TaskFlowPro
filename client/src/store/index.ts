import { create } from 'zustand';
import { User, Task } from '../types';
import { setAccessToken } from '../api/client';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  login: (user, token) => {
    setAccessToken(token);
    set({ user, isAuthenticated: true, isLoading: false });
  },
  logout: () => {
    setAccessToken(null);
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

interface BoardState {
  selectedTaskId: string | null;
  isDagViewOpen: boolean;
  isAiPanelOpen: boolean;
  filterAssignee: string | null;
  filterPriority: string | null;
  searchQuery: string;
  setSelectedTaskId: (id: string | null) => void;
  toggleDagView: () => void;
  toggleAiPanel: () => void;
  setFilterAssignee: (id: string | null) => void;
  setFilterPriority: (priority: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  selectedTaskId: null,
  isDagViewOpen: false,
  isAiPanelOpen: false,
  filterAssignee: null,
  filterPriority: null,
  searchQuery: '',
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  toggleDagView: () => set((state) => ({ isDagViewOpen: !state.isDagViewOpen })),
  toggleAiPanel: () => set((state) => ({ isAiPanelOpen: !state.isAiPanelOpen })),
  setFilterAssignee: (id) => set({ filterAssignee: id }),
  setFilterPriority: (priority) => set({ filterPriority: priority }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
