import { formatOffset } from '@lumora/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, type Priority, type Project, type ReminderChannel, type RemoteStatus, type TicketDetail } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { Avatar, Card, CopyButton, PriorityPicker, StatusPicker, timeAgo, useDismiss, useToast } from '../components/ui';
import { useApp, useWorkflow } from '../state';

export function TicketPage({ project, ticketId }: { project: Project; ticketId: string }) {
  const { me } = useApp();
  const supportCenter = me.limits.features.supportCenter;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'console' | 'network' | 'ticket'>('overview');
  const [busy, setBusy] = useState<'' | 'resend' | 'sync'>('');
  const toast = useToast();
  const workflow = useWorkflow(project.id, supportCenter);

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

  const patch = async (body: object, done: string) => {
    try {
      setTicket(await api<TicketDetail>(`/tickets/${ticket.id}`, { method: 'PATCH', body }));
      toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };
  const setStatus = (s: RemoteStatus) =>
    patch(workflow?.source === 'tool' ? { externalStatus: s.name } : { status: s.category }, workflow?.source === 'tool' ? `Moved to “${s.name}” in ${workflow.tool!.name}` : 'Status updated');
  const setPriority = (priority: Priority | null) => patch({ priority: priority ?? 'none' }, 'Priority updated');

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
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => run('resend')} disabled={!!busy}>
            {busy === 'resend' ? 'Sending…' : 'Send again'}
          </button>
        </div>
      </div>

      {!supportCenter ? (
        <div className="notice spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span>
            {ticket.deliveries.some((d) => d.status === 'sent')
              ? 'Sent to your tool. Business tracks its status here, synced from the linked ticket.'
              : 'Business adds a status to every report, synced from Jira, Zendesk and more.'}
          </span>
          <a className="btn btn-sm" href="#/billing" style={{ textDecoration: 'none' }}>
            See Business
          </a>
        </div>
      ) : (
      <section className="card triage">
        <div className="triage-cell">
          <span className="label">Status</span>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <StatusPicker value={ticket.status} label={ticket.externalStatus} statuses={workflow?.statuses} onChange={setStatus} align="left" />
            {linkedSyncs && (
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => run('sync')} disabled={!!busy} title="Read the status from the linked ticket now" aria-label="Sync status">
                <Icons.sync size={14} />
              </button>
            )}
          </div>
          <span className="muted small">
            {synced ? `From ${synced.name} · ${timeAgo(synced.external!.syncedAt)}` : workflow?.source === 'tool' ? `${workflow.tool!.name} workflow` : 'Set in Lumora'}
          </span>
        </div>
        <div className="triage-cell">
          <span className="label">Priority</span>
          <PriorityPicker value={ticket.priority} onChange={setPriority} align="left" />
          <span className="muted small">{ticket.ai && ticket.priority === ticket.ai.priority ? 'Suggested by AI Powered' : ticket.priority ? 'Set by your team' : 'Not set yet'}</span>
        </div>
        <div className="triage-cell">
          <span className="label">Assignee</span>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minHeight: 30 }}>
            {ticket.assignee ? (
              <>
                <Avatar name={ticket.assignee.name} /> <strong className="ellipsis">{ticket.assignee.name}</strong>
              </>
            ) : (
              <span className="muted">Unassigned</span>
            )}
          </span>
          <span className="muted small">{synced ? `Assigned in ${synced.name}` : 'Assign it in your ticketing tool'}</span>
        </div>
        <div className="triage-cell triage-action">
          <RemindButton ticketId={ticket.id} projectId={project.id} assignee={ticket.assignee?.name ?? null} />
        </div>
      </section>
      )}

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
            <p className="muted">
              {p.console
                ? 'No errors or warnings were logged before this report. The page was quiet, so the problem is probably visual or in the flow.'
                : 'Console capture was off for this report. Turn it on in Settings → Data capture.'}
            </p>
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
            <p className="muted card-pad">
              {p.network
                ? 'No requests failed before this report. Lumora keeps failed requests by default; you can record every request in Settings → Data capture.'
                : me.limits.features.network
                  ? 'Network capture was off for this report. Turn it on in Settings → Data capture.'
                  : 'Failed requests are attached on Pro and Business.'}
            </p>
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

/** Nudges the assignee on Slack or Teams: a direct message when Slack has a bot token, else a channel post. */
function RemindButton({ ticketId, projectId, assignee }: { ticketId: string; projectId: string; assignee: string | null }) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ReminderChannel[] | null>(null);
  const [channel, setChannel] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const toast = useToast();

  useEffect(() => {
    if (open && !channels)
      api<ReminderChannel[]>(`/projects/${projectId}/reminders`).then((c) => {
        setChannels(c);
        setChannel(c[0]?.integrationId ?? '');
      });
  }, [open]);

  const selected = channels?.find((c) => c.integrationId === channel);
  const send = async () => {
    setSending(true);
    try {
      const r = await api<{ sentTo: string }>(`/tickets/${ticketId}/remind`, { body: { integrationId: channel, note } });
      toast(r.sentTo);
      setOpen(false);
      setNote('');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="status-picker" ref={ref}>
      <button className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.bell size={14} /> Send a reminder
      </button>
      {open && (
        <div className="status-menu card remind-pop align-right">
          {!channels ? (
            <p className="muted small">Loading…</p>
          ) : channels.length === 0 ? (
            <div className="stack-sm">
              <strong>Remind on Slack or Teams</strong>
              <p className="muted small">Connect Slack or Microsoft Teams to nudge whoever has this report.</p>
              <a className="btn btn-sm btn-primary" href={`#/p/${projectId}/settings/integrations`} style={{ textDecoration: 'none', alignSelf: 'start' }}>
                Connect
              </a>
            </div>
          ) : (
            <div className="stack-sm">
              <strong>{assignee ? `Remind ${assignee}` : 'Remind the team'}</strong>
              {channels.length > 1 && (
                <select className="select" aria-label="Send with" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {channels.map((c) => (
                    <option key={c.integrationId} value={c.integrationId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="row small muted" style={{ gap: 8, flexWrap: 'nowrap' }}>
                {selected && <LogoTile type={selected.type} />}
                {selected?.direct && assignee ? `A direct message on ${selected.name}` : `A post in the ${selected?.name ?? ''} channel${assignee ? ` mentioning ${assignee}` : ''}`}
              </span>
              <textarea className="input" rows={3} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              <button className="btn btn-primary btn-sm" onClick={send} disabled={sending} style={{ alignSelf: 'end' }}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
