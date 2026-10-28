import { useEffect, useLayoutEffect, useState } from 'react';
import type { Me } from '../api';
import { Nebula } from './ui';

export interface TourStep {
  /** CSS selector of the element to point at (data-tour attributes in the layout). */
  target: string;
  title: string;
  body: string;
}

/** The steps adapt to what the plan includes, so the tour never shows locked screens as if they worked. */
export function tourSteps(me: Me): TourStep[] {
  const f = me.limits.features;
  const steps: TourStep[] = [
    {
      target: '[data-tour="nav-overview"]',
      title: 'Overview',
      body: f.supportCenter
        ? 'Your support at a glance: reports over time, how fast they get resolved, the top issues and the pages where people get stuck.'
        : f.basicDashboard
          ? 'How your app is doing: report volume, trends, categories and the latest reports with a link to each ticket.'
          : 'A dashboard of your reports comes with Pro. On Free, every report goes straight to your destination.',
    },
    {
      target: '[data-tour="nav-reports"]',
      title: 'Reports',
      body: f.supportCenter
        ? 'Every report with the live status of its ticket in Jira, Zendesk or ServiceNow. Filter, search, or group similar reports into one issue.'
        : 'With Business this becomes your report repository: live ticket status, filters and similar reports grouped into issues.',
    },
    {
      target: '[data-tour="nav-settings"]',
      title: 'Settings',
      body: 'Install the snippet, style the widget, shape the ticket template, choose what gets captured and connect your tools — each in its own tab.',
    },
    {
      target: '[data-tour="nav-billing"]',
      title: 'Plan & billing',
      body: me.account.plan === 'pro' ? 'Add extras like AI Powered or help desks whenever you need them — no plan change required.' : 'See your plan, compare features and manage invoices.',
    },
    {
      target: '[data-tour="help"]',
      title: 'Help is always here',
      body: 'Guides for every integration, fixes for common problems, this tour again, and a direct line to our team.',
    },
  ];
  // Members don't see Settings, and only the owner sees Plan & billing.
  return steps.filter((s) => (s.target.includes('nav-settings') ? me.user.role !== 'member' : s.target.includes('nav-billing') ? me.user.role === 'owner' : true));
}

export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  useLayoutEffect(() => {
    const el = document.querySelector(step.target);
    const update = () => setRect(el ? el.getBoundingClientRect() : null);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, onDone]);

  const last = index === steps.length - 1;
  const pad = 8;
  const bubbleTop = rect ? Math.max(16, Math.min(window.innerHeight - 260, rect.top + rect.height / 2 - 90)) : window.innerHeight / 2 - 120;
  const bubbleLeft = rect ? Math.min(window.innerWidth - 380, rect.right + 24) : window.innerWidth / 2 - 180;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div key={index} className="tour-bubble" style={{ top: bubbleTop, left: bubbleLeft }}>
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <Nebula className="mark-xs" detail="low" />
          <strong>{step.title}</strong>
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            {index + 1} / {steps.length}
          </span>
        </div>
        <p style={{ margin: '10px 0 16px' }}>{step.body}</p>
        <div className="spread">
          <button className="btn btn-sm btn-ghost" onClick={onDone}>
            Skip tour
          </button>
          <div className="row" style={{ gap: 6 }}>
            {index > 0 && (
              <button className="btn btn-sm" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => (last ? onDone() : setIndex(index + 1))} autoFocus>
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
