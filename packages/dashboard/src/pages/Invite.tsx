import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Field, Nebula } from '../components/ui';

interface InviteInfo {
  email: string;
  organization: string;
  invitedBy: string | null;
  role: string;
}

/** #/invite/<token>: someone was invited to an organization; they choose a name and password and they're in. */
export function InvitePage({ onDone }: { onDone: () => void }) {
  const token = decodeURIComponent(location.hash.slice('#/invite/'.length).split('?')[0]);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', password: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InviteInfo>(`/invites/${encodeURIComponent(token)}`).then(setInfo, (e) => setError(e.message));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/invites/${encodeURIComponent(token)}/accept`, { body: form });
      location.hash = '#/';
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!info) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card stack" style={{ textAlign: 'center' }}>
          <Nebula className="mark" />
          {error ? (
            <>
              <h1>This link doesn’t work anymore</h1>
              <p className="muted">{error}</p>
              <a className="btn" href="#/" onClick={() => setTimeout(onDone)} style={{ textDecoration: 'none' }}>
                Go to sign in
              </a>
            </>
          ) : (
            <p className="muted">Checking your invitation…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div style={{ textAlign: 'center' }}>
          <Nebula className="mark" />
          <div>
            <h1>Join {info.organization}</h1>
            <p className="muted small">
              {info.invitedBy ? `${info.invitedBy} invited you` : 'You were invited'} to see and triage {info.organization}’s bug reports on Lumora{info.role === 'admin' ? ', as an admin' : ''}.
            </p>
          </div>
        </div>
        <Field label="E-mail">
          <input className="input" value={info.email} disabled readOnly />
        </Field>
        <Field label="Your name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus autoComplete="name" />
        </Field>
        <Field label="Choose a password" hint="At least 8 characters">
          <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" />
        </Field>
        {error && <div className="notice notice-danger">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'One moment…' : `Join ${info.organization}`}
        </button>
      </form>
    </div>
  );
}
