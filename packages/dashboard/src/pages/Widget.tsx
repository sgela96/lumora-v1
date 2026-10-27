import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { clampSettingsToPlan, type LauncherMode, type WidgetPosition } from '@lumora/shared';
import type { Project } from '../api';
import { Icons } from '../components/icons';
import { Card, Field, SaveBar, SectionIntro, TierBadge, ToggleRow, UpgradeBadge, useToast } from '../components/ui';
import { useApp, useFeatureLock, useFeatureTier, useSettingsDraft } from '../state';

const LAUNCHER_MODES: { id: LauncherMode; title: string; description: string; icon: (p: { size?: number }) => ReactElement }[] = [
  { id: 'always', title: 'Always visible', description: 'The nebula sits in its corner on every page.', icon: Icons.sun },
  { id: 'onError', title: 'When something goes wrong', description: 'Hidden until a problem shows up, then it appears and offers help.', icon: Icons.alert },
  { id: 'manual', title: 'Only from your app', description: "No nebula on the page. Open it from a link or menu with Lumora('open').", icon: Icons.code },
];

const POSITIONS: { id: WidgetPosition; label: string }[] = [
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'top-left', label: 'Top left' },
];

export function WidgetPage({ project }: { project: Project }) {
  const { me, updateProject } = useApp();
  const toast = useToast();
  const lock = useFeatureLock();
  const tier = useFeatureTier();
  const { draft, update, dirty, saving, save, reset } = useSettingsDraft(project, updateProject);
  const [previewKey, setPreviewKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const a = draft.appearance;
  const smart = draft.smart;
  const smartLock = lock('smartLauncher');
  const [selector, setSelector] = useState('');

  // Live preview: the demo page's widget redraws with the unsaved settings, clamped to the plan.
  const sendPreview = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'lumora:preview', settings: clampSettingsToPlan(draft, me.limits) }, location.origin);
  }, [draft, me.limits]);
  useEffect(() => {
    const t = window.setTimeout(sendPreview, 200);
    return () => window.clearTimeout(t);
  }, [sendPreview]);
  useEffect(() => {
    const onReady = (e: MessageEvent) => e.origin === location.origin && e.data?.type === 'lumora:preview-ready' && sendPreview();
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, [sendPreview]);

  const simulateError = () => {
    frame.current?.contentWindow?.postMessage({ type: 'lumora:preview', simulate: 'error' }, location.origin);
  };

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

          <Card title="When the nebula shows up">
            <div className="stack">
              <div className="choice-cards" role="radiogroup" aria-label="When the nebula shows up">
                {LAUNCHER_MODES.map((m) => {
                  const locked = m.id !== 'always' && smartLock;
                  const selected = (smartLock ? 'always' : smart.launcher) === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-disabled={!!locked}
                      className="choice-card"
                      onClick={() => !locked && update((s) => void (s.smart.launcher = m.id))}
                    >
                      <span className="choice-icon" aria-hidden>
                        <m.icon size={18} />
                      </span>
                      <span className="choice-text">
                        <span className="row" style={{ gap: 8 }}>
                          <strong>{m.title}</strong>
                          {m.id !== 'always' && (locked ? <UpgradeBadge plan={locked} /> : <TierBadge plan={tier('smartLauncher')} />)}
                        </span>
                        <span className="hint">{m.description}</span>
                      </span>
                      <span className="choice-check" aria-hidden>
                        {selected && <Icons.check size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {smart.launcher === 'manual' && !smartLock && (
                <p className="hint">
                  Call <code>Lumora('open')</code> from your “Report a problem” link. The nebula appears while the panel is open and leaves when it closes. See{' '}
                  <a href={`#/p/${project.id}/settings/install`}>Install</a>.
                </p>
              )}
            </div>
          </Card>

          <Card title="React to errors">
            <ToggleRow
              title="Offer help when something goes wrong"
              description="The nebula glows and a small note invites the person to report what happened, quoting the error they saw."
              checked={a.proactiveOnError}
              onChange={(v) => update((s) => void (s.appearance.proactiveOnError = v))}
            />
            <div className="signal-list">
              <span className="label">What counts as something going wrong</span>
              <label className="check-line">
                <input type="checkbox" checked={smart.signals.pageErrors} onChange={(e) => update((s) => void (s.smart.signals.pageErrors = e.target.checked))} />
                <span>
                  <strong>Errors in the page</strong>
                  <span className="hint">Uncaught errors, failed promises and console errors.</span>
                </span>
              </label>
              <label className={`check-line${smartLock ? ' locked' : ''}`}>
                <input type="checkbox" disabled={!!smartLock} checked={!smartLock && smart.signals.failedRequests} onChange={(e) => update((s) => void (s.smart.signals.failedRequests = e.target.checked))} />
                <span>
                  <strong>
                    Failed requests {smartLock ? <UpgradeBadge plan={smartLock} /> : <TierBadge plan={tier('smartLauncher')} />}
                  </strong>
                  <span className="hint">Calls to your servers that fail with a 5xx or never arrive.</span>
                </span>
              </label>
              <label className={`check-line${smartLock ? ' locked' : ''}`}>
                <input type="checkbox" disabled={!!smartLock} checked={!smartLock && smart.signals.errorMessages} onChange={(e) => update((s) => void (s.smart.signals.errorMessages = e.target.checked))} />
                <span>
                  <strong>
                    Error messages on screen {smartLock ? <UpgradeBadge plan={smartLock} /> : <TierBadge plan={tier('smartLauncher')} />}
                  </strong>
                  <span className="hint">Error toasts and alerts, including Salesforce Lightning and Experience Cloud errors. The message they saw is added to the report.</span>
                </span>
              </label>
              {!smartLock && (
                <Field label="Your own error banners" hint="CSS selectors of error messages your app shows, e.g. .error-toast or [data-error].">
                  <div className="stack-sm">
                    {smart.errorSelectors.length > 0 && (
                      <div className="chip-list">
                        {smart.errorSelectors.map((sel, i) => (
                          <span className="chip mono" key={sel + i}>
                            {sel}
                            <button type="button" aria-label={`Remove ${sel}`} onClick={() => update((s) => void s.smart.errorSelectors.splice(i, 1))}>
                              <Icons.x size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <form
                      className="row"
                      style={{ flexWrap: 'nowrap' }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!selector.trim()) return;
                        update((s) => void s.smart.errorSelectors.push(selector.trim()));
                        setSelector('');
                      }}
                    >
                      <input className="input mono" placeholder=".error-toast" value={selector} onChange={(e) => setSelector(e.target.value)} style={{ flex: 1 }} aria-label="CSS selector of an error message" />
                      <button className="btn btn-sm">Add</button>
                    </form>
                  </div>
                </Field>
              )}
            </div>
          </Card>

          <Card title="Branding">
            <ToggleRow
              title="Show “Powered by Lumora”"
              checked={a.showBranding || !me.limits.features.removeBranding}
              onChange={(v) => update((s) => void (s.appearance.showBranding = v))}
              lockedTo={lock('removeBranding')} tier={tier('removeBranding')}
              description={lock('removeBranding') ? 'Business can remove the footer link.' : undefined}
            />
          </Card>

          <Card title="Ways to report">
            <ToggleRow title="Screenshot" description="Capture the page and mark it up (highlight, draw, hide private data)." checked={draft.reportTypes.screenshot} onChange={(v) => update((s) => void (s.reportTypes.screenshot = v))} />
            <ToggleRow
              title="Screen recording"
              description="Users record what happens; Lumora writes the steps to reproduce from their clicks."
              checked={draft.reportTypes.recording}
              onChange={(v) => update((s) => void (s.reportTypes.recording = v))}
              lockedTo={lock('recording')} tier={tier('recording')}
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
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={simulateError} title="See how the nebula reacts when something goes wrong">
                <Icons.alert size={14} /> Simulate an error
              </button>
              <button className="btn btn-sm" onClick={() => setPreviewKey((k) => k + 1)}>
                Reload
              </button>
            </div>
          }
        >
          <iframe ref={frame} key={previewKey} className="preview-frame" title="Widget preview" src={`/demo/?key=${encodeURIComponent(project.publicKey)}&preview=1`} />
          <p className="hint" style={{ marginTop: 8 }}>
            Changes show here right away{dirty ? '. Save to publish them on your site' : ''}. The nebula is always Lumora yellow.
          </p>
        </Card>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onReset={reset} />
    </div>
  );
}
