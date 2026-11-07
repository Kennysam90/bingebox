import { Check, Copy, ExternalLink, KeyRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * First-visit popup asking the site owner to connect their own AnimeDoc API key.
 * "Don't show again" is remembered in this browser; "Remind me later" hides it for this tab session.
 * To remove the popup entirely, delete <ApiKeyNotice /> from Layouts.tsx.
 */
const DISMISS_KEY = 'bingebox:animedoc-key-notice-dismissed';
const SNOOZE_KEY = 'bingebox:animedoc-key-notice-snoozed';
const ENV_LINE = 'ANIMEDOC_API_KEY=ad_live_your_key';

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(storage: () => Storage, key: string) {
  try {
    storage().setItem(key, '1');
  } catch {
    // Storage can be blocked (private mode); the popup just shows again next time.
  }
}

export function ApiKeyNotice() {
  const [open, setOpen] = useState(() => !read(() => localStorage, DISMISS_KEY) && !read(() => sessionStorage, SNOOZE_KEY));
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const snooze = () => {
    write(() => sessionStorage, SNOOZE_KEY);
    setOpen(false);
  };
  const dismiss = () => {
    write(() => localStorage, DISMISS_KEY);
    setOpen(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ENV_LINE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; the line is still visible to copy by hand.
    }
  };

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && snooze();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/75 backdrop-blur-sm" onClick={snooze} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apikey-title"
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-xl animate-scale-in overflow-y-auto rounded-2xl border border-white/10 bg-ink-850 shadow-pop focus:outline-none"
      >
        <button type="button" onClick={snooze} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-ink-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={18} />
        </button>

        <div className="p-6 sm:p-8">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-gradient shadow-glow">
            <KeyRound size={22} className="text-white" />
          </div>
          <p className="eyebrow">Setup required</p>
          <h2 id="apikey-title" className="mt-1.5 font-display text-2xl font-bold text-white">Connect your own AnimeDoc API key</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-200">
            BingeBox gets its movies and series from AnimeDoc. This site is currently running on the developer’s test key. Add your own key so streaming
            keeps working and the usage is billed to your account.
          </p>

          <ol className="mt-6 space-y-4">
            <Step n={1} title="Create an AnimeDoc account">
              Go to{' '}
              <a href="https://www.animedoc.cloud/" target="_blank" rel="noreferrer" className="font-medium text-brand-400 hover:underline">
                animedoc.cloud
              </a>{' '}
              and click <b className="text-white">Sign up free</b> (or <b className="text-white">Sign in</b> in the top bar). No credit card needed.
            </Step>
            <Step n={2} title="Generate your key on the Pricing page">
              Open{' '}
              <a href="https://www.animedoc.cloud/pricing" target="_blank" rel="noreferrer" className="font-medium text-brand-400 hover:underline">
                animedoc.cloud/pricing
              </a>{' '}
              and click <b className="text-white">Get free key</b>. Your key starts with <code className="rounded bg-white/10 px-1 py-0.5 text-[13px] text-white">ad_live_</code>.
            </Step>
            <Step n={3} title="Pick a plan that includes streaming">
              The free plan only covers search and title details, so movies won’t play with it. Video playback needs the <b className="text-white">stream proxy</b>,
              included in <b className="text-white">Starter</b>, <b className="text-white">Pro</b> (the plan AnimeDoc lists for commercial use) and the low-cost{' '}
              <b className="text-white">3-Day Pass</b> for testing. Plans are one-time payments and don’t auto-renew.
            </Step>
            <Step n={4} title="Add the key to the website">
              Open <code className="rounded bg-white/10 px-1 py-0.5 text-[13px] text-white">server/.env</code>, set this line with your key, then restart the server.
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-ink-950 py-1.5 pl-3 pr-1.5">
                <code className="min-w-0 flex-1 truncate text-[13px] text-white">{ENV_LINE}</code>
                <button type="button" onClick={copy} className="btn btn-sm btn-ghost h-8 px-2.5" aria-label="Copy line">
                  {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                  <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <span className="mt-1.5 block text-[13px] text-ink-300">Keep the key private and only on the server. Never paste it into the website’s frontend code.</span>
            </Step>
          </ol>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <a href="https://www.animedoc.cloud/pricing" target="_blank" rel="noreferrer" className="btn btn-md btn-primary">
              Get my API key <ExternalLink size={16} />
            </a>
            <button type="button" onClick={dismiss} className="btn btn-md btn-glass">
              I’ve added my key
            </button>
            <button type="button" onClick={snooze} className="btn btn-md btn-ghost">
              Remind me later
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-400">
            Help:{' '}
            <a href="https://www.animedoc.cloud/docs/getting-started" target="_blank" rel="noreferrer" className="hover:text-ink-200 hover:underline">
              AnimeDoc getting-started guide
            </a>{' '}
            ·{' '}
            <a href="mailto:support@animedoc.cloud" className="hover:text-ink-200 hover:underline">
              support@animedoc.cloud
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand-500/40 bg-brand-500/10 text-[13px] font-bold text-brand-300">{n}</span>
      <div className="min-w-0 text-sm leading-relaxed text-ink-200">
        <p className="mb-0.5 font-semibold text-white">{title}</p>
        {children}
      </div>
    </li>
  );
}
