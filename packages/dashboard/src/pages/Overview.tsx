import { useEffect, useState } from 'react';
import { api, type Metrics, type Project } from '../api';
import { BarList, Legend, TrendChart, type Series } from '../components/charts';
import { Card, formatHours, PageHead, Segmented, timeAgo, Upsell } from '../components/ui';
import { navigate, useApp } from '../state';

const SERIES: Series[] = [
  { key: 'created', label: 'Reports', color: '--series-reports' },
  { key: 'resolved', label: 'Resolved', color: '--series-resolved' },
];

const KIND_LABEL: Record<string, string> = { screenshot: 'Screenshot', recording: 'Recording', describe: 'Text only' };

export function OverviewPage({ project }: { project: Project }) {
  const { me } = useApp();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    if (!me.limits.features.supportCenter) return;
    let cancelled = false;
    const load = () =>
      api<Metrics>(`/projects/${project.id}/metrics?days=${days}`).then(
        (m) => !cancelled && setMetrics(m),
        (e) => !cancelled && setError(e.message),
      );
    load();
    const poll = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [project.id, days, me.limits.features.supportCenter]);

  if (!me.limits.features.supportCenter) {
    return (
      <div>
        <PageHead title="Overview" subtitle="Your support command center." />
        <div style={{ display: 'grid', placeItems: 'center', padding: '40px 0' }}>
          <Upsell title="The Support Center is part of Business">
            See every report across your apps in one place: live metrics, the status of each ticket synced back from Jira, Zendesk or ServiceNow, and
            duplicate reports grouped into a single issue.
          </Upsell>
        </div>
      </div>
    );
  }

  const reportsLink = (params: Record<string, string>) => navigate(`/p/${project.id}/reports?${new URLSearchParams(params)}`);

  return (
    <div className="stack">
      <PageHead
        title="Overview"
        subtitle={project.name}
        actions={
          <Segmented
            label="Time range"
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
            ]}
          />
        }
      />
      {error && <div className="notice notice-danger">{error}</div>}
      {!metrics ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid-4">
            <Kpi label="Reports" value={metrics.totals.reports} delta={delta(metrics.totals.reports, metrics.totals.previous)} hint={`vs previous ${days} days`} />
            <Kpi label="Open now" value={metrics.totals.open} hint={`${metrics.totals.inProgress} in progress`} onClick={() => reportsLink({ status: 'open' })} />
            <Kpi label="Median time to resolve" value={formatHours(metrics.totals.medianResolutionHours)} hint={`${metrics.totals.resolved} resolved in range`} />
            <Kpi
              label="Reports with errors"
              value={metrics.totals.reports ? `${Math.round((metrics.totals.withErrors / metrics.totals.reports) * 100)}%` : '—'}
              hint={metrics.totals.deliveryFailures ? `${metrics.totals.deliveryFailures} failed deliveries` : `${metrics.totals.reporters} people reported`}
            />
          </div>

          <Card
            title="Reports and resolutions"
            actions={
              <div className="row">
                <Legend series={SERIES} />
                <button className="btn btn-sm btn-ghost" onClick={() => setAsTable(!asTable)}>
                  {asTable ? 'Chart' : 'Table'}
                </button>
              </div>
            }
          >
            {asTable ? (
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                <table className="table small">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th className="num">Reports</th>
                      <th className="num">Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...metrics.series].reverse().map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td className="num">{d.created}</td>
                        <td className="num">{d.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <TrendChart data={metrics.series} series={SERIES} />
            )}
          </Card>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Card title="Top issues" actions={<a className="small" href={`#/p/${project.id}/reports?view=issues`}>All issues</a>}>
              {metrics.topIssues.length === 0 ? (
                <p className="muted small">No reports in this period.</p>
              ) : (
                <table className="table small">
                  <tbody>
                    {metrics.topIssues.map((i) => (
                      <tr key={i.fingerprint} className="clickable" onClick={() => reportsLink({ issue: i.fingerprint, status: 'all' })}>
                        <td style={{ paddingLeft: 0 }}>
                          <div className="title-cell">
                            <span className="t" style={{ maxWidth: 380 }}>{i.label}</span>
                            <span className="sub">Last seen {timeAgo(i.lastSeen)}</span>
                          </div>
                        </td>
                        <td className="num" style={{ paddingRight: 0 }}>
                          <strong>{i.reports}</strong>
                          <div className="muted">{i.unresolved} open</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Where people get stuck">
              <BarList items={metrics.topPages} onSelect={(page) => reportsLink({ page, status: 'all' })} />
            </Card>
          </div>

          <div className="grid-3" style={{ alignItems: 'start' }}>
            <Card title="By category">
              <BarList items={metrics.byCategory} onSelect={(category) => reportsLink({ category, status: 'all' })} />
            </Card>
            <Card title="By browser">
              <BarList items={metrics.byBrowser} onSelect={(browser) => reportsLink({ browser, status: 'all' })} />
            </Card>
            <Card title="How people reported">
              <BarList items={metrics.byKind.map((k) => ({ ...k, label: KIND_LABEL[k.label] ?? k.label }))} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, delta: d, onClick }: { label: string; value: string | number; hint?: string; delta?: { text: string; dir: 'up' | 'down' | 'flat' }; onClick?: () => void }) {
  return (
    <div className="card kpi" style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="delta">
        {d && <span className={`delta ${d.dir}`}>{d.text} </span>}
        {hint}
      </span>
    </div>
  );
}

/** More reports is bad news, so "up" reads as the warning direction. */
function delta(current: number, previous: number): { text: string; dir: 'up' | 'down' | 'flat' } | undefined {
  if (!previous) return current ? { text: 'New', dir: 'flat' } : undefined;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { text: '±0%', dir: 'flat' };
  return { text: `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}%`, dir: change > 0 ? 'up' : 'down' };
}
