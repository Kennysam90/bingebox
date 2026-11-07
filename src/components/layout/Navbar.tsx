import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, History, LayoutDashboard, LogOut, Pencil, Search, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useScrolled } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { Logo } from '../ui/Logo';

export const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/movies', label: 'Movies' },
  { to: '/series', label: 'TV Series' },
  { to: '/genres', label: 'Genres' },
  { to: '/my-list', label: 'My List' },
];

export function Navbar() {
  const scrolled = useScrolled(24);
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,box-shadow] duration-500 ease-cinematic',
        scrolled ? 'bg-ink-950/85 shadow-[0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl' : 'bg-gradient-to-b from-ink-950/90 via-ink-950/40 to-transparent'
      )}
    >
      <nav className="page-x flex h-[var(--nav-h)] items-center gap-6 lg:gap-10" aria-label="Main">
        <Link to="/" className={cn('shrink-0 text-[17px] sm:text-lg', searchOpen && 'hidden sm:block')} aria-label="BingeBox home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-full px-3 py-2 text-[14px] font-medium transition-colors lg:px-3.5',
                    isActive ? 'text-white' : 'text-ink-200 hover:text-white'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {l.label}
                    {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-500" />}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <SearchBox onOpenChange={setSearchOpen} />
          {user ? (
            <ProfileMenu />
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                Sign In
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm">
                Join Free
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

/** Expanding search field: typing updates /search?q= live, like a streaming app. */
function SearchBox({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearchPage = location.pathname === '/search';
  const query = params.get('q') ?? '';
  const [open, setOpen] = useState(onSearchPage);
  const [value, setValue] = useState(onSearchPage ? params.get('q') ?? '' : '');
  const input = useRef<HTMLInputElement>(null);
  const before = useRef('/');

  useEffect(() => onOpenChange(open), [open, onOpenChange]);

  useEffect(() => {
    if (!onSearchPage) {
      before.current = location.pathname + location.search;
      setValue('');
      setOpen(false);
    } else {
      setOpen(true);
      setValue(query);
    }
  }, [onSearchPage, location.pathname, location.search, query]);

  const update = (v: string) => {
    setValue(v);
    if (v.trim()) navigate(`/search?${new URLSearchParams({ q: v, ...(params.get('type') ? { type: params.get('type')! } : {}) })}`, { replace: onSearchPage });
    else if (onSearchPage) navigate(before.current, { replace: true });
  };

  return (
    <div className="relative flex items-center">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="field"
            initial={{ width: 40, opacity: 0.4 }}
            animate={{ width: 'min(280px, 52vw)', opacity: 1 }}
            exit={{ width: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-10 items-center gap-2 overflow-hidden rounded-full border border-white/15 bg-ink-900/80 pl-3 pr-1 backdrop-blur-xl focus-within:border-white/35"
          >
            <Search size={17} className="shrink-0 text-ink-200" />
            <input
              ref={input}
              autoFocus
              value={value}
              onChange={(e) => update(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  update('');
                  setOpen(false);
                }
              }}
              onBlur={() => !value && setOpen(false)}
              placeholder="Titles, people, genres, years"
              className="h-full min-w-0 flex-1 text-sm text-white placeholder:text-ink-400 focus:outline-none"
              aria-label="Search BingeBox"
            />
            {value && (
              <button onClick={() => update('')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-300 hover:text-white" aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </motion.div>
        ) : (
          <motion.button
            key="icon"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full text-white transition hover:bg-white/10"
            aria-label="Open search"
          >
            <Search size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileMenu() {
  const { user, profile, profiles, isAdmin, logout, selectProfile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const others = profiles.filter((p) => p.id !== profile?.id);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg p-0.5" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <Avatar avatar={profile?.avatar ?? 'ember'} name={profile?.name ?? user.name} className="h-9 w-9" />
        <ChevronDown size={16} className={cn('hidden text-ink-200 transition-transform duration-300 sm:block', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-[calc(100%+12px)] w-64 origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-ink-850/95 p-1.5 shadow-pop backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <Avatar avatar={profile?.avatar ?? 'ember'} name={profile?.name ?? ''} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{profile?.name}</p>
                <p className="truncate text-xs text-ink-300">{user.email}</p>
              </div>
            </div>
            {others.length > 0 && (
              <div className="border-t border-white/[0.06] py-1">
                {others.map((p) => (
                  <button
                    key={p.id}
                    role="menuitem"
                    onClick={async () => {
                      await selectProfile(p.id);
                      setOpen(false);
                      navigate('/');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink-100 hover:bg-white/5"
                  >
                    <Avatar avatar={p.avatar} name={p.name} className="h-7 w-7" rounded="rounded-md" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="border-t border-white/[0.06] py-1">
              <MenuLink to="/profiles?manage=1" icon={<Pencil size={16} />} label="Manage Profiles" />
              <MenuLink to="/account" icon={<Settings size={16} />} label="My profile" />
              <MenuLink to="/account?tab=history" icon={<History size={16} />} label="Viewing History" />
              {isAdmin && <MenuLink to="/admin" icon={<LayoutDashboard size={16} />} label="Admin Dashboard" />}
            </div>
            <div className="border-t border-white/[0.06] pt-1">
              <button
                role="menuitem"
                onClick={async () => {
                  try {
                    await logout();
                    navigate('/');
                  } catch {
                    toast.error('Sign out failed. Please check your connection and try again.');
                  }
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-100 hover:bg-white/5"
              >
                <LogOut size={16} /> Sign out of BingeBox
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-100 hover:bg-white/5 hover:text-white">
      <span className="text-ink-300">{icon}</span>
      {label}
    </Link>
  );
}
