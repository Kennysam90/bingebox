import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard, Field, FormError, PasswordField, SubmitButton } from '../../components/ui/Form';
import { useDocumentTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';
import { safeNext } from '../../lib/format';

const PERKS = ['Unlimited streaming, no ads', 'Up to 5 profiles, including Kids', 'Resume anywhere, on any device'];

export default function Signup() {
  useDocumentTitle('Create your account');
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user && !loading) return <Navigate to={next} replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email address.';
    if (form.password.length < 8) local.password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) local.password = 'Include at least one letter and one number.';
    setErrors(local);
    if (Object.keys(local).length) return;
    setError(null);
    setLoading(true);
    try {
      await signup(form.name.trim(), form.email, form.password);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        setError(err.message);
      } else setError('Sign up failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Start watching free"
      subtitle={
        <span className="mt-1 flex flex-col gap-1.5">
          {PERKS.map((p) => (
            <span key={p} className="flex items-center gap-2 text-sm">
              <Check size={15} className="text-brand-400" /> {p}
            </span>
          ))}
        </span>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-white hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={error} />
        <Field label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} placeholder="Your name" autoFocus />
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
        <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} showStrength />
        <SubmitButton loading={loading}>Create Account</SubmitButton>
        <p className="text-center text-xs leading-relaxed text-ink-400">By creating an account you agree to BingeBox’s Terms of Use and Privacy Policy.</p>
      </form>
    </AuthCard>
  );
}
