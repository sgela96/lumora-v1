import { formatError } from '@lumora/shared';
import { useState } from 'react';
import { api, type Project } from '../api';
import { Card, CopyButton, Field, SectionIntro, useToast } from '../components/ui';
import { navigate, useApp } from '../state';

/** Settings → App: what this app is called, which sites may use its widget, its key, and deleting it. */
export function ProjectSettingsPage({ project }: { project: Project }) {
  const { me, refresh, updateProject } = useApp();
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [prefix, setPrefix] = useState(project.ticketPrefix);
  const [origins, setOrigins] = useState(project.allowedOrigins.join('\n'));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleting, setDeleting] = useState(false);

  const originList = origins.split(/[\n,]/).map((o) => o.trim()).filter(Boolean);
  // Wildcards like https://*.acme.com are allowed; check the rest as a normal address.
  const badOrigin = originList.map((o) => (formatError('url', o.replace('*.', 'x.'), o) ? o : null)).find(Boolean);
  const dirty = name !== project.name || prefix !== project.ticketPrefix || originList.join('\n') !== project.allowedOrigins.join('\n');

  const save = async () => {
    if (badOrigin) return toast(`“${badOrigin}” isn’t a web address. Use the form https://app.acme.com`, true);
    setBusy(true);
    try {
      const saved = await api<Project>(`/projects/${project.id}`, { method: 'PATCH', body: { name, ticketPrefix: prefix, allowedOrigins: originList } });
      updateProject(saved);
      setOrigins(saved.allowedOrigins.join('\n'));
      toast('Saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!confirm('Create a new key? The snippet on your site stops working until you paste the new one.')) return;
    updateProject(await api<Project>(`/projects/${project.id}/rotate-key`, { body: {} }));
    toast('New key created. Update the snippet on your site.');
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      await refresh();
      navigate('/');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      setDeleting(false);
    }
  };

  return (
    <div className="stack">
      <SectionIntro>
        An app is one product where the widget lives, like your customer portal or your admin panel. {me.account.name} can have {me.limits.projects === 1 ? 'one app on this plan' : `up to ${me.limits.projects} apps`}, each with its own widget, settings and reports.
      </SectionIntro>

      <Card title="This app">
        <div className="grid-2">
          <Field label="App name" hint="Shown in the back office and in the tickets Lumora creates.">
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Report reference prefix" hint={<>Every report gets a short reference, like <span className="mono">{prefix || 'APP'}-42</span>, so your team can mention it.</>}>
            <input className="input mono" value={prefix} maxLength={10} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          </Field>
        </div>
      </Card>

      <Card title="Where the widget can run">
        <div className="stack">
          <p className="muted">
            Your widget key sits in your page’s code, like an analytics key, so anyone could copy it. Listing your domains makes sure only your sites can send reports with it.
          </p>
          <Field
            label="Allowed domains"
            hint={
              badOrigin ? (
                <span className="field-error">“{badOrigin}” isn’t a web address. Use the form https://app.acme.com</span>
              ) : originList.length ? (
                'One per line. Use https://*.acme.com to allow every subdomain.'
              ) : (
                <span className="badge badge-warn">Any site can use this key right now. Fine while you test; add your domain before going live.</span>
              )
            }
          >
            <textarea className={`textarea mono${badOrigin ? ' invalid' : ''}`} rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={'https://app.acme.com\nhttps://*.acme.com'} />
          </Field>
        </div>
      </Card>

      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <Card title="Widget key">
        <div className="spread" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <code className="mono">{project.publicKey}</code>
              <CopyButton text={project.publicKey} />
            </div>
            <p className="hint">It tells Lumora which app a report belongs to. Create a new one if you want every old copy of the snippet to stop working.</p>
          </div>
          <button className="btn" onClick={rotate}>
            Create a new key
          </button>
        </div>
      </Card>

      <Card title="Delete this app">
        <div className="stack">
          <p className="muted">Deletes the app, its widget settings, its destinations and every report. The widget stops working on your site. This can’t be undone.</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ maxWidth: 280 }} placeholder={`Type “${project.name}” to confirm`} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} aria-label="Type the app name to confirm" />
            <button className="btn btn-danger" onClick={remove} disabled={confirmDelete !== project.name || deleting}>
              {deleting ? 'Deleting…' : 'Delete app'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
