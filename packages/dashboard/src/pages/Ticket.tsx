import { formatOffset } from '@lumora/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, type Project, type TicketDetail } from '../api';
import { Card, CopyButton, PageHead, timeAgo, useToast } from '../components/ui';
import { StatusBadge } from './Inbox';

export function TicketPage({ project, ticketId }: { project: Project; ticketId: string }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'console' | 'network' | 'ticket'>('overview');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => api<TicketDetail>(`/tickets/${ticketId}`).then(setTicket, (e) => setError(e.message)), [ticketId]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="notice notice-danger">{error}</div>;
  if (!ticket) return <p className="muted">Loading…</p>;

  const p = ticket.payload;
  const env = p.environment;
  const errors = (p.console ?? []).filter((c) => c.level === 'error').length;
  const relativeSteps = !!p.recordingActions?.length && !ticket.aiSummary;

  const resend = async () => {
    setBusy(true);
    try {
      await api(`/tickets/${ticket.id}/resend`, { body: {} });
      await load();
      toast('Forwarded again');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const markResolved = async () => {
    await api(`/tickets/${ticket.id}`, { method: 'PATCH', body: { status: ticket.status === 'resolved' ? 'forwarded' : 'resolved' } });
    load();
  };

  return (
    <div className="stack">
      <a href={`#/projects/${project.id}/inbox`} className="muted small" style={{ textDecoration: 'none' }}>
        ← All reports
      </a>
      <PageHead
        title={ticket.title}
        subtitle={
          <span className="row">
            <span className="mono">{ticket.reference}</span>· {timeAgo(ticket.createdAt)} · <StatusBadge ticket={ticket} />
          </span>
        }
        actions={
          <>
            <button className="btn" onClick={markResolved}>
              {ticket.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
            </button>
            <button className="btn" onClick={resend} disabled={busy}>
              {busy ? 'Sending…' : 'Forward again'}
            </button>
          </>
        }
      />

      {ticket.aiSummary && (
        <div className="notice notice-accent">
          <strong>✦ AI summary:</strong> {ticket.aiSummary}
        </div>
      )}

      <div className="tabs" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['console', `Console (${p.console?.length ?? 0})`],
            ['network', `Network (${p.network?.length ?? 0})`],
            ['ticket', 'Ticket as sent'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack">
            {ticket.screenshotUrl && (
              <Card title="Screenshot" actions={<a className="btn btn-sm" href={ticket.screenshotUrl} target="_blank" rel="noreferrer">Open ↗</a>}>
                <img className="shot" src={ticket.screenshotUrl} alt="Screenshot" />
              </Card>
            )}
            {ticket.recordingUrl && (
              <Card title={`Screen recording${p.recordingDurationMs ? ` · ${formatOffset(p.recordingDurationMs)}` : ''}`}>
                <video className="shot" src={ticket.recordingUrl} controls preload="metadata" />
              </Card>
            )}
            <Card title="What the user said">
              <dl className="kv">
                {Object.entries(p.fields).map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{project.settings.template.fields.find((f) => f.id === k)?.label ?? k}</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
          <div className="stack">
            {ticket.steps.length > 0 && (
              <Card title={p.recordingActions?.length ? 'Steps to reproduce (from the recording)' : 'Steps before the report'}>
                <ol className="steps">
                  {ticket.steps.map((s, i) => (
                    <li key={i}>
                      {relativeSteps && <span className="muted mono">{formatOffset(s.timestamp)} </span>}
                      {s.text}
                    </li>
                  ))}
                </ol>
              </Card>
            )}
            <Card title="Reporter">
              <dl className="kv">
                <dt>E-mail</dt>
                <dd>{p.reporter.email ?? '—'}</dd>
                <dt>Name</dt>
                <dd>{p.reporter.name ?? '—'}</dd>
                <dt>User ID</dt>
                <dd className="mono">{p.reporter.id ?? '—'}</dd>
                {Object.entries({ ...(p.reporter.custom ?? {}), ...p.metadata }).map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {env && (
              <Card title="Environment">
                <dl className="kv small">
                  <dt>Page</dt>
                  <dd>
                    <a href={env.url} target="_blank" rel="noreferrer">
                      {env.url}
                    </a>
                  </dd>
                  <dt>Browser</dt>
                  <dd>{env.browser}</dd>
                  <dt>OS</dt>
                  <dd>{env.os}</dd>
                  <dt>Viewport</dt>
                  <dd>
                    {env.viewport} · screen {env.screen} · DPR {env.devicePixelRatio}
                  </dd>
                  <dt>Locale</dt>
                  <dd>
                    {env.language} · {env.timezone}
                  </dd>
                  <dt>Errors</dt>
                  <dd>{errors ? <span className="badge badge-danger">{errors} console error(s)</span> : 'None captured'}</dd>
                </dl>
              </Card>
            )}
            <Card title="Deliveries">
              {ticket.deliveries.length === 0 ? (
                <p className="muted small">
                  Not forwarded anywhere yet. <a href={`#/projects/${project.id}/integrations`}>Connect an integration</a>.
                </p>
              ) : (
                <div className="stack-sm">
                  {ticket.deliveries.map((d) => (
                    <div key={d.integrationId} className="spread small">
                      <span>
                        <strong>{d.name}</strong>{' '}
                        {d.status === 'sent' ? <span className="badge badge-ok">Sent</span> : <span className="badge badge-danger">Failed</span>}
                        {d.error && <div className="muted">{d.error}</div>}
                      </span>
                      {d.url && (
                        <a className="btn btn-sm" href={d.url} target="_blank" rel="noreferrer">
                          {d.externalId ?? 'Open'} ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'console' && (
        <Card title="Console">
          {p.console?.length ? (
            <div className="log mono">
              {p.console.map((c, i) => (
                <div key={i} className={`log-line ${c.level}`}>
                  <span className="muted">{new Date(c.timestamp).toLocaleTimeString()} </span>
                  <strong>{c.level.toUpperCase()}</strong> {c.message}
                  {c.stack && <div className="muted">{c.stack}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Nothing captured.</p>
          )}
        </Card>
      )}

      {tab === 'network' && (
        <Card title="Network" pad={false}>
          {p.network?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table small">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {p.network.map((n, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ wordBreak: 'break-all' }}>
                        {n.method} {n.url}
                      </td>
                      <td>
                        <span className={`badge ${n.ok ? 'badge-ok' : 'badge-danger'}`}>{n.status || n.error || 'failed'}</span>
                      </td>
                      <td className="muted">{n.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted card-pad">Nothing captured.</p>
          )}
        </Card>
      )}

      {tab === 'ticket' && (
        <Card title="Description sent to your ticketing tools" actions={<CopyButton text={ticket.description} />}>
          <div className="markdown mono">{ticket.description}</div>
        </Card>
      )}
    </div>
  );
}
