import type HlsType from 'hls.js';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from '../../hooks/misc';
import { cn, timecode } from '../../lib/format';
import type { Playback, PlaybackSource } from '../../lib/types';
import { Spinner } from '../ui/States';

interface Props {
  playback: Playback;
  onBack: () => void;
  onProgress: (position: number, duration: number, opts?: { final?: boolean }) => void;
  onNext?: () => void;
  onRetry?: () => void;
}

interface QualityOption {
  id: string;
  label: string;
  /** hls.js level index (-1 = auto) or MP4 source URL */
  level?: number;
  source?: PlaybackSource;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const CUE_SIZES = { S: '1.05rem', M: '1.35rem', L: '1.8rem' } as const;
const HIDE_AFTER = 3000;

/**
 * BingeBox's video player: custom controls on top of a native <video>, with
 * hls.js (lazy-loaded) for adaptive streams on browsers without native HLS.
 */
export function VideoPlayer({ playback, onBack, onProgress, onNext, onRetry }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const hideTimer = useRef<number>();
  const lastSaved = useRef(0);
  const attemptedSources = useRef(new Set<string>());

  const [prefs, setPrefs] = useLocalStorage('bb:player', { volume: 1, muted: false, subtitle: '' as string, cueSize: 'M' as keyof typeof CUE_SIZES, quality: '' });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<null | 'settings' | 'subtitles'>(null);
  const [speed, setSpeed] = useState(1);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [quality, setQuality] = useState<string>('auto');
  const [autoLevelLabel, setAutoLevelLabel] = useState('');
  const [subtitle, setSubtitle] = useState<string>(() => (playback.subtitles.some((s) => s.lang === prefs.subtitle) ? prefs.subtitle : ''));
  const [flash, setFlash] = useState<null | 'play' | 'pause' | 'back' | 'fwd'>(null);
  const [resumeBanner, setResumeBanner] = useState<number | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [scrub, setScrub] = useState<{ x: number; t: number } | null>(null);

  const label = playback.episode ? `S${playback.episode.season}:E${playback.episode.number} · ${playback.episode.name}` : '';

  // ---------------------------------------------------------------------
  // Source setup
  // ---------------------------------------------------------------------
  const ordered = useMemo(() => [...playback.sources].sort((a, b) => Number(b.primary) - Number(a.primary)), [playback.sources]);
  const hlsSource = ordered.find((s) => s.kind === 'hls');
  const mp4Sources = useMemo(() => {
    const probe = document.createElement('video');
    return ordered.filter((s) => s.kind === 'mp4' &&
      (!/hevc|h265/i.test(s.codec ?? '') || !!probe.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')));
  }, [ordered]);

  const seekAfterLoad = useRef<number | null>(playback.resume?.position ?? null);
  const resumeAfterLoad = useRef(true);

  const attachMp4 = useCallback((src: PlaybackSource) => {
    const el = video.current;
    if (!el) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    attemptedSources.current.add(src.url);
    setError(null);
    setWaiting(true);
    el.src = src.url;
    el.load();
  }, []);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    setError(null);
    setWaiting(true);
    let cancelled = false;

    const mp4Options: QualityOption[] = mp4Sources.map((s) => ({ id: s.url, label: s.quality, source: s }));

    if (hlsSource) {
      if (el.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS: native HLS handles adaptive quality itself.
        el.src = hlsSource.url;
        setQualities([{ id: 'auto', label: 'Auto' }, ...mp4Options]);
        setQuality('auto');
      } else {
        import('hls.js')
          .then(({ default: Hls }) => {
            if (cancelled) return;
            if (!Hls.isSupported()) {
              if (mp4Sources[0]) attachMp4(mp4Sources[0]);
              else setError('This browser can’t play this stream.');
              return;
            }
            const hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1, maxBufferLength: 30 });
            hlsRef.current = hls;
            hls.loadSource(hlsSource.url);
            hls.attachMedia(el);
            hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
              const levels = data.levels
                .map((l, i) => ({ id: `lvl-${i}`, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`, level: i, h: l.height }))
                .filter((l, i, arr) => arr.findIndex((x) => x.label === l.label) === i)
                .sort((a, b) => b.h - a.h);
              setQualities([{ id: 'auto', label: 'Auto', level: -1 }, ...levels]);
              setQuality('auto');
            });
            hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
              const lvl = hls.levels[data.level];
              setAutoLevelLabel(lvl?.height ? `${lvl.height}p` : '');
            });
            let mediaRecoveries = 0;
            let networkRecoveries = 0;
            hls.on(Hls.Events.ERROR, (_e, data) => {
              if (!data.fatal) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries++ < 2) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) hls.recoverMediaError();
              else if (mp4Sources[0]) {
                // Fall back to a progressive rendition.
                seekAfterLoad.current = el.currentTime || seekAfterLoad.current;
                attachMp4(mp4Sources[0]);
                setQualities(mp4Options);
                setQuality(mp4Sources[0].url);
              } else setError('The stream stopped responding.');
            });
          })
          .catch(() => setError('The player failed to load. Check your connection and try again.'));
      }
    } else if (mp4Sources.length) {
      const preferred = mp4Sources.find((s) => s.quality === prefs.quality) ?? mp4Sources[0];
      attachMp4(preferred);
      setQualities(mp4Options);
      setQuality(preferred.url);
    } else setError('No playable source is available.');

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
    // Sources only change when the episode changes (the component remounts then).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Media events
  // ---------------------------------------------------------------------
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.volume = prefs.volume;
    el.muted = prefs.muted;
    let active = true;

    const onLoaded = () => {
      setDuration(el.duration || 0);
      if (seekAfterLoad.current && seekAfterLoad.current < (el.duration || Infinity) - 5) {
        el.currentTime = seekAfterLoad.current;
        if (playback.resume && seekAfterLoad.current === playback.resume.position) setResumeBanner(playback.resume.position);
      }
      seekAfterLoad.current = null;
      if (resumeAfterLoad.current) el.play().catch(() => setPlaying(false));
    };
    const onTime = () => {
      setTime(el.currentTime);
      if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
      // Save every ~10 seconds of playback.
      if (Math.abs(el.currentTime - lastSaved.current) >= 10 && el.duration) {
        lastSaved.current = el.currentTime;
        onProgress(el.currentTime, el.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      if (el.duration && el.currentTime > 1) onProgress(el.currentTime, el.duration);
    };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => {
      setWaiting(false);
      setError(null);
    };
    const onCanPlay = () => setWaiting(false);
    const onEnded = () => {
      onProgress(el.duration, el.duration, { final: true });
      if (playback.next) setNextCountdown((c) => c ?? 8);
      setControls(true);
    };
    const onError = async () => {
      if (hlsRef.current) return; // hls.js reports its own errors
      const fallback = mp4Sources.find((s) => !attemptedSources.current.has(s.url));
      if (fallback) {
        seekAfterLoad.current = el.currentTime || seekAfterLoad.current;
        setQuality(fallback.url);
        attachMp4(fallback);
        return;
      }
      const code = el.error?.code;
      setError(code === 4 ? 'This video format isn’t supported by your browser.' : 'We couldn’t load this stream.');
      setWaiting(false);
      // Native media errors hide HTTP details. Retrieve just one byte to expose
      // useful provider messages (plan access, quota, expired source).
      try {
        const response = await fetch(el.currentSrc || el.src, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
          const data = await response.json();
          if (active && data.error?.message) setError(data.error.message);
        } else await response.body?.cancel();
      } catch { /* Keep the native error when diagnostics are unavailable. */ }
    };
    const onDuration = () => setDuration(el.duration || 0);

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('progress', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    el.addEventListener('durationchange', onDuration);
    return () => {
      active = false;
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('progress', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      el.removeEventListener('durationchange', onDuration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the final position when leaving the page or closing the tab.
  useEffect(() => {
    const el = video.current;
    const save = () => el && el.duration && el.currentTime > 1 && onProgress(el.currentTime, el.duration, { final: true });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [onProgress]);

  // Subtitle tracks: show the selected one, disable the rest.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const apply = () => {
      for (const track of Array.from(el.textTracks)) track.mode = subtitle && track.language === subtitle ? 'showing' : 'disabled';
    };
    apply();
    el.textTracks.addEventListener('addtrack', apply);
    return () => el.textTracks.removeEventListener('addtrack', apply);
  }, [subtitle]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Resume banner auto-dismiss.
  useEffect(() => {
    if (resumeBanner === null) return;
    const t = window.setTimeout(() => setResumeBanner(null), 7000);
    return () => window.clearTimeout(t);
  }, [resumeBanner]);

  // Up-next: show the card in the last 20 s, count down after the episode ends.
  useEffect(() => {
    if (!playback.next || !duration) return;
    if (duration - time < 20 && duration > 120 && nextCountdown === null && playing) setNextCountdown(15);
  }, [time, duration, playback.next, nextCountdown, playing]);
  useEffect(() => {
    if (nextCountdown === null) return;
    if (nextCountdown <= 0) {
      onNext?.();
      return;
    }
    const t = window.setTimeout(() => setNextCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [nextCountdown, onNext]);

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------
  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!video.current?.paused) setControls(false);
    }, HIDE_AFTER);
  }, []);
  useEffect(() => {
    if (!playing || menu) {
      setControls(true);
      window.clearTimeout(hideTimer.current);
    } else poke();
  }, [playing, menu, poke]);

  const showFlash = useCallback((f: 'play' | 'pause' | 'back' | 'fwd') => {
    setFlash(f);
    window.setTimeout(() => setFlash(null), 450);
  }, []);

  const togglePlay = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      showFlash('play');
    } else {
      el.pause();
      showFlash('pause');
    }
  }, [showFlash]);

  const seekBy = useCallback((delta: number) => {
    const el = video.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + delta), el.duration - 0.5);
    showFlash(delta < 0 ? 'back' : 'fwd');
    poke();
  }, [poke, showFlash]);

  const setVolume = useCallback(
    (v: number) => {
      const el = video.current;
      if (!el) return;
      const vol = Math.min(1, Math.max(0, v));
      el.volume = vol;
      el.muted = vol === 0;
      setPrefs((p) => ({ ...p, volume: vol, muted: vol === 0 }));
    },
    [setPrefs]
  );
  const toggleMute = useCallback(() => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted && el.volume === 0) el.volume = 0.6;
    setPrefs((p) => ({ ...p, muted: el.muted, volume: el.volume }));
  }, [setPrefs]);

  const toggleFullscreen = useCallback(() => {
    const el = container.current;
    const v = video.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    else v?.webkitEnterFullscreen?.();
  }, []);

  const togglePip = async () => {
    const v = video.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* not supported */
    }
  };

  const chooseQuality = (q: QualityOption) => {
    const el = video.current;
    if (!el) return;
    setQuality(q.id);
    if (q.level !== undefined && hlsRef.current) {
      hlsRef.current.currentLevel = q.level;
    } else if (q.source) {
      seekAfterLoad.current = el.currentTime;
      resumeAfterLoad.current = !el.paused;
      attachMp4(q.source);
      setPrefs((p) => ({ ...p, quality: q.label }));
    } else if (q.id === 'auto' && hlsSource && !hlsRef.current) {
      seekAfterLoad.current = el.currentTime;
      resumeAfterLoad.current = !el.paused;
      el.src = hlsSource.url;
    }
    setMenu(null);
  };

  const chooseSubtitle = (lang: string) => {
    setSubtitle(lang);
    setPrefs((p) => ({ ...p, subtitle: lang }));
    setMenu(null);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = video.current;
      if (!el) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') togglePlay();
      else if (k === 'arrowleft') seekBy(-5);
      else if (k === 'arrowright') seekBy(5);
      else if (k === 'j') seekBy(-10);
      else if (k === 'l') seekBy(10);
      else if (k === 'arrowup') setVolume(el.volume + 0.1);
      else if (k === 'arrowdown') setVolume(el.volume - 0.1);
      else if (k === 'm') toggleMute();
      else if (k === 'f') toggleFullscreen();
      else if (k === 'c' && playback.subtitles.length) chooseSubtitle(subtitle ? '' : prefs.subtitle || playback.subtitles[0].lang);
      else if (k === 'n' && playback.next) onNext?.();
      else if (k === 'escape' && menu) setMenu(null);
      else return;
      e.preventDefault();
      poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, seekBy, setVolume, toggleMute, toggleFullscreen, subtitle, menu, playback, onNext, poke]);

  // Timeline scrubbing with pointer capture.
  const timeline = useRef<HTMLDivElement>(null);
  const timeAt = (clientX: number) => {
    const r = timeline.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { x: f * r.width, t: f * (duration || 0) };
  };
  const dragging = useRef(false);

  // Double-tap seeking on touch screens.
  const lastTap = useRef<{ t: number; x: number }>({ t: 0, x: 0 });
  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (menu) return setMenu(null);
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (!isTouch) return togglePlay();
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (now - lastTap.current.t < 300 && Math.abs(x - lastTap.current.x) < 80) {
      seekBy(x < rect.width / 2 ? -10 : 10);
      lastTap.current = { t: 0, x: 0 };
    } else {
      lastTap.current = { t: now, x };
      if (controls) setControls(false);
      else poke();
    }
  };

  const progress = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const currentQuality = qualities.find((q) => q.id === quality);
  const qualityLabel = currentQuality ? (currentQuality.id === 'auto' && autoLevelLabel ? `Auto (${autoLevelLabel})` : currentQuality.label) : '';
  const VolIcon = prefs.muted || prefs.volume === 0 ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={container}
      className={cn('fixed inset-0 z-50 select-none overflow-hidden bg-black', !controls && playing && 'cursor-none')}
      style={{ ['--cue-size' as string]: CUE_SIZES[prefs.cueSize] }}
      onMouseMove={poke}
      onTouchStart={() => !controls && poke()}
    >
      <video ref={video} className="absolute inset-0 h-full w-full" playsInline preload="auto" poster={undefined}>
        {playback.subtitles.map((s) => (
          <track key={s.id} kind="subtitles" src={s.src} srcLang={s.lang} label={s.label} />
        ))}
      </video>

      {/* Click / tap surface */}
      <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={(e) => !window.matchMedia('(hover: none)').matches && (e.preventDefault(), toggleFullscreen())} />

      {/* Buffering */}
      {waiting && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-4"><Spinner className="h-14 w-14 border-[3px]" /><p className="text-sm text-ink-200">{duration ? 'Buffering…' : 'Preparing your stream from AnimeDoc…'}</p></div>
        </div>
      )}

      {/* Center flash feedback */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash}
            initial={{ opacity: 0.9, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className={cn('pointer-events-none absolute top-1/2 grid h-20 w-20 -translate-y-1/2 place-items-center rounded-full bg-black/50', flash === 'back' ? 'left-[20%]' : flash === 'fwd' ? 'right-[20%]' : 'left-1/2 -translate-x-1/2')}
          >
            {flash === 'play' && <Play size={34} className="ml-1 fill-white" />}
            {flash === 'pause' && <Pause size={34} className="fill-white" />}
            {flash === 'back' && <RotateCcw size={30} />}
            {flash === 'fwd' && <RotateCw size={30} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center">
          <div className="max-w-sm">
            <p className="font-display text-xl font-bold">Playback problem</p>
            <p className="mt-2 text-sm text-ink-200">{error}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  setError(null);
                  setWaiting(true);
                  attemptedSources.current.clear();
                  if (onRetry) { onRetry(); return; }
                  const q = qualities.find((x) => x.id === quality) ?? qualities[0];
                  if (q?.source) {
                    seekAfterLoad.current = time;
                    attachMp4(q.source);
                  } else hlsRef.current?.startLoad();
                }}
                className="btn btn-light btn-md"
              >
                <RotateCcw size={16} /> Retry
              </button>
              {qualities.filter((q) => q.source && q.id !== quality).slice(0, 1).map((q) => (
                <button key={q.id} onClick={() => chooseQuality(q)} className="btn btn-glass btn-md">
                  Try {q.label}
                </button>
              ))}
              <button onClick={onBack} className="btn btn-ghost btn-md">
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={cn('absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-16 pt-4 transition-opacity duration-300 sm:px-6', controls ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <button onClick={onBack} className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/10" aria-label="Back">
          <ArrowLeft size={24} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold sm:text-lg">{playback.title.title}</p>
          {label && <p className="truncate text-xs text-ink-200 sm:text-sm">{label}</p>}
        </div>
      </div>

      {/* Resume banner */}
      <AnimatePresence>
        {resumeBanner !== null && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-ink-900/90 py-2 pl-4 pr-2 text-sm shadow-pop backdrop-blur">
            Resumed from {timecode(resumeBanner)}
            <button
              onClick={() => {
                if (video.current) video.current.currentTime = 0;
                setResumeBanner(null);
              }}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
            >
              Start over
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Up next */}
      <AnimatePresence>
        {nextCountdown !== null && playback.next && (
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            className="absolute bottom-28 right-4 z-20 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-pop backdrop-blur sm:right-8"
          >
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-300">Next episode in {nextCountdown}s</p>
              <p className="mt-1 font-semibold">
                S{playback.next.season}:E{playback.next.number} · {playback.next.name}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onNext?.()} className="btn btn-light btn-sm flex-1">
                  <Play size={15} className="fill-current" /> Play now
                </button>
                <button onClick={() => setNextCountdown(null)} className="btn btn-glass btn-sm">
                  Cancel
                </button>
              </div>
            </div>
            <div className="h-1 bg-white/10">
              <div className="h-full bg-brand-500 transition-[width] duration-1000 ease-linear" style={{ width: `${(nextCountdown / 15) * 100}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <div className={cn('absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-4 pt-20 transition-opacity duration-300 sm:px-6 sm:pb-5', controls ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        {/* Timeline */}
        <div
          ref={timeline}
          className="group/tl relative mb-3 flex h-5 cursor-pointer items-center"
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${timecode(time)} of ${timecode(duration)}`}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = timeAt(e.clientX);
            setScrub(p);
          }}
          onPointerMove={(e) => {
            const p = timeAt(e.clientX);
            setScrub(p);
          }}
          onPointerUp={(e) => {
            if (dragging.current && video.current) video.current.currentTime = timeAt(e.clientX).t;
            dragging.current = false;
            setScrub(null);
          }}
          onPointerLeave={() => !dragging.current && setScrub(null)}
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] group-hover/tl:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-brand-500" style={{ width: `${dragging.current && scrub ? (scrub.t / (duration || 1)) * 100 : progress}%` }} />
          </div>
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 scale-0 rounded-full bg-brand-500 shadow transition-transform group-hover/tl:scale-100"
            style={{ left: `${dragging.current && scrub ? (scrub.t / (duration || 1)) * 100 : progress}%` }}
          />
          {scrub && (
            <div className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-xs font-semibold tabular-nums shadow" style={{ left: scrub.x }}>
              {timecode(scrub.t)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <CtrlButton label={playing ? 'Pause (k)' : 'Play (k)'} onClick={togglePlay}>
            {playing ? <Pause size={26} className="fill-white" /> : <Play size={26} className="ml-0.5 fill-white" />}
          </CtrlButton>
          <CtrlButton label="Back 10 seconds (j)" onClick={() => seekBy(-10)}>
            <RotateCcw size={22} />
          </CtrlButton>
          <CtrlButton label="Forward 10 seconds (l)" onClick={() => seekBy(10)}>
            <RotateCw size={22} />
          </CtrlButton>
          <div className="group/vol flex items-center">
            <CtrlButton label={prefs.muted ? 'Unmute (m)' : 'Mute (m)'} onClick={toggleMute}>
              <VolIcon size={23} />
            </CtrlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={prefs.muted ? 0 : prefs.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="bb-range hidden w-0 opacity-0 transition-all duration-300 group-hover/vol:w-24 group-hover/vol:opacity-100 sm:block"
              style={{ ['--fill' as string]: `${(prefs.muted ? 0 : prefs.volume) * 100}%` }}
              aria-label="Volume"
            />
          </div>
          <span className="ml-1 text-xs font-medium tabular-nums text-ink-100 sm:text-sm">
            {timecode(time)} <span className="text-ink-400">/ {timecode(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {playback.next && (
              <CtrlButton label="Next episode (n)" onClick={() => onNext?.()}>
                <SkipForward size={23} />
              </CtrlButton>
            )}
            {playback.subtitles.length > 0 && (
              <CtrlButton label="Subtitles (c)" onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')} active={!!subtitle}>
                <Captions size={24} />
              </CtrlButton>
            )}
            <CtrlButton label="Settings" onClick={() => setMenu(menu === 'settings' ? null : 'settings')} active={menu === 'settings'}>
              <Settings size={22} className={cn('transition-transform duration-300', menu === 'settings' && 'rotate-45')} />
            </CtrlButton>
            {'pictureInPictureEnabled' in document && (
              <CtrlButton label="Picture in picture" onClick={togglePip} className="hidden sm:grid">
                <PictureInPicture2 size={22} />
              </CtrlButton>
            )}
            <CtrlButton label={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={23} /> : <Maximize size={23} />}
            </CtrlButton>
          </div>
        </div>
      </div>

      {/* Menus */}
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-24 right-4 z-30 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 text-sm shadow-pop backdrop-blur-xl sm:right-6"
            onClick={(e) => e.stopPropagation()}
          >
            {menu === 'subtitles' ? (
              <SubtitleMenu
                tracks={playback.subtitles}
                value={subtitle}
                onChange={chooseSubtitle}
                size={prefs.cueSize}
                onSize={(s) => setPrefs((p) => ({ ...p, cueSize: s }))}
              />
            ) : (
              <SettingsMenu qualities={qualities} quality={quality} qualityLabel={qualityLabel} onQuality={chooseQuality} speed={speed} onSpeed={(s) => (setSpeed(s), setMenu(null))} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CtrlButton({ label, onClick, children, active, className }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn('grid h-11 w-11 place-items-center rounded-full text-white transition hover:scale-110 hover:bg-white/10', active && 'text-brand-400', className)}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function SettingsMenu({
  qualities,
  quality,
  qualityLabel,
  onQuality,
  speed,
  onSpeed,
}: {
  qualities: QualityOption[];
  quality: string;
  qualityLabel: string;
  onQuality: (q: QualityOption) => void;
  speed: number;
  onSpeed: (s: number) => void;
}) {
  const [page, setPage] = useState<'root' | 'quality' | 'speed'>('root');
  if (page === 'quality')
    return (
      <MenuList title="Quality" onBack={() => setPage('root')}>
        {qualities.map((q) => (
          <MenuItem key={q.id} selected={q.id === quality} onClick={() => onQuality(q)}>
            {q.id === 'auto' ? qualityLabel.startsWith('Auto') ? qualityLabel : 'Auto' : q.label}
            {/^(720|1080)/.test(q.label) && <span className="ml-2 rounded bg-white/10 px-1 text-[10px] font-bold">HD</span>}
          </MenuItem>
        ))}
      </MenuList>
    );
  if (page === 'speed')
    return (
      <MenuList title="Playback speed" onBack={() => setPage('root')}>
        {SPEEDS.map((s) => (
          <MenuItem key={s} selected={s === speed} onClick={() => onSpeed(s)}>
            {s === 1 ? 'Normal' : `${s}×`}
          </MenuItem>
        ))}
      </MenuList>
    );
  return (
    <div className="py-2">
      <button onClick={() => setPage('quality')} className="flex w-full items-center gap-3 px-4 py-3 hover:bg-white/5" disabled={qualities.length < 2}>
        <Settings size={17} className="text-ink-300" />
        Quality
        <span className="ml-auto text-ink-300">{qualityLabel}</span>
        {qualities.length > 1 && <ChevronRight size={16} className="text-ink-400" />}
      </button>
      <button onClick={() => setPage('speed')} className="flex w-full items-center gap-3 px-4 py-3 hover:bg-white/5">
        <Gauge size={17} className="text-ink-300" />
        Speed
        <span className="ml-auto text-ink-300">{speed === 1 ? 'Normal' : `${speed}×`}</span>
        <ChevronRight size={16} className="text-ink-400" />
      </button>
    </div>
  );
}

function SubtitleMenu({
  tracks,
  value,
  onChange,
  size,
  onSize,
}: {
  tracks: Playback['subtitles'];
  value: string;
  onChange: (lang: string) => void;
  size: keyof typeof CUE_SIZES;
  onSize: (s: keyof typeof CUE_SIZES) => void;
}) {
  return (
    <div>
      <MenuList title="Subtitles">
        <MenuItem selected={!value} onClick={() => onChange('')}>
          Off
        </MenuItem>
        {tracks.map((t) => (
          <MenuItem key={t.id} selected={value === t.lang} onClick={() => onChange(t.lang)}>
            {t.label}
          </MenuItem>
        ))}
      </MenuList>
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
        <span className="text-ink-300">Text size</span>
        <div className="flex gap-1">
          {(Object.keys(CUE_SIZES) as (keyof typeof CUE_SIZES)[]).map((s) => (
            <button key={s} onClick={() => onSize(s)} className={cn('h-8 w-8 rounded-lg text-xs font-bold', s === size ? 'bg-white text-ink-950' : 'bg-white/10 hover:bg-white/20')}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuList({ title, onBack, children }: { title: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        {onBack && (
          <button onClick={onBack} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" aria-label="Back">
            <ChevronLeft size={17} />
          </button>
        )}
        <span className={cn('font-semibold', !onBack && 'pl-1')}>{title}</span>
      </div>
      <div className="thin-scrollbar max-h-64 overflow-y-auto py-1">{children}</div>
    </div>
  );
}

function MenuItem({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5', selected && 'font-semibold text-white')}>
      <span className="grid w-4 place-items-center">{selected && <Check size={15} className="text-brand-400" />}</span>
      <span className="flex items-center">{children}</span>
    </button>
  );
}
