import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthCard, Field, FormError, SubmitButton } from '../../components/ui/Form';
import { useDocumentTitle } from '../../hooks/misc';
import { api, ApiError } from '../../lib/api';

export default function ForgotPassword() {
  useDocumentTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ devResetLink?: string }>('/auth/forgot-password', { email });
      setSent({ devLink: res.devResetLink });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent)
    return (
      <AuthCard title="Check your inbox" footer={<Link to="/login" className="font-semibold text-white hover:underline">Back to sign in</Link>}>
        <div className="flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
            <MailCheck size={26} />
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-200">
            If <span className="font-semibold text-white">{email}</span> has a BingeBox account, we’ve sent a link to reset the password. It expires in 1 hour.
          </p>
          {sent.devLink && (
            <div className="mt-6 w-full rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-left text-xs text-ink-300">
              <p className="font-semibold text-ink-100">Development mode</p>
              <p className="mt-1">Email delivery isn’t configured yet, so here’s the link directly:</p>
              <a href={sent.devLink} className="mt-2 block break-all font-medium text-brand-300 hover:text-brand-200">
                {sent.devLink}
              </a>
            </div>
          )}
        </div>
      </AuthCard>
    );

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we’ll send you a link to choose a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-white hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <FormError message={error} />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>
    </AuthCard>
  );
}
