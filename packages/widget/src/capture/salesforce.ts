/**
 * Salesforce awareness: where the user is (object, record, page) and what Lightning error
 * messages look like, for Lightning Experience and Experience Cloud sites.
 */

/** Lightning error toasts, page-level errors and the "Sorry to interrupt" dialog. */
export const SALESFORCE_ERROR_SELECTORS = [
  '.forceToastMessage.slds-theme--error',
  '.forceToastMessage.slds-theme_error',
  '.slds-notify_toast.slds-theme_error',
  '.slds-notify--toast.slds-theme--error',
  '.slds-notify_alert.slds-theme_error',
  '.forcePageError',
  '.pageLevelErrors',
  '#auraErrorMessage',
];

/** Where the readable text of a Salesforce error lives inside the matched element. */
export const SALESFORCE_TEXT_SELECTORS = ['.toastMessage', '.slds-text-heading_small', '.slds-text-heading--small', '.genericError', '.forceActionsText'];

export function isSalesforce(): boolean {
  if (/(\.lightning\.force\.com|\.my\.salesforce\.com|\.force\.com|\.my\.site\.com|\.salesforce-sites\.com)$/.test(location.hostname)) return true;
  // Experience Cloud on a custom domain: the Aura or LWR runtime is on the page.
  const w = window as unknown as { $A?: unknown; LWR?: unknown };
  return !!(w.$A || w.LWR);
}

/** Object, record and page from a Lightning or Experience Cloud URL. */
export function salesforceContext(): Record<string, string> {
  if (!isSalesforce()) return {};
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const out: Record<string, string> = {};
  if (parts[0] === 'lightning') {
    out['salesforce.surface'] = 'Lightning Experience';
    const [, kind, a, b] = parts;
    if (kind === 'r' && a) {
      out['salesforce.object'] = a;
      if (b && /^[a-zA-Z0-9]{15,18}$/.test(b)) out['salesforce.recordId'] = b;
    } else if (kind === 'o' && a) out['salesforce.object'] = a;
    else if (kind === 'n' && a) out['salesforce.page'] = a;
    else if (kind === 'page' && a) out['salesforce.page'] = a;
    else if (kind === 'setup') out['salesforce.page'] = `Setup${a ? ` › ${a}` : ''}`;
    return out;
  }
  out['salesforce.surface'] = 'Experience Cloud';
  const s = parts.indexOf('s');
  const rest = s >= 0 ? parts.slice(s + 1) : parts;
  const id = rest.find((p) => /^[a-zA-Z0-9]{15,18}$/.test(p) && /\d/.test(p));
  if (id) {
    out['salesforce.recordId'] = id;
    const object = rest[rest.indexOf(id) - 1];
    if (object) out['salesforce.object'] = object;
  } else if (rest.length) out['salesforce.page'] = rest.join('/');
  else out['salesforce.page'] = 'Home';
  return out;
}
