import { INTEGRATION_CATEGORIES, minimumPlanForIntegration, PLANS, type IntegrationCategory } from '@lumora/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type ConnectorInfo, type Integration, type Project } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { Card, CopyButton, Field, SectionIntro, Switch, UpgradeBadge, useToast } from '../components/ui';
import { navigate, useApp } from '../state';

const ORDER: IntegrationCategory[] = ['trackers', 'helpdesks', 'enterprise', 'messaging'];

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
  const connectorOf = (type: string) => catalog.integrations.find((c) => c.type === type)!;

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
    toast(result.ok ? result.message : result.message, !result.ok);
  };

  const remove = async (integration: Integration) => {
    if (!confirm(`Remove ${integration.name}? New reports will no longer be sent there.`)) return;
    await api(`/integrations/${integration.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="stack">
      <SectionIntro>
        Where tickets are created, following your template. {active} of {max} destination{max === 1 ? '' : 's'} in use.
      </SectionIntro>

      {items && items.length > 0 && !editing && (
        <Card title="Connected" pad={false}>
          <table className="table">
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td style={{ width: 52, paddingRight: 0 }}>
                    <LogoTile type={i.type} />
                  </td>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="muted small row" style={{ gap: 6 }}>
                      {connectorOf(i.type)?.label}
                      {i.syncsStatus && (
                        <span className="badge" title="Ticket status is read back into Lumora">
                          <Icons.sync size={11} /> Status sync{me.limits.features.supportCenter ? '' : ' · Business'}
                        </span>
                      )}
                      {i.categories.length > 0 && <span>· only {i.categories.join(', ')}</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => test(i)}>
                        Test
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditing({ connector: connectorOf(i.type), integration: i })}>
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
          categories={me.limits.features.routingByCategory ? (categoryField?.options ?? []) : []}
          showHook={me.limits.features.supportCenter}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        ORDER.map((cat) => (
          <Card key={cat} title={INTEGRATION_CATEGORIES[cat].label}>
            <div className="grid-3">
              {INTEGRATION_CATEGORIES[cat].types.map((type) => {
                const c = connectorOf(type);
                if (!c) return null;
                const allowed = PLANS[me.account.plan].integrations.includes(c.type);
                return (
                  <button key={c.type} className="card integration-tile" style={{ background: 'var(--surface-2)', boxShadow: 'none' }} onClick={() => (allowed ? setEditing({ connector: c }) : navigate('/billing'))}>
                    <div className="spread">
                      <LogoTile type={c.type} />
                      {!allowed ? (
                        <UpgradeBadge
                          plan={minimumPlanForIntegration(c.type)}
                          label={me.account.plan === 'pro' && INTEGRATION_CATEGORIES.helpdesks.types.includes(c.type) ? 'Help desks extra' : undefined}
                        />
                      ) : c.syncsStatus ? <span className="badge"><Icons.sync size={11} /> Syncs status</span> : null}
                    </div>
                    <strong>{c.label}</strong>
                    <span className="muted small">{c.description}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        ))
      )}
      {!editing && !me.server.emailAvailable && <p className="hint">E-mail delivery needs SMTP_URL configured on the server.</p>}
    </div>
  );
}

function IntegrationForm({
  project,
  connector,
  integration,
  categories,
  showHook,
  onCancel,
  onSaved,
}: {
  project: Project;
  connector: ConnectorInfo;
  integration?: Integration;
  categories: string[];
  showHook: boolean;
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
    <Card
      title={
        <span className="row" style={{ gap: 10 }}>
          <LogoTile type={connector.type} /> {integration ? 'Edit' : 'Connect'} {connector.label}
        </span>
      }
    >
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
        {connector.syncsStatus && showHook && (
          <div className="notice stack-sm">
            <strong>Live status updates</strong>
            <span>
              Lumora checks the status of linked {connector.label} tickets every couple of minutes. For instant updates, add this URL as a webhook in{' '}
              {connector.label} (issue/ticket updated events):
            </span>
            {integration?.hookUrl ? (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{integration.hookUrl}</code>
                <CopyButton text={integration.hookUrl} />
              </div>
            ) : (
              <span className="muted small">The URL appears here once the destination is saved.</span>
            )}
          </div>
        )}
        {error && <div className="notice notice-danger">{error}</div>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Connecting…' : integration ? 'Save and test' : 'Connect and test'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
