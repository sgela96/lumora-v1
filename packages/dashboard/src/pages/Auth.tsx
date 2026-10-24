import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Field } from '../components/ui';

export function AuthPage({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(location.hash.includes('register') ? 'register' : 'login');
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/auth/${mode}`, { body: form });
      location.hash = mode === 'register' ? '#/' : location.hash;
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
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-sun" />
          <div>
            <h1>{mode === 'login' ? 'Welcome back' : 'Start your free trial'}</h1>
            <p className="muted small">{mode === 'login' ? 'Sign in to Lumora' : '14 days of Pro, no card required'}</p>
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
        <Field label="E-mail">
          <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
          <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </Field>
        {error && <div className="notice notice-danger">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <p className="muted small" style={{ textAlign: 'center' }}>
          {mode === 'login' ? 'New to Lumora? ' : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </a>
        </p>
      </form>
    </div>
  );
}
