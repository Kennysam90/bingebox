import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Profile, Session } from '../lib/types';

interface AuthContextValue extends Session {
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ chooseProfile: boolean }>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectProfile: (id: number) => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EMPTY: Session = { user: null, profile: null, profiles: [] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<Session>('/auth/me'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const session = data ?? EMPTY;

  /** Anything personal (rows, lists, progress) must refetch when the viewer changes. */
  const resetPersonalData = useCallback(() => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
  }, [qc]);

  const loginM = useMutation({
    mutationFn: (v: { email: string; password: string }) => api.post<Session & { chooseProfile: boolean }>('/auth/login', v),
  });
  const signupM = useMutation({
    mutationFn: (v: { name: string; email: string; password: string }) => api.post<Session>('/auth/signup', v),
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginM.mutateAsync({ email, password });
      resetPersonalData();
      qc.setQueryData<Session>(['session'], { user: res.user, profile: res.profile, profiles: res.profiles });
      return { chooseProfile: res.chooseProfile };
    },
    [loginM, qc, resetPersonalData]
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await signupM.mutateAsync({ name, email, password });
      resetPersonalData();
      qc.setQueryData<Session>(['session'], res);
    },
    [signupM, qc, resetPersonalData]
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    resetPersonalData();
    qc.setQueryData<Session>(['session'], EMPTY);
  }, [qc, resetPersonalData]);

  const selectProfile = useCallback(
    async (id: number) => {
      const res = await api.post<{ profile: Profile }>(`/profiles/${id}/select`);
      resetPersonalData();
      qc.setQueryData<Session>(['session'], (prev) => (prev ? { ...prev, profile: res.profile } : prev));
    },
    [qc, resetPersonalData]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      loading: isLoading,
      isAdmin: session.user?.role === 'admin',
      login,
      signup,
      logout,
      selectProfile,
      refresh: refetch,
    }),
    [session, isLoading, login, signup, logout, selectProfile, refetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
