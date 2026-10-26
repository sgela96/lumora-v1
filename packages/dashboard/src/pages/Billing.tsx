import { monthlyPrice, PLAN_ORDER, type AddonId, type AddonQuantities, type PlanId } from '@lumora/shared';
import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { Icons } from '../components/icons';
import { Card, PageHead, useToast } from '../components/ui';
import { TrialButton } from '../components/TrialButton';
import { useApp } from '../state';

/** The full matrix behind "Compare all features" — the cards above stay short. */
/** Back from Stripe Checkout: the webhook may land a few seconds later, so wait for it before celebrating. */
function PaymentStatus() {
  const { me, refresh } = useApp();
  const [tries, setTries] = useState(0);
  const confirmed = me.account.planStatus === 'active' && me.account.plan !== 'free';
  useEffect(() => {
    if (confirmed || tries >= 15) return;
    const t = setTimeout(() => refresh().finally(() => setTries((n) => n + 1)), 2000);
    return () => clearTimeout(t);
  }, [confirmed, tries, refresh]);
  if (confirmed) return <div className="notice notice-accent">Payment confirmed — your {me.limits.name} plan is active. A receipt is on its way to your inbox.</div>;
  if (tries >= 15) return <div className="notice">We’re still waiting for the payment confirmation. It can take a minute; this page updates on its own — or refresh later.</div>;
  return (
    <div className="notice row" style={{ gap: 10 }}>
      <span className="pulse-dot" aria-hidden /> Confirming your payment…
    </div>
  );
}

const COMPARE: { group: string; rows: [string, string, string, string][] }[] = [
  {
    group: 'Widget',
    rows: [
      ['Apps', '1', '1 (+ extra apps)', '25'],
      ['Reports a month', '25', '500 (+1,000 packs)', '10,000'],
      ['Screenshots with markup', '✓', '✓', '✓'],
      ['Screen recording with voice', '—', '2 min (10 with extra)', '10 min'],
      ['Written steps from recordings', '—', '✓', '✓'],
      ['Your branding (no “Powered by”)', '—', '✓', '✓'],
    ],
  },
  {
    group: 'Captured automatically',
    rows: [
      ['Console errors, browser & page', '✓', '✓', '✓'],
      ['Failed requests & the user’s last steps', '—', '✓', '✓'],
      ['Hide sensitive elements', '—', '—', '✓'],
    ],
  },
  {
    group: 'Tickets',
    rows: [
      ['Slack, webhook, e-mail', '✓', '✓', '✓'],
      ['Jira, Azure DevOps, GitHub, GitLab, Linear & 5 more', '—', '✓', '✓'],
      ['Zendesk, Freshdesk, HubSpot', '—', 'Extra', '✓'],
      ['Salesforce, ServiceNow, Freshservice', '—', '—', '✓'],
      ['Destinations per app', '1', '1 (3 with help desks)', '10 + routing'],
      ['Custom ticket template', '—', '✓', '✓'],
    ],
  },
  {
    group: 'AI Powered',
    rows: [
      ['Voice transcripts, summaries, smarter steps', '—', 'Extra', '✓'],
      ['Suggested priority, duplicates, translation', '—', 'Extra', '✓'],
    ],
  },
  {
    group: 'Back office',
    rows: [
      ['Dashboard', '—', 'Basic', 'Advanced'],
      ['Report repository with live ticket status', '—', '—', '✓'],
      ['Similar reports grouped into issues', '—', '—', '✓'],
    ],
  },
];

export function BillingPage() {
  const { me, catalog, refresh } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [addons, setAddons] = useState<AddonQuantities>(me.account.addons ?? {});
  const [showCompare, setShowCompare] = useState(false);
  const [returning] = useState(() => location.hash.includes('checkout=success'));
  const current = me.account.chosenPlan ?? me.account.plan;
  const trialing = me.account.planStatus === 'trialing';
  const addonsDirty = JSON.stringify(addons) !== JSON.stringify(me.account.addons ?? {});

  const subscribe = async (plan: PlanId, withAddons: AddonQuantities = {}) => {
    setBusy(plan);
    try {
      if (me.server.billingEnabled) {
        if (plan === 'free') {
          // Downgrading is handled in Stripe's portal (cancel at period end).
          const { url } = await api<{ url: string }>('/billing/portal', { body: {} });
          location.href = url;
          return;
        }
        const res = await api<{ url?: string; updated?: boolean }>('/billing/checkout', { body: { plan, addons: withAddons } });
        if (res.url) {
          location.href = res.url;
          return;
        }
      } else {
        await api('/billing/dev-plan', { body: { plan, addons: withAddons } });
      }
      await refresh();
      toast(`You’re on ${catalog.plans[plan].name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(null);
    }
  };

  const setQty = (id: AddonId, n: number) => setAddons((a) => ({ ...a, [id]: Math.max(0, Math.min(catalog.addons[id].stackable ? 50 : 1, n)) }));

  return (
    <div className="stack rise">
      <PageHead
        title="Plan & billing"
        subtitle={
          trialing && me.account.trialEndsAt
            ? `You’re trying ${catalog.plans[current].name} free until ${new Date(me.account.trialEndsAt).toLocaleDateString()}. After that you keep Lumora on Free.`
            : `You’re on ${catalog.plans[me.account.plan].name}. Billed monthly, cancel anytime.`
        }
        actions={
          me.server.billingEnabled &&
          me.account.hasBillingCustomer && (
            <button className="btn" onClick={() => api<{ url: string }>('/billing/portal', { body: {} }).then(({ url }) => (location.href = url))}>
              Invoices & payment method
            </button>
          )
        }
      />
      {!me.server.billingEnabled && <div className="notice">Billing isn’t configured on this server (no STRIPE_SECRET_KEY), so you can switch plans and extras freely to try them.</div>}
      {returning && <PaymentStatus />}
      {me.account.canTrial && (
        <div className="notice notice-accent spread" style={{ gap: 16, flexWrap: 'wrap' }}>
          <span>
            <strong>Try Pro free for 7 days.</strong> Screen recordings that turn into steps, network logs, all 10 trackers, your own template and the dashboard. No card needed,
            and you’re back on Free when it ends.
          </span>
          <TrialButton />
        </div>
      )}

      <div className="grid-3">
        {PLAN_ORDER.map((id) => {
          const plan = catalog.plans[id];
          const isCurrent = id === me.account.plan && !trialing;
          // On Business, Pro is part of what they already have, so it isn't offered as a move.
          const included = id === 'pro' && me.account.plan === 'business' && !trialing;
          const featured = id === 'pro' && !included;
          return (
            <div key={id} className={`card price-card lift${featured ? ' featured iris-border' : ''}`}>
              {featured && <span className="ribbon">Most popular</span>}
              <div>
                <h2>{plan.name}</h2>
                <p className="muted small" style={{ marginTop: 2 }}>
                  {plan.tagline}
                </p>
              </div>
              <div>
                <span className="price">${plan.priceMonthlyUsd}</span>
                <span className="muted"> / month</span>
              </div>
              <ul className="small">
                {plan.highlights.map((h) => (
                  <li key={h}>
                    <Icons.check size={15} />
                    {h}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto' }}>
                <button
                  className={`btn ${featured && !isCurrent ? 'btn-primary' : ''}`}
                  style={{ width: '100%' }}
                  disabled={isCurrent || included || busy !== null}
                  onClick={() => subscribe(id, id === 'pro' ? addons : {})}
                >
                  {isCurrent ? 'Current plan' : included ? 'Included in Business' : busy === id ? 'One moment…' : trialing && id === current ? `Keep ${plan.name}` : id === 'free' ? 'Switch to Free' : `Choose ${plan.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!(me.account.plan === 'business' && !trialing) && (
      <Card
        title="Extras for Pro"
        actions={
          <span className="muted small">
            Pro with these extras: <strong className="tnum">${monthlyPrice('pro', addons)}</strong> / month
          </span>
        }
      >
        <div>
          {catalog.addonOrder.map((id) => {
            const addon = catalog.addons[id];
            const qty = addons[id] ?? 0;
            return (
              <div key={id} className="addon-row">
                <div>
                  <strong>{addon.name}</strong> {id === 'ai' && <span className="ai-label" style={{ marginLeft: 6 }}>New</span>}
                  <div className="muted small">{addon.description}</div>
                </div>
                <span className="muted small tnum">${addon.priceMonthlyUsd} / month{addon.stackable ? ' each' : ''}</span>
                {addon.stackable ? (
                  <span className="stepper">
                    <button type="button" aria-label={`Fewer ${addon.name}`} onClick={() => setQty(id, qty - 1)}>
                      −
                    </button>
                    <span>{qty}</span>
                    <button type="button" aria-label={`More ${addon.name}`} onClick={() => setQty(id, qty + 1)}>
                      +
                    </button>
                  </span>
                ) : (
                  <button type="button" role="switch" aria-checked={qty > 0} aria-label={addon.name} className="switch" onClick={() => setQty(id, qty ? 0 : 1)} />
                )}
              </div>
            );
          })}
        </div>
        <div className="spread" style={{ marginTop: 14 }}>
          <span className="muted small">Business includes every extra.</span>
          <button className="btn btn-primary" disabled={!addonsDirty || busy !== null} onClick={() => subscribe('pro', addons)}>
            {me.account.plan === 'pro' && !trialing ? 'Update extras' : 'Choose Pro with these extras'}
          </button>
        </div>
      </Card>
      )}

      <div>
        <button className="btn btn-ghost" onClick={() => setShowCompare(!showCompare)}>
          {showCompare ? 'Hide' : 'Compare all features'}
        </button>
      </div>
      {showCompare && (
        <Card pad={false}>
          <table className="table compare small">
            <thead>
              <tr>
                <th />
                <th>Free</th>
                <th>Pro</th>
                <th>Business</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((g) => (
                <Fragment key={g.group}>
                  <tr className="group">
                    <td colSpan={4}>{g.group}</td>
                  </tr>
                  {g.rows.map(([label, ...cells]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {cells.map((c, i) => (
                        <td key={i} className={c === '—' ? 'muted' : undefined}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
