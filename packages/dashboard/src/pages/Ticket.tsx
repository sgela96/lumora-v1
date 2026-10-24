import { formatOffset, type TicketStatus } from '@lumora/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, type Project, type TicketDetail } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { Card, CopyButton, Segmented, StatusBadge, timeAgo, useToast } from '../components/ui';
import { useApp } from '../state';

export function TicketPage({ project, ticketId }: { project: Project; ticketId: string }) {
  const { me } = useApp();
  const supportCenter = me.limits.features.supportCenter;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'console' | 'network' | 'ticket'>('overview');
  const [busy, setBusy] = useState<'' | 'resend' | 'sync'>('');
  const toast = useToast();

  const load = useCallback(() => api<TicketDetail>(`/tickets/${ticketId}`).then(setTicket, (e) => setError(e.message)), [ticketId]);
  useEffect(() => {
    load();
    const poll = setInterval(load, 20_000);
    return () => clearInterval(poll);
  }, [load]);

  if (error) return <div className="notice notice-danger">{error}</div>;
  if (!ticket) return <p className="muted">Loading…</p>;

  const p = ticket.payload;
  const env = p.environment;
  const relativeSteps = !!p.recordingActions?.length && !ticket.aiSummary;
  const synced = ticket.deliveries.find((d) => d.external && !d.external.error);
  const linkedSyncs = ticket.deliveries.some((d) => d.external);

  const run = async (kind: 'resend' | 'sync') => {
    setBusy(kind);
    try {
      if (kind === 'resend') await api(`/tickets/${ticket.id}/resend`, { body: {} });
      else await api(`/tickets/${ticket.id}/sync`, { body: {} });
      await load();
      toast(kind === 'resend' ? 'Sent again' : 'Status refreshed');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy('');
    }
  };

  const setStatus = async (status: TicketStatus) => {
    await api(`/tickets/${ticket.id}`, { method: 'PATCH', body: { status } });
    load();
  };

  return (
    <div className="stack">
      <a href={`#/p/${project.id}/reports`} className="muted small row" style={{ gap: 4 }}>
        <Icons.back size={14} /> Reports
      </a>

      <div className="page-head" style={{ marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24 }}>{ticket.title}</h1>
          <div className="row muted" style={{ marginTop: 8 }}>
            <span className="mono">{ticket.reference}</span>
            <span>·</span>
            <span>{timeAgo(ticket.createdAt)}</span>
            <StatusBadge status={ticket.status} label={ticket.externalStatus} />
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => run('resend')} disabled={!!busy}>
            {busy === 'resend' ? 'Sending…' : 'Send again'}
          </button>
        </div>
      </div>

      <div className="card card-pad spread" style={{ flexWrap: 'wrap' }}>
        <div className="stack-sm" style={{ gap: 4 }}>
          <strong>Status</strong>
          <span className="muted small">
            {synced
              ? `Synced from ${synced.name} · “${synced.external!.label}” · ${timeAgo(synced.external!.syncedAt)}`
              : linkedSyncs && !supportCenter
                ? 'Status sync with your ticketing tool is part of the Business plan.'
                : 'Set manually — no linked ticket reports a status.'}
          </span>
        </div>
        <div className="row">
          <Segmented
            label="Status"
            value={ticket.status}
            onChange={setStatus}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
          {supportCenter && linkedSyncs && (
            <button className="btn btn-sm" onClick={() => run('sync')} disabled={!!busy} title="Read the status from the linked ticket now">
              <Icons.sync size={14} /> {busy === 'sync' ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
      </div>

      {ticket.ai && (
        <section className="card card-pad ai-card iris-border">
          <div className="spread" style={{ marginBottom: 10 }}>
            <span className="ai-label">AI Powered</span>
            <span className="row small">
              <span className={`badge ${ticket.ai.priority === 'urgent' || ticket.ai.priority === 'high' ? 'badge-danger' : 'badge-warn'}`}>
                Priority · {ticket.ai.priority[0].toUpperCase() + ticket.ai.priority.slice(1)}
              </span>
              {ticket.ai.duplicateOf && <span className="badge badge-info">Possible duplicate of {ticket.ai.duplicateOf}</span>}
            </span>
          </div>
          <p style={{ fontSize: 15 }}>{ticket.ai.summary}</p>
          {(ticket.ai.expected || ticket.ai.actual) && (
            <div className="grid-2" style={{ marginTop: 14 }}>
              <div>
                <div className="label">Expected</div>
                <div className="small">{ticket.ai.expected || '—'}</div>
              </div>
              <div>
                <div className="label">What happened</div>
                <div className="small">{ticket.ai.actual || '—'}</div>
              </div>
            </div>
          )}
          {ticket.ai.technicalHint && (
            <div className="notice" style={{ marginTop: 14 }}>
              <strong>Likely cause · </strong>
              {ticket.ai.technicalHint}
            </div>
          )}
        </section>
      )}

      <div className="tabs" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['console', `Console · ${p.console?.length ?? 0}`],
            ['network', `Network · ${p.network?.length ?? 0}`],
            ['ticket', 'Ticket as sent'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack">
            {ticket.screenshotUrl && (
              <Card
                title="Screenshot"
                actions={
                  <a className="btn btn-sm" href={ticket.screenshotUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    Open <Icons.external size={13} />
                  </a>
                }
              >
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
            {ticket.transcript && (
              <Card title="What they said">
                <div className="transcript small">
                  {ticket.transcript.segments.length ? (
                    ticket.transcript.segments.map((s, i) => (
                      <div key={i}>
                        <span className="muted mono">{formatOffset(s.start * 1000)}</span>
                        <span>{s.text}</span>
                      </div>
                    ))
                  ) : (
                    <p>{ticket.transcript.text}</p>
                  )}
                </div>
              </Card>
            )}
            {ticket.steps.length > 0 && (
              <Card title={p.recordingActions?.length ? 'Steps to reproduce' : 'What they did before reporting'}>
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
            <Card title="Linked tickets">
              {ticket.deliveries.length === 0 ? (
                <p className="muted small">
                  Not sent anywhere yet. <a href={`#/p/${project.id}/settings/integrations`}>Connect a destination</a>.
                </p>
              ) : (
                <div className="stack-sm" style={{ gap: 12 }}>
                  {ticket.deliveries.map((d) => (
                    <div key={d.integrationId} className="spread small">
                      <span className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 0 }}>
                        <LogoTile type={d.type} />
                        <span style={{ minWidth: 0 }}>
                          <strong>{d.name}</strong> {d.displayId || d.externalId ? <span className="mono muted">{d.displayId ?? d.externalId}</span> : null}
                          <div className="muted">
                            {d.status === 'failed'
                              ? d.error
                              : d.external
                                ? `${d.external.label}${d.external.error ? ` · couldn’t refresh: ${d.external.error}` : ''}`
                                : 'Delivered'}
                          </div>
                        </span>
                      </span>
                      {d.status === 'failed' ? (
                        <span className="badge badge-danger">Failed</span>
                      ) : d.url ? (
                        <a className="btn btn-sm" href={d.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          Open <Icons.external size={13} />
                        </a>
                      ) : (
                        <span className="badge badge-ok">Sent</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
            {ticket.issue && supportCenter && (
              <Card title="Issue">
                <div className="spread small">
                  <span style={{ minWidth: 0 }}>{ticket.issue.label}</span>
                  <a className="btn btn-sm" href={`#/p/${project.id}/reports?issue=${ticket.issue.fingerprint}&status=all`} style={{ textDecoration: 'none' }}>
                    Similar reports
                  </a>
                </div>
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
                  <dt>System</dt>
                  <dd>{env.os}</dd>
                  <dt>Viewport</dt>
                  <dd>
                    {env.viewport} · screen {env.screen} · {env.devicePixelRatio}×
                  </dd>
                  <dt>Locale</dt>
                  <dd>
                    {env.language} · {env.timezone}
                  </dd>
                </dl>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'console' && (
        <Card>
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
            <p className="muted">Nothing was logged.</p>
          )}
        </Card>
      )}

      {tab === 'network' && (
        <Card pad={false}>
          {p.network?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table small">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Status</th>
                    <th className="num">Time</th>
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
                      <td className="num muted">{n.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted card-pad">No failed requests.</p>
          )}
        </Card>
      )}

      {tab === 'ticket' && (
        <Card title="Description sent to your tools" actions={<CopyButton text={ticket.description} />}>
          <div className="markdown mono">{ticket.description}</div>
        </Card>
      )}
    </div>
  );
}
