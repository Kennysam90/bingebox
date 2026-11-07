import { useQuery } from '@tanstack/react-query';
import { Clock, Eye, Film, ListVideo, PlayCircle, Plus, Search, Star, Tv, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LandscapeArt } from '../../components/cards/TitleArt';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { useDocumentTitle } from '../../hooks/misc';
import { api } from '../../lib/api';
import { compact, relativeTime } from '../../lib/format';
import { AdminHeader } from './ui';
import { BarList, Legend, LineChart, SERIES } from './charts';

interface Stats {
  totals: Record<string, number>;
  daily: { day: string; plays: number; views: number; signups: number }[];
  topTitles: { id: number; slug: string; title: string; type: string; poster: string | null; backdrop: string | null; plays: number }[];
  genres: { name: string; slug: string; count: number }[];
  recentUsers: { id: number; name: string; email: string; role: string; createdAt: number }[];
  topSearches: { q: string; n: number }[];
  generatedAt: number;
}

const LINE_SERIES = [
  { key: 'plays', label: 'Plays', color: SERIES.plays },
  { key: 'views', label: 'Title views', color: SERIES.views },
];

export default function AdminDashboard() {
  useDocumentTitle('Admin');
  const [table, setTable] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<Stats>('/admin/stats'), refetchInterval: 60_000 });

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const t = data?.totals;

  return (
    <div>
      <AdminHeader
        title="Overview"
        subtitle="Catalog health and audience activity over the last 30 days."
        actions={
          <Link to="/admin/titles/new" className="btn btn-primary btn-sm">
            <Plus size={16} /> Import title
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Film size={18} />} label="Movies" value={t?.movies} />
        <Stat icon={<Tv size={18} />} label="Series" value={t?.series} sub={t ? `${t.episodes} episodes` : undefined} />
        <Stat icon={<Users size={18} />} label="Members" value={t?.users} sub={t ? `${t.profiles} profiles` : undefined} />
        <Stat icon={<UserPlus size={18} />} label="New members · 30d" value={t?.signups30d} />
        <Stat icon={<PlayCircle size={18} />} label="Plays · 30d" value={t?.plays30d} />
        <Stat icon={<Clock size={18} />} label="Hours watched · 30d" value={t?.watchHours30d} />
        <Stat icon={<Eye size={18} />} label="Active members · 30d" value={t?.activeUsers30d} />
        <Stat icon={<ListVideo size={18} />} label="My List saves" value={t?.watchlistAdds} sub={t ? `${t.ratings} ratings` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card-surface bg-ink-800 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold">Daily activity</h2>
              <p className="text-xs text-ink-400">Plays and title-page views, last 30 days</p>
            </div>
            <div className="flex items-center gap-4">
              <Legend series={LINE_SERIES} />
              <button onClick={() => setTable((v) => !v)} className="text-xs font-semibold text-ink-300 hover:text-white">
                {table ? 'View chart' : 'View table'}
              </button>
            </div>
          </div>
          {isLoading || !data ? (
            <Skeleton className="h-[240px]" />
          ) : table ? (
            <div className="thin-scrollbar max-h-[260px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-ink-800 text-left text-xs text-ink-400">
                  <tr>
                    <th className="py-2 font-medium">Day</th>
                    <th className="py-2 text-right font-medium">Plays</th>
                    <th className="py-2 text-right font-medium">Views</th>
                    <th className="py-2 text-right font-medium">Sign-ups</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-white/[0.04]">
                      <td className="py-1.5 text-ink-200">{d.day}</td>
                      <td className="py-1.5 text-right">{d.plays}</td>
                      <td className="py-1.5 text-right">{d.views}</td>
                      <td className="py-1.5 text-right">{d.signups}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <LineChart data={data.daily} series={LINE_SERIES} />
          )}
        </section>

        <section className="card-surface bg-ink-800 p-5 sm:p-6">
          <h2 className="font-display text-base font-bold">Catalog by category</h2>
          <p className="mb-5 text-xs text-ink-400">Titles per category (a title can sit in several)</p>
          {isLoading || !data ? <Skeleton className="h-[240px]" /> : <BarList data={data.genres.map((g) => ({ label: g.name, value: g.count }))} />}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card-surface p-5 sm:p-6 lg:col-span-1">
          <h2 className="mb-4 font-display text-base font-bold">Most played · 30d</h2>
          {isLoading || !data ? (
            <Skeleton className="h-60" />
          ) : data.topTitles.length === 0 ? (
            <p className="text-sm text-ink-400">No plays yet. They’ll appear here as members start watching.</p>
          ) : (
            <ol className="space-y-3">
              {data.topTitles.map((tt, i) => (
                <li key={tt.id}>
                  <Link to={`/admin/titles/${tt.id}`} className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-white/[0.03]">
                    <span className="w-5 text-center font-display text-sm font-bold text-ink-400">{i + 1}</span>
                    <div className="w-20 shrink-0 overflow-hidden rounded-md">
                      <LandscapeArt title={tt} width={250} showTitle={false} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{tt.title}</span>
                    <span className="text-xs tabular-nums text-ink-300">{compact(tt.plays)} plays</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card-surface p-5 sm:p-6">
          <h2 className="mb-4 font-display text-base font-bold">Newest members</h2>
          {isLoading || !data ? (
            <Skeleton className="h-60" />
          ) : (
            <ul className="space-y-3">
              {data.recentUsers.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-700 text-sm font-bold">{u.name[0]?.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {u.name} {u.role === 'admin' && <span className="ml-1 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">ADMIN</span>}
                    </p>
                    <p className="truncate text-xs text-ink-400">{u.email}</p>
                  </div>
                  <span className="text-xs text-ink-400">{relativeTime(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/users" className="mt-4 inline-block text-xs font-semibold text-brand-300 hover:text-brand-200">
            Manage users →
          </Link>
        </section>

        <section className="card-surface p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-base font-bold">
            <Search size={16} /> Top searches · 30d
          </h2>
          {isLoading || !data ? (
            <Skeleton className="h-60" />
          ) : data.topSearches.length === 0 ? (
            <p className="text-sm text-ink-400">No searches yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.topSearches.map((s) => (
                <li key={s.q} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink-100">“{s.q}”</span>
                  <span className="tabular-nums text-ink-400">{s.n}</span>
                </li>
              ))}
            </ul>
          )}
          {t && (
            <p className="mt-6 flex items-center gap-1.5 border-t border-white/[0.06] pt-4 text-xs text-ink-400">
              <Star size={13} /> {t.completions30d} titles watched to the end in 30 days
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value?: number; sub?: string }) {
  return (
    <div className="card-surface p-4 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-300">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.05] text-ink-100">{icon}</span>
        {label}
      </div>
      {value === undefined ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-3 font-display text-[1.75rem] font-bold leading-none tabular-nums">{value.toLocaleString()}</p>}
      {sub && <p className="mt-1.5 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}
