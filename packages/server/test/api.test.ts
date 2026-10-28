import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

// Isolated server: in-memory DB, temp upload dir. Env must be set before the app is imported.
process.env.LUMORA_DB = ':memory:';
process.env.LUMORA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'lumora-test-'));
process.env.LUMORA_SECRET = 'test-secret';

let base = '';
let close: () => void;
let cookie = '';

before(async () => {
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

async function call(pathname: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + pathname, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

function report(key: string, payload: object, origin?: string) {
  const form = new FormData();
  form.append('key', key);
  form.append('payload', JSON.stringify(payload));
  form.append('screenshot', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'screenshot.png');
  return fetch(`${base}/api/widget/reports?key=${encodeURIComponent(key)}`, { method: 'POST', body: form, headers: origin ? { Origin: origin } : {} });
}

test('register → project → widget config → report → ticket', async () => {
  assert.equal((await call('/api/me')).status, 401);
  const reg = await call('/api/auth/register', { body: { name: 'Ana', company: 'Acme', email: 'ana@acme.test', password: 'password123' } });
  assert.equal(reg.status, 201);

  const me = await call('/api/me');
  assert.equal(me.body.account.plan, 'free');
  assert.equal(me.body.account.planStatus, 'active');
  assert.equal(me.body.account.canTrial, true);
  // Pro (via the opt-in trial): basic dashboard, no repository.
  assert.equal((await call('/api/billing/trial', { body: {} })).status, 200);
  const [firstProject] = (await call('/api/projects')).body;
  assert.equal((await call(`/api/projects/${firstProject.id}/metrics`)).body.level, 'basic');
  // Pro lists and opens its reports; statuses, filters and grouping are Business.
  assert.equal((await call(`/api/projects/${firstProject.id}/tickets`)).status, 200);
  assert.equal((await call(`/api/projects/${firstProject.id}/issues`)).status, 402);
  assert.equal((await call('/api/billing/dev-plan', { body: { plan: 'business' } })).status, 200);

  const [project] = (await call('/api/projects')).body;
  assert.match(project.publicKey, /^pk_/);
  assert.equal(project.ticketPrefix, 'ACM');

  const cfg = await fetch(`${base}/api/widget/config?key=${project.publicKey}`).then((r) => r.json());
  assert.equal(cfg.settings.reportTypes.recording, true);

  const res = await report(project.publicKey, {
    kind: 'screenshot',
    fields: { category: 'Bug', description: 'Checkout is broken', injected: 'nope' },
    reporter: { email: 'user@shop.test', id: '42' },
    metadata: { release: '1.2.3' },
    console: [{ level: 'error', message: 'TypeError: boom', timestamp: Date.now() }, { level: 'log', message: 'noise', timestamp: Date.now() }],
    breadcrumbs: [{ type: 'click', kind: 'button', label: 'Pay', timestamp: Date.now() }],
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.reference, 'ACM-1');

  const list = await call(`/api/projects/${project.id}/tickets`);
  assert.equal(list.body.total, 1);
  const ticket = (await call(`/api/tickets/${created.id}`)).body;
  assert.equal(ticket.title, '[Bug] Checkout is broken');
  assert.equal(ticket.payload.fields.injected, undefined, 'fields outside the template are dropped');
  assert.deepEqual(ticket.payload.console.map((c: { level: string }) => c.level), ['error'], 'only configured levels are kept');
  assert.match(ticket.description, /Click the "Pay" button/);
  assert.ok(ticket.screenshotUrl);
  const shot = await fetch(base + ticket.screenshotUrl, { headers: { Cookie: cookie } });
  assert.equal(shot.status, 200);
  assert.equal(shot.headers.get('content-type'), 'image/png');
});

test('allowed origins and plan limits are enforced', async () => {
  const [project] = (await call('/api/projects')).body;
  await call(`/api/projects/${project.id}`, { method: 'PATCH', body: { allowedOrigins: ['https://*.acme.com'] } });
  const blocked = await fetch(`${base}/api/widget/config?key=${project.publicKey}`, { headers: { Origin: 'https://evil.test' } });
  assert.equal(blocked.status, 403);
  const allowed = await fetch(`${base}/api/widget/config?key=${project.publicKey}`, { headers: { Origin: 'https://app.acme.com' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.acme.com');

  // Downgrade to Free: no recording, one of three trackers only, no dashboard.
  assert.equal((await call('/api/billing/dev-plan', { body: { plan: 'free' } })).status, 200);
  const cfg = await fetch(`${base}/api/widget/config?key=${project.publicKey}`, { headers: { Origin: 'https://acme.com' } }).then((r) => r.json());
  assert.equal(cfg.settings.reportTypes.recording, false);
  const azureOnFree = await call(`/api/projects/${project.id}/integrations`, {
    body: { type: 'azure_devops', config: { organization: 'acme', project: 'Web', token: 't' } },
  });
  assert.equal(azureOnFree.status, 402);
  const zendesk = await call(`/api/projects/${project.id}/integrations`, {
    body: { type: 'zendesk', config: { subdomain: 'acme', email: 'a@b.c', apiToken: 't' } },
  });
  assert.equal(zendesk.status, 402);
  assert.equal(zendesk.body.code, 'upgrade');
  assert.equal((await call(`/api/projects/${project.id}/metrics`)).status, 402);
  assert.equal((await call(`/api/projects/${project.id}/issues`)).status, 402);
  const second = await call('/api/projects', { body: { name: 'Second site' } });
  assert.equal(second.status, 402);
});

test('integration secrets are never returned and are kept on edit', async () => {
  const [project] = (await call('/api/projects')).body;
  const created = await call(`/api/projects/${project.id}/integrations`, { body: { type: 'webhook', config: { url: 'https://hooks.example.com/x', secret: 'top-secret' } } });
  assert.equal(created.status, 201);
  assert.equal(created.body.config.secret, '••••••••');
  const edited = await call(`/api/integrations/${created.body.id}`, { method: 'PATCH', body: { config: { url: 'https://hooks.example.com/y', secret: '••••••••' } } });
  assert.equal(edited.body.config.url, 'https://hooks.example.com/y');
  assert.equal(edited.body.config.secret, '••••••••');
});

test('cookie-authenticated mutations require JSON (CSRF guard)', async () => {
  const res = await fetch(`${base}/api/projects`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=x' });
  assert.equal(res.status, 415);
});

test('other accounts cannot read tickets', async () => {
  await call('/api/billing/dev-plan', { body: { plan: 'business' } });
  const [project] = (await call('/api/projects')).body;
  const { body } = await call(`/api/projects/${project.id}/tickets`);
  const ticketId = body.items[0].id;
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Eve', email: 'eve@evil.test', password: 'password123' } });
  assert.equal((await call(`/api/tickets/${ticketId}`)).status, 404);
  assert.equal((await call(`/api/projects/${project.id}`)).status, 404);
});

test('Support Center: grouping, metrics, manual status and status sync from Jira', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Sam', company: 'Globex', email: 'sam@globex.test', password: 'password123' } });
  assert.equal((await call('/api/billing/dev-plan', { body: { plan: 'business' } })).status, 200);
  const [project] = (await call('/api/projects')).body;

  // A fake Jira: creates SUP-1, SUP-2… and reports whatever status we set.
  const jiraStatus: Record<string, { name: string; category: string }> = {};
  let created = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://globex.atlassian.net')) return realFetch(input, init);
    if (url.endsWith('/rest/api/2/issue') && init?.method === 'POST') {
      const key = `SUP-${++created}`;
      jiraStatus[key] = { name: 'To Do', category: 'new' };
      return new Response(JSON.stringify({ key }), { status: 201 });
    }
    const m = url.match(/\/rest\/api\/2\/issue\/(SUP-\d+)\?/);
    if (m) return new Response(JSON.stringify({ key: m[1], fields: { status: { name: jiraStatus[m[1]].name, statusCategory: { key: jiraStatus[m[1]].category } } } }));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  try {
    const jira = await call(`/api/projects/${project.id}/integrations`, {
      body: { type: 'jira', config: { siteUrl: 'https://globex.atlassian.net', email: 'a@b.c', apiToken: 't', projectKey: 'SUP' } },
    });
    assert.equal(jira.status, 201);
    assert.match(jira.body.hookUrl, /\/api\/hooks\/status\/int_/);
    // The URL is built from LUMORA_PUBLIC_URL; point it at this test server.
    const hookUrl = base + new URL(jira.body.hookUrl).pathname;

    const error = (n: number) => ({ level: 'error', message: `TypeError: Cannot read properties of undefined (reading 'total') at order ${n}`, timestamp: Date.now() });
    for (const n of [101, 202]) {
      const res = await report(project.publicKey, { kind: 'describe', fields: { category: 'Bug', description: `Checkout fails ${n}` }, reporter: { email: `u${n}@x.test` }, metadata: {}, console: [error(n)] });
      assert.equal(res.status, 201);
    }
    await report(project.publicKey, { kind: 'describe', fields: { category: 'Idea', description: 'Dark mode please' }, reporter: {}, metadata: {} });
    await new Promise((r) => setTimeout(r, 300)); // deliveries run in the background

    const issues = (await call(`/api/projects/${project.id}/issues`)).body;
    assert.equal(issues[0].reports, 2, 'same error with different numbers groups into one issue');
    assert.equal(issues[0].reporters, 2);

    const list = (await call(`/api/projects/${project.id}/tickets?status=open`)).body;
    assert.equal(list.counts.open, 3);
    const ticket = list.items.find((t: { title: string }) => t.title.includes('101'));
    const delivery = ticket.deliveries[0];
    assert.equal(delivery.externalId, delivery.displayId ?? delivery.externalId);
    assert.match(delivery.externalId, /^SUP-\d$/);

    // Someone moves the Jira issue to "In Review", then Jira calls the webhook.
    jiraStatus[delivery.externalId] = { name: 'In Review', category: 'indeterminate' };
    const bad = await fetch(hookUrl.replace(/\/[^/]+$/, '/wrong-token'), { method: 'POST', body: '{}' });
    assert.equal(bad.status, 404);
    const hook = await fetch(hookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue: { key: delivery.externalId } }) });
    assert.equal(hook.status, 202);
    await new Promise((r) => setTimeout(r, 200));
    let synced = (await call(`/api/tickets/${ticket.id}`)).body;
    assert.equal(synced.status, 'in_progress');
    assert.equal(synced.externalStatus, 'In Review');

    // Resolved in Jira → resolved in Lumora (manual sync endpoint).
    jiraStatus[delivery.externalId] = { name: 'Done', category: 'done' };
    synced = (await call(`/api/tickets/${ticket.id}/sync`, { body: {} })).body;
    assert.equal(synced.status, 'resolved');
    assert.ok(synced.resolvedAt);

    // Manual status for the idea.
    const idea = list.items.find((t: { category: string }) => t.category === 'Idea');
    assert.equal((await call(`/api/tickets/${idea.id}`, { method: 'PATCH', body: { status: 'in_progress' } })).body.status, 'in_progress');
    assert.equal((await call(`/api/tickets/${idea.id}`, { method: 'PATCH', body: { status: 'nope' } })).status, 400);

    const metrics = (await call(`/api/projects/${project.id}/metrics?days=7`)).body;
    assert.equal(metrics.totals.reports, 3);
    assert.equal(metrics.totals.resolved, 1);
    assert.equal(metrics.totals.withErrors, 2);
    assert.equal(metrics.series.length, 7);
    assert.equal(metrics.series.at(-1).created, 3);
    assert.equal(metrics.topIssues[0].reports, 2);

    const filtered = (await call(`/api/projects/${project.id}/tickets?category=Idea`)).body;
    assert.equal(filtered.total, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Pro extras unlock help desks; an expired trial falls back to Free', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Pat', company: 'Initech', email: 'pat@initech.test', password: 'password123' } });
  const [project] = (await call('/api/projects')).body;
  const zendesk = { type: 'zendesk', config: { subdomain: 'initech', email: 'a@b.c', apiToken: 't' } };
  assert.equal((await call(`/api/projects/${project.id}/integrations`, { body: zendesk })).status, 402);
  assert.equal((await call('/api/billing/dev-plan', { body: { plan: 'pro', addons: { helpdesks: 1, ai: 1, nonsense: 3 } } })).status, 200);
  const me = (await call('/api/me')).body;
  assert.deepEqual(me.account.addons, { helpdesks: 1, ai: 1 });
  assert.equal(me.limits.features.aiSteps, true);
  assert.equal((await call(`/api/projects/${project.id}/integrations`, { body: zendesk })).status, 201);

  // Trial over without paying → Free limits, widget still works.
  const { getDb } = await import('../src/db');
  getDb().prepare("UPDATE accounts SET plan_status = 'trialing', trial_ends_at = '2000-01-01T00:00:00Z' WHERE id = ?").run(me.account.id);
  const after = (await call('/api/me')).body;
  assert.equal(after.account.plan, 'free');
  const cfg = await fetch(`${base}/api/widget/config?key=${project.publicKey}`).then((r) => r.json());
  assert.equal(cfg.plan, 'free');
});

test('onboarding: install detection, first report, progress and the plan the user has seen', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Lu', company: 'Hooli', email: 'lu@hooli.test', password: 'password123' } });
  let me = (await call('/api/me')).body;
  assert.equal(me.account.onboarding.setupDone, undefined);
  assert.equal(me.account.onboarding.seenPlan, me.account.planKey, 'the trial itself is not a "payment" moment');

  const [project] = (await call('/api/projects')).body;
  assert.equal(project.installedAt, null);
  await fetch(`${base}/api/widget/config?key=${project.publicKey}`, { headers: { Origin: 'https://app.hooli.test' } });
  await report(project.publicKey, { kind: 'screenshot', fields: { description: 'Hello' } }, 'https://app.hooli.test');
  const [after] = (await call('/api/projects')).body;
  assert.equal(after.installedOrigin, 'https://app.hooli.test');
  assert.ok(!Number.isNaN(Date.parse(after.installedAt)));
  assert.ok(after.firstReportAt);

  assert.equal((await call('/api/me/onboarding', { method: 'PATCH', body: { setupDone: true, tourDone: true } })).status, 200);
  await call('/api/billing/dev-plan', { body: { plan: 'business' } });
  me = (await call('/api/me')).body;
  assert.deepEqual([me.account.onboarding.setupDone, me.account.onboarding.tourDone], [true, true]);
  assert.notEqual(me.account.planKey, me.account.onboarding.seenPlan, 'a new plan is waiting to be celebrated');
  await call('/api/me/onboarding', { method: 'PATCH', body: { seenPlan: true } });
  me = (await call('/api/me')).body;
  assert.equal(me.account.planKey, me.account.onboarding.seenPlan);
});

test('password reset: unknown e-mails look the same, tokens are single-use', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Ro', company: 'Umbrella', email: 'ro@umbrella.test', password: 'password123' } });
  cookie = '';
  assert.deepEqual((await call('/api/auth/forgot', { body: { email: 'nobody@umbrella.test' } })).body, { ok: true });
  assert.deepEqual((await call('/api/auth/forgot', { body: { email: 'ro@umbrella.test' } })).body, { ok: true });

  // The real token is only e-mailed; plant a known one.
  const { createHash } = await import('node:crypto');
  const { getDb } = await import('../src/db');
  const token = 'known-reset-token';
  getDb()
    .prepare('UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE email = ?')
    .run(createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 60_000).toISOString(), 'ro@umbrella.test');

  assert.equal((await call('/api/auth/reset', { body: { token, password: 'short' } })).status, 400);
  assert.equal((await call('/api/auth/reset', { body: { token, password: 'new-password-1' } })).status, 200);
  assert.equal((await call('/api/me')).status, 200, 'signed in after reset');
  assert.equal((await call('/api/auth/reset', { body: { token, password: 'new-password-2' } })).status, 400);
  cookie = '';
  assert.equal((await call('/api/auth/login', { body: { email: 'ro@umbrella.test', password: 'new-password-1' } })).status, 200);
});

test('status webhook is created in GitHub with one click and removed with the integration', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Gi', company: 'Stark', email: 'gi@stark.test', password: 'password123' } });
  await call('/api/billing/dev-plan', { body: { plan: 'business' } });
  const [project] = (await call('/api/projects')).body;
  const calls: { method: string; url: string; body?: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.github.com')) return realFetch(input, init);
    calls.push({ method: init?.method ?? 'GET', url, body: init?.body as string });
    if (url.endsWith('/hooks') && init?.method === 'POST') return Response.json({ id: 77 }, { status: 201 });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json({ full_name: 'stark/suit', has_issues: true });
  }) as typeof fetch;
  try {
    const created = (await call(`/api/projects/${project.id}/integrations`, { body: { type: 'github', config: { repository: 'stark/suit', token: 'ghp_x' } } })).body;
    assert.equal(created.autoHook, true);
    assert.equal(created.hookConfigured, false);
    assert.ok(created.webhookGuide.length > 0);

    const hook = (await call(`/api/integrations/${created.id}/auto-hook`, { body: {} })).body;
    assert.equal(hook.ok, true);
    const post = calls.find((c) => c.url.endsWith('/repos/stark/suit/hooks'))!;
    assert.equal(JSON.parse(post.body!).config.url, created.hookUrl);
    const [listed] = (await call(`/api/projects/${project.id}/integrations`)).body;
    assert.equal(listed.hookConfigured, true);

    // The hook URL answers and records when the last update arrived.
    const ping = await fetch(base + new URL(created.hookUrl).pathname, { method: 'POST', body: '{"zen":"hi"}', headers: { 'Content-Type': 'application/json' } });
    assert.equal(ping.status, 202);
    assert.ok((await call(`/api/projects/${project.id}/integrations`)).body[0].lastHookAt);

    assert.equal((await call(`/api/integrations/${created.id}`, { method: 'DELETE', body: {} })).status, 200);
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/repos/stark/suit/hooks/77')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('new accounts start on Free and can opt into one 7-day Pro trial', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Tia', company: 'Tyrell', email: 'tia@tyrell.test', password: 'password123' } });
  let me = (await call('/api/me')).body;
  assert.equal(me.account.plan, 'free');
  assert.equal(me.account.trialEndsAt, null);
  assert.ok(me.limits.integrations.includes('jira'), 'Free can connect Jira');
  assert.ok(!me.limits.integrations.includes('azure_devops'));
  assert.equal(me.limits.historyDays, 30, 'Free keeps a month of reports');

  const started = await call('/api/billing/trial', { body: {} });
  assert.equal(started.status, 200);
  me = (await call('/api/me')).body;
  assert.equal(me.account.plan, 'pro');
  assert.equal(me.account.planStatus, 'trialing');
  assert.equal(me.account.canTrial, false);
  const days = (new Date(me.account.trialEndsAt).getTime() - Date.now()) / 86400_000;
  assert.ok(days > 6.9 && days <= 7, `trial lasts 7 days, got ${days}`);
  assert.notEqual(me.account.planKey, me.account.onboarding.seenPlan, 'starting a trial is celebrated once');

  assert.equal((await call('/api/billing/trial', { body: {} })).status, 409, 'only one trial per account');
});

test('Support Center: tool statuses, priorities, bulk edits, saved views and reminders', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Lee', company: 'Initech', email: 'lee@initech.test', password: 'password123' } });
  await call('/api/billing/dev-plan', { body: { plan: 'business' } });
  const [project] = (await call('/api/projects')).body;

  // A fake Jira with a three-step workflow, and a fake Slack that records what it receives.
  const workflow = [
    { name: 'To Do', statusCategory: { key: 'new' } },
    { name: 'In Review', statusCategory: { key: 'indeterminate' } },
    { name: 'Done', statusCategory: { key: 'done' } },
  ];
  const issues: Record<string, { status: (typeof workflow)[number]; assignee: { displayName: string; emailAddress: string } | null }> = {};
  const slack: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://hooks.slack.com')) {
      slack.push(JSON.parse(String(init?.body)).text);
      return new Response('ok');
    }
    if (!url.startsWith('https://initech.atlassian.net')) return realFetch(input, init);
    if (url.endsWith('/rest/api/2/issue') && init?.method === 'POST') {
      const key = `INI-${Object.keys(issues).length + 1}`;
      issues[key] = { status: workflow[0], assignee: { displayName: 'Milton', emailAddress: 'milton@initech.test' } };
      return new Response(JSON.stringify({ key }), { status: 201 });
    }
    if (url.endsWith('/project/INI/statuses')) return new Response(JSON.stringify([{ name: 'Bug', statuses: workflow }]));
    const transition = url.match(/\/issue\/(INI-\d+)\/transitions$/);
    if (transition && init?.method === 'POST') {
      const id = JSON.parse(String(init.body)).transition.id as string;
      issues[transition[1]].status = workflow[Number(id)];
      return new Response(null, { status: 204 });
    }
    if (transition) return new Response(JSON.stringify({ transitions: workflow.map((s, i) => ({ id: String(i), to: { name: s.name } })) }));
    const m = url.match(/\/rest\/api\/2\/issue\/(INI-\d+)\?/);
    if (m) {
      const issue = issues[m[1]];
      return new Response(JSON.stringify({ key: m[1], fields: { status: issue.status, assignee: issue.assignee } }));
    }
    return new Response('{}');
  }) as typeof fetch;

  try {
    await call(`/api/projects/${project.id}/integrations`, { body: { type: 'jira', config: { siteUrl: 'https://initech.atlassian.net', email: 'a@b.c', apiToken: 't', projectKey: 'INI' } } });
    for (const n of [1, 2]) await report(project.publicKey, { kind: 'describe', fields: { category: 'Bug', description: `Stapler missing ${n}` }, reporter: {}, metadata: {} });
    await new Promise((r) => setTimeout(r, 300));

    const flow = (await call(`/api/projects/${project.id}/workflow`)).body;
    assert.equal(flow.source, 'tool');
    assert.deepEqual(flow.statuses.map((s: { name: string; category: string }) => `${s.name}:${s.category}`), ['To Do:open', 'In Review:in_progress', 'Done:resolved']);

    const { items } = (await call(`/api/projects/${project.id}/tickets`)).body;
    const [first, second] = items;
    // Picking a tool status moves the Jira issue and reads it back, assignee included.
    const moved = (await call(`/api/tickets/${first.id}`, { method: 'PATCH', body: { externalStatus: 'In Review' } })).body;
    assert.equal(moved.externalStatus, 'In Review');
    assert.equal(moved.status, 'in_progress');
    assert.equal(moved.assignee.name, 'Milton');
    assert.equal((await call(`/api/tickets/${first.id}`, { method: 'PATCH', body: { externalStatus: 'Shipped' } })).status, 400);

    const bulk = (await call(`/api/projects/${project.id}/tickets/bulk`, { body: { ids: [first.id, second.id, 'tk_nope'], patch: { priority: 'urgent' } } })).body;
    assert.equal(bulk.results.length, 2);
    const urgent = (await call(`/api/projects/${project.id}/tickets?priority=urgent`)).body;
    assert.equal(urgent.total, 2);
    assert.equal((await call(`/api/tickets/${first.id}`, { method: 'PATCH', body: { priority: 'whenever' } })).status, 400);

    const view = (await call(`/api/projects/${project.id}/views`, { body: { name: 'Urgent bugs', query: 'priority=urgent', layout: { mode: 'board', groupBy: 'status' } } })).body;
    assert.equal((await call(`/api/projects/${project.id}/views`)).body[0].layout.mode, 'board');
    await call(`/api/views/${view.id}`, { method: 'DELETE', body: {} });
    assert.equal((await call(`/api/projects/${project.id}/views`)).body.length, 0);

    // Reminders need Slack or Teams.
    assert.equal((await call(`/api/tickets/${first.id}/remind`, { body: {} })).status, 400);
    await call(`/api/projects/${project.id}/integrations`, { body: { type: 'slack', config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' } } });
    const channels = (await call(`/api/projects/${project.id}/reminders`)).body;
    assert.deepEqual(channels.map((c: { type: string; direct: boolean }) => [c.type, c.direct]), [['slack', false]]);
    slack.length = 0;
    const sent = (await call(`/api/tickets/${first.id}/remind`, { body: { note: 'Customers keep asking' } })).body;
    assert.match(sent.sentTo, /Milton/);
    assert.match(slack[0], /\*Milton\*, a reminder/);
    assert.match(slack[0], /Customers keep asking/);
    assert.match(slack[0], /Sent from Lumora by Lee/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('dashboard: one layout per organization, set by the owner; Business metrics for the new cards', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Owner', company: 'Umbrella', email: 'owner@umbrella.test', password: 'password123' } });
  let me = (await call('/api/me')).body;
  assert.equal(me.dashboard.canEdit, true);
  assert.equal((await call('/api/account/dashboard', { method: 'PUT', body: { layout: [] } })).status, 402, 'Free has no dashboard');

  await call('/api/billing/dev-plan', { body: { plan: 'pro' } });
  me = (await call('/api/me')).body;
  assert.equal(me.dashboard.custom, false);
  assert.equal(me.dashboard.layout[0].id, 'kpi.reports');
  // Unknown cards, duplicates and wrong sizes are cleaned up.
  const saved = await call('/api/account/dashboard', {
    method: 'PUT',
    body: { layout: [{ id: 'byOs', size: 'L' }, { id: 'byOs', size: 'S' }, { id: 'nope', size: 'M' }, { id: 'kpi.open', size: 'L' }] },
  });
  assert.deepEqual(saved.body.layout, [{ id: 'byOs', size: 'L' }, { id: 'kpi.open', size: 'S' }]);
  assert.equal((await call('/api/me')).body.dashboard.custom, true);

  // A teammate in the same organization sees the same layout but can't change it.
  const { run, one } = await import('../src/db');
  const { hashPassword } = await import('../src/lib/crypto');
  const account = one<{ account_id: string }>("SELECT account_id FROM users WHERE email = 'owner@umbrella.test'")!;
  run('INSERT INTO users (id, account_id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'usr_teammate', account.account_id, 'mate@umbrella.test', 'Mate', await hashPassword('password123'), '2999-01-01 00:00:00');
  cookie = '';
  assert.equal((await call('/api/auth/login', { body: { email: 'mate@umbrella.test', password: 'password123' } })).status, 200);
  me = (await call('/api/me')).body;
  assert.equal(me.dashboard.canEdit, false);
  assert.deepEqual(me.dashboard.layout.map((i: { id: string }) => i.id), ['byOs', 'kpi.open']);
  assert.equal((await call('/api/account/dashboard', { method: 'PUT', body: { layout: null } })).status, 403);

  // Pro metrics carry the breakdowns its cards need.
  const [project] = (await call('/api/projects')).body;
  const basic = (await call(`/api/projects/${project.id}/metrics`)).body;
  assert.equal(basic.level, 'basic');
  for (const key of ['byBrowser', 'byOs', 'byKind', 'topPages']) assert.ok(Array.isArray(basic[key]), key);

  // Business: people affected, workload, aging and the errors people saw.
  await call('/api/billing/dev-plan', { body: { plan: 'business' } });
  const error = { level: 'error', message: 'TypeError: x is undefined', timestamp: Date.now() };
  const seen = { level: 'error', message: 'Error shown on screen (Salesforce): “Insufficient access rights”', timestamp: Date.now() };
  for (const email of ['a@x.test', 'b@x.test', 'a@x.test']) {
    await report(project.publicKey, { kind: 'describe', fields: { category: 'Bug', description: 'Save fails' }, reporter: { email }, metadata: {}, console: [error, seen] });
  }
  run("UPDATE tickets SET assignee_name = 'Ada', priority = 'high' WHERE project_id = ?", project.id);
  const m = (await call(`/api/projects/${project.id}/metrics?days=7`)).body;
  assert.equal(m.peopleAffected[0].reporters, 2, 'three reports from two people');
  assert.equal(m.peopleAffected[0].reports, 3);
  assert.deepEqual(m.byAssignee, [{ label: 'Ada', value: 3 }]);
  assert.deepEqual(m.byPriority, [{ label: 'High', value: 3 }]);
  assert.equal(m.aging[0].value, 3);
  assert.equal(m.screenErrors[0].label, 'Insufficient access rights');
  assert.equal(m.screenErrors[0].value, 3);
  assert.equal(m.byToolStatus[0].label, 'Open');
});

test('reports: filters take several values; the owner sets the default display for everyone', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Lin', company: 'Linearish', email: 'lin@linearish.test', password: 'password123' } });
  await call('/api/billing/dev-plan', { body: { plan: 'business' } });
  const [project] = (await call('/api/projects')).body;
  for (const category of ['Bug', 'Idea', 'Question']) {
    assert.equal((await report(project.publicKey, { kind: 'describe', fields: { category, description: `A ${category}` }, reporter: {}, metadata: {} })).status, 201);
  }
  const both = (await call(`/api/projects/${project.id}/tickets?category=Bug&category=Idea`)).body;
  assert.equal(both.total, 2);
  const { run } = await import('../src/db');
  run("UPDATE tickets SET priority = 'high' WHERE project_id = ? AND category = 'Bug'", project.id);
  assert.equal((await call(`/api/projects/${project.id}/tickets?priority=high&priority=none`)).body.total, 3);
  assert.equal((await call(`/api/projects/${project.id}/tickets?priority=none`)).body.total, 2);

  assert.equal((await call('/api/projects')).body[0].reportDisplay.layout, 'list');
  const saved = await call(`/api/projects/${project.id}/report-display`, { method: 'PUT', body: { display: { layout: 'board', groupBy: 'priority', properties: ['id', 'priority', 'nope'] } } });
  assert.equal(saved.status, 200);
  const display = (await call('/api/projects')).body[0].reportDisplay;
  assert.equal(display.layout, 'board');
  assert.equal(display.groupBy, 'priority');
  assert.deepEqual(display.properties, ['id', 'priority']);
  await call(`/api/projects/${project.id}/report-display`, { method: 'PUT', body: { display: null } });
  assert.equal((await call('/api/projects')).body[0].reportDisplay.layout, 'list');
});

test('organization: invitations use seats, invited people join with their role, owners and admins manage people', async () => {
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Olivia Owner', company: 'Seatco', email: 'olivia@seatco.test', password: 'password123' } });
  let org = (await call('/api/org')).body;
  assert.equal(org.name, 'Seatco');
  assert.deepEqual(org.seats, { used: 1, limit: 2 });
  assert.equal(org.members[0].role, 'owner');
  assert.equal((await call('/api/me')).body.user.role, 'owner');

  // Free has 2 seats: the owner and one invitation.
  const invite = await call('/api/org/invites', { body: { email: 'max@seatco.test', role: 'member' } });
  assert.equal(invite.status, 201);
  assert.match(invite.body.link, /\/app\/#\/invite\//);
  assert.equal((await call('/api/org/invites', { body: { email: 'third@seatco.test' } })).status, 402);
  assert.equal((await call('/api/org/invites', { body: { email: 'olivia@seatco.test' } })).status, 409);
  // Re-inviting the same e-mail replaces the invitation instead of using another seat.
  const again = await call('/api/org/invites', { body: { email: 'max@seatco.test', role: 'member' } });
  assert.equal(again.status, 201);
  assert.equal(again.body.organization.invites.length, 1);
  assert.equal((await call(`/api/invites/${invite.body.link.split('/invite/')[1]}`)).status, 404, 'the old link stops working');

  await call('/api/billing/dev-plan', { body: { plan: 'pro' } });
  const adminInvite = await call('/api/org/invites', { body: { email: 'ada@seatco.test', role: 'admin' } });
  assert.equal(adminInvite.status, 201);

  // Accepting: anyone with the link, signed out.
  cookie = '';
  const token = again.body.link.split('/invite/')[1];
  const preview = (await call(`/api/invites/${token}`)).body;
  assert.deepEqual([preview.email, preview.organization, preview.invitedBy], ['max@seatco.test', 'Seatco', 'Olivia Owner']);
  assert.equal((await call(`/api/invites/${token}/accept`, { body: { name: 'Max', password: 'short' } })).status, 400);
  assert.equal((await call(`/api/invites/${token}/accept`, { body: { name: 'Max', password: 'password123' } })).status, 201);
  const max = (await call('/api/me')).body;
  assert.equal(max.user.role, 'member');
  assert.equal(max.account.name, 'Seatco');
  assert.equal(max.dashboard.canEdit, false);
  assert.equal((await call(`/api/invites/${token}`)).status, 404, 'an invitation works once');
  assert.equal((await call('/api/org/invites', { body: { email: 'x@seatco.test' } })).status, 403, 'members can’t invite');
  const maxId = max.user.id;

  cookie = '';
  await call(`/api/invites/${adminInvite.body.link.split('/invite/')[1]}/accept`, { body: { name: 'Ada Admin', password: 'password123' } });
  org = (await call('/api/org')).body;
  assert.equal(org.you.role, 'admin');
  assert.deepEqual(org.members.map((m: { role: string }) => m.role), ['owner', 'admin', 'member']);
  assert.equal((await call(`/api/org/members/${maxId}`, { method: 'PATCH', body: { role: 'admin' } })).status, 403, 'only the owner changes roles');
  const ownerId = org.members[0].id;
  assert.equal((await call(`/api/org/members/${ownerId}`, { method: 'DELETE', body: {} })).status, 400);
  assert.equal((await call(`/api/org/members/${maxId}`, { method: 'DELETE', body: {} })).status, 200);
  assert.deepEqual((await call('/api/org')).body.seats, { used: 2, limit: 5 });

  // The owner hands over ownership and becomes an admin.
  cookie = '';
  await call('/api/auth/login', { body: { email: 'olivia@seatco.test', password: 'password123' } });
  const adaId = org.members[1].id;
  org = (await call(`/api/org/members/${adaId}`, { method: 'PATCH', body: { role: 'owner' } })).body;
  assert.deepEqual(org.members.map((m: { name: string; role: string }) => `${m.name}:${m.role}`), ['Ada Admin:owner', 'Olivia Owner:admin']);
});
