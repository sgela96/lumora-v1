import { ADDONS, PLANS } from '@lumora/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Me } from '../api';
import { Icons } from './icons';
import { Nebula } from './ui';

interface Slide {
  id: string;
  title: string;
  body: string;
  scene: ReactNode;
  cta?: { label: string; href: (projectId: string) => string };
}

const SLIDE_MS = 7000;

// ---------- Little animated scenes (CSS only, loop while the slide is visible) ----------

const RecordingScene = () => (
  <div className="scn scn-rec">
    <div className="scn-rec-top">
      <span className="scn-dot" /> Recording · 0:07 <span className="scn-wave"><i /><i /><i /><i /><i /></span>
    </div>
    {['Click “Settings”', 'Select “Mexico” in “Country”', 'Click “Save details”'].map((s, i) => (
      <div key={s} className="scn-step" style={{ animationDelay: `${0.4 + i * 0.5}s` }}>
        <span className="mono">0:0{i + 1}</span> {s}
      </div>
    ))}
    <div className="scn-step err" style={{ animationDelay: '2s' }}>
      <span className="mono">0:04</span> ⚠ VAT number is required
    </div>
  </div>
);

const NetworkScene = () => (
  <div className="scn scn-net">
    {[
      ['GET', '/api/me', '200', ''],
      ['GET', '/api/invoices', '200', ''],
      ['POST', '/api/billing', '422', 'bad'],
      ['GET', '/api/plans', '200', ''],
    ].map(([m, u, s, bad], i) => (
      <div key={u} className={`scn-req ${bad}`} style={{ animationDelay: `${0.3 + i * 0.35}s` }}>
        <span className="mono">{m}</span> <span className="mono grow">{u}</span> <span className="scn-code">{s}</span>
      </div>
    ))}
    <div className="scn-note" style={{ animationDelay: '2.1s' }}>Last clicks: Settings → Country → Save</div>
  </div>
);

const TrackersScene = () => (
  <div className="scn scn-tools">
    {[
      ['Ji', '#2684FF'],
      ['GH', '#24292F'],
      ['Az', '#0078D4'],
      ['GL', '#E24329'],
      ['Li', '#5E6AD2'],
      ['CU', '#7B68EE'],
      ['As', '#F06A6A'],
      ['Tr', '#0079BF'],
    ].map(([t, c], i) => (
      <span key={t} style={{ background: c, animationDelay: `${0.2 + i * 0.15}s` }}>
        {t}
      </span>
    ))}
  </div>
);

const TemplateScene = () => (
  <div className="scn scn-tpl">
    <div className="scn-tray">
      <span className="p a">Steps</span>
      <span className="p b">Console</span>
      <span className="p c">AI overview</span>
    </div>
    <div className="scn-layout">
      <span className="slot s1" />
      <span className="slot s2" />
      <span className="slot s3" />
    </div>
  </div>
);

const DashboardScene = () => (
  <div className="scn scn-dash">
    <div className="scn-kpis">
      <span><b>128</b>reports</span>
      <span><b>32 h</b>to resolve</span>
    </div>
    <svg viewBox="0 0 240 80" className="scn-chart" aria-hidden>
      <path pathLength={1} d="M0 62 L30 55 L60 58 L90 40 L120 44 L150 30 L180 34 L210 18 L240 22" />
      <path pathLength={1} className="b" d="M0 70 L30 66 L60 64 L90 55 L120 52 L150 45 L180 40 L210 33 L240 30" />
    </svg>
  </div>
);

const AiScene = () => (
  <div className="scn scn-ai">
    <Nebula className="scn-orb" />
    <div className="scn-ai-card">
      <span className="k">Summary</span>
      <span className="ln l1" />
      <span className="k" style={{ animationDelay: '1.4s' }}>Likely cause</span>
      <span className="ln l2" />
      <span className="scn-pri">Priority · High</span>
    </div>
  </div>
);

const StatusScene = () => (
  <div className="scn scn-status">
    {['VAT error on save', 'Blank PDF export', 'Safari login loop'].map((t, i) => (
      <div key={t} className="scn-row">
        <span>{t}</span>
        <span className="scn-pill" style={{ animationDelay: `${i * 0.6}s` }}>
          <i className="s1">Open</i>
          <i className="s2">In review</i>
          <i className="s3">Resolved</i>
        </span>
      </div>
    ))}
  </div>
);

const IssuesScene = () => (
  <div className="scn scn-issues">
    <div className="c c1">VAT error · Chrome</div>
    <div className="c c2">VAT error · Safari</div>
    <div className="c c3">VAT error · Edge</div>
    <div className="c grp">
      <b>1 issue</b> · 12 people affected
    </div>
  </div>
);

const PrivacyScene = () => (
  <div className="scn scn-hide">
    <div className="scn-mock">
      <span className="lbl">Balance</span>
      <span className="val">
        $12,480.00<span className="bar" />
      </span>
      <span className="lbl">Card</span>
      <span className="val">
        4242 4242 4242 4242<span className="bar b2" />
      </span>
    </div>
  </div>
);

const BrandScene = () => (
  <div className="scn scn-brand">
    <div className="scn-panel">
      <b>Something not working?</b>
      <span className="opt" />
      <span className="opt" />
      <span className="foot">Powered by Lumora</span>
    </div>
  </div>
);

function slidesFor(me: Me): Slide[] {
  const ai = me.limits.features.aiSteps;
  const aiSlide: Slide = {
    id: 'ai',
    title: 'AI Powered triage',
    body: 'Each report arrives with a summary, expected vs. actual, a suggested priority, possible duplicates and the likely cause, in your team’s language.',
    scene: <AiScene />,
    cta: { label: 'Turn it on', href: (p) => `#/p/${p}/settings/capture` },
  };
  if (me.account.plan === 'business') {
    return [
      {
        id: 'status',
        title: 'Live status from your tools',
        body: 'Every report shows the real status of its ticket in Jira, Zendesk, ServiceNow and more, updated on its own.',
        scene: <StatusScene />,
        cta: { label: 'Open Reports', href: (p) => `#/p/${p}/reports` },
      },
      {
        id: 'issues',
        title: 'Similar reports, one issue',
        body: 'Reports with the same error are grouped, so you see how many people each problem affects and fix the biggest first.',
        scene: <IssuesScene />,
        cta: { label: 'See issues', href: (p) => `#/p/${p}/reports?mode=issues` },
      },
      {
        id: 'dash',
        title: 'The advanced dashboard',
        body: 'Time to resolve, top issues, the pages where people get stuck, and every app in one place.',
        scene: <DashboardScene />,
        cta: { label: 'Go to Overview', href: (p) => `#/p/${p}/overview` },
      },
      { ...aiSlide, body: `${aiSlide.body} ${me.limits.aiReportsPerMonth.toLocaleString()} AI reports a month are included.` },
      {
        id: 'privacy',
        title: 'Hide what’s private',
        body: 'Add CSS selectors and those elements are blacked out in every screenshot and never recorded as steps.',
        scene: <PrivacyScene />,
        cta: { label: 'Add elements', href: (p) => `#/p/${p}/settings/capture` },
      },
      {
        id: 'brand',
        title: 'White label',
        body: 'Remove “Powered by Lumora” so the widget feels fully yours.',
        scene: <BrandScene />,
        cta: { label: 'Widget settings', href: (p) => `#/p/${p}/settings/widget` },
      },
    ];
  }
  const pro: Slide[] = [
    {
      id: 'rec',
      title: 'Record the screen, get the steps',
      body: `Users record what happened, with their voice. Lumora writes numbered, timestamped steps to reproduce, up to ${Math.round(me.limits.features.recordingMaxSeconds / 60)} minutes.`,
      scene: <RecordingScene />,
      cta: { label: 'Widget settings', href: (p) => `#/p/${p}/settings/widget` },
    },
    {
      id: 'net',
      title: 'Network and last actions',
      body: 'Failed requests with status and timing, and the clicks right before the report, attached to every ticket.',
      scene: <NetworkScene />,
      cta: { label: 'Data capture', href: (p) => `#/p/${p}/settings/capture` },
    },
    {
      id: 'trackers',
      title: 'All 10 trackers',
      body: 'Jira, GitHub, Azure DevOps, GitLab, Linear, ClickUp, Asana, Shortcut, YouTrack and Trello.',
      scene: <TrackersScene />,
      cta: { label: 'Connect a tool', href: (p) => `#/p/${p}/settings/integrations` },
    },
    {
      id: 'tpl',
      title: 'Your ticket template',
      body: 'Build the ticket from pieces and see a live preview of how it lands in your tool.',
      scene: <TemplateScene />,
      cta: { label: 'Build it', href: (p) => `#/p/${p}/settings/template` },
    },
    {
      id: 'dash',
      title: 'Your dashboard',
      body: 'Report volume, trends, categories and the latest reports at a glance.',
      scene: <DashboardScene />,
      cta: { label: 'Go to Overview', href: (p) => `#/p/${p}/overview` },
    },
  ];
  return ai ? [...pro, aiSlide] : pro;
}

/** Shown once after an upgrade, a trial or new extras: what's new, one animated slide per feature. */
export function Showcase({ me, projectId, onClose, onTour }: { me: Me; projectId?: string; onClose: () => void; onTour: () => void }) {
  const slides = slidesFor(me);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const started = useRef(Date.now());
  const elapsed = useRef(0);
  const plan = PLANS[me.account.plan];
  const trial = me.account.planStatus === 'trialing' && me.account.trialEndsAt;
  const extras = Object.entries(me.account.addons ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([id]) => ADDONS[id as keyof typeof ADDONS]?.name).filter(Boolean);

  // Stories-style autoplay; hovering pauses it.
  useEffect(() => {
    if (paused || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    started.current = Date.now();
    const t = window.setTimeout(() => {
      elapsed.current = 0;
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS - elapsed.current);
    return () => {
      window.clearTimeout(t);
      elapsed.current += Date.now() - started.current;
    };
  }, [index, paused, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const go = (i: number) => {
    elapsed.current = 0;
    setIndex((i + slides.length) % slides.length);
  };
  const slide = slides[index];

  return (
    <div className="modal-scrim showcase-scrim" role="dialog" aria-modal="true" aria-label={`Welcome to ${plan.name}`}>
      <div className="showcase card" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <button className="icon-btn showcase-x" onClick={onClose} aria-label="Close">
          <Icons.x size={17} />
        </button>
        <header className="showcase-head">
          <Nebula className="showcase-orb" />
          <div>
            <h1>
              Welcome to <span className={`plan-chip big plan-${me.account.plan}`}>{plan.name}</span>
            </h1>
            <p className="muted">
              {trial
                ? `Your trial runs until ${new Date(me.account.trialEndsAt!).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. Here’s what you can try.`
                : extras.length && me.account.plan === 'pro'
                  ? `Payment confirmed. New: ${extras.join(', ')}.`
                  : 'Your payment is confirmed. Here’s what’s new.'}
            </p>
          </div>
        </header>
        <div className="showcase-body">
          <ol className="showcase-list">
            {slides.map((s, i) => (
              <li key={s.id}>
                <button className={i === index ? 'on' : ''} onClick={() => go(i)} aria-current={i === index}>
                  <span className="t">{s.title}</span>
                  <span className="bar">
                    <i key={`${index}-${paused}`} className={i === index ? (paused ? 'run paused' : 'run') : i < index ? 'done' : ''} style={i === index ? { animationDuration: `${SLIDE_MS}ms` } : undefined} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="showcase-stage" key={slide.id}>
            <div className="showcase-scene">{slide.scene}</div>
            <h2>{slide.title}</h2>
            <p className="muted">{slide.body}</p>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              {slide.cta && projectId && (
                <a className="btn btn-primary btn-sm" href={slide.cta.href(projectId)} onClick={onClose} style={{ textDecoration: 'none' }}>
                  {slide.cta.label}
                </a>
              )}
              <button className="icon-btn" onClick={() => go(index - 1)} aria-label="Previous">
                <Icons.back size={16} />
              </button>
              <button className="icon-btn flip" onClick={() => go(index + 1)} aria-label="Next">
                <Icons.back size={16} />
              </button>
            </div>
          </div>
        </div>
        <footer className="showcase-foot">
          <button className="btn btn-ghost" onClick={onTour}>
            Show me around
          </button>
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            Start using {plan.name}
          </button>
        </footer>
      </div>
    </div>
  );
}
