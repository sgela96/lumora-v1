import { ADDON_ORDER, ADDONS, PLANS } from '@lumora/shared';
import type { Me } from '../api';
import { Icons } from './icons';
import { Nebula } from './ui';

/** Shown once after a payment is confirmed or extras change: what just got unlocked. */
export function WelcomeModal({ me, onClose, onTour }: { me: Me; onClose: () => void; onTour: () => void }) {
  const plan = PLANS[me.account.plan];
  const extras = ADDON_ORDER.filter((id) => (me.account.addons?.[id] ?? 0) > 0).map((id) => ADDONS[id]);
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label={`Welcome to ${plan.name}`}>
      <div className="modal card iris-border">
        <div className="modal-stage">
          <Nebula className="modal-orb" />
          <span className="spark s1" />
          <span className="spark s2" />
          <span className="spark s3" />
        </div>
        <h1 style={{ textAlign: 'center', fontSize: 28 }}>
          Welcome to <span className="iris-text">{plan.name}</span>
        </h1>
        <p className="muted" style={{ textAlign: 'center', marginTop: 6 }}>
          Your payment is confirmed. Here’s what you have now:
        </p>
        <ul className="unlock-list">
          {plan.highlights.map((h) => (
            <li key={h}>
              <Icons.check size={16} />
              {h}
            </li>
          ))}
          {extras.map((a) => (
            <li key={a.id}>
              <Icons.check size={16} />
              <span>
                <strong>{a.name}</strong> — {a.description}
              </span>
            </li>
          ))}
        </ul>
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={onTour} autoFocus>
            Show me around
          </button>
        </div>
      </div>
    </div>
  );
}
