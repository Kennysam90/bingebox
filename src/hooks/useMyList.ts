import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { CardTitle } from '../lib/types';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

/** The profile's watchlist as a Set for quick "is it saved?" checks, plus a toggle with optimistic updates. */
export function useMyList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const { data } = useQuery({
    queryKey: ['my-list'],
    queryFn: () => api.get<{ items: CardTitle[] }>('/me/list'),
    enabled: !!user,
    staleTime: 60_000,
  });
  const ids = new Set((data?.items ?? []).map((t) => t.id));

  const mutation = useMutation({
    mutationFn: ({ title, add }: { title: CardTitle | { id: number; title: string }; add: boolean }) =>
      add ? api.put(`/me/list/${title.id}`) : api.del(`/me/list/${title.id}`),
    onMutate: async ({ title, add }) => {
      await qc.cancelQueries({ queryKey: ['my-list'] });
      const prev = qc.getQueryData<{ items: CardTitle[] }>(['my-list']);
      qc.setQueryData<{ items: CardTitle[] }>(['my-list'], (old) => {
        const items = old?.items ?? [];
        return { items: add ? [title as CardTitle, ...items.filter((t) => t.id !== title.id)] : items.filter((t) => t.id !== title.id) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['my-list'], ctx.prev);
      toast.error('We couldn’t update My List. Please try again.');
    },
    onSuccess: (_d, { title, add }) => {
      toast.show(add ? `Added “${title.title}” to My List` : `Removed “${title.title}” from My List`, {
        tone: 'success',
        action: { label: 'Undo', onClick: () => mutation.mutate({ title, add: !add }) },
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['my-list'] });
      qc.invalidateQueries({ queryKey: ['title'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
  });

  const toggle = (title: CardTitle | { id: number; title: string }) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    mutation.mutate({ title, add: !ids.has(title.id) });
  };

  return { ids, has: (id: number) => ids.has(id), toggle, items: data?.items ?? [], loaded: data !== undefined };
}
