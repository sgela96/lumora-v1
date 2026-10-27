import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salesforceContext } from '../src/capture/salesforce';

function at(url: string, globals: Record<string, unknown> = {}) {
  const u = new URL(url);
  Object.assign(globalThis, { location: { hostname: u.hostname, pathname: u.pathname }, window: globals });
  return salesforceContext();
}

test('reads the object, record and page from Salesforce URLs', () => {
  assert.deepEqual(at('https://acme.lightning.force.com/lightning/r/Case/5003000000D8cuIAAR/view'), {
    'salesforce.surface': 'Lightning Experience',
    'salesforce.object': 'Case',
    'salesforce.recordId': '5003000000D8cuIAAR',
  });
  assert.deepEqual(at('https://acme.lightning.force.com/lightning/o/Account/list'), { 'salesforce.surface': 'Lightning Experience', 'salesforce.object': 'Account' });
  assert.deepEqual(at('https://acme.lightning.force.com/lightning/n/Billing_Console'), { 'salesforce.surface': 'Lightning Experience', 'salesforce.page': 'Billing_Console' });
  assert.deepEqual(at('https://acme.my.site.com/support/s/case/5003000000D8cuIAAR/printer-jam'), {
    'salesforce.surface': 'Experience Cloud',
    'salesforce.recordId': '5003000000D8cuIAAR',
    'salesforce.object': 'case',
  });
  // A custom domain counts when the Aura runtime is on the page.
  assert.deepEqual(at('https://help.acme.com/s/contactsupport', { $A: {} }), { 'salesforce.surface': 'Experience Cloud', 'salesforce.page': 'contactsupport' });
  assert.deepEqual(at('https://app.acme.com/settings'), {});
});
