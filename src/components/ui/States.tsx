import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/format';

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block h-6 w-6 animate-spin-slow rounded-full border-2 border-white/15 border-t-brand-500', className)} role="status" aria-label="Loading" />
  );
}

export function FullPageLoader() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <Spinner className="h-10 w-10 border-[3px]" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-ink-800', className)}>
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export function RowSkeleton({ poster = false }: { poster?: boolean }) {
  return (
    <div className="page-x py-4">
      <Skeleton className="mb-4 h-6 w-48 rounded-lg" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className={cn('shrink-0', poster ? 'aspect-[2/3] w-[42vw] sm:w-[200px]' : 'aspect-video w-[72vw] sm:w-[300px]')} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: { title?: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center', className)}>
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
        <AlertTriangle size={26} />
      </div>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {message && <p className="mt-2 text-sm leading-relaxed text-ink-300">{message}</p>}
      {onRetry && (
        <button onClick={onRetry} className="btn btn-glass btn-md mt-6">
          <RefreshCw size={16} /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      {icon && <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-ink-850 text-ink-200">{icon}</div>}
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {message && <p className="mt-2 text-sm leading-relaxed text-ink-300">{message}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
