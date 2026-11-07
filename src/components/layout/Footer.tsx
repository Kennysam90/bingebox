import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';

const COLUMNS = [
  {
    title: 'Browse',
    links: [
      { to: '/movies', label: 'Movies' },
      { to: '/series', label: 'TV Series' },
      { to: '/nollywood', label: 'Nollywood' },
      { to: '/genres', label: 'Genres' },
      { to: '/movies?sort=added', label: 'Recently Added' },
    ],
  },
  {
    title: 'Your BingeBox',
    links: [
      { to: '/my-list', label: 'My List' },
      { to: '/account?tab=history', label: 'Viewing History' },
      { to: '/profiles?manage=1', label: 'Profiles' },
      { to: '/account', label: 'Account' },
    ],
  },
  {
    title: 'Genres',
    links: [
      { to: '/genre/science-fiction', label: 'Sci-Fi' },
      { to: '/genre/comedy', label: 'Comedy' },
      { to: '/genre/horror', label: 'Horror' },
      { to: '/genre/animation', label: 'Animation' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="page-x mt-16 border-t border-white/[0.06] pb-28 pt-14 text-sm text-ink-300 lg:pb-14">
      <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <Logo className="text-lg" />
          <p className="mt-4 leading-relaxed">
            Big stories. One more episode. A world of movies and series, ready for your next great escape.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-200">{c.title}</h3>
            <ul className="space-y-2.5">
              {c.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-col gap-4 border-t border-white/[0.06] pt-6 text-xs leading-relaxed text-ink-400 md:flex-row md:items-start md:justify-between">
        <p className="max-w-3xl">
          Movies and TV series supplied by AnimeDoc. Playback and availability depend on the streaming source.
        </p>
        <p className="shrink-0">© {new Date().getFullYear()} BingeBox</p>
      </div>
    </footer>
  );
}
