import { useEffect, useState } from 'react';
import type { Me, Project } from '../api';
import { HELP_ARTICLES } from '../guides';
import { navigate } from '../state';
import { Icons } from './icons';

/** Side panel with guides, troubleshooting, the tour and a direct line to support. */
export function HelpPanel({ me, project, onClose, onTour }: { me: Me; project?: Project; onClose: () => void; onTour: () => void }) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Context for support, so the first reply can already help.
  const diagnostics = [`Account: ${me.account.id}`, `Plan: ${me.account.plan}`, project && `App: ${project.id}`, project && `Widget installed: ${project.installedAt ? `yes (${project.installedOrigin})` : 'not detected yet'}`]
    .filter(Boolean)
    .join('\n');
  const mailto = `mailto:${me.server.supportEmail}?subject=${encodeURIComponent('Help with Lumora')}&body=${encodeURIComponent(`Hi Lumora team,\n\n\n\n—\n${diagnostics}`)}`;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Help">
        <div className="spread">
          <h2>Help</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close help">
            Close
          </button>
        </div>

        <div className="grid-2" style={{ gap: 10 }}>
          <button
            className="card help-action"
            onClick={() => {
              onClose();
              navigate('/setup');
            }}
          >
            <Icons.check size={18} />
            <span>
              <strong>Setup guide</strong>
              <span className="muted small">Install, connect, first report</span>
            </span>
          </button>
          <button
            className="card help-action"
            onClick={() => {
              onClose();
              onTour();
            }}
          >
            <Icons.layers size={18} />
            <span>
              <strong>Take the tour</strong>
              <span className="muted small">Where everything is</span>
            </span>
          </button>
        </div>

        <div className="nav-label" style={{ paddingLeft: 0 }}>
          Guides & troubleshooting
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {HELP_ARTICLES.map((a) => (
            <div key={a.id} className="help-item">
              <button className="help-q" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                {a.title}
                <span className="muted">{open === a.id ? '−' : '+'}</span>
              </button>
              {open === a.id && (
                <ol className="help-a">
                  {a.body.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>

        <div className="card card-pad stack-sm help-contact">
          <strong>Still stuck?</strong>
          <span className="muted small">Write to us — we include your account details so we can help right away.</span>
          <a className="btn btn-primary" href={mailto} style={{ textDecoration: 'none' }}>
            Contact support
          </a>
        </div>
      </aside>
    </>
  );
}
