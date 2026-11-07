import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { useDocumentTitle } from '../../hooks/misc';
import { useToast } from '../../hooks/useToast';
import { api, ApiError } from '../../lib/api';
import { AdminHeader } from './ui';

interface GenreRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort: number;
  count: number;
}

export default function AdminGenres() {
  useDocumentTitle('Categories · Admin');
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'genres'], queryFn: () => api.get<{ genres: GenreRow[] }>('/admin/genres') });
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState({ name: '', slug: '', description: '', sort: 0 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'genres'] });
    qc.invalidateQueries({ queryKey: ['genres'] });
  };
  const save = useMutation({
    mutationFn: () => (editing === 'new' ? api.post('/admin/genres', draft) : api.put(`/admin/genres/${editing}`, draft)),
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Category created' : 'Category updated');
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed.'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/admin/genres/${id}`),
    onSuccess: () => {
      toast.success('Category deleted');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed.'),
  });

  const start = (g?: GenreRow) => {
    setEditing(g ? g.id : 'new');
    setDraft(g ? { name: g.name, slug: g.slug, description: g.description ?? '', sort: g.sort } : { name: '', slug: '', description: '', sort: (data?.genres.length ?? 0) + 1 });
  };

  const editor = (
    <tr className="bg-white/[0.02]">
      <td className="px-4 py-3">
        <input className="input h-10 text-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" autoFocus aria-label="Name" />
      </td>
      <td className="px-4 py-3">
        <input className="input h-10 text-sm" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="auto" aria-label="Slug" />
      </td>
      <td className="px-4 py-3">
        <input className="input h-10 text-sm" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description" aria-label="Description" />
      </td>
      <td className="px-4 py-3">
        <input className="input h-10 w-20 text-sm" inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label="Sort order" />
      </td>
      <td className="px-4 py-3" />
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <button onClick={() => save.mutate()} disabled={!draft.name.trim() || save.isPending} className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-40" aria-label="Save">
            <Check size={15} />
          </button>
          <button onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10" aria-label="Cancel">
            <X size={15} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      <AdminHeader
        title="Categories"
        subtitle="Genres members can browse. Order controls how they appear across the site."
        actions={
          <button onClick={() => start()} className="btn btn-primary btn-sm" disabled={editing === 'new'}>
            <Plus size={16} /> New category
          </button>
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/60">
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Titles</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {editing === 'new' && editor}
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <Skeleton className="h-8" />
                        </td>
                      </tr>
                    ))
                  : data?.genres.map((g) =>
                      editing === g.id ? (
                        <EditorRow key={g.id}>{editor}</EditorRow>
                      ) : (
                        <tr key={g.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-semibold">{g.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-ink-300">{g.slug}</td>
                          <td className="max-w-xs truncate px-4 py-3 text-ink-300">{g.description}</td>
                          <td className="px-4 py-3 tabular-nums text-ink-300">{g.sort}</td>
                          <td className="px-4 py-3">
                            <Link to={`/admin/titles?genre=${g.slug}`} className="tabular-nums text-ink-100 hover:underline">
                              {g.count}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => start(g)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white" aria-label={`Edit ${g.name}`}>
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => confirm(`Delete “${g.name}”? ${g.count} titles will lose this category (the titles themselves stay).`) && remove.mutate(g.id)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-brand-300"
                                aria-label={`Delete ${g.name}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EditorRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
