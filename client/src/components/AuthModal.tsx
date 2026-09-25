import React, { useState } from 'react';
import { useAuthStore } from '../store';
import { api } from '../api/client';
import toast from 'react-hot-toast';
import { Shield, ArrowRight, Lock, Mail, User as UserIcon } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('admin@taskflow.dev');
  const [password, setPassword] = useState('Password123!');
  const [name, setName] = useState('Ada Admin');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await api.post('/auth/login', { email, password });
        login(res.data.data.user, res.data.data.accessToken);
        toast.success('Welcome back, ' + res.data.data.user.name);
      } else {
        const res = await api.post('/auth/register', { email, password, name });
        login(res.data.data.user, res.data.data.accessToken);
        toast.success('Account created successfully');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-md p-7 border border-slate-200/90 dark:border-surface-border text-slate-900 dark:text-slate-100 rounded-sm shadow-2xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-9 h-9 bg-brand-primary/15 dark:bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-brand-primary rounded-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">TaskFlow Pro</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Intelligent Workflow Engine</p>
          </div>
        </div>

        <div className="flex border-b border-slate-200/80 dark:border-surface-border mb-5">
          <button
            type="button"
            className={`pb-2.5 px-4 text-sm font-medium transition-colors ${
              isLogin
                ? 'border-b-2 border-brand-primary text-slate-900 dark:text-slate-100 font-semibold'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            onClick={() => setIsLogin(true)}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`pb-2.5 px-4 text-sm font-medium transition-colors ${
              !isLogin
                ? 'border-b-2 border-brand-primary text-slate-900 dark:text-slate-100 font-semibold'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            onClick={() => setIsLogin(false)}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input w-full pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 rounded-sm"
                  placeholder="Ada Lovelace"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 rounded-sm"
                placeholder="developer@taskflow.dev"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 rounded-sm"
                placeholder="••••••••"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Min 8 chars, 1 uppercase, 1 digit</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-5 py-2.5 px-4 bg-brand-primary hover:bg-brand-primary/90 text-white text-sm font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 rounded-sm shadow-md shadow-brand-primary/20"
          >
            <span>{loading ? 'Processing...' : isLogin ? 'Sign In to Workspace' : 'Get Started'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-surface-border/50 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Demo credentials pre-filled for local testing.
          </p>
        </div>
      </div>
    </div>
  );
};
