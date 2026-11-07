import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; action?: Toast['action']; duration?: number }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'info', action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.duration ?? 3800);
    },
    [dismiss]
  );
  const value = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, { tone: 'success' }), error: (m) => show(m, { tone: 'error', duration: 5500 }) }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-8" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/95 py-3 pl-4 pr-2 text-sm text-white shadow-pop backdrop-blur-xl"
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              {t.tone === 'success' ? (
                <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
              ) : t.tone === 'error' ? (
                <AlertCircle size={18} className="shrink-0 text-brand-400" />
              ) : (
                <Info size={18} className="shrink-0 text-ink-200" />
              )}
              <span className="leading-snug">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="ml-1 rounded-full px-3 py-1 text-xs font-semibold text-brand-300 hover:bg-white/5"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} className="grid h-7 w-7 place-items-center rounded-full text-ink-300 hover:bg-white/5 hover:text-white" aria-label="Dismiss">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
