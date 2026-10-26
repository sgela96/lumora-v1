import { useState, type ReactElement, type ReactNode } from 'react';
import type { LogLevel } from '@lumora/shared';
import type { Project } from '../api';
import { Icons } from '../components/icons';
import { Field, SaveBar, SectionIntro, Segmented, ToggleRow, useToast } from '../components/ui';
import { useApp, useFeatureLock, useFeatureTier, useSettingsDraft } from '../state';

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'log', 'debug'];

const SECTIONS: { id: string; label: string; icon: (p: { size?: number }) => ReactElement }[] = [
  { id: 'technical', label: 'Technical details', icon: Icons.code },
  { id: 'steps', label: 'Steps to reproduce', icon: Icons.layers },
  { id: 'privacy', label: 'Privacy', icon: Icons.lock },
  { id: 'user', label: 'Who reported it', icon: Icons.user },
];

function Section({ id, title, intro, icon: Icon, children }: { id: string; title: string; intro: ReactNode; icon: (p: { size?: number }) => ReactElement; children: ReactNode }) {
  return (
    <section id={`capture-${id}`} className="card capture-section">
      <header className="capture-head">
        <span className="capture-icon" aria-hidden>
          <Icon size={18} />
        </span>
        <div>
          <h2>{title}</h2>
          <p className="muted small">{intro}</p>
        </div>
      </header>
      <div className="card-pad capture-body">{children}</div>
    </section>
  );
}

export function CapturePage({ project }: { project: Project }) {
  const { me, updateProject } = useApp();
  const toast = useToast();
  const lock = useFeatureLock();
  const tier = useFeatureTier();
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

  // What a report carries with these settings, shown as a live summary at the top.
  const on = (feature: Parameters<typeof lock>[0], enabled: boolean) => enabled && !lock(feature);
  const included = [
    on('console', c.console.enabled) && `Console (${c.console.levels.join(', ') || 'no levels'})`,
    on('network', c.network.enabled) && (c.network.failedOnly ? 'Failed requests' : 'Every request'),
    c.environment && 'Browser and page',
    on('breadcrumbs', c.breadcrumbs) && 'Last actions',
    on('recordingSteps', c.recordingSteps) && 'Steps from recordings',
    on('aiSteps', c.aiSteps) && 'AI summary and triage',
    (c.user.id || c.user.email || c.user.name) && 'Who reported it',
  ].filter(Boolean) as string[];
  const protectedItems = [c.maskInputs && 'Typed values masked', c.redactSensitiveData && 'E-mails, cards and tokens scrubbed', c.redactSelectors.length > 0 && !lock('redactionRules') && `${c.redactSelectors.length} hidden element${c.redactSelectors.length > 1 ? 's' : ''}`].filter(Boolean) as string[];

  return (
    <div className="stack">
      <SectionIntro>What travels with every report. It’s attached automatically: people are told what’s included, never asked to collect it.</SectionIntro>

      <div className="capture-summary card card-pad">
        <div>
          <span className="label">Every report includes</span>
          <div className="chip-list">
            {included.map((x) => (
              <span key={x} className="chip on">
                <Icons.check size={12} /> {x}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Protected</span>
          <div className="chip-list">
            {protectedItems.length ? (
              protectedItems.map((x) => (
                <span key={x} className="chip safe">
                  <Icons.lock size={12} /> {x}
                </span>
              ))
            ) : (
              <span className="chip warn">Nothing is masked</span>
            )}
          </div>
        </div>
      </div>

      <div className="capture-grid">
        <nav className="capture-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#capture-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`capture-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <s.icon size={15} /> {s.label}
            </a>
          ))}
        </nav>

        <div className="stack" style={{ minWidth: 0 }}>
          <Section id="technical" icon={Icons.code} title="Technical details" intro="What your developers would ask for: errors, requests and where it happened.">
            <ToggleRow title="Console" description="Errors and warnings with stack traces, including the ones from before the widget opened." checked={c.console.enabled} onChange={(v) => update((s) => void (s.capture.console.enabled = v))} lockedTo={lock('console')} tier={tier('console')}>
              <div className="capture-options">
                <Field label="Levels">
                  <div className="level-chips" role="group" aria-label="Console levels">
                    {LEVELS.map((level) => {
                      const active = c.console.levels.includes(level);
                      return (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={active}
                          className={`level-chip level-${level}`}
                          onClick={() => update((s) => void (s.capture.console.levels = active ? s.capture.console.levels.filter((l) => l !== level) : [...s.capture.console.levels, level]))}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Keep the last">
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <input className="input" type="number" min={1} max={200} value={c.console.maxEntries} onChange={(e) => update((s) => void (s.capture.console.maxEntries = Number(e.target.value)))} style={{ width: 90 }} />
                    <span className="muted small">messages</span>
                  </div>
                </Field>
              </div>
            </ToggleRow>
            <ToggleRow title="Network requests" description="Method, URL, status and timing of fetch and XHR calls. Bodies and headers are never captured." checked={c.network.enabled} onChange={(v) => update((s) => void (s.capture.network.enabled = v))} lockedTo={lock('network')} tier={tier('network')}>
              <div className="capture-options">
                <Segmented
                  label="Which requests"
                  value={c.network.failedOnly ? 'failed' : 'all'}
                  onChange={(v) => update((s) => void (s.capture.network.failedOnly = v === 'failed'))}
                  options={[
                    { value: 'failed', label: 'Only failed (4xx, 5xx, errors)' },
                    { value: 'all', label: 'Every request' },
                  ]}
                />
              </div>
            </ToggleRow>
            <ToggleRow title="Browser and page" description="URL, browser, OS, screen size, language and time zone." checked={c.environment} onChange={(v) => update((s) => void (s.capture.environment = v))} />
          </Section>

          <Section id="steps" icon={Icons.layers} title="Steps to reproduce" intro="How Lumora writes down what the user did, so your team can follow it.">
            <ToggleRow title="Last actions" description="The last clicks, field changes and page changes before the user opened Lumora." checked={c.breadcrumbs} onChange={(v) => update((s) => void (s.capture.breadcrumbs = v))} lockedTo={lock('breadcrumbs')} tier={tier('breadcrumbs')} />
            <ToggleRow title="Steps from screen recordings" description="Turns what the user did while recording into written, timestamped steps." checked={c.recordingSteps} onChange={(v) => update((s) => void (s.capture.recordingSteps = v))} lockedTo={lock('recordingSteps')} tier={tier('recordingSteps')} />
            <ToggleRow
              title="AI Powered"
              description={
                me.server.aiAvailable || lock('aiSteps')
                  ? `Transcribes what people say while recording${me.server.transcriptionAvailable || lock('aiSteps') ? '' : ' (needs a speech-to-text key on the server)'}, then writes a summary, clearer steps, expected vs. actual, a suggested priority, possible duplicates and a likely cause, in your team’s language.${me.limits.aiReportsPerMonth ? ` ${me.usage.aiReports} of ${me.limits.aiReportsPerMonth} used this month.` : ''}`
                  : 'Needs ANTHROPIC_API_KEY on the server.'
              }
              checked={c.aiSteps}
              onChange={(v) => update((s) => void (s.capture.aiSteps = v))}
              lockedTo={lock('aiSteps')}
              tier={tier('aiSteps')}
              lockLabel={me.account.plan === 'pro' ? 'AI Powered extra' : undefined}
            />
          </Section>

          <Section id="privacy" icon={Icons.lock} title="Privacy" intro="Private data is removed in the user’s browser, before anything is sent.">
            <ToggleRow title="Mask what users type" description="Steps say “Type into Email” instead of the value. Passwords and card fields are always masked." checked={c.maskInputs} onChange={(v) => update((s) => void (s.capture.maskInputs = v))} />
            <ToggleRow title="Scrub sensitive data" description="Removes e-mails, card numbers, tokens and secrets from logs and URLs." checked={c.redactSensitiveData} onChange={(v) => update((s) => void (s.capture.redactSensitiveData = v))} />
            <ToggleRow title="Hide elements" description="CSS selectors that are blacked out in screenshots and never recorded as steps." checked={!lock('redactionRules')} onChange={() => {}} lockedTo={lock('redactionRules')} tier={tier('redactionRules')}>
              <div className="stack-sm">
                <div className="chip-list">
                  {c.redactSelectors.length === 0 && <span className="muted small">No elements hidden yet.</span>}
                  {c.redactSelectors.map((sel, i) => (
                    <span className="chip mono" key={sel + i}>
                      {sel}
                      <button type="button" aria-label={`Remove ${sel}`} onClick={() => update((s) => void s.capture.redactSelectors.splice(i, 1))}>
                        <Icons.x size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <form
                  className="row"
                  style={{ flexWrap: 'nowrap' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selector.trim()) return;
                    update((s) => void s.capture.redactSelectors.push(selector.trim()));
                    setSelector('');
                  }}
                >
                  <input className="input mono" placeholder=".account-balance, [data-private]" value={selector} onChange={(e) => setSelector(e.target.value)} style={{ flex: 1 }} aria-label="CSS selector to hide" />
                  <button className="btn btn-sm">Add</button>
                </form>
              </div>
            </ToggleRow>
          </Section>

          <Section
            id="user"
            icon={Icons.user}
            title="Who reported it"
            intro={
              <>
                Sent by your app with <code>Lumora('identify', …)</code>, so nobody has to type it.
              </>
            }
          >
            <div className="user-grid">
              <ToggleRow title="User ID" checked={c.user.id} onChange={(v) => update((s) => void (s.capture.user.id = v))} />
              <ToggleRow title="E-mail" checked={c.user.email} onChange={(v) => update((s) => void (s.capture.user.email = v))} />
              <ToggleRow title="Name" checked={c.user.name} onChange={(v) => update((s) => void (s.capture.user.name = v))} />
              <ToggleRow title="Custom attributes" description="Plan, role, tenant…" checked={c.user.custom} onChange={(v) => update((s) => void (s.capture.user.custom = v))} />
            </div>
            <ToggleRow title="Ask anonymous users for their e-mail" description="An optional field, so you can follow up." checked={c.askEmailIfAnonymous} onChange={(v) => update((s) => void (s.capture.askEmailIfAnonymous = v))} />
          </Section>
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onReset={reset} />
    </div>
  );
}
