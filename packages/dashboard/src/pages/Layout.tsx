import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { HelpPanel } from '../components/Help';
import { Icons } from '../components/icons';
import { Tour, tourSteps } from '../components/Tour';
import { Showcase } from '../components/Showcase';
import { Nebula, PageHead, Upsell, useToast } from '../components/ui';
import { TrialButton } from '../components/TrialButton';
import { ThemeToggle } from '../components/ThemeToggle';
import { navigate, useApp, useRoute } from '../state';
import { BillingPage } from './Billing';
import { OverviewPage } from './Overview';
import { ReportsPage } from './Reports';
import { SettingsPage } from './Settings';
import { SetupPage } from './Setup';
import { TicketPage } from './Ticket';

export function Layout({ onSignOut }: { onSignOut: () => void }) {
  const { me, projects, refresh } = useApp();
  const toast = useToast();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [touring, setTouring] = useState(false);
  const onboarding = me.account.onboarding ?? {};
  const supportCenter = me.limits.features.supportCenter;
  const dashboard = me.limits.features.basicDashboard;

  const [root, projectId, section = 'overview', sub] = route;
  const project = projects.find((p) => p.id === projectId) ?? projects[0];

  useEffect(() => {
    if (root === 'billing' || root === 'setup' || !project) return;
    if (root !== 'p' || !projects.some((p) => p.id === projectId)) {
      // New accounts land in the setup guide until they finish or skip it.
      navigate(!onboarding.setupDone ? '/setup' : `/p/${project.id}/${project.tickets ? 'overview' : 'settings/install'}`);
    }
  }, [root, projectId, project, projects, onboarding.setupDone]);

  const saveOnboarding = useCallback((patch: Record<string, boolean>) => api('/me/onboarding', { method: 'PATCH', body: patch }).then(refresh), [refresh]);

  // After a payment, new extras or a started trial, celebrate once with what just got unlocked. Downgrades are acknowledged silently.
  const planChanged = me.account.planKey !== onboarding.seenPlan;
  const celebrate = planChanged && me.account.plan !== 'free' && ['active', 'trialing'].includes(me.account.planStatus) && root !== 'setup';
  const acked = useRef(false);
  useEffect(() => {
    if (planChanged && !celebrate && !acked.current && root !== 'setup') {
      acked.current = true;
      void saveOnboarding({ seenPlan: true });
    }
  }, [planChanged, celebrate, root, saveOnboarding]);

  const startTour = () => {
    if (root !== 'p') navigate(`/p/${project?.id}/overview`);
    setTouring(true);
  };
  const endTour = () => {
    setTouring(false);
    if (!onboarding.tourDone) void saveOnboarding({ tourDone: true });
  };

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

  if (root === 'setup' && project) {
    return (
      <SetupPage
        project={project}
        onFinish={async (tour) => {
          await saveOnboarding({ setupDone: true });
          navigate(`/p/${project.id}/overview`);
          if (tour) setTouring(true);
        }}
      />
    );
  }

  let page = null;
  if (root === 'billing') page = <BillingPage />;
  else if (project) {
    if (section === 'overview') page = <OverviewPage key={project.id} project={project} />;
    else if (section === 'reports' && sub) page = <TicketPage key={sub} project={project} ticketId={sub} />;
    else if (section === 'reports') page = <ReportsPage key={project.id} project={project} />;
    else if (section === 'settings') page = <SettingsPage key={project.id} project={project} tab={sub ?? 'install'} />;
  }

  const nav = [
    { id: 'overview', label: 'Overview', icon: Icons.overview, locked: !dashboard },
    { id: 'reports', label: 'Reports', icon: Icons.reports, count: project?.tickets, locked: false },
    { id: 'settings', label: 'Settings', icon: Icons.settings },
  ];

  return (
    <div className="shell">
      <div className="ambient" aria-hidden>
        <span />
      </div>
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="brand-row">
          <a className="brand" href="#/">
            <Nebula /> Lumora
            {me.account.plan !== 'free' && <span className={`plan-chip plan-${me.account.plan}`}>{me.limits.name}</span>}
          </a>
          <ThemeToggle />
        </div>

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
            <a key={n.id} data-tour={`nav-${n.id}`} className={`nav-link${root === 'p' && section === n.id ? ' active' : ''}`} href={`#/p/${project.id}/${n.id}`}>
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
        <a data-tour="nav-billing" className={`nav-link${root === 'billing' ? ' active' : ''}`} href="#/billing">
          <Icons.billing /> Plan & billing
        </a>
        <button data-tour="help" className="nav-link" onClick={() => setHelpOpen(true)}>
          <Icons.help /> Help
        </button>

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
            {me.account.canTrial && <TrialButton className="btn btn-sm btn-primary trial-nudge" />}
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
        <main className="main">
          {trialDays !== null && trialDays <= 3 && root !== 'billing' && (
            <div className="trial-banner rise">
              <Icons.sparkle size={16} />
              <span>
                Your Pro trial ends {trialDays === 0 ? 'today' : `in ${trialDays} day${trialDays === 1 ? '' : 's'}`}. Keep recordings, the dashboard and your template — or move to Free.
              </span>
              <a className="btn btn-sm btn-primary" href="#/billing" style={{ textDecoration: 'none' }}>
                Choose a plan
              </a>
            </div>
          )}
          {!onboarding.setupDone && project && root === 'p' && (
            <div className="trial-banner rise">
              <Icons.check size={16} />
              <span>Finish setting up Lumora — it takes about five minutes.</span>
              <a className="btn btn-sm" href="#/setup" style={{ textDecoration: 'none' }}>
                Continue setup
              </a>
            </div>
          )}
          {page}
        </main>
      </div>
      {helpOpen && <HelpPanel me={me} project={project} onClose={() => setHelpOpen(false)} onTour={startTour} />}
      {touring && <Tour steps={tourSteps(me)} onDone={endTour} />}
      {celebrate && !touring && (
        <Showcase
          me={me}
          projectId={project?.id}
          onClose={() => void saveOnboarding({ seenPlan: true })}
          onTour={() => {
            void saveOnboarding({ seenPlan: true });
            startTour();
          }}
        />
      )}
    </div>
  );
}
