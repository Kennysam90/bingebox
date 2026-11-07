import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Spinner } from '../ui/States';

interface PreviewInfo {
  kind: 'trailer' | 'preview';
  url: string;
  mediaKind: 'mp4' | 'hls';
  start: number;
  length: number | null;
}

/** Plays a title's trailer, or a short labelled preview clip when there is no trailer. */
export function PreviewModal({ slug, title, open, onClose }: { slug: string; title: string; open: boolean; onClose: () => void }) {
  return createPortal(<AnimatePresence>{open && <Inner slug={slug} title={title} onClose={onClose} />}</AnimatePresence>, document.body);
}

function Inner({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ['preview', slug], queryFn: () => api.get<PreviewInfo>(`/titles/${slug}/preview`) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Attach HLS when needed (lazy-loaded so it never weighs down other pages).
  useEffect(() => {
    const el = video.current;
    if (!el || !data) return;
    let destroy: (() => void) | undefined;
    const start = () => {
      if (data.start) el.currentTime = data.start;
      el.play().catch(() => {
        // Autoplay with sound was blocked; fall back to muted.
        el.muted = true;
        setMuted(true);
        el.play().catch(() => {});
      });
    };
    if (data.mediaKind === 'hls' && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        const hls = new Hls({ capLevelToPlayerSize: true });
        hls.loadSource(data.url);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, start);
        destroy = () => hls.destroy();
      });
    } else {
      el.src = data.url;
      el.addEventListener('loadedmetadata', start, { once: true });
    }
    return () => destroy?.();
  }, [data]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-3 backdrop-blur-md sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} ${data?.kind ?? 'preview'}`}
    >
      <motion.div
        className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-pop ring-1 ring-white/10"
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video bg-black">
          {(isLoading || (!error && !isError && data && !ended)) && (
            <video
              ref={video}
              className="h-full w-full"
              playsInline
              muted={muted}
              onTimeUpdate={(e) => {
                if (data?.length && e.currentTarget.currentTime > data.start + data.length) {
                  e.currentTarget.pause();
                  setEnded(true);
                }
              }}
              onEnded={() => setEnded(true)}
              onError={() => setError(true)}
            />
          )}
          {isLoading && (
            <div className="absolute inset-0 grid place-items-center">
              <Spinner className="h-10 w-10" />
            </div>
          )}
          {(isError || error) && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-200">This preview isn’t available right now.</div>}
          {ended && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
              <div>
                <p className="font-display text-2xl font-bold">Enjoying {title}?</p>
                <button onClick={() => navigate(`/watch/${slug}`)} className="btn btn-primary btn-lg mt-5">
                  <Play size={20} className="fill-current" /> Watch the full {data?.kind === 'trailer' ? 'title' : 'film'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs text-ink-300">{data?.kind === 'trailer' ? 'Official trailer' : `Preview clip${data?.length ? ` · ${Math.round(data.length)}s` : ''}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMuted((m) => !m)} className="btn-icon h-10 w-10" aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button onClick={onClose} className="btn-icon h-10 w-10" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
