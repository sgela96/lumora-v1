import { PLAN_ORDER, type PlanId } from '@lumora/shared';
import { useState } from 'react';
import { api } from '../api';
import { PageHead, useToast } from '../components/ui';
import { useApp } from '../state';

export function BillingPage() {
  const { me, catalog, refresh } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const current = me.account.plan;
  const trialing = me.account.planStatus === 'trialing';

  const choose = async (plan: PlanId) => {
    setBusy(plan);
    try {
      if (me.server.billingEnabled) {
        const { url } = await api<{ url: string }>('/billing/checkout', { body: { plan } });
        location.href = url;
        return;
      }
      await api('/billing/dev-plan', { body: { plan } });
      await refresh();
      toast(`Switched to ${catalog.plans[plan].name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(null);
    }
  };

  const portal = async () => {
    const { url } = await api<{ url: string }>('/billing/portal', { body: {} });
    location.href = url;
  };

  return (
    <div className="stack">
      <PageHead
        title="Plan & billing"
        subtitle={
          trialing && me.account.trialEndsAt
            ? `You’re on a free ${catalog.plans[current].name} trial until ${new Date(me.account.trialEndsAt).toLocaleDateString()}. Pick a plan to keep Lumora running.`
            : `You’re on ${catalog.plans[current].name}. Billed monthly, cancel anytime.`
        }
        actions={
          me.server.billingEnabled &&
          me.account.hasBillingCustomer && (
            <button className="btn" onClick={portal}>
              Invoices & payment method
            </button>
          )
        }
      />
      {!me.server.billingEnabled && (
        <div className="notice">
          Billing isn’t configured on this server (no <code>STRIPE_SECRET_KEY</code>), so you can switch plans freely to try each tier.
        </div>
      )}
      {location.hash.includes('checkout=success') && <div className="notice notice-accent">🎉 Thanks! Your subscription is active.</div>}

      <div className="grid-3">
        {PLAN_ORDER.map((id) => {
          const plan = catalog.plans[id];
          const isCurrent = id === current && !trialing;
          return (
            <div key={id} className={`card plan-card${id === current ? ' current' : ''}`}>
              <div className="spread">
                <h2>{plan.name}</h2>
                {id === 'pro' && <span className="badge badge-accent">Most popular</span>}
              </div>
              <div>
                <span className="price">${plan.priceMonthlyUsd}</span>
                <span className="muted"> / month</span>
              </div>
              <p className="muted small">{plan.tagline}</p>
              <ul className="small">
                {plan.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto' }}>
                <button className={`btn ${isCurrent ? '' : 'btn-primary'}`} style={{ width: '100%' }} disabled={isCurrent || busy !== null} onClick={() => choose(id)}>
                  {isCurrent ? 'Current plan' : busy === id ? 'One moment…' : trialing && id === current ? `Keep ${plan.name}` : `Choose ${plan.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
