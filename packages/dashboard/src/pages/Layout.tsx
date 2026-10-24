import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useToast } from '../components/ui';
import { navigate, useApp, useRoute } from '../state';
import { BillingPage } from './Billing';
import { CapturePage } from './Capture';
import { InboxPage } from './Inbox';
import { InstallPage } from './Install';
import { IntegrationsPage } from './Integrations';
import { ProjectSettingsPage } from './ProjectSettings';
import { TemplatePage } from './Template';
import { TicketPage } from './Ticket';
import { WidgetPage } from './Widget';

const SECTIONS = [
  { id: 'inbox', label: 'Reports', icon: '📥' },
  { id: 'install', label: 'Install', icon: '⚡' },
  { id: 'widget', label: 'Widget', icon: '☀️' },
  { id: 'template', label: 'Ticket template', icon: '📝' },
  { id: 'capture', label: 'Data capture', icon: '🛰️' },
  { id: 'integrations', label: 'Integrations', icon: '🔌' },
  { id: 'settings', label: 'Site settings', icon: '⚙️' },
] as const;

export function Layout({ onSignOut }: { onSignOut: () => void }) {
  const { me, projects, refresh } = useApp();
  const toast = useToast();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  const [root, projectId, section = 'inbox', sub] = route;
  const project = projects.find((p) => p.id === projectId) ?? projects[0];

  useEffect(() => {
    if (root !== 'billing' && (root !== 'projects' || !projects.some((p) => p.id === projectId)) && project) {
      navigate(`/projects/${project.id}/${project.tickets ? 'inbox' : 'install'}`);
    }
  }, [root, projectId, project, projects]);

  useEffect(() => setMenuOpen(false), [route.join('/')]);

  const addProject = async () => {
    const name = prompt('Name of the new site (e.g. “Customer portal”)');
    if (!name) return;
    try {
      const created = await api<{ id: string }>('/projects', { body: { name } });
      await refresh();
      navigate(`/projects/${created.id}/install`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
      if (error instanceof ApiError && error.code === 'upgrade') navigate('/billing');
    }
  };

  const signOut = async () => {
    await api('/auth/logout', { body: {} });
    onSignOut();
  };

  const trialDays = me.account.planStatus === 'trialing' && me.account.trialEndsAt ? Math.max(0, Math.ceil((new Date(me.account.trialEndsAt).getTime() - Date.now()) / 86400_000)) : null;

  let page = null;
  if (root === 'billing') page = <BillingPage />;
  else if (project) {
    const key = `${project.id}-${section}`;
    if (section === 'inbox' && sub) page = <TicketPage key={sub} project={project} ticketId={sub} />;
    else if (section === 'inbox') page = <InboxPage key={key} project={project} />;
    else if (section === 'install') page = <InstallPage key={key} project={project} />;
    else if (section === 'widget') page = <WidgetPage key={key} project={project} />;
    else if (section === 'template') page = <TemplatePage key={key} project={project} />;
    else if (section === 'capture') page = <CapturePage key={key} project={project} />;
    else if (section === 'integrations') page = <IntegrationsPage key={key} project={project} />;
    else if (section === 'settings') page = <ProjectSettingsPage key={key} project={project} />;
  }

  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <a className="brand" href="#/">
          <span className="brand-sun" /> Lumora
        </a>

        <div className="field" style={{ padding: '0 4px 6px' }}>
          <select
            className="select"
            aria-label="Site"
            value={project?.id ?? ''}
            onChange={(e) => (e.target.value === '__new' ? addProject() : navigate(`/projects/${e.target.value}/${section}`))}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__new">＋ Add a site…</option>
          </select>
        </div>

        {project &&
          SECTIONS.map((s) => (
            <a key={s.id} className={`nav-link${root === 'projects' && section === s.id ? ' active' : ''}`} href={`#/projects/${project.id}/${s.id}`}>
              <span aria-hidden>{s.icon}</span> {s.label}
              {s.id === 'inbox' && project.tickets ? <span className="count">{project.tickets}</span> : null}
            </a>
          ))}

        <div className="nav-label">Account</div>
        <a className={`nav-link${root === 'billing' ? ' active' : ''}`} href="#/billing">
          <span aria-hidden>💳</span> Plan & billing
        </a>

        <div className="sidebar-footer">
          <div className="small">
            <div className="spread">
              <strong>{me.limits.name}</strong>
              {trialDays !== null && <span className="badge badge-accent">Trial · {trialDays}d</span>}
              {!me.account.active && <span className="badge badge-danger">Inactive</span>}
            </div>
            <div className="muted">
              {me.usage.reports} / {me.limits.reportsPerMonth.toLocaleString()} reports this month
            </div>
            <div className="meter">
              <span style={{ width: `${Math.min(100, (me.usage.reports / me.limits.reportsPerMonth) * 100)}%` }} />
            </div>
          </div>
          <div className="spread small">
            <span className="muted" title={me.user.email}>{me.user.name}</span>
            <button className="btn btn-sm btn-ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div>
        <div className="mobile-bar">
          <button className="btn btn-sm" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <strong>{project?.name ?? 'Lumora'}</strong>
        </div>
        <main className="main">{page}</main>
      </div>
    </div>
  );
}
