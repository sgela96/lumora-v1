import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { buildSteps, clampSettingsToPlan, defaultSettings, mergeSettings, redactText, redactUrl, type UserAction } from '@lumora/shared';
import { toHtml, toJiraWiki, toSlack } from '../src/lib/markdown';
import { renderTicket } from '../src/lib/ticket';
import { verifyStripeSignature } from '../src/routes/billing';

const at = (type: UserAction['type'], label: string, extra: Partial<UserAction> = {}, timestamp = 0): UserAction => ({
  type,
  label,
  kind: extra.kind ?? 'element',
  timestamp,
  ...extra,
});

test('steps: collapses typing, link navigation and submit noise', () => {
  const steps = buildSteps(
    [
      at('click', 'Settings', { kind: 'link' }, 0),
      at('navigate', '/settings', { kind: 'page' }, 100),
      at('click', 'Email', { kind: 'field', selector: '#email' }, 200),
      at('input', 'Email', { kind: 'field', selector: '#email' }, 300),
      at('input', 'Email', { kind: 'field', selector: '#email', value: 'a@b.co' }, 400),
      at('click', 'Save', { kind: 'button' }, 500),
      at('submit', 'profile', { kind: 'form' }, 520),
      at('error', 'TypeError: x is undefined', { kind: 'error' }, 600),
      at('error', 'TypeError: x is undefined', { kind: 'error' }, 610),
    ],
    'en',
  );
  assert.deepEqual(
    steps.map((s) => s.text),
    ['Click the "Settings" link', 'Enter "a@b.co" in the "Email" field', 'Click the "Save" button', '⚠️ The page shows an error: TypeError: x is undefined'],
  );
});

test('steps: Spanish phrasing and start URL', () => {
  const steps = buildSteps([at('check', 'Recordarme', { kind: 'checkbox', checked: false })], 'es', 'https://app.test/login');
  assert.deepEqual(
    steps.map((s) => s.text),
    ['Abrir https://app.test/login', 'Desmarcar "Recordarme"'],
  );
});

test('redaction removes secrets but keeps context', () => {
  assert.equal(redactUrl('https://x.test/cb?code=abc123&state=ok'), 'https://x.test/cb?code=[redacted]&state=ok');
  assert.equal(redactText('Auth failed for ana@acme.com with Bearer eyJabc.def'), 'Auth failed for [email] with Bearer [redacted]');
  assert.equal(redactText('card 4242 4242 4242 4242 declined'), 'card [card] declined');
  // Stack frames keep their line:column after the redacted query value.
  assert.equal(redactText('at (https://x.test/?key=pk_123:10:5)'), 'at (https://x.test/?key=[redacted]:10:5)');
});

test('plan clamping turns off features the plan lacks', () => {
  const s = defaultSettings();
  s.capture.aiSteps = true;
  s.appearance.showBranding = false;
  s.capture.redactSelectors = ['.secret'];
  const starter = clampSettingsToPlan(s, 'starter');
  assert.equal(starter.reportTypes.recording, false);
  assert.equal(starter.capture.network.enabled, false);
  assert.equal(starter.capture.aiSteps, false);
  assert.equal(starter.appearance.showBranding, true);
  assert.deepEqual(starter.capture.redactSelectors, []);
  const business = clampSettingsToPlan(s, 'business');
  assert.equal(business.capture.aiSteps, true);
  assert.equal(business.appearance.showBranding, false);
  assert.equal(business.recording.maxSeconds, 120);
});

test('mergeSettings fills new defaults into old stored settings and ignores junk', () => {
  const merged = mergeSettings({ appearance: { accentColor: '#000000', unknown: 1 }, capture: { console: { levels: ['error'] } }, extra: true });
  assert.equal(merged.appearance.accentColor, '#000000');
  assert.equal(merged.appearance.position, 'bottom-right');
  assert.deepEqual(merged.capture.console.levels, ['error']);
  assert.equal((merged as unknown as Record<string, unknown>).extra, undefined);
  assert.equal((merged.appearance as unknown as Record<string, unknown>).unknown, undefined);
});

test('markdown converts to each ticket system format', () => {
  const md = '## Steps\n1. Click **Save**\n2. See `error`\n\n```\nTypeError\n```\n[Screenshot](https://x.test/a.png)';
  assert.match(toJiraWiki(md), /^h3\. Steps\n\n# Click \*Save\*\n# See \{\{error\}\}/);
  assert.match(toJiraWiki(md), /\{noformat\}\nTypeError\n\{noformat\}/);
  assert.match(toJiraWiki(md), /\[Screenshot\|https:\/\/x\.test\/a\.png\]/);
  assert.match(toHtml(md), /<ol><li>Click <strong>Save<\/strong><\/li><li>See <code>error<\/code><\/li><\/ol>/);
  assert.match(toHtml('<script>'), /&lt;script&gt;/);
  assert.match(toSlack(md), /<https:\/\/x\.test\/a\.png\|Screenshot>/);
});

test('ticket rendering fills variables and drops empty sections', () => {
  const settings = defaultSettings();
  const rendered = renderTicket({
    settings,
    reference: 'ACM-7',
    steps: [{ text: 'Click the "Pay" button', timestamp: 1500 }],
    stepsAreRelative: true,
    attachments: [],
    payload: {
      kind: 'describe',
      fields: { category: 'Bug', description: 'Payment button does nothing\nmore details' },
      reporter: { email: 'ana@acme.test' },
      metadata: {},
      console: [],
    },
  });
  assert.equal(rendered.title, '[Bug] Payment button does nothing');
  assert.equal(rendered.category, 'Bug');
  assert.match(rendered.description, /## Steps to reproduce\n1\. \[0:02\] Click the "Pay" button/);
  assert.doesNotMatch(rendered.description, /## Console/);
  assert.doesNotMatch(rendered.description, /## Environment/);
});

test('stripe webhook signatures are verified', () => {
  const secret = 'whsec_test';
  const payload = '{"type":"x"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret), true);
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sig.replace(/.$/, '0')}`, secret), false);
  assert.equal(verifyStripeSignature(payload, `t=${t - 3600},v1=${sig}`, secret), false);
});
