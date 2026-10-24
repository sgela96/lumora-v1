import { DEFAULT_DESCRIPTION_TEMPLATE, DEFAULT_TITLE_TEMPLATE, type FieldType, type TemplateField } from '@lumora/shared';
import type { Project } from '../api';
import { Card, Field, SaveBar, SectionIntro, UpgradeBadge, useToast } from '../components/ui';
import { useApp, useFeatureLock, useSettingsDraft } from '../state';

const TYPES: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Short text' },
  { id: 'textarea', label: 'Long text' },
  { id: 'select', label: 'Choice' },
  { id: 'email', label: 'E-mail' },
  { id: 'checkbox', label: 'Checkbox' },
];

const PRESET_ES: TemplateField[] = [
  { id: 'category', label: 'Tipo', type: 'select', required: true, options: ['Error', 'Consulta', 'Idea'] },
  { id: 'description', label: '¿Qué pasó?', type: 'textarea', required: true, placeholder: 'Contanos qué esperabas y qué pasó en su lugar' },
];

export function TemplatePage({ project }: { project: Project }) {
  const { catalog, updateProject } = useApp();
  const toast = useToast();
  const locked = useFeatureLock()('customTemplate');
  const { draft, update, dirty, saving, save, reset } = useSettingsDraft(project, updateProject);
  const t = draft.template;

  const setField = (i: number, patch: Partial<TemplateField>) => update((s) => void Object.assign(s.template.fields[i], patch));
  const move = (i: number, dir: -1 | 1) =>
    update((s) => {
      const f = s.template.fields;
      const j = i + dir;
      if (j < 0 || j >= f.length) return;
      [f[i], f[j]] = [f[j], f[i]];
    });

  const onSave = async () => {
    try {
      await save();
      toast('Template saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  return (
    <div className="stack">
      <SectionIntro actions={locked && <UpgradeBadge plan={locked} />}>The form people fill in, and how the ticket reads in your tracker.</SectionIntro>
      {locked && <div className="notice notice-accent">Your plan uses the default template. Upgrade to customize fields and the ticket layout.</div>}

      <fieldset disabled={!!locked} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <Card
          title="Form fields"
          actions={
            <div className="row">
              <button className="btn btn-sm" type="button" onClick={() => update((s) => void (s.template.fields = structuredClone(PRESET_ES)))}>
                Use Spanish preset
              </button>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() =>
                  update((s) =>
                    void s.template.fields.push({ id: `field${s.template.fields.length + 1}`, label: 'New field', type: 'text', required: false }),
                  )
                }
              >
                ＋ Add field
              </button>
            </div>
          }
        >
          <div className="stack-sm">
            {t.fields.map((f, i) => (
              <div key={i} className="stack-sm">
                <div className="field-editor">
                  <input className="input" aria-label="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                  <input className="input mono" aria-label="Field id" value={f.id} onChange={(e) => setField(i, { id: e.target.value.replace(/[^\w-]/g, '') })} title="Used as {{fields.id}}" />
                  <select className="select" aria-label="Type" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType, options: e.target.value === 'select' ? f.options ?? ['Option 1'] : undefined })}>
                    {TYPES.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <label className="row small" style={{ flexWrap: 'nowrap' }}>
                    <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Required
                  </label>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button className="btn btn-sm btn-ghost btn-danger" type="button" onClick={() => update((s) => void s.template.fields.splice(i, 1))} aria-label="Remove">✕</button>
                  </div>
                </div>
                {(f.type === 'select' || f.type === 'text' || f.type === 'textarea') && (
                  <div style={{ paddingLeft: 12 }}>
                    {f.type === 'select' ? (
                      <input
                        className="input"
                        placeholder="Options, comma separated"
                        value={(f.options ?? []).join(', ')}
                        onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                        onBlur={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                      />
                    ) : (
                      <input className="input" placeholder="Placeholder (optional)" value={f.placeholder ?? ''} onChange={(e) => setField(i, { placeholder: e.target.value })} />
                    )}
                  </div>
                )}
              </div>
            ))}
            <p className="hint">
              Tip: a choice field with id <code>category</code> can route tickets to different destinations (Business) and is used in the default title.
            </p>
          </div>
        </Card>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <Card title="Ticket layout">
            <div className="stack">
              <Field label="Title">
                <input className="input mono" value={t.titleTemplate} onChange={(e) => update((s) => void (s.template.titleTemplate = e.target.value))} />
              </Field>
              <Field label="Description (Markdown)" hint="Converted automatically to Jira, Zendesk, Slack… formatting. Empty sections are removed.">
                <textarea className="textarea" rows={18} value={t.descriptionTemplate} onChange={(e) => update((s) => void (s.template.descriptionTemplate = e.target.value))} />
              </Field>
              <div>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() =>
                    update((s) => {
                      s.template.titleTemplate = DEFAULT_TITLE_TEMPLATE;
                      s.template.descriptionTemplate = DEFAULT_DESCRIPTION_TEMPLATE;
                    })
                  }
                >
                  Restore default layout
                </button>
              </div>
            </div>
          </Card>
          <Card title="Variables">
            <table className="table small">
              <tbody>
                {catalog.templateVariables.map((v) => (
                  <tr key={v.name}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {v.name}
                    </td>
                    <td className="muted">{v.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </fieldset>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onReset={reset} />
    </div>
  );
}
