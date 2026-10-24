import { createHmac, timingSafeEqual } from 'node:crypto';
import { isPlanId, PLAN_ORDER, type PlanId } from '@lumora/shared';
import express, { Router } from 'express';
import { requireJsonForMutations, requireUser } from '../auth';
import { billingEnabled, config } from '../config';
import { one, run } from '../db';
import { getAccount, HttpError } from '../services';

// Stripe is called over its REST API directly: two endpoints and a webhook don't justify the SDK.

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new HttpError(502, `Stripe: ${body.error?.message ?? res.status}`);
  return body;
}

function planForPrice(priceId: string | undefined): PlanId | undefined {
  return PLAN_ORDER.find((p) => config.stripe.prices[p] && config.stripe.prices[p] === priceId);
}

/** Mounted before express.json(): signature verification needs the raw body. */
export function stripeWebhookRouter(): Router {
  const router = Router();
  router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
    if (!billingEnabled() || !config.stripe.webhookSecret) throw new HttpError(404, 'Billing is not configured');
    const raw = (req.body as Buffer).toString('utf8');
    if (!verifyStripeSignature(raw, String(req.headers['stripe-signature'] ?? ''), config.stripe.webhookSecret)) {
      throw new HttpError(400, 'Invalid signature');
    }
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, any> } };
    const obj = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const accountId = obj.client_reference_id as string | undefined;
      const plan = obj.metadata?.plan;
      if (accountId && isPlanId(plan)) {
        run(
          `UPDATE accounts SET plan = ?, plan_status = 'active', stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`,
          plan,
          obj.customer ?? null,
          obj.subscription ?? null,
          accountId,
        );
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const account = one<{ id: string }>('SELECT id FROM accounts WHERE stripe_customer_id = ?', String(obj.customer));
      if (account) {
        const plan = planForPrice(obj.items?.data?.[0]?.price?.id);
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : String(obj.status);
        // Stripe statuses: active, trialing, past_due, unpaid, canceled, incomplete…
        const mapped = ['active', 'trialing'].includes(status) ? 'active' : status;
        run(
          'UPDATE accounts SET plan = COALESCE(?, plan), plan_status = ?, stripe_subscription_id = ? WHERE id = ?',
          plan ?? null,
          mapped,
          obj.id ?? null,
          account.id,
        );
      }
    }
    res.json({ received: true });
  });
  return router;
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

  router.post('/checkout', async (req, res) => {
    const plan = req.body.plan;
    if (!isPlanId(plan)) throw new HttpError(400, 'Unknown plan');
    if (!billingEnabled()) throw new HttpError(400, 'Billing is not configured on this server');
    const price = config.stripe.prices[plan];
    if (!price) throw new HttpError(500, `STRIPE_PRICE_${plan.toUpperCase()} is not set`);
    const account = getAccount(req.user!.accountId);

    let customer = account.stripe_customer_id;
    if (!customer) {
      const created = await stripe<{ id: string }>('customers', { email: req.user!.email, name: account.name, 'metadata[account_id]': account.id });
      customer = created.id;
      run('UPDATE accounts SET stripe_customer_id = ? WHERE id = ?', customer, account.id);
    }
    const session = await stripe<{ url: string }>('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: account.id,
      'line_items[0][price]': price,
      'line_items[0][quantity]': '1',
      'metadata[plan]': plan,
      'subscription_data[metadata][account_id]': account.id,
      allow_promotion_codes: 'true',
      success_url: `${config.publicUrl}/app/#/billing?checkout=success`,
      cancel_url: `${config.publicUrl}/app/#/billing`,
    });
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

  /** Without Stripe (local / self-hosted demo) plans can be switched freely to try every tier. */
  router.post('/dev-plan', (req, res) => {
    if (billingEnabled()) throw new HttpError(403, 'Use checkout when billing is enabled');
    const plan = req.body.plan;
    if (!isPlanId(plan)) throw new HttpError(400, 'Unknown plan');
    run(`UPDATE accounts SET plan = ?, plan_status = 'active' WHERE id = ?`, plan, req.user!.accountId);
    res.json({ ok: true });
  });

  return router;
}
