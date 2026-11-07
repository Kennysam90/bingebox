import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/format';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, className, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={fid} className="label">
        {label}
      </label>
      <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className={cn('input', error && 'border-brand-500/70')} {...rest} />
      {error ? (
        <p id={`${fid}-err`} className="mt-1.5 flex items-center gap-1 text-xs text-brand-300">
          <AlertCircle size={12} /> {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
});

export function PasswordField({ label, error, showStrength, ...rest }: FieldProps & { showStrength?: boolean }) {
  const [show, setShow] = useState(false);
  const id = useId();
  const value = String(rest.value ?? '');
  const score = strength(value);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} aria-invalid={!!error} className={cn('input pr-12', error && 'border-brand-500/70')} {...rest} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-300 hover:text-white" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {showStrength && value && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? ['bg-brand-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'][score - 1] : 'bg-white/10')} />
            ))}
          </div>
          <span className="w-14 text-right text-[11px] text-ink-300">{['Too weak', 'Weak', 'Good', 'Strong', 'Excellent'][score]}</span>
        </div>
      )}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-brand-300">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) s = Math.min(s, 1);
  return Math.min(4, s);
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
      <AlertCircle size={17} className="mt-0.5 shrink-0 text-brand-400" />
      {message}
    </div>
  );
}

export function SubmitButton({ loading, children, className }: { loading?: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="submit" disabled={loading} className={cn('btn btn-primary btn-lg w-full', className)}>
      {loading ? <span className="h-5 w-5 animate-spin-slow rounded-full border-2 border-white/30 border-t-white" /> : children}
    </button>
  );
}

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-full max-w-[440px]">
      <div className="rounded-3xl border border-white/[0.08] bg-ink-900/80 p-7 shadow-pop backdrop-blur-2xl sm:p-10">
        <h1 className="font-display text-[1.9rem] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-ink-300">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-ink-300">{footer}</div>}
    </div>
  );
}
