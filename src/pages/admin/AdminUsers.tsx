import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronLeft, ChevronRight, Search, Shield, ShieldOff, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { useDebounced, useDocumentTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { api, ApiError, qs } from '../../lib/api';
import { cn, relativeTime } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { AdminHeader, FilterSelect } from './ui';

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  createdAt: number;
  lastLoginAt: number | null;
  profiles: number;
  views: number;
  watchSeconds: number;
}

export default function AdminUsers() {
  useDocumentTitle('Users · Admin');
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'users', { dq, role, status, page }],
    queryFn: () => api.get<Paged<UserRow>>(`/admin/users${qs({ q: dq, role, status, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pick<UserRow, 'role' | 'status'>> }) => api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      toast.success('User updated');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed.'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success('User deleted');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed.'),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <AdminHeader title="Users" subtitle={data ? `${data.total.toLocaleString()} accounts` : 'Member accounts'} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-850 px-3 focus-within:border-white/30 sm:max-w-sm">
          <Search size={16} className="text-ink-400" />
          <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Search name or email" className="h-full flex-1 text-sm focus:outline-none" aria-label="Search users" />
        </div>
        <FilterSelect value={role} onChange={(v) => (setRole(v), setPage(1))} options={[['', 'All roles'], ['user', 'Members'], ['admin', 'Admins']]} />
        <FilterSelect value={status} onChange={(v) => (setStatus(v), setPage(1))} options={[['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']]} />
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/60">
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <Skeleton className="h-10" />
                        </td>
                      </tr>
                    ))
                  : data?.items.map((u) => {
                      const self = u.id === me?.id;
                      return (
                        <tr key={u.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-700 font-bold">{u.name[0]?.toUpperCase()}</span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {u.name} {self && <span className="text-xs font-normal text-ink-400">(you)</span>}
                                </p>
                                <p className="truncate text-xs text-ink-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', u.role === 'admin' ? 'bg-brand-500/15 text-brand-300' : 'bg-white/10 text-ink-200')}>{u.role === 'admin' ? 'Admin' : 'Member'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', u.status === 'active' ? 'text-emerald-300' : 'text-amber-300')}>
                              {u.status === 'active' ? <UserCheck size={14} /> : <Ban size={14} />}
                              {u.status === 'active' ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-300">
                            {u.profiles} profile{u.profiles === 1 ? '' : 's'} · {u.views} views · {Math.round(u.watchSeconds / 3600)}h watched
                            <br />
                            <span className="text-ink-400">Last sign-in {u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'never'}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <ActionBtn
                                label={u.role === 'admin' ? 'Remove admin access' : 'Make admin'}
                                disabled={self}
                                onClick={() => confirm(u.role === 'admin' ? `Remove admin access from ${u.name}?` : `Give ${u.name} full admin access?`) && patch.mutate({ id: u.id, body: { role: u.role === 'admin' ? 'user' : 'admin' } })}
                              >
                                {u.role === 'admin' ? <ShieldOff size={15} /> : <Shield size={15} />}
                              </ActionBtn>
                              <ActionBtn
                                label={u.status === 'active' ? 'Suspend' : 'Reactivate'}
                                disabled={self}
                                onClick={() => patch.mutate({ id: u.id, body: { status: u.status === 'active' ? 'suspended' : 'active' } })}
                              >
                                {u.status === 'active' ? <Ban size={15} /> : <UserCheck size={15} />}
                              </ActionBtn>
                              <ActionBtn label="Delete account" disabled={self || u.role === 'admin'} danger onClick={() => confirm(`Permanently delete ${u.email}? Their profiles, lists and history will be removed.`) && remove.mutate(u.id)}>
                                <Trash2 size={15} />
                              </ActionBtn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          {data && data.items.length === 0 && <EmptyState title="No users found" />}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-sm text-ink-300">
              <span>
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30" aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30" aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className={cn('grid h-8 w-8 place-items-center rounded-lg text-ink-300 transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-25', danger ? 'hover:text-brand-300' : 'hover:text-white')}>
      {children}
    </button>
  );
}
