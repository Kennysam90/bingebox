import { Bookmark, Clapperboard, Home, LayoutGrid, Tv } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/format';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/movies', label: 'Movies', icon: Clapperboard },
  { to: '/series', label: 'Series', icon: Tv },
  { to: '/genres', label: 'Genres', icon: LayoutGrid },
  { to: '/my-list', label: 'My List', icon: Bookmark },
];

/** Bottom navigation on phones, where the top links don't fit. */
export function MobileTabBar() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-950/90 backdrop-blur-xl lg:hidden" aria-label="Primary">
      <ul className="grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors', isActive ? 'text-white' : 'text-ink-300')}
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 2.4 : 1.8} className={isActive ? 'text-brand-500' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
