import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard, Field, FormError, PasswordField, SubmitButton } from '../../components/ui/Form';
import { useDocumentTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { safeNext } from '../../lib/format';

export default function Login() {
  useDocumentTitle('Sign in');
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user && !loading) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { chooseProfile } = await login(email, password);
      navigate(chooseProfile ? `/profiles?next=${encodeURIComponent(next)}` : next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to pick up right where you left off."
      footer={
        <>
          New to BingeBox?{' '}
          <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-white hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        <div>
          <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" className="text-[13px] text-ink-300 hover:text-white">
              Forgot password?
            </Link>
          </div>
        </div>
        <SubmitButton loading={loading}>Sign In</SubmitButton>
      </form>
    </AuthCard>
  );
}
