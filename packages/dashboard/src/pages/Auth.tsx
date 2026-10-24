import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Field, Nebula } from '../components/ui';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const hashParams = () => new URLSearchParams(location.hash.split('?')[1] ?? '');
const resetToken = () => hashParams().get('token') ?? '';

export function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>(location.hash.startsWith('#/reset') ? 'reset' : location.hash.includes('register') ? 'register' : 'login');
  const [sent, setSent] = useState(false);
  // The website's "Start free" form hands over name, e-mail and company in the hash.
  const [form, setForm] = useState(() => {
    const q = hashParams();
    return { name: q.get('name') ?? '', company: q.get('company') ?? '', email: q.get('email') ?? '', password: '' };
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setSent(false);
    if (location.hash.startsWith('#/reset')) location.hash = '#/';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot', { body: { email: form.email } });
        setSent(true);
        return;
      }
      if (mode === 'reset') await api('/auth/reset', { body: { token: resetToken(), password: form.password } });
      else await api(`/auth/${mode}`, { body: form });
      location.hash = mode === 'login' ? location.hash : '#/';
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div style={{ textAlign: 'center' }}>
          <Nebula className="mark" />
          <div>
            <h1>{TITLES[mode][0]}</h1>
            <p className="muted small">{TITLES[mode][1]}</p>
          </div>
        </div>
        {mode === 'register' && (
          <div className="grid-2">
            <Field label="Your name">
              <input className="input" value={form.name} onChange={set('name')} required autoComplete="name" />
            </Field>
            <Field label="Company">
              <input className="input" value={form.company} onChange={set('company')} autoComplete="organization" />
            </Field>
          </div>
        )}
        {sent ? (
          <div className="notice notice-accent">If an account exists for {form.email}, a link to choose a new password is on its way. It works for one hour.</div>
        ) : (
          <>
            {mode !== 'reset' && (
              <Field label="E-mail">
                <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
              </Field>
            )}
            {mode !== 'forgot' && (
              <Field
                label={mode === 'reset' ? 'New password' : 'Password'}
                hint={mode === 'login' ? undefined : 'At least 8 characters'}
                action={
                  mode === 'login' && (
                    <a href="#" className="small" onClick={(e) => { e.preventDefault(); go('forgot'); }}>
                      Forgot password?
                    </a>
                  )
                }
              >
                <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={mode === 'login' ? undefined : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </Field>
            )}
            {error && <div className="notice notice-danger">{error}</div>}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'One moment…' : TITLES[mode][2]}
            </button>
          </>
        )}
        <p className="muted small" style={{ textAlign: 'center' }}>
          {mode === 'login' ? 'New to Lumora? ' : mode === 'register' ? 'Already have an account? ' : ''}
          <a href="#" onClick={(e) => { e.preventDefault(); go(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'Create an account' : mode === 'register' ? 'Sign in' : 'Back to sign in'}
          </a>
        </p>
      </form>
    </div>
  );
}

const TITLES: Record<Mode, [string, string, string]> = {
  login: ['Welcome back', 'Sign in to Lumora', 'Sign in'],
  register: ['Start your free trial', '14 days of Pro, no card required', 'Create account'],
  forgot: ['Reset your password', 'We’ll e-mail you a link to choose a new one', 'Send the link'],
  reset: ['Choose a new password', 'Then you’re straight back in', 'Save and sign in'],
};
