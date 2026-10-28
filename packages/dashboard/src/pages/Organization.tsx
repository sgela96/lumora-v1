import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type Organization, type Role } from '../api';
import { Icons } from '../components/icons';
import { Avatar, Card, CopyButton, PageHead, timeAgo, useDismiss, useToast } from '../components/ui';
import { useApp } from '../state';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_HINT: Record<Role, string> = {
  owner: 'Manages people and roles, and sets the dashboard and report display for everyone.',
  admin: 'Invites and removes people.',
  member: 'Sees and triages every report.',
};

/** Who's in the organization, their role, pending invitations and seats. */
export function OrganizationPage() {
  const { refresh } = useApp();
  const toast = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string } | null>(null);

  useEffect(() => {
    api<Organization>('/org').then(
      (o) => {
        setOrg(o);
        setName(o.name);
      },
      (e) => setError(e.message),
    );
  }, []);

  const act = async (fn: () => Promise<Organization>, done?: string) => {
    try {
      setOrg(await fn());
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  if (error) return <div className="notice notice-danger">{error}</div>;
  if (!org) return <p className="muted">Loading…</p>;

  const full = org.seats.used >= org.seats.limit;
  const manage = org.you.canManage;
  const owner = org.you.role === 'owner';

  return (
    <div className="stack">
      <PageHead
        title="Organization"
        subtitle={`Everyone at ${org.name} sees the same reports, dashboard and settings.`}
        actions={
          manage && (
            <button className="btn btn-primary" onClick={() => setInviting(true)} disabled={full} title={full ? 'Every seat is in use' : undefined}>
              <Icons.plus size={15} /> Invite people
            </button>
          )
        }
      />

      <div className="org-top">
        <Card title="Details">
          <form
            className="org-name"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void act(async () => {
                const o = await api<Organization>('/org', { method: 'PATCH', body: { name } });
                await refresh();
                return o;
              }, 'Organization renamed');
            }}
          >
            <label className="label" htmlFor="org-name">
              Name
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="org-name" className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} maxLength={100} />
              {manage && name.trim() !== org.name && <button className="btn">Save</button>}
            </div>
            <span className="muted small">Created {new Date(org.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </form>
        </Card>
        <Card title="Seats">
          <div className="seats">
            <div className="seats-figure">
              <strong className="tnum">{org.seats.used}</strong>
              <span className="muted">of {org.seats.limit} used</span>
            </div>
            <div className="meter" aria-hidden>
              <span style={{ width: `${Math.min(100, (org.seats.used / org.seats.limit) * 100)}%` }} />
            </div>
            <span className="muted small">
              People and pending invitations both use a seat.{' '}
              {full && (
                <>
                  <a href="#/billing">Upgrade</a> to invite more people.
                </>
              )}
            </span>
          </div>
        </Card>
      </div>

      {lastLink && (
        <div className="notice spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span>
            {org.emailAvailable ? <>We e-mailed an invitation to <strong>{lastLink.email}</strong>. You can also share the link:</> : <>E-mail isn’t set up on this server, so share this link with <strong>{lastLink.email}</strong>:</>}
            <span className="mono small invite-link">{lastLink.link}</span>
          </span>
          <CopyButton text={lastLink.link} label="Copy link" />
        </div>
      )}

      <section className="card">
        <header className="card-head">
          <h2>People · {org.members.length}</h2>
        </header>
        <div style={{ overflowX: 'auto' }}>
          <table className="table org-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Last active</th>
                <th>Joined</th>
                {manage && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => {
                const you = m.id === org.you.id;
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                        <Avatar name={m.name} size={32} />
                        <div className="title-cell">
                          <span className="t">
                            {m.name} {you && <span className="badge">You</span>}
                          </span>
                          <span className="sub">{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {owner && !you ? (
                        <select
                          className="select select-sm"
                          aria-label={`Role of ${m.name}`}
                          value={m.role}
                          onChange={(e) => {
                            const role = e.target.value as Role;
                            if (role === 'owner' && !confirm(`Make ${m.name} the owner? You’ll become an admin.`)) return;
                            void act(async () => {
                              const o = await api<Organization>(`/org/members/${m.id}`, { method: 'PATCH', body: { role } });
                              if (role === 'owner') await refresh();
                              return o;
                            }, role === 'owner' ? `${m.name} is now the owner` : 'Role updated');
                          }}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      ) : (
                        <span className={`badge role-${m.role}`} title={ROLE_HINT[m.role]}>
                          {ROLE_LABEL[m.role]}
                        </span>
                      )}
                    </td>
                    <td className="muted small">{lastActive(m.lastSeenAt)}</td>
                    <td className="muted small">{timeAgo(m.joinedAt)}</td>
                    {manage && (
                      <td className="num">
                        {!you && m.role !== 'owner' && (owner || m.role === 'member') && (
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm"
                            aria-label={`Remove ${m.name}`}
                            title="Remove from the organization"
                            onClick={() => confirm(`Remove ${m.name}? They’ll be signed out and lose access right away.`) && act(() => api<Organization>(`/org/members/${m.id}`, { method: 'DELETE', body: {} }), `${m.name} was removed`)}
                          >
                            <Icons.x size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {org.invites.length > 0 && (
        <section className="card">
          <header className="card-head">
            <h2>Invitations · {org.invites.length}</h2>
          </header>
          <div style={{ overflowX: 'auto' }}>
            <table className="table org-table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Role</th>
                  <th>Sent</th>
                  {manage && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {org.invites.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                        <span className="invite-avatar" aria-hidden>
                          <Icons.mail size={15} />
                        </span>
                        <div className="title-cell">
                          <span className="t">{i.email}</span>
                          <span className="sub">{i.invitedBy ? `Invited by ${i.invitedBy}` : 'Invited'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge role-${i.role}`}>{ROLE_LABEL[i.role]}</span>
                    </td>
                    <td className="small">{i.expired ? <span className="badge badge-danger">Expired</span> : <span className="muted">{timeAgo(i.sentAt)}</span>}</td>
                    {manage && (
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={async () => {
                            try {
                              const r = await api<{ link: string; organization: Organization }>(`/org/invites/${i.id}/resend`, { body: {} });
                              setOrg(r.organization);
                              setLastLink({ email: i.email, link: r.link });
                              toast(org.emailAvailable ? `Sent again to ${i.email}` : 'New link ready to share');
                            } catch (e) {
                              toast(e instanceof Error ? e.message : String(e), true);
                            }
                          }}
                        >
                          {org.emailAvailable ? 'Resend' : 'New link'}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => act(() => api<Organization>(`/org/invites/${i.id}`, { method: 'DELETE', body: {} }), 'Invitation revoked')}>
                          Revoke
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Card title="Roles">
        <dl className="roles-legend">
          {(['owner', 'admin', 'member'] as Role[]).map((r) => (
            <div key={r}>
              <dt>
                <span className={`badge role-${r}`}>{ROLE_LABEL[r]}</span>
              </dt>
              <dd className="muted small">{ROLE_HINT[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {inviting && (
        <InviteDialog
          canInviteAdmins={owner}
          seatsLeft={org.seats.limit - org.seats.used}
          onClose={() => setInviting(false)}
          onInvited={(o, email, link) => {
            setOrg(o);
            setLastLink({ email, link });
            setInviting(false);
            toast(`Invitation sent to ${email}`);
          }}
        />
      )}
    </div>
  );
}

function InviteDialog({ canInviteAdmins, seatsLeft, onClose, onInvited }: { canInviteAdmins: boolean; seatsLeft: number; onClose: () => void; onInvited: (o: Organization, email: string, link: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useDismiss(true, onClose);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ link: string; organization: Organization }>('/org/invites', { body: { email, role } });
      onInvited(r.organization, email.trim().toLowerCase(), r.link);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'upgrade' ? `${err.message}` : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-scrim invite-scrim" role="dialog" aria-modal="true" aria-label="Invite people">
      <div className="card modal invite-modal" ref={ref}>
      <form className="stack" onSubmit={submit}>
        <div className="spread" style={{ alignItems: 'start' }}>
          <div>
            <h2>Invite people</h2>
            <p className="muted small">
              They’ll get an e-mail with a link to join. {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left.
            </p>
          </div>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Close" onClick={onClose}>
            <Icons.x size={15} />
          </button>
        </div>
        <label className="label" htmlFor="invite-email">
          E-mail
        </label>
        <input id="invite-email" className="input" type="email" autoFocus required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <span className="label">Role</span>
        <div className="role-choice" role="radiogroup" aria-label="Role">
          {(['member', 'admin'] as Role[]).map((r) => {
            const locked = r === 'admin' && !canInviteAdmins;
            return (
              <button key={r} type="button" role="radio" aria-checked={role === r} aria-disabled={locked} className="role-option" onClick={() => !locked && setRole(r)}>
                <strong>{ROLE_LABEL[r]}</strong>
                <span className="muted small">{locked ? 'Only the owner can invite admins.' : ROLE_HINT[r]}</span>
              </button>
            );
          })}
        </div>
        {error && <div className="notice notice-danger">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
      </form>
      </div>
    </div>,
    document.body,
  );
}

function lastActive(iso: string | null): string {
  if (!iso) return 'Never';
  return Date.now() - Date.parse(iso) < 10 * 60_000 ? 'Active now' : timeAgo(iso);
}
