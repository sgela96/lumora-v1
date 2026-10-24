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
  return fetch(`${base}/api/widget/reports`, { method: 'POST', body: form, headers: origin ? { Origin: origin } : {} });
}

test('register → project → widget config → report → ticket', async () => {
  assert.equal((await call('/api/me')).status, 401);
  const reg = await call('/api/auth/register', { body: { name: 'Ana', company: 'Acme', email: 'ana@acme.test', password: 'password123' } });
  assert.equal(reg.status, 201);

  const me = await call('/api/me');
  assert.equal(me.body.account.plan, 'pro');
  assert.equal(me.body.account.planStatus, 'trialing');

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

  // Downgrade to Starter: recording disappears from the widget and Jira can't be connected.
  assert.equal((await call('/api/billing/dev-plan', { body: { plan: 'starter' } })).status, 200);
  const cfg = await fetch(`${base}/api/widget/config?key=${project.publicKey}`, { headers: { Origin: 'https://acme.com' } }).then((r) => r.json());
  assert.equal(cfg.settings.reportTypes.recording, false);
  assert.equal(cfg.settings.capture.network.enabled, false);
  const jira = await call(`/api/projects/${project.id}/integrations`, {
    body: { type: 'jira', config: { siteUrl: 'https://x.atlassian.net', email: 'a@b.c', apiToken: 't', projectKey: 'SUP' } },
  });
  assert.equal(jira.status, 402);
  assert.equal(jira.body.code, 'upgrade');
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
  const [project] = (await call('/api/projects')).body;
  const { body } = await call(`/api/projects/${project.id}/tickets`);
  const ticketId = body.items[0].id;
  cookie = '';
  await call('/api/auth/register', { body: { name: 'Eve', email: 'eve@evil.test', password: 'password123' } });
  assert.equal((await call(`/api/tickets/${ticketId}`)).status, 404);
  assert.equal((await call(`/api/projects/${project.id}`)).status, 404);
});
