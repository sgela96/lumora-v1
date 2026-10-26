import { useEffect, useState } from 'react';
import { api, type ConnectorInfo, type Project } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { CopyButton, Field, Nebula, Segmented, timeAgo, useToast } from '../components/ui';
import { navigate, useApp } from '../state';
import { IntegrationForm } from './Integrations';

type StepId = 'app' | 'install' | 'connect' | 'test';

const STEPS: { id: StepId; title: string; hint: string }[] = [
  { id: 'app', title: 'Your app', hint: 'Name it and say where it lives' },
  { id: 'install', title: 'Install', hint: 'One line in your HTML' },
  { id: 'connect', title: 'Connect your tool', hint: 'Where tickets should go' },
  { id: 'test', title: 'Send a test report', hint: 'See it arrive' },
];

const POPULAR = ['jira', 'github', 'azure_devops', 'gitlab', 'linear', 'zendesk', 'slack', 'webhook'];

/** Guided first run: from sign-up to the first complete ticket in a few minutes. */
export function SetupPage({ project, onFinish }: { project: Project; onFinish: (startTour: boolean) => void }) {
  const { me, catalog, refresh, projects } = useApp();
  const toast = useToast();
  const live = projects.find((p) => p.id === project.id) ?? project;
  const done: Record<StepId, boolean> = {
    app: !!live.name && live.name !== '',
    install: !!live.installedAt,
    connect: (live.destinations ?? 0) > 0,
    test: !!live.firstReportAt,
  };
  const firstOpen = STEPS.find((s) => !done[s.id])?.id ?? 'test';
  // A brand-new app starts by confirming its name and address; returning users resume where they left off.
  const [step, setStep] = useState<StepId>(done.install ? firstOpen : 'app');

  // Live detection: the widget loading on the customer's site and the first report arriving.
  useEffect(() => {
    if (step !== 'install' && step !== 'test') return;
    const t = setInterval(() => refresh(), 3000);
    return () => clearInterval(t);
  }, [step, refresh]);

  const index = STEPS.findIndex((s) => s.id === step);
  const next = () => setStep(STEPS[Math.min(index + 1, STEPS.length - 1)].id);

  return (
    <div className="setup">
      <div className="ambient" aria-hidden>
        <span />
      </div>
      <aside className="setup-rail">
        <a className="brand" href="#/">
          <Nebula /> Lumora
        </a>
        <h2 style={{ fontSize: 22, margin: '18px 0 4px' }}>Let’s get you set up</h2>
        <p className="muted small">About five minutes. You can leave and come back anytime.</p>
        <ol className="setup-steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button className={`setup-step${step === s.id ? ' active' : ''}${done[s.id] ? ' done' : ''}`} onClick={() => setStep(s.id)}>
                <span className="setup-dot">{done[s.id] ? <Icons.check size={14} /> : i + 1}</span>
                <span>
                  <strong>{s.title}</strong>
                  <span className="muted small">{s.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <button className="btn btn-ghost" style={{ marginTop: 'auto' }} onClick={() => onFinish(false)}>
          I’ll finish later
        </button>
      </aside>

      <main className="setup-main rise" key={step}>
        {step === 'app' && <AppStep project={live} onNext={next} />}
        {step === 'install' && <InstallStep project={live} publicUrl={me.server.publicUrl} onNext={next} />}
        {step === 'connect' && <ConnectStep project={live} connectors={catalog.integrations} allowed={me.limits.integrations} onNext={next} />}
        {step === 'test' && (
          <TestStep
            project={live}
            onFinish={(tour) => {
              toast('You’re all set');
              onFinish(tour);
            }}
          />
        )}
      </main>
    </div>
  );
}

function AppStep({ project, onNext }: { project: Project; onNext: () => void }) {
  const { updateProject } = useApp();
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.allowedOrigins[0] ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      updateProject(await api<Project>(`/projects/${project.id}`, { method: 'PATCH', body: { name, allowedOrigins: domain ? [domain] : [] } }));
      onNext();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <StepHead n={1} title="Your app" body="The app where your users will report problems. You can add more apps later." />
      <Field label="App name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Its address (optional)" hint="Only this site will be allowed to use your widget key. Leave it empty while you test.">
        <input className="input" placeholder="https://app.yourcompany.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </Field>
      <div>
        <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
          Continue
        </button>
      </div>
    </div>
  );
}

function InstallStep({ project, publicUrl, onNext }: { project: Project; publicUrl: string; onNext: () => void }) {
  const [stack, setStack] = useState<'html' | 'react' | 'gtm' | 'wordpress'>('html');
  const tag = `<script src="${publicUrl}/lumora.js" data-key="${project.publicKey}" async></script>`;
  const snippets: Record<typeof stack, { where: string; code: string }> = {
    html: { where: 'Paste it before </body> on every page.', code: tag },
    react: { where: 'Add it once to index.html (Vite, CRA) or to the root layout <head> (Next.js).', code: tag },
    gtm: {
      where: 'New tag → Custom HTML → paste → trigger “All Pages” → publish.',
      code: `<script>\n  (function () {\n    var s = document.createElement('script');\n    s.src = '${publicUrl}/lumora.js'; s.async = true;\n    s.dataset.key = '${project.publicKey}';\n    document.head.appendChild(s);\n  })();\n</script>`,
    },
    wordpress: { where: 'Appearance → Theme file editor → footer.php, before </body> — or any “insert headers and footers” plugin.', code: tag },
  };
  const demo = `/demo/?key=${encodeURIComponent(project.publicKey)}`;
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <StepHead n={2} title="Install Lumora" body="One line, any stack. We’ll notice the moment it loads on your site." />
      <Segmented
        label="Your stack"
        value={stack}
        onChange={setStack}
        options={[
          { value: 'html', label: 'HTML' },
          { value: 'react', label: 'React · Next · Vue' },
          { value: 'gtm', label: 'Tag Manager' },
          { value: 'wordpress', label: 'WordPress' },
        ]}
      />
      <p className="muted">{snippets[stack].where}</p>
      <div className="code-block">
        {snippets[stack].code}
        <CopyButton text={snippets[stack].code} />
      </div>
      <div className={`detect card card-pad${project.installedAt ? ' ok' : ''}`}>
        {project.installedAt ? (
          <>
            <Icons.check size={20} />
            <span>
              <strong>Lumora is live</strong> on {project.installedOrigin} · {timeAgo(project.installedAt)}
            </span>
          </>
        ) : (
          <>
            <span className="pulse-dot" aria-hidden />
            <span>
              <strong>Waiting for your site…</strong> Open a page where you added the snippet and this turns green.
            </span>
          </>
        )}
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={onNext}>
          {project.installedAt ? 'Continue' : 'Continue without waiting'}
        </button>
        <a className="btn btn-ghost" href={demo} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          Try it on our demo page first
        </a>
      </div>
    </div>
  );
}

function ConnectStep({ project, connectors, allowed, onNext }: { project: Project; connectors: ConnectorInfo[]; allowed: string[]; onNext: () => void }) {
  const { refresh } = useApp();
  const [picked, setPicked] = useState<ConnectorInfo | null>(null);
  const popular = POPULAR.map((t) => connectors.find((c) => c.type === t)).filter((c): c is ConnectorInfo => !!c);
  const connected = (project.destinations ?? 0) > 0;
  if (picked) {
    return (
      <div className="stack" style={{ maxWidth: 860 }}>
        <StepHead n={3} title={`Connect ${picked.label}`} body="We test the connection as soon as you save." />
        <IntegrationForm
          project={project}
          connector={picked}
          categories={[]}
          showHook={false}
          onCancel={() => setPicked(null)}
          onSaved={async () => {
            await refresh();
            setPicked(null);
            onNext();
          }}
        />
      </div>
    );
  }
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <StepHead n={3} title="Where should tickets go?" body="Pick the tool your team works in. You can add more later in Settings → Integrations." />
      {connected && (
        <div className="detect card card-pad ok">
          <Icons.check size={20} />
          <span>
            <strong>Connected.</strong> New reports will create tickets automatically.
          </span>
        </div>
      )}
      <div className="grid-4">
        {popular.map((c) => {
          const ok = allowed.includes(c.type);
          return (
            <button key={c.type} className="card integration-tile" disabled={!ok} onClick={() => setPicked(c)} title={ok ? undefined : 'Not in your plan'}>
              <LogoTile type={c.type} />
              <strong>{c.label}</strong>
              {!ok && <span className="muted small">Upgrade to use</span>}
            </button>
          );
        })}
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={onNext}>
          {connected ? 'Continue' : 'Skip for now'}
        </button>
        <a className="btn btn-ghost" href={`#/p/${project.id}/settings/integrations`} style={{ textDecoration: 'none' }}>
          See all 20 integrations
        </a>
      </div>
    </div>
  );
}

function TestStep({ project, onFinish }: { project: Project; onFinish: (tour: boolean) => void }) {
  const demo = `/demo/?key=${encodeURIComponent(project.publicKey)}`;
  const arrived = !!project.firstReportAt;
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <StepHead n={4} title="Send your first report" body="Click the nebula on your site (or our demo page), break something and send it. We’ll show you when it lands." />
      {arrived ? (
        <div className="celebrate card iris-border">
          <Nebula className="celebrate-orb" />
          <h2 style={{ fontSize: 26 }}>Your first report is in</h2>
          <p className="muted">It’s in Lumora{(project.destinations ?? 0) > 0 ? ' and in your connected tool' : ''}, with the steps, console and browser details attached.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn" onClick={() => onFinish(false)}>
              Go to Lumora
            </button>
            <button className="btn btn-primary" onClick={() => onFinish(true)} autoFocus>
              Take a 1-minute tour
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="detect card card-pad">
            <span className="pulse-dot" aria-hidden />
            <span>
              <strong>Waiting for a report…</strong> It usually takes less than a minute.
            </span>
          </div>
          <div className="row">
            <a className="btn btn-primary" href={demo} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              Open the demo page <Icons.external size={14} />
            </a>
            <button className="btn btn-ghost" onClick={() => onFinish(false)}>
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StepHead({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="stack-sm">
      <span className="badge badge-accent" style={{ justifySelf: 'start' }}>
        Step {n} of 4
      </span>
      <h1>{title}</h1>
      <p className="muted" style={{ fontSize: 16 }}>
        {body}
      </p>
    </div>
  );
}

export function setupProgress(project: Project): { done: number; total: number; steps: { id: StepId; title: string; done: boolean }[] } {
  const steps = [
    { id: 'app' as const, title: 'Create your app', done: true },
    { id: 'install' as const, title: 'Install the widget', done: !!project.installedAt },
    { id: 'connect' as const, title: 'Connect your ticketing tool', done: (project.destinations ?? 0) > 0 },
    { id: 'test' as const, title: 'Receive your first report', done: !!project.firstReportAt },
  ];
  return { done: steps.filter((s) => s.done).length, total: steps.length, steps };
}

export function navigateSetup(): void {
  navigate('/setup');
}
