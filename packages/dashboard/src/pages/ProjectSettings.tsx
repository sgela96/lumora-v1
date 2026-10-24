import { useState } from 'react';
import { api, type Project } from '../api';
import { Card, Field, PageHead, useToast } from '../components/ui';
import { navigate, useApp } from '../state';

export function ProjectSettingsPage({ project }: { project: Project }) {
  const { refresh, updateProject } = useApp();
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [prefix, setPrefix] = useState(project.ticketPrefix);
  const [origins, setOrigins] = useState(project.allowedOrigins.join('\n'));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api<Project>(`/projects/${project.id}`, {
        method: 'PATCH',
        body: { name, ticketPrefix: prefix, allowedOrigins: origins.split(/[\n,]/).map((o) => o.trim()).filter(Boolean) },
      });
      updateProject(saved);
      setOrigins(saved.allowedOrigins.join('\n'));
      toast('Settings saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!confirm('Generate a new key? The current snippet stops working until you update it on your site.')) return;
    updateProject(await api<Project>(`/projects/${project.id}/rotate-key`, { body: {} }));
    toast('New key generated — update the snippet on your site');
  };

  const remove = async () => {
    if (prompt(`Type “${project.name}” to delete this site and all its reports.`) !== project.name) return;
    await api(`/projects/${project.id}`, { method: 'DELETE' });
    await refresh();
    navigate('/');
  };

  return (
    <div className="stack">
      <PageHead title="Site settings" subtitle={project.name} />
      <Card title="General">
        <div className="stack">
          <div className="grid-2">
            <Field label="Site name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Ticket reference prefix" hint={`References look like ${prefix || 'LUM'}-42`}>
              <input className="input mono" value={prefix} maxLength={10} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            </Field>
          </div>
          <Field label="Allowed domains" hint="One per line, e.g. https://app.acme.com or https://*.acme.com. Leave empty to allow any site (fine while testing).">
            <textarea className="textarea" rows={4} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://app.acme.com" />
          </Field>
          <div>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Card>

      <Card title="Widget key">
        <div className="spread">
          <div>
            <code>{project.publicKey}</code>
            <p className="hint">Public by design (it lives in your page). Restrict domains above to stop others from using it.</p>
          </div>
          <button className="btn" onClick={rotate}>
            Rotate key
          </button>
        </div>
      </Card>

      <Card title="Danger zone">
        <div className="spread">
          <p className="muted">Delete this site, its configuration and every report. This can’t be undone.</p>
          <button className="btn btn-danger" onClick={remove}>
            Delete site
          </button>
        </div>
      </Card>
    </div>
  );
}
