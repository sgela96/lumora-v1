import { useState } from 'react';
import type { WidgetPosition } from '@lumora/shared';
import type { Project } from '../api';
import { Card, Field, SaveBar, SectionIntro, ToggleRow, useToast } from '../components/ui';
import { useApp, useFeatureLock, useSettingsDraft } from '../state';

const POSITIONS: { id: WidgetPosition; label: string }[] = [
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'top-left', label: 'Top left' },
];

const SWATCHES = ['#F59E0B', '#F97316', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#18181B'];

export function WidgetPage({ project }: { project: Project }) {
  const { me, updateProject } = useApp();
  const toast = useToast();
  const lock = useFeatureLock();
  const { draft, update, dirty, saving, save, reset } = useSettingsDraft(project, updateProject);
  const [previewKey, setPreviewKey] = useState(0);
  const a = draft.appearance;

  const onSave = async () => {
    try {
      await save();
      setPreviewKey((k) => k + 1);
      toast('Widget updated — live on your site');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  return (
    <div className="stack">
      <SectionIntro>How the nebula looks on your app and what people can do with it.</SectionIntro>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Appearance">
            <div className="stack">
              <Field label="Accent color">
                <div className="row">
                  <input className="input" type="color" value={a.accentColor} onChange={(e) => update((s) => void (s.appearance.accentColor = e.target.value.toUpperCase()))} />
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => update((s) => void (s.appearance.accentColor = c))}
                      style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: a.accentColor === c ? '3px solid var(--text)' : '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--border)', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              </Field>
              <div className="grid-2">
                <Field label="Position">
                  <select className="select" value={a.position} onChange={(e) => update((s) => void (s.appearance.position = e.target.value as WidgetPosition))}>
                    {POSITIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Theme">
                  <select className="select" value={a.theme} onChange={(e) => update((s) => void (s.appearance.theme = e.target.value as typeof a.theme))}>
                    <option value="auto">Follow the visitor’s system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Field>
                <Field label="Horizontal offset (px)">
                  <input className="input" type="number" min={0} max={200} value={a.offsetX} onChange={(e) => update((s) => void (s.appearance.offsetX = Number(e.target.value)))} />
                </Field>
                <Field label="Vertical offset (px)">
                  <input className="input" type="number" min={0} max={200} value={a.offsetY} onChange={(e) => update((s) => void (s.appearance.offsetY = Number(e.target.value)))} />
                </Field>
              </div>
              <div className="grid-2">
                <Field label="Language">
                  <select className="select" value={a.locale} onChange={(e) => update((s) => void (s.appearance.locale = e.target.value as typeof a.locale))}>
                    <option value="auto">Detect from the page</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </Field>
                <Field label="Greeting" hint="Leave empty for “Something not working?”">
                  <input className="input" maxLength={80} value={a.greeting} placeholder="Something not working?" onChange={(e) => update((s) => void (s.appearance.greeting = e.target.value))} />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Behaviour">
            <ToggleRow
              title="React to errors"
              description="When the page throws an error the sun looks worried and gently offers to report it."
              checked={a.proactiveOnError}
              onChange={(v) => update((s) => void (s.appearance.proactiveOnError = v))}
            />
            <ToggleRow
              title="Show “Powered by Lumora”"
              checked={a.showBranding || !me.limits.features.removeBranding}
              onChange={(v) => update((s) => void (s.appearance.showBranding = v))}
              lockedTo={lock('removeBranding')}
              description={lock('removeBranding') ? 'Remove the footer link on a higher plan.' : undefined}
            />
          </Card>

          <Card title="Ways to report">
            <ToggleRow title="Screenshot" description="Capture the page and mark it up (highlight, draw, hide private data)." checked={draft.reportTypes.screenshot} onChange={(v) => update((s) => void (s.reportTypes.screenshot = v))} />
            <ToggleRow
              title="Screen recording"
              description="Users record what happens; Lumora writes the steps to reproduce from their clicks."
              checked={draft.reportTypes.recording}
              onChange={(v) => update((s) => void (s.reportTypes.recording = v))}
              lockedTo={lock('recording')}
            >
              <div className="grid-2">
                <Field label="Max length (seconds)" hint={`Your plan allows up to ${me.limits.features.recordingMaxSeconds}s`}>
                  <input
                    className="input"
                    type="number"
                    min={10}
                    max={me.limits.features.recordingMaxSeconds || 600}
                    value={draft.recording.maxSeconds}
                    onChange={(e) => update((s) => void (s.recording.maxSeconds = Number(e.target.value)))}
                  />
                </Field>
                <Field label="Microphone">
                  <label className="row small">
                    <input type="checkbox" checked={draft.recording.allowMicrophone} onChange={(e) => update((s) => void (s.recording.allowMicrophone = e.target.checked))} /> Let users narrate
                  </label>
                </Field>
              </div>
            </ToggleRow>
            <ToggleRow title="Just describe it" description="A quick form without attachments." checked={draft.reportTypes.describe} onChange={(v) => update((s) => void (s.reportTypes.describe = v))} />
          </Card>
        </div>

        <Card
          title="Live preview"
          actions={
            <button className="btn btn-sm" onClick={() => setPreviewKey((k) => k + 1)}>
              Reload
            </button>
          }
        >
          <iframe key={previewKey} className="preview-frame" title="Widget preview" src={`/demo/?key=${encodeURIComponent(project.publicKey)}&preview=1`} />
          <p className="hint" style={{ marginTop: 8 }}>
            The preview uses the saved settings{dirty ? ' — save to see your changes' : ''}.
          </p>
        </Card>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onReset={reset} />
    </div>
  );
}
