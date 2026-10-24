import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Icons } from '../components/icons';
import { Nebula, PageHead, Upsell, useToast } from '../components/ui';
import { navigate, useApp, useRoute } from '../state';
import { BillingPage } from './Billing';
import { OverviewPage } from './Overview';
import { ReportsPage } from './Reports';
import { SettingsPage } from './Settings';
import { TicketPage } from './Ticket';

export function Layout({ onSignOut }: { onSignOut: () => void }) {
  const { me, projects, refresh } = useApp();
  const toast = useToast();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const supportCenter = me.limits.features.supportCenter;
  const dashboard = me.limits.features.basicDashboard;

  const [root, projectId, section = 'overview', sub] = route;
  const project = projects.find((p) => p.id === projectId) ?? projects[0];

  useEffect(() => {
    if (root === 'billing' || !project) return;
    if (root !== 'p' || !projects.some((p) => p.id === projectId)) {
      navigate(`/p/${project.id}/${project.tickets ? 'overview' : 'settings/install'}`);
    }
  }, [root, projectId, project, projects]);

  useEffect(() => setMenuOpen(false), [route.join('/')]);

  const addProject = async () => {
    const name = prompt('Name of the new app (e.g. “Customer portal”)');
    if (!name) return;
    try {
      const created = await api<{ id: string }>('/projects', { body: { name } });
      await refresh();
      navigate(`/p/${created.id}/settings/install`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
      if (error instanceof ApiError && error.code === 'upgrade') navigate('/billing');
    }
  };

  const signOut = async () => {
    await api('/auth/logout', { body: {} });
    onSignOut();
  };

  const trialDays =
    me.account.planStatus === 'trialing' && me.account.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(me.account.trialEndsAt).getTime() - Date.now()) / 86400_000))
      : null;

  let page = null;
  if (root === 'billing') page = <BillingPage />;
  else if (project) {
    if (section === 'overview') page = <OverviewPage key={project.id} project={project} />;
    else if (section === 'reports' && !supportCenter)
      page = (
        <div className="stack rise">
          <PageHead title="Reports" subtitle="Every report from your app in one place." />
          <div style={{ display: 'grid', placeItems: 'center', padding: '24px 0' }}>
            <Upsell title="Your support command center">
              The report repository is part of Business: every report with the live status of its ticket in Jira, Zendesk or ServiceNow, filters and search,
              similar reports grouped into issues, and the advanced dashboard.
            </Upsell>
          </div>
        </div>
      );
    else if (section === 'reports' && sub) page = <TicketPage key={sub} project={project} ticketId={sub} />;
    else if (section === 'reports') page = <ReportsPage key={project.id} project={project} />;
    else if (section === 'settings') page = <SettingsPage key={project.id} project={project} tab={sub ?? 'install'} />;
  }

  const nav = [
    { id: 'overview', label: 'Overview', icon: Icons.overview, locked: !dashboard },
    { id: 'reports', label: 'Reports', icon: Icons.reports, count: project?.tickets, locked: !supportCenter },
    { id: 'settings', label: 'Settings', icon: Icons.settings },
  ];

  return (
    <div className="shell">
      <div className="ambient" aria-hidden>
        <span />
      </div>
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <a className="brand" href="#/">
          <Nebula /> Lumora
        </a>

        <div className="field" style={{ padding: '0 2px 10px' }}>
          <select
            className="select"
            aria-label="App"
            value={project?.id ?? ''}
            onChange={(e) => (e.target.value === '__new' ? addProject() : navigate(`/p/${e.target.value}/${section === 'settings' ? 'settings' : section}`))}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__new">Add an app…</option>
          </select>
        </div>

        {project &&
          nav.map((n) => (
            <a key={n.id} className={`nav-link${root === 'p' && section === n.id ? ' active' : ''}`} href={`#/p/${project.id}/${n.id}`}>
              <n.icon /> {n.label}
              {n.locked ? (
                <span className="lock muted" title={n.id === 'overview' ? 'Pro plan' : 'Business plan'}>
                  <Icons.lock size={13} />
                </span>
              ) : n.count ? (
                <span className="count">{n.count}</span>
              ) : null}
            </a>
          ))}

        <div className="nav-label">Account</div>
        <a className={`nav-link${root === 'billing' ? ' active' : ''}`} href="#/billing">
          <Icons.billing /> Plan & billing
        </a>

        <div className="sidebar-footer">
          <div className="card card-pad small" style={{ padding: '12px 14px' }}>
            <div className="spread">
              <strong>{me.limits.name}</strong>
              {trialDays !== null && <span className="badge badge-accent">Trial · {trialDays}d left</span>}
              {!me.account.active && <span className="badge badge-danger">Inactive</span>}
            </div>
            <div className="muted tnum" style={{ marginTop: 2 }}>
              {me.usage.reports.toLocaleString()} of {me.limits.reportsPerMonth.toLocaleString()} reports
            </div>
            <div className="meter">
              <span style={{ width: `${Math.min(100, (me.usage.reports / me.limits.reportsPerMonth) * 100)}%` }} />
            </div>
          </div>
          <div className="spread small" style={{ padding: '0 6px' }}>
            <span className="muted" title={me.user.email}>
              {me.user.name}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div>
        <div className="mobile-bar">
          <button className="btn btn-sm btn-ghost" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Icons.menu />
          </button>
          <strong>{project?.name ?? 'Lumora'}</strong>
        </div>
        <main className="main">{page}</main>
      </div>
    </div>
  );
}
