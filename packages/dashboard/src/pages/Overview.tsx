import { useEffect, useState, type ReactNode } from 'react';
import { api, type BasicMetrics, type Metrics, type Project, type RecentReport } from '../api';
import { BarList, Legend, Sparkline, TrendChart, useCountUp, type Series } from '../components/charts';
import { Icons, LogoTile } from '../components/icons';
import { Card, formatHours, Nebula, Segmented, timeAgo, Upsell } from '../components/ui';
import { navigate, useApp } from '../state';
import { setupProgress } from './Setup';
import { TrialButton } from '../components/TrialButton';

const SERIES: Series[] = [
  { key: 'created', label: 'Reports', color: '--series-reports' },
  { key: 'resolved', label: 'Resolved', color: '--series-resolved' },
];

const KIND_LABEL: Record<string, string> = { screenshot: 'Screenshot', recording: 'Recording', describe: 'Text only' };

export function OverviewPage({ project }: { project: Project }) {
  const { me } = useApp();
  const advanced = me.limits.features.supportCenter;
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [metrics, setMetrics] = useState<Metrics | BasicMetrics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me.limits.features.basicDashboard) return;
    let cancelled = false;
    const load = () =>
      api<Metrics | BasicMetrics>(`/projects/${project.id}/metrics?days=${days}`).then(
        (m) => !cancelled && setMetrics(m),
        (e) => !cancelled && setError(e.message),
      );
    load();
    const poll = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [project.id, days, me.limits.features.basicDashboard]);

  if (!me.limits.features.basicDashboard) {
    return (
      <div className="stack rise">
        <Hero name={me.user.name} lede={<>Your reports go straight to {project.name}’s destinations.</>} />
        <GettingStarted project={project} />
        <div style={{ display: 'grid', placeItems: 'center', padding: '24px 0' }}>
          <Upsell title="See how your app is doing" cta="Upgrade to Pro" action={me.account.canTrial ? <TrialButton /> : undefined}>
            Pro adds a dashboard with your report volume, trends, categories and the latest reports — plus screen recordings that turn into written steps.
          </Upsell>
        </div>
      </div>
    );
  }

  if (error) return <div className="notice notice-danger">{error}</div>;
  if (!metrics) return <p className="muted">Loading…</p>;

  const reportsLink = (params: Record<string, string>) => advanced && navigate(`/p/${project.id}/reports?${new URLSearchParams(params)}`);
  const open = metrics.level === 'advanced' ? metrics.totals.open : null;
  const lede =
    metrics.totals.reports === 0 ? (
      <>All quiet — no reports in the last {metrics.days} days.</>
    ) : (
      <>
        <strong>{metrics.totals.reports}</strong> report{metrics.totals.reports === 1 ? '' : 's'} in the last {metrics.days} days
        {open !== null && (
          <>
            {' '}
            · <strong>{open}</strong> waiting for the team
          </>
        )}
        .
      </>
    );

  return (
    <div className="stack rise">
      <Hero name={me.user.name} lede={lede} />

      <GettingStarted project={project} />

      {advanced && (
        <div className="spread">
          <h2 className="section-title">Last {metrics.days} days</h2>
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
        </div>
      )}
      {metrics.level === 'advanced' ? <AdvancedTiles m={metrics} onOpen={() => reportsLink({ status: 'open' })} /> : <BasicTiles m={metrics} />}

      <Card
        className="lift"
        title={metrics.level === 'advanced' ? 'Reports and resolutions' : 'Reports per day'}
        actions={metrics.level === 'advanced' && <Legend series={SERIES} />}
      >
        <TrendChart data={metrics.series} series={metrics.level === 'advanced' ? SERIES : SERIES.slice(0, 1)} />
      </Card>

      {metrics.level === 'advanced' ? (
        <>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Card className="lift" title="Top issues" actions={<a className="small" href={`#/p/${project.id}/reports?mode=issues`}>All issues</a>}>
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
            <Card className="lift" title="Where people get stuck">
              <BarList items={metrics.topPages} onSelect={(page) => reportsLink({ page, status: 'all' })} />
            </Card>
          </div>
          <div className="grid-3" style={{ alignItems: 'start' }}>
            <Card className="lift" title="By category">
              <BarList items={metrics.byCategory} onSelect={(category) => reportsLink({ category, status: 'all' })} />
            </Card>
            <Card className="lift" title="By browser">
              <BarList items={metrics.byBrowser} onSelect={(browser) => reportsLink({ browser, status: 'all' })} />
            </Card>
            <Card className="lift" title="How people reported">
              <BarList items={metrics.byKind.map((k) => ({ ...k, label: KIND_LABEL[k.label] ?? k.label }))} />
            </Card>
          </div>
          <Card className="lift" title="Latest reports" actions={<a className="small" href={`#/p/${project.id}/reports?status=all`}>All reports</a>}>
            <Activity items={metrics.recent} onOpen={(r) => navigate(`/p/${project.id}/reports/${r.id}`)} />
          </Card>
        </>
      ) : (
        <>
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Card className="lift" title="By category">
              <BarList items={metrics.byCategory} />
            </Card>
            <Card className="lift" title="Latest reports" actions={<a className="small" href={`#/p/${project.id}/reports`}>All reports</a>}>
              <Activity items={metrics.recent} onOpen={(r) => navigate(`/p/${project.id}/reports/${r.id}`)} />
            </Card>
          </div>
          <div className="card iris-border card-pad spread" style={{ borderRadius: 22 }}>
            <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
              <Nebula className="mark mark-sm" />
              <div>
                <h2>Run support from one place</h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  Business adds the report repository with each ticket’s live status from Jira or Zendesk, similar reports grouped into issues and the advanced dashboard.
                </p>
              </div>
            </div>
            <a className="btn btn-primary" href="#/billing" style={{ textDecoration: 'none' }}>
              See Business
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** Stays on the Overview until the app is installed, connected and has received a report. */
function GettingStarted({ project }: { project: Project }) {
  const progress = setupProgress(project);
  if (progress.done === progress.total) return null;
  return (
    <section className="card card-pad getting-started iris-border lift">
      <div className="spread">
        <div>
          <h2 style={{ fontSize: 19 }}>Getting started</h2>
          <p className="muted small">
            {progress.done} of {progress.total} done — finish to get complete tickets in your tool.
          </p>
        </div>
        <a className="btn btn-primary btn-sm" href="#/setup" style={{ textDecoration: 'none' }}>
          Continue setup
        </a>
      </div>
      <div className="meter" style={{ margin: '14px 0 6px' }}>
        <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
      <ol className="checklist">
        {progress.steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            <span className="setup-dot">{s.done ? <Icons.check size={13} /> : null}</span>
            {s.title}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Hero({ name, lede, actions }: { name: string; lede: ReactNode; actions?: ReactNode }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening';
  return (
    <section className="hero">
      <div>
        <h1>
          {greeting}, <span className="iris-text">{name.split(' ')[0]}</span>
        </h1>
        <p className="lede">{lede}</p>
        {actions && <div style={{ marginTop: 16 }}>{actions}</div>}
      </div>
      <Nebula className="orb" />
    </section>
  );
}

function Kpi({ label, value, format, hint, delta: d, spark, icon, onClick }: {
  label: string;
  value: number | null;
  format?: (n: number) => string;
  hint?: string;
  delta?: { text: string; dir: 'up' | 'down' | 'flat' };
  spark?: number[];
  icon: ReactNode;
  onClick?: () => void;
}) {
  const animated = useCountUp(value ?? 0);
  return (
    <div className="card kpi lift" style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <span className="chip">{icon}</span>
      <span className="label">{label}</span>
      <span className="value">{value === null ? '—' : format ? format(animated) : animated.toLocaleString()}</span>
      <span className="delta">
        {d && <span className={`delta ${d.dir}`}>{d.text} </span>}
        {hint}
      </span>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

function AdvancedTiles({ m, onOpen }: { m: Metrics; onOpen: () => void }) {
  const spark = m.series.map((d) => d.created);
  const pct = (n: number) => (m.totals.reports ? Math.round((n / m.totals.reports) * 100) : 0);
  return (
    <div className="grid-4">
      <Kpi label="Reports" value={m.totals.reports} delta={delta(m.totals.reports, m.totals.previous)} hint={`vs previous ${m.days} days`} spark={spark} icon={<Icons.reports size={16} />} />
      <Kpi label="Open now" value={m.totals.open} hint={`${m.totals.inProgress} in progress`} icon={<Icons.alert size={16} />} onClick={onOpen} />
      <Kpi
        label="Median time to resolve"
        value={m.totals.medianResolutionHours === null ? null : Math.round(m.totals.medianResolutionHours * 10)}
        format={(n) => formatHours(n / 10)}
        hint={`${m.totals.resolved} resolved`}
        spark={m.series.map((d) => d.resolved)}
        icon={<Icons.check size={16} />}
      />
      <Kpi
        label="Reports with errors"
        value={pct(m.totals.withErrors)}
        format={(n) => `${n}%`}
        hint={m.totals.deliveryFailures ? `${m.totals.deliveryFailures} failed deliveries` : `${m.totals.reporters} people reported`}
        icon={<Icons.layers size={16} />}
      />
    </div>
  );
}

function BasicTiles({ m }: { m: BasicMetrics }) {
  const pct = (n: number) => (m.totals.reports ? Math.round((n / m.totals.reports) * 100) : 0);
  return (
    <div className="grid-3">
      <Kpi label="Reports, last 30 days" value={m.totals.reports} delta={delta(m.totals.reports, m.totals.previous)} hint="vs previous 30 days" spark={m.series.map((d) => d.created)} icon={<Icons.reports size={16} />} />
      <Kpi label="With a screen recording" value={pct(m.totals.withRecording)} format={(n) => `${n}%`} hint={`${m.totals.withRecording} recordings`} icon={<Icons.video size={16} />} />
      <Kpi label="With console errors" value={pct(m.totals.withErrors)} format={(n) => `${n}%`} hint={`${m.totals.withErrors} reports`} icon={<Icons.alert size={16} />} />
    </div>
  );
}

function Activity({ items, onOpen }: { items: RecentReport[]; onOpen?: (r: RecentReport) => void }) {
  if (!items.length) return <p className="muted small">No reports yet.</p>;
  return (
    <div className="activity">
      {items.map((r) => (
        <div key={r.id} className="activity-row" style={onOpen ? { cursor: 'pointer' } : undefined} onClick={onOpen ? () => onOpen(r) : undefined}>
          <span className="activity-dot" aria-hidden />
          <div className="title-cell">
            <span className="t" style={{ maxWidth: 420 }}>{r.title}</span>
            <span className="sub">
              <span className="mono">{r.reference}</span> · {timeAgo(r.createdAt)}
            </span>
          </div>
          {r.linked ? (
            r.linked.url ? (
              <a className="ref-chip" href={r.linked.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                <LogoTile type={r.linked.type} />
                {r.linked.ref ?? 'Open'}
              </a>
            ) : (
              <span className="ref-chip">
                <LogoTile type={r.linked.type} />
                Sent
              </span>
            )
          ) : (
            <span className="muted small">—</span>
          )}
        </div>
      ))}
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
