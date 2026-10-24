import { minimumPlanForIntegration, PLANS } from '@lumora/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type ConnectorInfo, type Integration, type Project } from '../api';
import { Card, Field, PageHead, Switch, UpgradeBadge, useToast } from '../components/ui';
import { navigate, useApp } from '../state';

const LOGOS: Record<string, string> = {
  webhook: '🪝',
  slack: '💬',
  email: '✉️',
  jira: '🟦',
  zendesk: '🟩',
  freshdesk: '🟢',
  github: '🐙',
  linear: '🟪',
  salesforce: '☁️',
};

export function IntegrationsPage({ project }: { project: Project }) {
  const { me, catalog } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<Integration[] | null>(null);
  const [editing, setEditing] = useState<{ connector: ConnectorInfo; integration?: Integration } | null>(null);

  const load = () => api<Integration[]>(`/projects/${project.id}/integrations`).then(setItems);
  useEffect(() => {
    load();
  }, [project.id]);

  const categoryField = project.settings.template.fields.find((f) => f.id === 'category' && f.type === 'select');
  const active = items?.filter((i) => i.enabled).length ?? 0;
  const max = me.limits.destinationsPerProject;

  const toggle = async (integration: Integration, enabled: boolean) => {
    try {
      await api(`/integrations/${integration.id}`, { method: 'PATCH', body: { enabled } });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  const test = async (integration: Integration) => {
    const result = await api<{ ok: boolean; message: string }>(`/integrations/${integration.id}/test`, { body: {} });
    toast(result.ok ? `✓ ${result.message}` : result.message, !result.ok);
  };

  const remove = async (integration: Integration) => {
    if (!confirm(`Remove ${integration.name}? Reports will no longer be sent there.`)) return;
    await api(`/integrations/${integration.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="stack">
      <PageHead
        title="Integrations"
        subtitle={`Where reports go. ${active} of ${max} destination${max === 1 ? '' : 's'} in use on your plan.`}
      />

      {items && items.length > 0 && (
        <Card title="Connected" pad={false}>
          <table className="table">
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td style={{ width: 40, fontSize: 22 }}>{LOGOS[i.type]}</td>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="muted small">
                      {catalog.integrations.find((c) => c.type === i.type)?.label}
                      {i.categories.length > 0 && ` · only ${i.categories.join(', ')}`}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => test(i)}>
                        Test
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditing({ connector: catalog.integrations.find((c) => c.type === i.type)!, integration: i })}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-ghost btn-danger" onClick={() => remove(i)}>
                        Remove
                      </button>
                      <Switch checked={i.enabled} onChange={(v) => toggle(i, v)} label={`Enable ${i.name}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing ? (
        <IntegrationForm
          project={project}
          connector={editing.connector}
          integration={editing.integration}
          categories={me.limits.features.routingByCategory ? categoryField?.options ?? [] : []}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        <Card title="Add a destination">
          <div className="grid-3">
            {catalog.integrations.map((c) => {
              const allowed = PLANS[me.account.plan].integrations.includes(c.type);
              return (
                <button key={c.type} className="card integration-tile" onClick={() => (allowed ? setEditing({ connector: c }) : navigate('/billing'))}>
                  <div className="spread">
                    <span style={{ fontSize: 26 }}>{LOGOS[c.type]}</span>
                    {!allowed && <UpgradeBadge plan={minimumPlanForIntegration(c.type)} />}
                  </div>
                  <strong>{c.label}</strong>
                  <span className="muted small">{c.description}</span>
                </button>
              );
            })}
          </div>
          {!me.server.emailAvailable && <p className="hint" style={{ marginTop: 12 }}>E-mail delivery needs SMTP_URL configured on the server.</p>}
        </Card>
      )}
    </div>
  );
}

function IntegrationForm({
  project,
  connector,
  integration,
  categories,
  onCancel,
  onSaved,
}: {
  project: Project;
  connector: ConnectorInfo;
  integration?: Integration;
  categories: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(integration?.name ?? connector.label);
  const [config, setConfig] = useState<Record<string, string>>(integration?.config ?? {});
  const [only, setOnly] = useState<string[]>(integration?.categories ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { name, config, categories: only, type: connector.type };
      const saved = integration
        ? await api<Integration>(`/integrations/${integration.id}`, { method: 'PATCH', body })
        : await api<Integration>(`/projects/${project.id}/integrations`, { body });
      const result = await api<{ ok: boolean; message: string }>(`/integrations/${saved.id}/test`, { body: {} });
      toast(result.ok ? `Connected — ${result.message}` : `Saved, but the test failed: ${result.message}`, !result.ok);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (err instanceof ApiError && err.code === 'upgrade') toast('Upgrade your plan to add this destination', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`${LOGOS[connector.type]} ${integration ? 'Edit' : 'Connect'} ${connector.label}`}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">{connector.description}</p>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid-2">
          {connector.fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? '' : ' (optional)'}`} hint={f.help}>
              <input
                className="input"
                type={f.type === 'password' ? 'password' : f.type === 'email' ? 'email' : 'text'}
                placeholder={f.placeholder}
                required={f.required && !(f.type === 'password' && integration)}
                value={config[f.key] ?? ''}
                autoComplete="off"
                onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        {categories.length > 0 && (
          <Field label="Only send these categories" hint="Leave all unchecked to receive every report.">
            <div className="row">
              {categories.map((c) => (
                <label key={c} className="row small" style={{ gap: 4 }}>
                  <input type="checkbox" checked={only.includes(c)} onChange={(e) => setOnly(e.target.checked ? [...only, c] : only.filter((x) => x !== c))} />
                  {c}
                </label>
              ))}
            </div>
          </Field>
        )}
        {error && <div className="notice notice-danger">{error}</div>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Connecting…' : integration ? 'Save & test' : 'Connect & test'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
