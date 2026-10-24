import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADDON_ORDER, ADDONS, isAddonId, isPlanId, PLAN_ORDER, PLANS, type AddonQuantities, type PlanId } from '@lumora/shared';
import express, { Router } from 'express';
import { requireJsonForMutations, requireUser } from '../auth';
import { billingEnabled, config } from '../config';
import { one, run } from '../db';
import { planActivatedMail, sendMail } from '../lib/mail';
import { canStartTrial, getAccount, HttpError } from '../services';

// Stripe is called over its REST API directly: a handful of endpoints and a webhook don't justify the SDK.

async function stripe<T>(path: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const query = method === 'GET' && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  const res = await fetch(`https://api.stripe.com/v1/${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? new URLSearchParams(params) : undefined,
  });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new HttpError(502, `Stripe: ${body.error?.message ?? res.status}`);
  return body;
}

interface StripeItem {
  id: string;
  quantity: number;
  price: { id: string };
}

/** Plan + add-ons → Stripe line items (one price per plan and per add-on, quantity = count). */
export function lineItems(plan: PlanId, addons: AddonQuantities): { price: string; quantity: number }[] {
  const price = config.stripe.prices[plan];
  if (!price) throw new HttpError(500, `STRIPE_PRICE_${plan.toUpperCase()} is not set`);
  const items = [{ price, quantity: 1 }];
  for (const id of PLANS[plan].addons) {
    const quantity = Math.max(0, Math.floor(addons[id] ?? 0));
    if (!quantity) continue;
    const addonPrice = config.stripe.addonPrices[id];
    if (!addonPrice) throw new HttpError(500, `STRIPE_PRICE_ADDON_${id.toUpperCase()} is not set`);
    items.push({ price: addonPrice, quantity: ADDONS[id].stackable ? quantity : 1 });
  }
  return items;
}

/** Stripe subscription items → plan + add-ons, for the webhook. */
export function fromStripeItems(items: StripeItem[]): { plan?: PlanId; addons: AddonQuantities } {
  const addons: AddonQuantities = {};
  let plan: PlanId | undefined;
  for (const item of items) {
    const p = PLAN_ORDER.find((id) => config.stripe.prices[id] && config.stripe.prices[id] === item.price.id);
    if (p) plan = p;
    const addon = ADDON_ORDER.find((id) => config.stripe.addonPrices[id] && config.stripe.addonPrices[id] === item.price.id);
    if (addon) addons[addon] = item.quantity;
  }
  return { plan, addons };
}

function cleanAddons(plan: PlanId, input: unknown): AddonQuantities {
  const out: AddonQuantities = {};
  if (typeof input !== 'object' || !input) return out;
  for (const [k, v] of Object.entries(input)) {
    if (!isAddonId(k) || !PLANS[plan].addons.includes(k)) continue;
    const n = Math.max(0, Math.min(ADDONS[k].stackable ? 50 : 1, Math.floor(Number(v) || 0)));
    if (n) out[k] = n;
  }
  return out;
}

/** Mounted before express.json(): signature verification needs the raw body. */
export function stripeWebhookRouter(): Router {
  const router = Router();
  router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!billingEnabled() || !config.stripe.webhookSecret) throw new HttpError(404, 'Billing is not configured');
    const raw = (req.body as Buffer).toString('utf8');
    if (!verifyStripeSignature(raw, String(req.headers['stripe-signature'] ?? ''), config.stripe.webhookSecret)) {
      throw new HttpError(400, 'Invalid signature');
    }
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, any> } };
    const obj = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const accountId = obj.client_reference_id as string | undefined;
      if (accountId) {
        run(`UPDATE accounts SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`, obj.customer ?? null, obj.subscription ?? null, accountId);
        if (obj.subscription) await applySubscription(String(obj.subscription));
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      applySubscriptionObject(obj, event.type === 'customer.subscription.deleted');
    }
    res.json({ received: true });
  });
  return router;
}

async function applySubscription(subscriptionId: string): Promise<void> {
  const sub = await stripe<Record<string, any>>(`subscriptions/${subscriptionId}`, {}, 'GET');
  applySubscriptionObject(sub, false);
}

/** Plan, add-ons and status always come from the subscription itself, so any change in Stripe is reflected. */
function applySubscriptionObject(sub: Record<string, any>, deleted: boolean): void {
  const account = one<{ id: string }>('SELECT id FROM accounts WHERE stripe_customer_id = ?', String(sub.customer));
  if (!account) return;
  if (deleted || sub.status === 'canceled') {
    run(`UPDATE accounts SET plan = 'free', plan_status = 'active', addons = '{}', stripe_subscription_id = NULL WHERE id = ?`, account.id);
    return;
  }
  const { plan, addons } = fromStripeItems((sub.items?.data ?? []) as StripeItem[]);
  // Stripe statuses: active, trialing, past_due, unpaid, incomplete… only active/trialing grant the paid plan.
  const status = ['active', 'trialing'].includes(String(sub.status)) ? 'active' : String(sub.status);
  const before = one<{ plan: string; plan_status: string }>('SELECT plan, plan_status FROM accounts WHERE id = ?', account.id);
  if (status === 'active' && plan && plan !== 'free' && (before?.plan !== plan || before?.plan_status !== 'active')) {
    const user = one<{ email: string; name: string }>('SELECT email, name FROM users WHERE account_id = ? ORDER BY created_at LIMIT 1', account.id);
    if (user) void sendMail(planActivatedMail(user.email, user.name, PLANS[plan].name, PLANS[plan].highlights));
  }
  run(
    'UPDATE accounts SET plan = COALESCE(?, plan), plan_status = ?, addons = ?, stripe_subscription_id = ? WHERE id = ?',
    plan ?? null,
    status,
    JSON.stringify(addons),
    sub.id ?? null,
    account.id,
  );
}

export function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = parts.t;
  const signatures = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export function billingRouter(): Router {
  const router = Router();
  router.use(requireJsonForMutations, requireUser);

  /** Start (or change) a paid subscription: a plan plus add-ons. */
  router.post('/checkout', async (req, res) => {
    const plan = req.body.plan;
    if (!isPlanId(plan) || plan === 'free') throw new HttpError(400, 'Choose Pro or Business');
    if (!billingEnabled()) throw new HttpError(400, 'Billing is not configured on this server');
    const addons = cleanAddons(plan, req.body.addons);
    const items = lineItems(plan, addons);
    const account = getAccount(req.user!.accountId);

    // Existing subscription: swap its items in place (Stripe prorates).
    if (account.stripe_subscription_id) {
      const sub = await stripe<{ items: { data: StripeItem[] } }>(`subscriptions/${account.stripe_subscription_id}`, {}, 'GET');
      const params: Record<string, string> = { proration_behavior: 'create_prorations' };
      sub.items.data.forEach((item, i) => {
        params[`items[${i}][id]`] = item.id;
        params[`items[${i}][deleted]`] = 'true';
      });
      items.forEach((item, i) => {
        const n = sub.items.data.length + i;
        params[`items[${n}][price]`] = item.price;
        params[`items[${n}][quantity]`] = String(item.quantity);
      });
      const updated = await stripe<Record<string, any>>(`subscriptions/${account.stripe_subscription_id}`, params);
      applySubscriptionObject(updated, false);
      res.json({ updated: true });
      return;
    }

    let customer = account.stripe_customer_id;
    if (!customer) {
      const created = await stripe<{ id: string }>('customers', { email: req.user!.email, name: account.name, 'metadata[account_id]': account.id });
      customer = created.id;
      run('UPDATE accounts SET stripe_customer_id = ? WHERE id = ?', customer, account.id);
    }
    const params: Record<string, string> = {
      mode: 'subscription',
      customer,
      client_reference_id: account.id,
      'subscription_data[metadata][account_id]': account.id,
      allow_promotion_codes: 'true',
      success_url: `${config.publicUrl}/app/#/billing?checkout=success`,
      cancel_url: `${config.publicUrl}/app/#/billing`,
    };
    items.forEach((item, i) => {
      params[`line_items[${i}][price]`] = item.price;
      params[`line_items[${i}][quantity]`] = String(item.quantity);
    });
    const session = await stripe<{ url: string }>('checkout/sessions', params);
    res.json({ url: session.url });
  });

  router.post('/portal', async (req, res) => {
    if (!billingEnabled()) throw new HttpError(400, 'Billing is not configured on this server');
    const account = getAccount(req.user!.accountId);
    if (!account.stripe_customer_id) throw new HttpError(400, 'No subscription yet');
    const session = await stripe<{ url: string }>('billing_portal/sessions', {
      customer: account.stripe_customer_id,
      return_url: `${config.publicUrl}/app/#/billing`,
    });
    res.json({ url: session.url });
  });

  /** Opt-in Pro trial: once per account, no card. When it ends the account is back on Free. */
  router.post('/trial', (req, res) => {
    const account = getAccount(req.user!.accountId);
    if (!canStartTrial(account)) throw new HttpError(409, account.trial_ends_at ? 'You’ve already used your Pro trial' : 'Your account is already on a paid plan');
    const ends = new Date(Date.now() + config.trialDays * 86400_000).toISOString();
    run(`UPDATE accounts SET plan = 'pro', plan_status = 'trialing', trial_ends_at = ? WHERE id = ?`, ends, account.id);
    res.json({ ok: true, trialEndsAt: ends });
  });

  /** Without Stripe (local / self-hosted demo) plans and add-ons can be switched freely to try every tier. */
  router.post('/dev-plan', (req, res) => {
    if (billingEnabled()) throw new HttpError(403, 'Use checkout when billing is enabled');
    const plan = req.body.plan;
    if (!isPlanId(plan)) throw new HttpError(400, 'Unknown plan');
    const addons = cleanAddons(plan, req.body.addons ?? {});
    run(`UPDATE accounts SET plan = ?, plan_status = 'active', addons = ? WHERE id = ?`, plan, JSON.stringify(addons), req.user!.accountId);
    res.json({ ok: true });
  });

  return router;
}
