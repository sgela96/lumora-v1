import { useEffect, useState } from 'react';
import { api, type Project, type TicketSummary } from '../api';
import { PageHead, timeAgo } from '../components/ui';
import { navigate } from '../state';

const KIND_ICON: Record<string, string> = { screenshot: '📸', recording: '🎥', describe: '✍️' };

export function StatusBadge({ ticket }: { ticket: Pick<TicketSummary, 'status' | 'deliveries'> }) {
  if (ticket.status === 'resolved') return <span className="badge badge-ok">Resolved</span>;
  if (ticket.status === 'delivery_failed') return <span className="badge badge-danger">Delivery failed</span>;
  const sent = ticket.deliveries.filter((d) => d.status === 'sent');
  if (sent.length) return <span className="badge badge-info">Sent to {sent.map((d) => d.externalId || d.name).join(', ')}</span>;
  return <span className="badge">New</span>;
}

export function InboxPage({ project }: { project: Project }) {
  const [items, setItems] = useState<TicketSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<{ total: number; items: TicketSummary[] }>(`/projects/${project.id}/tickets?q=${encodeURIComponent(query)}`).then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
      });
    const t = setTimeout(load, query ? 250 : 0);
    // Light polling so new reports appear while the page is open.
    const poll = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [project.id, query]);

  return (
    <div className="stack">
      <PageHead
        title="Reports"
        subtitle={`${total} report${total === 1 ? '' : 's'} from ${project.name}. Every report is also forwarded to your integrations.`}
        actions={<input className="input" placeholder="Search title, reference or e-mail" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 280 }} />}
      />
      <section className="card">
        {items === null ? (
          <div className="empty muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty stack-sm">
            <div className="sun-big" />
            <h2>{query ? 'No matches' : 'No reports yet'}</h2>
            <p className="muted">{query ? 'Try another search.' : 'Install the snippet and click the sun on your site to send the first one.'}</p>
            {!query && (
              <div>
                <a className="btn btn-primary" href={`#/projects/${project.id}/install`} style={{ marginTop: 12 }}>
                  Install the widget
                </a>
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Reporter</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/projects/${project.id}/inbox/${t.id}`)}>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <span aria-hidden>{KIND_ICON[t.kind] ?? '•'}</span>
                        <div>
                          <a href={`#/projects/${project.id}/inbox/${t.id}`} style={{ textDecoration: 'none', fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                            {t.title}
                          </a>
                          <div className="muted small mono">
                            {t.reference}
                            {t.category ? ` · ${t.category}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="small">{t.reporterEmail ?? <span className="muted">Anonymous</span>}</td>
                    <td>
                      <StatusBadge ticket={t} />
                    </td>
                    <td className="muted small" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {timeAgo(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
