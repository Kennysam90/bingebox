import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthCard, FormError, PasswordField, SubmitButton } from '../../components/ui/Form';
import { useDocumentTitle } from '../../hooks/misc';
import { api, ApiError } from '../../lib/api';

export default function ResetPassword() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Those passwords don’t match.');
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token)
    return (
      <AuthCard title="Invalid link" subtitle="This password reset link is missing its token." footer={<Link to="/forgot-password" className="font-semibold text-white hover:underline">Request a new link</Link>}>
        <span />
      </AuthCard>
    );

  if (done)
    return (
      <AuthCard title="Password updated">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 size={44} className="text-emerald-400" />
          <p className="mt-4 text-ink-200">Your password has been changed and you’ve been signed out of other devices.</p>
          <Link to="/login" className="btn btn-primary btn-lg mt-8 w-full">
            Sign in
          </Link>
        </div>
      </AuthCard>
    );

  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 8 characters with a letter and a number.">
      <form onSubmit={submit} className="space-y-5">
        <FormError message={error} />
        <PasswordField label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} showStrength autoFocus />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <SubmitButton loading={loading}>Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}
