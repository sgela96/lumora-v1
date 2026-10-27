import type { ConsoleEntry, NetworkEntry, ProjectSettings } from '@lumora/shared';
import { truncate } from '../util';
import type { ConsoleCapture } from './console';
import type { NetworkCapture } from './network';
import { isSalesforce, SALESFORCE_ERROR_SELECTORS, SALESFORCE_TEXT_SELECTORS } from './salesforce';

export type SignalSource = 'page' | 'network' | 'message';

/** Something went wrong for the user: a thrown error, a failed request or an error shown on screen. */
export interface ErrorSignal {
  source: SignalSource;
  message: string;
  /** Set for messages read from Salesforce's own toasts and error dialogs. */
  platform?: 'salesforce';
}

/** Error toasts and alerts of the common UI libraries. */
const GENERIC_ERROR_SELECTORS = [
  '.Toastify__toast--error',
  '[data-sonner-toast][data-type="error"]',
  '.notistack-MuiContent-error',
  '.MuiAlert-standardError',
  '.MuiAlert-filledError',
  '.MuiAlert-outlinedError',
  '.chakra-alert[data-status="error"]',
  '.ant-message-error',
  '.ant-notification-notice-error',
  '.ant-alert-error',
  '.toast-error',
  '.alert-danger[role="alert"]',
  '.swal2-icon-error',
  '[role="alert"][class*="error" i]',
  '[role="alert"][class*="danger" i]',
];

/** Benign browser noise that should never wake the nebula. */
const IGNORED = [/ResizeObserver loop/i, /^\[Lumora\]/, /Script error\.?$/i];

interface Options {
  settings: ProjectSettings;
  console: ConsoleCapture;
  network: NetworkCapture;
  isOwnElement: (node: Node) => boolean;
}

/**
 * Turns what the captures see into "the user just hit a problem" signals, and watches the page
 * for error messages (toasts, alerts, Salesforce Lightning errors) as they appear.
 */
export class ErrorSignals {
  private listeners = new Set<(signal: ErrorSignal) => void>();
  private seen = new WeakSet<Element>();
  private observer?: MutationObserver;
  private observed = new WeakSet<Node>();
  private shadowRoots: ShadowRoot[] = [];
  private scanTimer?: number;
  private selector = '';
  private salesforce = false;
  private unsubscribe: (() => void)[] = [];

  constructor(private options: Options) {}

  start(): void {
    const { signals, errorSelectors } = this.options.settings.smart;
    if (signals.pageErrors) this.unsubscribe.push(this.options.console.onEntry((e) => this.fromConsole(e)));
    if (signals.failedRequests) this.unsubscribe.push(this.options.network.onEntry((e) => this.fromNetwork(e)));
    if (!signals.errorMessages && !errorSelectors.length) return;

    this.salesforce = isSalesforce();
    const selectors = [...(signals.errorMessages ? [...GENERIC_ERROR_SELECTORS, ...SALESFORCE_ERROR_SELECTORS] : []), ...errorSelectors];
    this.selector = selectors.filter(valid).join(',');
    if (!this.selector) return;
    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) this.watchShadowRoots(node);
      this.scheduleScan();
    });
    this.observe(document.documentElement);
    this.watchShadowRoots(document.documentElement);
    // Error banners already on the page when Lumora loads count too.
    this.scan();
  }

  stop(): void {
    this.observer?.disconnect();
    for (const off of this.unsubscribe.splice(0)) off();
    window.clearTimeout(this.scanTimer);
  }

  onSignal(listener: (signal: ErrorSignal) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Lumora('error', '…'): the app says something went wrong. */
  report(message: string): void {
    this.emit({ source: 'message', message: truncate(message, 220) });
  }

  /** Lets the back office's preview show what happens, without breaking anything. */
  simulate(): void {
    this.report('We couldn’t save your changes. Please try again.');
  }

  private fromConsole(entry: ConsoleEntry): void {
    if (entry.level !== 'error' || IGNORED.some((r) => r.test(entry.message))) return;
    this.emit({ source: 'page', message: entry.message });
  }

  private fromNetwork(entry: NetworkEntry): void {
    const failed = entry.status >= 500 || (entry.status === 0 && !/abort/i.test(entry.error ?? ''));
    if (!failed) return;
    let path = entry.url;
    try {
      path = new URL(entry.url).pathname;
    } catch {
      /* keep the raw URL */
    }
    this.emit({ source: 'network', message: `${entry.method} ${path} failed (${entry.status || entry.error || 'network error'})` });
  }

  private emit(signal: ErrorSignal): void {
    for (const listener of this.listeners) {
      try {
        listener(signal);
      } catch {
        // never break the host page
      }
    }
  }

  private observe(target: Node): void {
    if (this.observed.has(target)) return;
    this.observed.add(target);
    if (target instanceof ShadowRoot) this.shadowRoots.push(target);
    this.observer?.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }

  /** Lightning (LWR) and many design systems render inside open shadow roots: watch those too. */
  private watchShadowRoots(node: Node): void {
    if (!(node instanceof Element) || this.options.isOwnElement(node)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let visited = 0;
    for (let el: Node | null = node; el && visited < 2000; el = walker.nextNode(), visited++) {
      const root = (el as Element).shadowRoot;
      if (root && !this.options.isOwnElement(el)) {
        this.observe(root);
        for (const child of root.children) this.watchShadowRoots(child);
      }
    }
  }

  private scheduleScan(): void {
    if (this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = undefined;
      this.scan();
    }, 250);
  }

  private scan(): void {
    this.shadowRoots = this.shadowRoots.filter((r) => r.host.isConnected);
    for (const root of [document, ...this.shadowRoots]) {
      let matches: NodeListOf<Element>;
      try {
        matches = root.querySelectorAll(this.selector);
      } catch {
        return;
      }
      for (const el of matches) {
        if (this.seen.has(el) || this.options.isOwnElement(el) || !visible(el)) continue;
        const text = readText(el);
        if (!text) continue;
        this.seen.add(el);
        this.emit({ source: 'message', message: text, platform: this.salesforce && el.matches(SALESFORCE_ERROR_SELECTORS.join(',')) ? 'salesforce' : undefined });
      }
    }
  }
}

function valid(selector: string): boolean {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function visible(el: Element): boolean {
  if (!el.getClientRects().length) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.opacity !== '0';
}

function readText(el: Element): string {
  const inner = SALESFORCE_TEXT_SELECTORS.map((s) => el.querySelector(s)).find((x): x is Element => !!x?.textContent?.trim());
  const raw = ((inner ?? el) as HTMLElement).innerText ?? (inner ?? el).textContent ?? '';
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(close|dismiss|cerrar|×|x|error|success)$/i.test(l));
  return truncate(lines.join(' · ').replace(/\s+/g, ' '), 220);
}
