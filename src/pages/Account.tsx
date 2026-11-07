import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bookmark, Check, ChevronRight, Film, History, KeyRound, Laptop, Mail, Pencil, Plus, ShieldCheck, Trash2, User as UserIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LandscapeArt } from '../components/cards/TitleArt';
import { Avatar } from '../components/ui/Avatar';
import { Field, FormError, PasswordField } from '../components/ui/Form';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useMyList } from '../hooks/useMyList';
import { api, ApiError } from '../lib/api';
import { cn, relativeTime, timecode } from '../lib/format';
import type { CardTitle } from '../lib/types';

const TABS = [
  { id: 'account', label: 'Overview', icon: UserIcon },
  { id: 'history', label: 'Viewing history', icon: History },
  { id: 'security', label: 'Security', icon: KeyRound },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function Account() {
  useDocumentTitle('My profile');
  const { user, profile, profiles } = useAuth();
  const list = useMyList();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'account') as Tab;
  const memberSince = user ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="page-x mx-auto max-w-[1600px] pb-10 pt-[calc(var(--nav-h)+2rem)] sm:pt-[calc(var(--nav-h)+3rem)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="eyebrow">Your BingeBox</p>
        <Link to="/" className="flex items-center gap-2 text-xs text-ink-300 transition hover:text-white">Back to browsing <ArrowRight size={14} /></Link>
      </div>
      <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#121014]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-60 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(255,45,70,0.2),transparent_65%)]" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="absolute -right-24 -top-44 h-[500px] w-[500px] rotate-[-30deg] rounded-[40%] border border-white/[0.045]" style={{ transform: `rotate(-30deg) scale(${1 + i * 0.2})` }} />)}
          <div className="absolute inset-0 bg-gradient-to-r from-ink-900/70 via-transparent to-transparent" />
        </div>
        <div className="relative flex flex-col gap-7 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-9 lg:p-11">
          <div className="relative self-start rounded-[28px] border border-white/15 bg-white/[0.03] p-2 shadow-2xl sm:self-auto">
            <Avatar avatar={profile?.avatar ?? 'ember'} name={profile?.name ?? user?.name ?? ''} className="h-24 w-24 sm:h-28 sm:w-28" rounded="rounded-[22px]" />
            <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-4 border-[#121014] bg-white text-ink-950"><Check size={14} strokeWidth={3} /></span>
          </div>
          <div className="min-w-0 flex-1">
            <span className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-200"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Personal profile</span>
            <h1 className="break-words font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{profile?.name ?? user?.name}</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-200">Your picks, your progress, your next great watch.</p>
          </div>
          <Link to={`/profiles?manage=1&edit=${profile?.id ?? ''}&next=/account`} className="btn btn-glass btn-md self-start sm:self-center"><Pencil size={15} /> Edit profile</Link>
        </div>
        <div className="relative grid grid-cols-3 divide-x divide-white/[0.07] border-t border-white/[0.07] bg-black/15 py-5 sm:py-6">
          <ProfileStat label="Saved titles" value={list.loaded ? list.items.length : '—'} />
          <ProfileStat label="Viewer profiles" value={profiles.length} />
          <ProfileStat label="Member since" value={memberSince} />
        </div>
      </section>
      <div className="mt-8 grid items-start gap-7 lg:mt-10 lg:grid-cols-[210px_1fr] lg:gap-10">
        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--nav-h)+1.5rem)]">
          <p className="mb-3 hidden px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400 lg:block">Personal space</p>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5 lg:flex-col lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0" aria-label="Account sections">
            {TABS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setParams(id === 'account' ? {} : { tab: id }, { replace: true })} aria-current={tab === id ? 'page' : undefined} className={cn('flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition lg:w-full', tab === id ? 'bg-brand-500/10 text-brand-300' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white')}><Icon size={17} /> {label}<ChevronRight size={14} className="ml-auto hidden lg:block" /></button>)}
          </nav>
          <div className="mt-6 hidden border-t border-white/[0.07] pt-5 lg:block"><Link to="/my-list" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-ink-300 transition hover:bg-white/[0.04] hover:text-white"><Bookmark size={17} /> My List <ArrowRight size={14} className="ml-auto" /></Link></div>
        </aside>
        <div className="min-w-0">{tab === 'account' ? <AccountTab /> : tab === 'history' ? <HistoryTab /> : <SecurityTab />}</div>
      </div>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 px-2 text-center sm:px-6"><p className="font-display text-base font-semibold sm:text-xl">{value}</p><p className="mt-1 text-[10px] text-ink-300 sm:text-xs">{label}</p></div>;
}

function AccountTab() {
  const { user, profile, profiles, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const save = useMutation({
    mutationFn: () => api.patch('/account', { name: name.trim() }),
    onSuccess: () => { toast.success('Account updated'); refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Couldn’t update your account.'),
  });
  if (!user) return null;
  return (
    <div className="space-y-6">
      <div><h2 className="font-display text-xl font-bold">Make yourself at home</h2><p className="mt-1.5 text-sm text-ink-300">A little about you. Everything for your next movie night.</p></div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03]"><UserIcon size={18} className="text-ink-200" /></span><div><h3 className="text-sm font-semibold">Account details</h3><p className="mt-0.5 text-xs text-ink-400">Your sign-in account information</p></div></div>
          <div className="space-y-5"><Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" /><Field label="Email address" value={user.email} readOnly type="email" hint={<span className="flex items-center gap-1.5"><Mail size={11} /> Used to sign in to your account.</span>} /></div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5"><span className="text-xs text-ink-400">Keep it personal.</span><button className="btn btn-primary btn-md" disabled={save.isPending || !name.trim() || name.trim() === user.name}>{save.isPending ? 'Saving…' : 'Save changes'}</button></div>
        </form>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
          <div className="flex-1 p-5 sm:p-7"><span className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300"><ShieldCheck size={20} /></span><h3 className="font-display text-lg font-bold">A space of your own</h3><p className="mt-3 text-sm leading-6 text-ink-300">Each profile has its own watchlist, viewing history and recommendations. Pick up right where you left off.</p><div className="mt-6 flex items-center gap-3"><Avatar avatar={profile?.avatar ?? 'ember'} name={profile?.name ?? user.name} className="h-9 w-9" /><div className="min-w-0"><p className="truncate text-sm font-medium">{profile?.name}</p><p className="mt-0.5 text-[11px] text-ink-400">Your active viewing profile</p></div></div></div>
          <Link to="/account?tab=security" className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-5 py-4 text-xs font-semibold text-ink-200 transition hover:bg-white/[0.05] sm:px-7">Password & security <ArrowRight size={15} /></Link>
        </div>
      </div>
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-lg font-bold">Your viewing crew</h3><p className="mt-1 text-xs text-ink-300">Different tastes. One BingeBox.</p></div><Link to="/profiles?manage=1&next=/account" className="flex items-center gap-2 text-xs font-semibold text-ink-200 transition hover:text-white">Manage profiles <ArrowRight size={14} /></Link></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{profiles.map((p) => <Link key={p.id} to={`/profiles?manage=1&edit=${p.id}&next=/account`} className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition hover:border-white/20 hover:bg-white/[0.05]"><Avatar avatar={p.avatar} name={p.name} className="h-11 w-11" rounded="rounded-xl" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="mt-1 text-[10px] text-ink-400">{p.id === profile?.id ? 'CURRENT PROFILE' : 'PERSONAL PROFILE'}</p></div><Pencil size={14} className="text-ink-400 transition group-hover:text-white" /></Link>)}{profiles.length < 5 && <Link to="/profiles?manage=1&edit=new&next=/account" className="flex min-h-[76px] items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-xs font-medium text-ink-300 transition hover:border-white/30 hover:bg-white/[0.03] hover:text-white"><Plus size={18} /> Add a profile</Link>}</div>
      </section>
      <Link to="/movies" className="group flex items-center gap-4 rounded-2xl border border-brand-500/15 bg-gradient-to-r from-brand-500/[0.07] to-transparent p-5 sm:px-7"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-300"><Film size={20} /></span><div className="flex-1"><p className="text-sm font-semibold">Your next favourite is waiting.</p><p className="mt-1 text-xs text-ink-300">Find something worth staying in for.</p></div><ArrowRight size={18} className="text-ink-300 transition group-hover:translate-x-1 group-hover:text-white" /></Link>
    </div>
  );
}

interface HistoryItem {
  id: number;
  watchedAt: number;
  seconds: number;
  title: CardTitle;
  episode: { id: number; name: string; label: string } | null;
}

function HistoryTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['history', profile?.id], queryFn: () => api.get<{ items: HistoryItem[] }>('/me/history') });
  const removeOne = useMutation({
    mutationFn: (id: number) => api.del(`/me/history/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }),
    onError: () => toast.error('Couldn’t remove that history entry. Please try again.'),
  });
  const clear = useMutation({
    mutationFn: () => api.del('/me/history'),
    onSuccess: () => {
      toast.show('Viewing history cleared');
      qc.invalidateQueries();
    },
  });

  const groups = new Map<string, HistoryItem[]>();
  if (isError) return <ErrorState message="We couldn’t load your viewing history." onRetry={() => refetch()} />;
  for (const item of data?.items ?? []) {
    const d = new Date(item.watchedAt);
    const key = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Viewing history</h2>
          <p className="text-sm text-ink-300">Everything {profile?.name} has watched on BingeBox.</p>
        </div>
        {!!data?.items.length && (
          <button onClick={() => confirm('Clear all viewing history and progress for this profile?') && clear.mutate()} className="btn btn-glass btn-sm">
            <Trash2 size={15} /> Clear all
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState icon={<History size={26} />} title="Nothing watched yet" message="Titles you watch will show up here." />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-300">{day}</h3>
              <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/60">
                {items.map((h) => (
                  <li key={h.id} className="group flex items-center gap-4 p-3">
                    <Link to={`/title/${h.title.slug}`} className="w-32 shrink-0 overflow-hidden rounded-lg sm:w-40">
                      <LandscapeArt title={h.title} width={330} showTitle={false} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/title/${h.title.slug}`} className="block truncate font-semibold hover:underline">
                        {h.title.title}
                      </Link>
                      {h.episode && <p className="truncate text-sm text-ink-200">{h.episode.label} · {h.episode.name}</p>}
                      <p className="text-xs text-ink-400">
                        {relativeTime(h.watchedAt)} · watched to {timecode(h.seconds)}
                      </p>
                    </div>
                    <button onClick={() => removeOne.mutate(h.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-400 opacity-100 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100" aria-label="Remove from history">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<{ sessions: { createdAt: number; userAgent: string; current: boolean }[] }>('/account/sessions') });
  const change = useMutation({
    mutationFn: () => api.post('/account/password', form),
    onSuccess: () => {
      toast.success('Password changed. Other devices have been signed out.');
      setForm({ currentPassword: '', newPassword: '' });
      setError(null);
      sessions.refetch();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t change your password.'),
  });
  const revoke = useMutation({
    mutationFn: () => api.post('/account/sessions/revoke-others'),
    onSuccess: () => {
      toast.success('Signed out of all other devices');
      sessions.refetch();
    },
  });

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
        className="card-surface max-w-xl space-y-5 p-6"
      >
        <h2 className="font-display text-lg font-bold">Change password</h2>
        <FormError message={error} />
        <PasswordField label="Current password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} />
        <PasswordField label="New password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} showStrength />
        <button className="btn btn-primary btn-md" disabled={change.isPending || !form.currentPassword || !form.newPassword}>
          Update password
        </button>
      </form>
      <section className="card-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Signed-in devices</h2>
          {(sessions.data?.sessions.length ?? 0) > 1 && (
            <button onClick={() => revoke.mutate()} className="btn btn-glass btn-sm">
              Sign out other devices
            </button>
          )}
        </div>
        <ul className="mt-4 space-y-2">
          {sessions.data?.sessions.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 text-sm">
              <Laptop size={18} className="text-ink-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{describeAgent(s.userAgent)}</p>
                <p className="text-xs text-ink-400">Signed in {relativeTime(s.createdAt)}</p>
              </div>
              {s.current && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">This device</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function describeAgent(ua: string) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? (/iPhone|iPad/.test(ua) ? 'iOS' : 'macOS') : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}
