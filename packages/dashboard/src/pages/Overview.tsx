import { DASHBOARD_PRESETS, dashboardCard, type DashboardItem } from '@lumora/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type BasicMetrics, type Me, type Metrics, type Project } from '../api';
import { CardGallery, DashCell, DashboardCard, PresetMenu, type CardContext } from '../components/Dashboard';
import { Icons } from '../components/icons';
import { Nebula, Segmented, Upsell, useToast } from '../components/ui';
import { navigate, useApp, usePermissions } from '../state';
import { setupProgress } from './Setup';
import { TrialButton } from '../components/TrialButton';

export function OverviewPage({ project }: { project: Project }) {
  const { me, refresh } = useApp();
  const toast = useToast();
  const advanced = me.limits.features.supportCenter;
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [metrics, setMetrics] = useState<Metrics | BasicMetrics | null>(null);
  const [error, setError] = useState('');
  /** The layout being edited; null when not editing. */
  const [draft, setDraft] = useState<DashboardItem[] | null>(null);
  const [gallery, setGallery] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const editing = draft !== null;
  const layout = draft ?? me.dashboard.layout;
  const ctx: CardContext = {
    m: metrics,
    projectId: project.id,
    openReports: advanced ? (params) => navigate(`/p/${project.id}/reports?${new URLSearchParams(params)}`) : undefined,
    openReport: (id) => navigate(`/p/${project.id}/reports/${id}`),
  };
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

  const save = async (next: DashboardItem[] | null, message: string) => {
    setSaving(true);
    try {
      await api<Me['dashboard']>('/account/dashboard', { method: 'PUT', body: { layout: next } });
      await refresh();
      setDraft(null);
      toast(message);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  };
  const move = (id: string, to: number) =>
    setDraft((d) => {
      if (!d) return d;
      const from = d.findIndex((i) => i.id === id);
      if (from < 0 || from === to) return d;
      const next = [...d];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  return (
    <div className="stack rise">
      <Hero name={me.user.name} lede={lede} />

      <GettingStarted project={project} />

      {editing ? (
        <div className="dash-editbar card" role="toolbar" aria-label="Edit the dashboard">
          <div className="dash-editbar-text">
            <strong>Editing the dashboard</strong>
            <span className="muted small">Everyone at {me.account.name} will see these changes. Drag cards to reorder them.</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <PresetMenu business={advanced} onPick={(id) => setDraft(structuredClone(DASHBOARD_PRESETS.find((p) => p.id === id)!.items))} />
            <button type="button" className="btn btn-sm" onClick={() => setGallery(true)}>
              <Icons.plus size={14} /> Add a card
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={() => save(null, 'Dashboard back to the default')}>
              Reset
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => save(draft, `Dashboard saved for everyone at ${me.account.name}`)}>
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
      ) : (
        <div className="spread">
          <h2 className="section-title">Last {metrics.days} days</h2>
          <div className="row" style={{ gap: 8 }}>
            {advanced && (
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
            )}
            {me.dashboard.canEdit && (
              <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Customize the dashboard" title="Customize the dashboard" onClick={() => setDraft(structuredClone(me.dashboard.layout))}>
                <Icons.settings size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {layout.length === 0 ? (
        <div className="card card-pad dash-empty">
          <p className="muted">{editing ? 'No cards yet. Add one or start from a preset.' : 'This dashboard has no cards.'}</p>
          {editing && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setGallery(true)}>
              <Icons.plus size={14} /> Add a card
            </button>
          )}
        </div>
      ) : (
        <div className={`dash-grid${editing ? ' dash-editing' : ''}`}>
          {layout.map((item, index) => {
            const def = dashboardCard(item.id);
            if (!def) return null;
            return (
              <DashCell
                key={item.id}
                item={item}
                index={index}
                count={layout.length}
                editing={editing}
                dragging={dragId === item.id}
                onDragStart={() => setDragId(item.id)}
                onDragEnter={() => dragId && dragId !== item.id && move(dragId, index)}
                onDragEnd={() => setDragId(null)}
                onMove={(to) => move(item.id, to)}
                onResize={(size) => setDraft((d) => d && d.map((i) => (i.id === item.id ? { ...i, size } : i)))}
                onRemove={() => setDraft((d) => d && d.filter((i) => i.id !== item.id))}
              >
                <DashboardCard def={def} ctx={ctx} />
              </DashCell>
            );
          })}
        </div>
      )}

      {!advanced && !editing && (
        <div className="card iris-border card-pad spread" style={{ borderRadius: 22 }}>
          <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
            <Nebula className="mark mark-sm" />
            <div>
              <h2>Run support from one place</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                Business adds the report repository with each ticket’s live status from Jira or Zendesk, similar reports grouped into issues and dashboard cards for your team’s workload.
              </p>
            </div>
          </div>
          <a className="btn btn-primary" href="#/billing" style={{ textDecoration: 'none' }}>
            See Business
          </a>
        </div>
      )}

      {gallery && draft && (
        <CardGallery
          ctx={ctx}
          layout={draft}
          business={advanced}
          onAdd={(def) => setDraft([...draft, { id: def.id, size: def.sizes.includes('M') ? 'M' : def.sizes[0] }])}
          onClose={() => setGallery(false)}
        />
      )}
    </div>
  );
}

/** Stays on the Overview until the app is installed, connected and has received a report. */
function GettingStarted({ project }: { project: Project }) {
  const progress = setupProgress(project);
  const can = usePermissions();
  if (progress.done === progress.total || !can.settings) return null;
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

