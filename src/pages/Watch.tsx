import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { ErrorState, Spinner } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../lib/api';
import type { Playback } from '../lib/types';

export default function Watch() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const episode = params.get('episode');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const { data, dataUpdatedAt, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['play', slug, episode, profile?.id],
    queryFn: () => api.get<Playback>(`/me/play/${slug}${episode ? `?episode=${episode}` : ''}`),
    staleTime: 0,
    gcTime: 0,
  });
  useDocumentTitle(data ? `Watching ${data.title.title}` : 'Watch');

  // Personal rows should reflect what was just watched once we leave the player.
  useEffect(
    () => () => {
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['title'] });
    },
    [qc]
  );

  const saveProgress = useCallback(
    (position: number, duration: number, opts?: { final?: boolean }) => {
      if (!data || !Number.isFinite(duration) || duration <= 0) return;
      const body = JSON.stringify({ titleId: data.title.id, episodeId: data.episode?.id ?? null, position: Math.min(position, duration), duration });
      // keepalive lets the final save finish even while the page unloads.
      fetch('/api/me/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BingeBox-Client': 'web' },
        body,
        credentials: 'same-origin',
        keepalive: !!opts?.final,
      }).catch(() => {});
    },
    [data]
  );

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(`/title/${slug}`));
  const next = useCallback(() => {
    if (data?.next) navigate(`/watch/${slug}?episode=${data.next.id}`, { replace: true });
  }, [data, navigate, slug]);

  if (isLoading)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black">
        <Spinner className="h-14 w-14 border-[3px]" />
      </div>
    );
  if (isError || !data)
    return (
      <div className="fixed inset-0 grid place-items-center bg-black">
        <ErrorState
          title="We can’t play this right now"
          message={error instanceof ApiError ? error.message : 'Please try again in a moment.'}
          onRetry={() => refetch()}
        />
        <button onClick={back} className="btn btn-ghost btn-md absolute left-4 top-4">
          ← Back
        </button>
      </div>
    );

  // Remount the player per episode so every stream starts clean.
  return <VideoPlayer key={`${data.title.id}-${data.episode?.id ?? 0}-${dataUpdatedAt}`} playback={data} onBack={back} onProgress={saveProgress} onNext={data.next ? next : undefined} onRetry={() => refetch()} />;
}
