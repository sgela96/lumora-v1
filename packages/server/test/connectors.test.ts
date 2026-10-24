import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { CONNECTORS, connectorCatalog } from '../src/connectors';
import type { DeliveryContext } from '../src/connectors/types';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** Replaces fetch with a router: the first route whose pattern matches the URL answers. */
function stubFetch(routes: [RegExp, unknown | ((call: Call) => unknown)][]) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const body = typeof init.body === 'string' ? safeJson(init.body) : init.body;
    const call: Call = { url, method: init.method ?? 'GET', headers, body };
    calls.push(call);
    const route = routes.find(([re]) => re.test(url));
    if (!route) return new Response(JSON.stringify({ message: `unexpected ${url}` }), { status: 404 });
    const value = typeof route[1] === 'function' ? (route[1] as (c: Call) => unknown)(call) : route[1];
    return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

function context(withFile = true): DeliveryContext {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lumora-conn-'));
  const file = path.join(dir, 'screenshot.png');
  writeFileSync(file, Buffer.from('89504e47', 'hex'));
  return {
    ticketId: 'tkt_1',
    reference: 'ACM-7',
    title: '[Bug] Checkout fails',
    description: '## Steps to reproduce\n1. Click **Pay**',
    category: 'Bug',
    payload: { kind: 'screenshot', fields: {}, reporter: { email: 'ana@acme.test' }, metadata: {} },
    aiSummary: 'Payment button throws',
    files: withFile ? [{ path: file, name: 'ACM-7-screenshot.png', mime: 'image/png', size: 4 }] : [],
    attachments: [{ name: 'screenshot.png', kind: 'screenshot', url: 'https://lumora.test/files/tkt_1/screenshot.png?s=x' }],
    dashboardUrl: 'https://lumora.test/app',
  };
}

test('every integration type is registered and the catalog says which ones sync status', () => {
  const catalog = connectorCatalog();
  assert.equal(catalog.length, Object.keys(CONNECTORS).length);
  const byType = Object.fromEntries(catalog.map((c) => [c.type, c]));
  assert.equal(byType.jira.syncsStatus, true);
  assert.equal(byType.jira.category, 'trackers');
  assert.equal(byType.servicenow.category, 'enterprise');
  assert.equal(byType.webhook.syncsStatus, false);
  assert.equal(byType.slack.category, 'messaging');
});

test('jira: creates an issue, uploads attachments, normalizes status categories', async () => {
  const cfg = { siteUrl: 'acme.atlassian.net', email: 'a@acme.test', apiToken: 'tok', projectKey: 'SUP' };
  stubFetch([
    [/\/rest\/api\/2\/issue$/, { key: 'SUP-12' }],
    [/\/attachments$/, [{}]],
  ]);
  const result = await CONNECTORS.jira.send(context(), cfg);
  assert.deepEqual(result, { externalId: 'SUP-12', url: 'https://acme.atlassian.net/browse/SUP-12' });
  const create = calls[0];
  assert.equal(create.method, 'POST');
  assert.equal(create.headers.authorization, `Basic ${Buffer.from('a@acme.test:tok').toString('base64')}`);
  assert.equal((create.body as any).fields.project.key, 'SUP');
  assert.match((create.body as any).fields.description, /^\*Summary:\* Payment button throws/);
  assert.equal(calls[1].headers['x-atlassian-token'], 'no-check');

  for (const [key, expected] of [['new', 'open'], ['indeterminate', 'in_progress'], ['done', 'resolved']] as const) {
    stubFetch([[/\/issue\/SUP-12\?fields=status/, { fields: { status: { name: 'Whatever', statusCategory: { key } } } }]]);
    assert.deepEqual(await CONNECTORS.jira.fetchStatus!(cfg, 'SUP-12'), { status: expected, label: 'Whatever' });
  }
});

test('github: returns the issue number as id and maps open/closed', async () => {
  const cfg = { repository: 'acme/web', token: 'ghp_x' };
  stubFetch([[/\/repos\/acme\/web\/issues$/, { number: 42, html_url: 'https://github.com/acme/web/issues/42' }]]);
  const result = await CONNECTORS.github.send(context(false), cfg);
  assert.deepEqual(result, { externalId: '42', displayId: '#42', url: 'https://github.com/acme/web/issues/42' });
  assert.match((calls[0].body as any).body, /!\[Screenshot\]\(https:\/\/lumora\.test/);

  stubFetch([[/\/issues\/42$/, { state: 'closed', state_reason: 'completed' }]]);
  assert.deepEqual(await CONNECTORS.github.fetchStatus!(cfg, '42'), { status: 'resolved', label: 'Closed' });
  stubFetch([[/\/issues\/42$/, { state: 'open' }]]);
  assert.deepEqual(await CONNECTORS.github.fetchStatus!(cfg, '#42'), { status: 'open', label: 'Open' });
});

test('azure devops: uploads, then creates a Bug with repro steps and the attachment relation', async () => {
  const cfg = { organization: 'acme', project: 'Web App', token: 'pat' };
  stubFetch([
    [/_apis\/wit\/attachments/, { url: 'https://dev.azure.com/acme/_apis/wit/attachments/abc' }],
    [/_apis\/wit\/workitems\/\$Bug/, { id: 314, _links: { html: { href: 'https://dev.azure.com/acme/Web%20App/_workitems/edit/314' } } }],
  ]);
  const result = await CONNECTORS.azure_devops.send(context(), cfg);
  assert.deepEqual(result, { externalId: '314', displayId: '#314', url: 'https://dev.azure.com/acme/Web%20App/_workitems/edit/314' });
  assert.equal(calls[0].headers['content-type'], 'application/octet-stream');
  const create = calls[1];
  assert.equal(create.headers['content-type'], 'application/json-patch+json');
  assert.equal(create.headers.authorization, `Basic ${Buffer.from(':pat').toString('base64')}`);
  const ops = create.body as { path: string; value: any }[];
  assert.equal(ops.find((o) => o.path === '/fields/System.Title')?.value, '[Bug] Checkout fails');
  assert.match(ops.find((o) => o.path === '/fields/Microsoft.VSTS.TCM.ReproSteps')?.value, /<strong>Summary:<\/strong>/);
  assert.equal(ops.find((o) => o.path === '/relations/-')?.value.rel, 'AttachedFile');

  for (const [state, expected] of [['New', 'open'], ['Active', 'in_progress'], ['Resolved', 'resolved'], ['Closed', 'resolved']] as const) {
    stubFetch([[/workitems\/314\?fields=System\.State/, { fields: { 'System.State': state } }]]);
    assert.deepEqual(await CONNECTORS.azure_devops.fetchStatus!(cfg, '314'), { status: expected, label: state });
  }
});

test('servicenow: creates an incident, attaches files, maps numeric states', async () => {
  const cfg = { instance: 'acme', username: 'svc', password: 'pw', assignmentGroup: 'Web' };
  stubFetch([
    [/\/api\/now\/table\/incident\?/, { result: { sys_id: 'abc123', number: 'INC0010042' } }],
    [/\/api\/now\/attachment\/file/, { result: {} }],
  ]);
  const result = await CONNECTORS.servicenow.send(context(), cfg);
  assert.deepEqual(result, { externalId: 'abc123', displayId: 'INC0010042', url: 'https://acme.service-now.com/nav_to.do?uri=incident.do?sys_id=abc123' });
  const body = calls[0].body as any;
  assert.equal(body.short_description, '[Bug] Checkout fails');
  assert.equal(body.assignment_group, 'Web');
  assert.match(body.description, /^SUMMARY: Payment button throws/);
  assert.match(calls[1].url, /table_name=incident&table_sys_id=abc123&file_name=ACM-7-screenshot\.png/);

  for (const [state, expected, label] of [['1', 'open', 'New'], ['2', 'in_progress', 'In Progress'], ['3', 'in_progress', 'On Hold'], ['6', 'resolved', 'Resolved'], ['7', 'resolved', 'Closed']] as const) {
    stubFetch([[/incident\/abc123\?sysparm_fields=state/, { result: { state } }]]);
    assert.deepEqual(await CONNECTORS.servicenow.fetchStatus!(cfg, 'abc123'), { status: expected, label });
  }
});

test('gitlab: uploads files, embeds them, and maps opened/closed', async () => {
  const cfg = { project: 'https://gitlab.com/acme/web', token: 'glpat' };
  stubFetch([
    [/\/projects\/acme%2Fweb\/uploads$/, { markdown: '![shot](/uploads/abc/shot.png)' }],
    [/\/projects\/acme%2Fweb\/issues$/, { iid: 9, web_url: 'https://gitlab.com/acme/web/-/issues/9' }],
  ]);
  const result = await CONNECTORS.gitlab.send(context(), cfg);
  assert.deepEqual(result, { externalId: '9', displayId: '#9', url: 'https://gitlab.com/acme/web/-/issues/9' });
  assert.equal(calls[0].headers['private-token'], 'glpat');
  assert.match((calls[1].body as any).description, /!\[shot\]\(\/uploads\/abc\/shot\.png\)/);

  stubFetch([[/\/issues\/9$/, { state: 'closed' }]]);
  assert.deepEqual(await CONNECTORS.gitlab.fetchStatus!(cfg, '9'), { status: 'resolved', label: 'Closed' });
  stubFetch([[/\/issues\/9$/, { state: 'opened' }]]);
  assert.deepEqual(await CONNECTORS.gitlab.fetchStatus!(cfg, '#9'), { status: 'open', label: 'Open' });
});

test('help desk status mapping (zendesk, freshdesk, linear, clickup)', async () => {
  stubFetch([[/tickets\/5\.json$/, { ticket: { status: 'pending' } }]]);
  assert.deepEqual(await CONNECTORS.zendesk.fetchStatus!({ subdomain: 'acme', email: 'a@b.c', apiToken: 't' }, '5'), { status: 'in_progress', label: 'Pending' });
  stubFetch([[/tickets\/5$/, { status: 4 }]]);
  assert.deepEqual(await CONNECTORS.freshdesk.fetchStatus!({ domain: 'acme.freshdesk.com', apiKey: 'k' }, '5'), { status: 'resolved', label: 'Resolved' });
  stubFetch([[/linear\.app\/graphql/, { data: { issue: { state: { name: 'In Review', type: 'started' } } } }]]);
  assert.deepEqual(await CONNECTORS.linear.fetchStatus!({ apiKey: 'k', teamKey: 'ENG' }, 'ENG-1'), { status: 'in_progress', label: 'In Review' });
  stubFetch([[/task\/abc$/, { status: { status: 'qa', type: 'custom' } }]]);
  assert.deepEqual(await CONNECTORS.clickup.fetchStatus!({ token: 't', listId: '1' }, 'abc'), { status: 'in_progress', label: 'qa' });
});

test('remote API errors surface a readable message', async () => {
  stubFetch([]);
  await assert.rejects(CONNECTORS.github.fetchStatus!({ repository: 'acme/web', token: 't' }, '1'), /api\.github\.com answered 404: unexpected/);
});
