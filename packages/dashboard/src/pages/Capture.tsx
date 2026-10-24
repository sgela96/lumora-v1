import { useState } from 'react';
import type { LogLevel } from '@lumora/shared';
import type { Project } from '../api';
import { Card, Field, SaveBar, SectionIntro, ToggleRow, useToast } from '../components/ui';
import { useApp, useFeatureLock, useSettingsDraft } from '../state';

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'log', 'debug'];

export function CapturePage({ project }: { project: Project }) {
  const { me, updateProject } = useApp();
  const toast = useToast();
  const lock = useFeatureLock();
  const { draft, update, dirty, saving, save, reset } = useSettingsDraft(project, updateProject);
  const c = draft.capture;
  const [selector, setSelector] = useState('');

  const onSave = async () => {
    try {
      await save();
      toast('Capture settings saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  return (
    <div className="stack">
      <SectionIntro>What travels with every report. It’s attached automatically — people are told what’s included, never asked to collect it.</SectionIntro>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="User">
            <p className="hint" style={{ marginBottom: 6 }}>
              Sent with <code>Lumora('identify', …)</code> from your app.
            </p>
            <ToggleRow title="User ID" checked={c.user.id} onChange={(v) => update((s) => void (s.capture.user.id = v))} />
            <ToggleRow title="E-mail" checked={c.user.email} onChange={(v) => update((s) => void (s.capture.user.email = v))} />
            <ToggleRow title="Name" checked={c.user.name} onChange={(v) => update((s) => void (s.capture.user.name = v))} />
            <ToggleRow title="Custom attributes" description="Plan, role, tenant… anything else you pass." checked={c.user.custom} onChange={(v) => update((s) => void (s.capture.user.custom = v))} />
            <ToggleRow title="Ask anonymous users for their e-mail" description="Optional field so you can follow up." checked={c.askEmailIfAnonymous} onChange={(v) => update((s) => void (s.capture.askEmailIfAnonymous = v))} />
          </Card>

          <Card title="Developer console">
            <ToggleRow title="Console messages" description="Including uncaught errors and unhandled promise rejections, with stack traces." checked={c.console.enabled} onChange={(v) => update((s) => void (s.capture.console.enabled = v))} lockedTo={lock('console')}>
              <div className="stack-sm">
                <div className="row">
                  {LEVELS.map((level) => (
                    <label key={level} className="row small" style={{ gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={c.console.levels.includes(level)}
                        onChange={(e) => update((s) => void (s.capture.console.levels = e.target.checked ? [...s.capture.console.levels, level] : s.capture.console.levels.filter((l) => l !== level)))}
                      />
                      {level}
                    </label>
                  ))}
                </div>
                <Field label="Keep the last">
                  <input className="input" type="number" min={1} max={200} value={c.console.maxEntries} onChange={(e) => update((s) => void (s.capture.console.maxEntries = Number(e.target.value)))} style={{ width: 120 }} />
                </Field>
              </div>
            </ToggleRow>
            <ToggleRow title="Network requests" description="Method, URL, status and timing of fetch/XHR calls. Bodies and headers are never captured." checked={c.network.enabled} onChange={(v) => update((s) => void (s.capture.network.enabled = v))} lockedTo={lock('network')}>
              <label className="row small">
                <input type="checkbox" checked={c.network.failedOnly} onChange={(e) => update((s) => void (s.capture.network.failedOnly = e.target.checked))} /> Only failed requests (4xx, 5xx, network errors)
              </label>
            </ToggleRow>
            <ToggleRow title="Environment" description="URL, browser, OS, viewport, language, timezone." checked={c.environment} onChange={(v) => update((s) => void (s.capture.environment = v))} />
          </Card>
        </div>

        <div className="stack">
          <Card title="Steps to reproduce">
            <ToggleRow title="Recent actions" description="The last clicks, inputs and page changes before the user opened Lumora." checked={c.breadcrumbs} onChange={(v) => update((s) => void (s.capture.breadcrumbs = v))} lockedTo={lock('breadcrumbs')} />
            <ToggleRow title="Steps from screen recordings" description="Turns what the user did while recording into written, timestamped steps." checked={c.recordingSteps} onChange={(v) => update((s) => void (s.capture.recordingSteps = v))} lockedTo={lock('recordingSteps')} />
            <ToggleRow
              title="AI Powered"
              description={
                me.server.aiAvailable || lock('aiSteps')
                  ? `Transcribes what people say while recording${me.server.transcriptionAvailable || lock('aiSteps') ? '' : ' (needs a speech-to-text key on the server)'}, then writes a summary, smarter steps, expected vs. actual, a suggested priority, possible duplicates and a likely cause — in your team’s language. ${me.limits.aiReportsPerMonth ? `${me.usage.aiReports} of ${me.limits.aiReportsPerMonth} used this month.` : ''}`
                  : 'Needs ANTHROPIC_API_KEY on the server.'
              }
              checked={c.aiSteps}
              onChange={(v) => update((s) => void (s.capture.aiSteps = v))}
              lockedTo={lock('aiSteps')}
              lockLabel={me.account.plan === 'pro' ? 'AI Powered extra' : undefined}
            />
          </Card>

          <Card title="Privacy">
            <ToggleRow title="Mask what users type" description="Steps say “Type into Email” instead of the value. Passwords and card fields are always masked." checked={c.maskInputs} onChange={(v) => update((s) => void (s.capture.maskInputs = v))} />
            <ToggleRow title="Scrub sensitive data" description="Removes e-mails, card numbers, tokens and secrets from logs and URLs before sending." checked={c.redactSensitiveData} onChange={(v) => update((s) => void (s.capture.redactSensitiveData = v))} />
            <ToggleRow
              title="Hide elements"
              description="CSS selectors that are blacked out in screenshots and never recorded as steps."
              checked={!lock('redactionRules')}
              onChange={() => {}}
              lockedTo={lock('redactionRules')}
            >
              <div className="stack-sm">
                <div className="chip-list">
                  {c.redactSelectors.map((sel, i) => (
                    <span className="chip mono" key={sel + i}>
                      {sel}
                      <button type="button" aria-label={`Remove ${sel}`} onClick={() => update((s) => void s.capture.redactSelectors.splice(i, 1))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selector.trim()) return;
                    update((s) => void s.capture.redactSelectors.push(selector.trim()));
                    setSelector('');
                  }}
                >
                  <input className="input mono" placeholder=".account-balance, [data-private]" value={selector} onChange={(e) => setSelector(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-sm">Add</button>
                </form>
              </div>
            </ToggleRow>
          </Card>
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onReset={reset} />
    </div>
  );
}
