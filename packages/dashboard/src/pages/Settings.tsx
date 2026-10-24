import type { Project } from '../api';
import { PageHead } from '../components/ui';
import { CapturePage } from './Capture';
import { InstallPage } from './Install';
import { IntegrationsPage } from './Integrations';
import { ProjectSettingsPage } from './ProjectSettings';
import { TemplatePage } from './Template';
import { WidgetPage } from './Widget';

const TABS = [
  { id: 'install', label: 'Install' },
  { id: 'widget', label: 'Widget' },
  { id: 'template', label: 'Ticket template' },
  { id: 'capture', label: 'Data capture' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'general', label: 'General' },
] as const;

export function SettingsPage({ project, tab }: { project: Project; tab: string }) {
  const current = TABS.find((t) => t.id === tab)?.id ?? 'install';
  return (
    <div>
      <PageHead title="Settings" subtitle={project.name} />
      <nav className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <a key={t.id} role="tab" aria-selected={current === t.id} className="tab" href={`#/p/${project.id}/settings/${t.id}`}>
            {t.label}
          </a>
        ))}
      </nav>
      {current === 'install' && <InstallPage key={project.id} project={project} />}
      {current === 'widget' && <WidgetPage key={project.id} project={project} />}
      {current === 'template' && <TemplatePage key={project.id} project={project} />}
      {current === 'capture' && <CapturePage key={project.id} project={project} />}
      {current === 'integrations' && <IntegrationsPage key={project.id} project={project} />}
      {current === 'general' && <ProjectSettingsPage key={project.id} project={project} />}
    </div>
  );
}
