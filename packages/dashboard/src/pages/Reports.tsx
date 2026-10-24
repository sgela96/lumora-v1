import type { TicketStatus } from '@lumora/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { api, type IssueGroup, type Project, type TicketList, type TicketSummary } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { Nebula, PageHead, Segmented, StatusBadge, timeAgo, UpgradeBadge } from '../components/ui';
import { navigate, useApp, useHashQuery } from '../state';

const KIND: Record<string, { icon: (p: { size?: number }) => ReactElement; label: string }> = {
  screenshot: { icon: Icons.camera, label: 'Screenshot' },
  recording: { icon: Icons.video, label: 'Recording' },
  describe: { icon: Icons.text, label: 'Text only' },
};

const PAGE = 50;

export function ReportsPage({ project }: { project: Project }) {
  const { me } = useApp();
  const supportCenter = me.limits.features.supportCenter;
  const [params, setParams] = useHashQuery();
  const status = (params.get('status') ?? 'open') as TicketStatus | 'all';
  const view = supportCenter && params.get('view') === 'issues' ? 'issues' : 'reports';
  const [list, setList] = useState<TicketList | null>(null);
  const [issues, setIssues] = useState<IssueGroup[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const filterKeys = ['category', 'kind', 'browser', 'page', 'issue', 'range', 'hasErrors', 'hasRecording', 'delivery', 'q'] as const;
  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  for (const k of filterKeys) {
    const v = params.get(k);
    if (!v) continue;
    if (k === 'range') query.set('from', new Date(Date.now() - Number(v) * 86400_000).toISOString().slice(0, 10));
    else query.set(k, v);
  }
  const queryString = query.toString();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (view === 'issues') return api<IssueGroup[]>(`/projects/${project.id}/issues?${queryString}`).then((r) => !cancelled && setIssues(r));
      return api<TicketList>(`/projects/${project.id}/tickets?${queryString}&limit=${limit}`).then((r) => !cancelled && setList(r));
    };
    load();
    // New reports and synced statuses show up without a refresh.
    const poll = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [project.id, queryString, view, limit]);

  useEffect(() => {
    const t = setTimeout(() => params.get('q') !== search && setParams({ q: search || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]);

  const activeFilters = filterKeys.filter((k) => k !== 'q' && params.get(k));
  const counts = list?.counts;

  return (
    <div className="stack">
      <PageHead
        title="Reports"
        subtitle={
          supportCenter
            ? 'Every report from your app, with its live status in your ticketing tools.'
            : `Reports from the last ${list?.historyDays ?? me.limits.historyDays} days.`
        }
        actions={<input className="input input-search" placeholder="Search" aria-label="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />}
      />

      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => {
            setLimit(PAGE);
            setParams({ status: v });
          }}
          options={[
            { value: 'open', label: 'Open', count: counts?.open },
            { value: 'in_progress', label: 'In progress', count: counts?.in_progress },
            { value: 'resolved', label: 'Resolved', count: counts?.resolved },
            { value: 'all', label: 'All', count: counts?.all },
          ]}
        />
        <div className="row">
          <Segmented
            label="View"
            value={view}
            onChange={(v) => (supportCenter ? setParams({ view: v === 'issues' ? 'issues' : undefined }) : navigate('/billing'))}
            options={[
              { value: 'reports', label: 'Reports' },
              { value: 'issues', label: <>Grouped by issue{!supportCenter && <Icons.lock size={12} />}</> },
            ]}
          />
        </div>
      </div>

      <div className="filters">
        <select className="select" aria-label="Category" value={params.get('category') ?? ''} onChange={(e) => setParams({ category: e.target.value })}>
          <option value="">All categories</option>
          {list?.facets.category.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Type" value={params.get('kind') ?? ''} onChange={(e) => setParams({ kind: e.target.value })}>
          <option value="">Any capture</option>
          <option value="screenshot">Screenshot</option>
          <option value="recording">Recording</option>
          <option value="describe">Text only</option>
        </select>
        <select className="select" aria-label="Page" value={params.get('page') ?? ''} onChange={(e) => setParams({ page: e.target.value })}>
          <option value="">All pages</option>
          {list?.facets.page.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Browser" value={params.get('browser') ?? ''} onChange={(e) => setParams({ browser: e.target.value })}>
          <option value="">All browsers</option>
          {list?.facets.browser.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Date range" value={params.get('range') ?? ''} onChange={(e) => setParams({ range: e.target.value })}>
          <option value="">Any time</option>
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <select
          className="select"
          aria-label="More filters"
          value={params.get('hasErrors') ? 'errors' : params.get('hasRecording') ? 'recording' : params.get('delivery') ? 'failed' : ''}
          onChange={(e) =>
            setParams({
              hasErrors: e.target.value === 'errors' ? '1' : undefined,
              hasRecording: e.target.value === 'recording' ? '1' : undefined,
              delivery: e.target.value === 'failed' ? 'failed' : undefined,
            })
          }
        >
          <option value="">Everything</option>
          <option value="errors">With console errors</option>
          <option value="recording">With a recording</option>
          <option value="failed">Delivery failed</option>
        </select>
        {activeFilters.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => setParams(Object.fromEntries(activeFilters.map((k) => [k, undefined])))}>
            Clear filters
          </button>
        )}
      </div>

      {params.get('issue') && list?.items[0]?.issue && (
        <div className="notice spread">
          <span>
            Showing reports of one issue: <strong>{list.items[0].issue.label}</strong>
          </span>
          <button className="btn btn-sm" onClick={() => setParams({ issue: undefined })}>
            Show all
          </button>
        </div>
      )}

      <section className="card">
        {view === 'issues' ? (
          <IssuesTable issues={issues} onOpen={(i) => setParams({ view: undefined, issue: i.fingerprint, status: 'all' })} />
        ) : !list ? (
          <div className="empty muted">Loading…</div>
        ) : list.items.length === 0 ? (
          <EmptyState project={project} filtered={activeFilters.length > 0 || !!params.get('q') || status !== 'all'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Status</th>
                  <th>Linked ticket</th>
                  <th>Reporter</th>
                  <th className="num">Received</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((t) => (
                  <ReportRow key={t.id} ticket={t} projectId={project.id} />
                ))}
              </tbody>
            </table>
            {list.total > list.items.length && (
              <div style={{ textAlign: 'center', padding: 14 }}>
                <button className="btn btn-sm" onClick={() => setLimit(limit + PAGE)}>
                  Show more ({list.total - list.items.length})
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ReportRow({ ticket: t, projectId }: { ticket: TicketSummary; projectId: string }) {
  const kind = KIND[t.kind] ?? KIND.describe;
  const linked = t.deliveries.find((d) => d.status === 'sent' && (d.displayId || d.externalId));
  const failed = t.deliveries.some((d) => d.status === 'failed');
  return (
    <tr className="clickable" onClick={() => navigate(`/p/${projectId}/reports/${t.id}`)}>
      <td>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
          <span className="kind-icon" title={kind.label}>
            <kind.icon size={16} />
          </span>
          <div className="title-cell">
            <a className="t" href={`#/p/${projectId}/reports/${t.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
              {t.title}
            </a>
            <span className="sub">
              <span className="mono">{t.reference}</span>
              {t.category && <span>· {t.category}</span>}
              {t.pagePath && <span>· {t.pagePath}</span>}
              {t.errorCount > 0 && (
                <span className="badge badge-danger" style={{ padding: '0 6px' }}>
                  {t.errorCount} error{t.errorCount > 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
        </div>
      </td>
      <td>
        <StatusBadge status={t.status} label={t.externalStatus} />
      </td>
      <td>
        {linked ? (
          <span className="ref-chip" title={linked.name}>
            <LogoTile type={linked.type} />
            {linked.displayId ?? linked.externalId}
          </span>
        ) : failed ? (
          <span className="badge badge-danger">Delivery failed</span>
        ) : (
          <span className="muted small">—</span>
        )}
      </td>
      <td className="small" style={{ whiteSpace: 'nowrap' }}>
        {t.reporterEmail ?? <span className="muted">Anonymous</span>}
      </td>
      <td className="num muted small" style={{ whiteSpace: 'nowrap' }}>
        {timeAgo(t.createdAt)}
      </td>
    </tr>
  );
}

function IssuesTable({ issues, onOpen }: { issues: IssueGroup[] | null; onOpen: (i: IssueGroup) => void }) {
  if (!issues) return <div className="empty muted">Loading…</div>;
  if (!issues.length) return <div className="empty muted">No issues match these filters.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Issue</th>
            <th className="num">Reports</th>
            <th className="num">Unresolved</th>
            <th className="num">People</th>
            <th className="num">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.fingerprint} className="clickable" onClick={() => onOpen(i)}>
              <td>
                <div className="title-cell">
                  <span className="t">{i.label}</span>
                  <span className="sub">
                    First seen {timeAgo(i.firstSeen)}
                    {i.pages.length > 0 && <span>· {i.pages.join(', ')}</span>}
                  </span>
                </div>
              </td>
              <td className="num">
                <strong>{i.reports}</strong>
              </td>
              <td className="num">{i.unresolved}</td>
              <td className="num">{i.reporters}</td>
              <td className="num muted small">{timeAgo(i.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ project, filtered }: { project: Project; filtered: boolean }) {
  return (
    <div className="empty stack-sm">
      <Nebula className="mark" />
      <h2>{filtered ? 'Nothing here' : 'No reports yet'}</h2>
      <p className="muted">{filtered ? 'No reports match this view. Try another status or clear the filters.' : 'Install the snippet and send the first report from your app.'}</p>
      {!filtered && (
        <div>
          <a className="btn btn-primary" href={`#/p/${project.id}/settings/install`} style={{ marginTop: 12, textDecoration: 'none' }}>
            Install Lumora
          </a>
        </div>
      )}
    </div>
  );
}
