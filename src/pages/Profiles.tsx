import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Pencil, Plus, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AVATAR_STYLES } from '../components/ui/Avatar';
import { FormError } from '../components/ui/Form';
import { Logo } from '../components/ui/Logo';
import { useDocumentTitle } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { api, ApiError } from '../lib/api';
import { cn, safeNext } from '../lib/format';
import type { Profile } from '../lib/types';

/** "Who's watching?" picker, and profile management (?manage=1). */
export default function Profiles() {
  useDocumentTitle('Profiles');
  const { profiles, profile: current, selectProfile, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [manage, setManage] = useState(params.get('manage') === '1');
  const [editing, setEditing] = useState<Profile | 'new' | null>(() => params.get('edit') === 'new' && profiles.length < 5 ? 'new' : profiles.find((p) => String(p.id) === params.get('edit')) ?? null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get('next'));
  const closeEditor = () => { setEditing(null); if (params.has('edit')) { const updated = new URLSearchParams(params); updated.delete('edit'); setParams(updated, { replace: true }); } };
  const choose = async (p: Profile) => {
    if (manage) return setEditing(p);
    setSelecting(p.id); setError(null);
    try { await selectProfile(p.id); navigate(next, { replace: true }); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Couldn’t switch profiles. Please try again.'); }
    finally { setSelecting(null); }
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-ink-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10"><div className="absolute -top-72 left-1/2 h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(255,45,70,0.13),transparent_65%)]" /><div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:linear-gradient(black,transparent_80%)]" /></div>
      <header className="page-x flex h-[var(--nav-h)] shrink-0 items-center justify-between gap-4 border-b border-white/[0.04]"><Link to="/" className="text-lg" aria-label="BingeBox home"><Logo /></Link><Link to="/account" className="flex items-center gap-2 text-xs text-ink-300 transition hover:text-white"><ArrowLeft size={14} /> My profile</Link></header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16 sm:px-8 sm:py-20">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center"><p className="eyebrow mb-4">One account. Your own experience.</p><h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">{manage ? 'Made for everyone.' : 'Who’s watching?'}</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-300">{manage ? 'Give every viewer their own corner of BingeBox. Edit a profile or make room for someone new.' : 'Choose your profile and settle in. Your favourites and where you left off are right here.'}</p></motion.div>
        <div className="mx-auto mt-10 w-full max-w-5xl"><FormError message={error} /><div className="mt-3 flex flex-wrap justify-center gap-4 sm:gap-5">
          {profiles.map((p, i) => <motion.button key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => choose(p)} disabled={selecting !== null} aria-label={`${manage ? 'Edit' : 'Watch as'} ${p.name}`} className={cn('group relative flex w-[calc(50%-8px)] max-w-[190px] flex-col items-center rounded-[22px] border bg-white/[0.025] px-4 pb-5 pt-7 text-center transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.05] disabled:opacity-60 sm:w-44', p.id === current?.id ? 'border-brand-500/35' : 'border-white/[0.09]')}>
            <span className="relative"><Avatar avatar={p.avatar} name={p.name} className="h-20 w-20 shadow-xl transition duration-300 group-hover:scale-105 sm:h-24 sm:w-24" rounded="rounded-[22px]" />{manage && <span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border-[3px] border-ink-950 bg-white text-ink-950"><Pencil size={12} /></span>}</span>
            <span className="mt-5 w-full truncate text-sm font-semibold sm:text-base">{p.name}</span><span className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-400">Personal profile</span>
            <span className={cn('mt-5 flex h-6 items-center gap-1.5 text-[10px] font-medium', p.id === current?.id ? 'text-brand-300' : 'text-ink-400')}>{selecting === p.id ? 'Opening…' : p.id === current?.id ? <><Check size={12} /> Current profile</> : <>{manage ? 'Edit profile' : 'Let’s watch'} <ChevronRight size={12} /></>}</span>
          </motion.button>)}
          {profiles.length < 5 && <motion.button initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: profiles.length * 0.06 }} onClick={() => setEditing('new')} className="group flex w-[calc(50%-8px)] max-w-[190px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 px-4 py-7 transition duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.03] sm:w-44"><span className="grid h-16 w-16 place-items-center rounded-full border border-white/10 bg-white/[0.025] text-ink-300 transition group-hover:text-white"><Plus size={27} strokeWidth={1.4} /></span><span className="mt-5 text-sm font-medium text-ink-200">Add profile</span><span className="mt-2 text-[11px] text-ink-400">A space for someone new</span></motion.button>}
        </div></div>
        <div className="mt-10 flex flex-col items-center gap-5"><button onClick={() => manage ? navigate(next) : setManage(true)} className={cn('btn btn-md min-w-44', manage ? 'btn-primary' : 'btn-glass')}>{manage ? <>Done <ArrowRight size={15} /></> : <><Users size={15} /> Manage profiles</>}</button><p className="flex items-center gap-2 text-[11px] text-ink-400"><ShieldCheck size={13} /> Separate watchlists. Personal recommendations.</p></div>
      </main>
      <footer className="pb-7 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-ink-500">Press play. Make it yours.</footer>
      <AnimatePresence>{editing && <ProfileEditor profile={editing === 'new' ? null : editing} onClose={closeEditor} onSaved={() => refresh()} canDelete={profiles.length > 1} />}</AnimatePresence>
    </div>
  );
}

function ProfileEditor({ profile, onClose, onSaved, canDelete }: { profile: Profile | null; onClose: () => void; onSaved: () => void; canDelete: boolean }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? Object.keys(AVATAR_STYLES)[Math.floor(Math.random() * 8)]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => (profile ? api.patch(`/profiles/${profile.id}`, { name: name.trim(), avatar }) : api.post('/profiles', { name: name.trim(), avatar })),
    onSuccess: () => {
      toast.success(profile ? 'Profile updated' : 'Profile created');
      onSaved();
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t save the profile.'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/profiles/${profile!.id}`),
    onSuccess: () => {
      toast.show('Profile deleted');
      qc.invalidateQueries();
      onSaved();
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t delete the profile.'),
  });

  const busy = save.isPending || remove.isPending;
  const close = () => { if (!busy) onClose(); };
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (!busy) onClose(); }
      if (e.key === 'Tab') {
        const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? []);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = scroll; document.removeEventListener('keydown', key); before?.focus(); };
  }, [busy, onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.form ref={dialog} role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" initial={{ scale: 0.97, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); setError(null); if (!name.trim()) return setError('Give the profile a name.'); save.mutate(); }} className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#101013] text-left shadow-pop">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-6 sm:px-8"><div><p className="eyebrow mb-2">Make it yours</p><h2 id="profile-editor-title" className="font-display text-2xl font-bold">{profile ? 'Edit your profile' : 'A new point of view.'}</h2><p className="mt-2 text-xs text-ink-300">Your own identity. Your own entertainment.</p></div><button type="button" onClick={close} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-ink-300 transition hover:bg-white/10 hover:text-white" aria-label="Close profile editor"><X size={16} /></button></div>
        <div className="grid gap-7 p-6 sm:grid-cols-[140px_1fr] sm:gap-8 sm:p-8">
          <div className="flex items-center gap-4 sm:flex-col sm:text-center"><Avatar avatar={avatar} name={name} className="h-20 w-20 shadow-xl sm:h-32 sm:w-32" rounded="rounded-[24px]" /><div className="min-w-0"><p className="break-words text-sm font-semibold">{name.trim() || 'Your name'}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-ink-400">Personal profile</p></div></div>
          <div className="min-w-0"><label htmlFor="profile-name" className="label">Profile name</label><input id="profile-name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} maxLength={20} placeholder="What should we call you?" className="input" autoFocus required disabled={busy} /><p className="mt-2 text-[11px] text-ink-400">This is how you’ll appear on BingeBox.</p><fieldset disabled={busy} className="mt-6"><legend className="label">Choose your colour</legend><div className="mt-2 grid grid-cols-4 gap-3">{Object.entries(AVATAR_STYLES).map(([key, style]) => <button key={key} type="button" onClick={() => setAvatar(key)} className={cn('relative rounded-xl p-1 ring-offset-2 ring-offset-[#101013] transition', avatar === key ? 'bg-white/10 ring-1 ring-white/70' : 'hover:bg-white/5')} aria-label={style.label} aria-pressed={avatar === key}><Avatar avatar={key} name={name || 'B'} className="aspect-square w-full" rounded="rounded-lg" />{avatar === key && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-white text-ink-950"><Check size={10} strokeWidth={3} /></span>}</button>)}</div></fieldset></div>
        </div>
        <div className="px-6 sm:px-8"><FormError message={error} /></div>
        {confirmDelete ? <div className="m-6 mt-2 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 sm:mx-8"><p className="text-sm font-semibold">Delete {profile?.name}’s profile?</p><p className="mt-2 text-xs leading-5 text-ink-300">Their watchlist, history and progress will be permanently removed.</p><div className="mt-4 flex gap-3"><button type="button" disabled={busy} onClick={() => remove.mutate()} className="btn btn-primary btn-sm">{remove.isPending ? 'Deleting…' : 'Delete profile'}</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="btn btn-ghost btn-sm">Keep profile</button></div></div> : <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-white/[0.015] px-6 py-5 sm:px-8"><div>{profile && canDelete && <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 text-xs text-ink-400 transition hover:text-brand-300"><Trash2 size={14} /> Delete profile</button>}</div><div className="flex gap-2"><button type="button" disabled={busy} onClick={close} className="btn btn-ghost btn-md">Cancel</button><button type="submit" disabled={busy || !name.trim()} className="btn btn-primary btn-md">{save.isPending ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}</button></div></div>}
      </motion.form>
    </motion.div>
  );
}
