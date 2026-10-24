import type { ReportKind, ReporterInfo } from '@lumora/shared';
import { LumoraApi } from './api';
import { ActionCapture } from './capture/actions';
import { ConsoleCapture } from './capture/console';
import { NetworkCapture } from './capture/network';
import { Widget } from './ui/widget';

/**
 * Installation (one line):
 *   <script src="https://app.lumora.app/lumora.js" data-key="pk_live_…" async></script>
 *
 * Optional — identify the user / attach metadata, even before the script loads:
 *   <script>window.Lumora=window.Lumora||function(){(Lumora.q=Lumora.q||[]).push(arguments)}</script>
 *   Lumora('identify', { id: '42', email: 'ana@acme.com', name: 'Ana', plan: 'pro' });
 *   Lumora('metadata', { release: '2.3.1' });
 *   Lumora('open'); Lumora('screenshot'); Lumora('record'); Lumora('hide'); Lumora('show');
 */

type Command = 'identify' | 'metadata' | 'open' | 'close' | 'screenshot' | 'record' | 'hide' | 'show' | 'destroy';
type QueuedCall = [Command, ...unknown[]];
type LumoraFn = ((command: Command, ...args: unknown[]) => void) & { q?: QueuedCall[]; loaded?: boolean; version?: string };

declare global {
  interface Window {
    Lumora?: LumoraFn;
    LumoraConfig?: { key?: string; api?: string };
  }
}

const VERSION = '0.1.0';

(function boot() {
  const existing = window.Lumora;
  if (existing?.loaded) return;

  const script = (document.currentScript as HTMLScriptElement | null) ?? document.querySelector<HTMLScriptElement>('script[data-key][src*="lumora"]');
  const key = script?.dataset.key || window.LumoraConfig?.key;
  const apiBase = (script?.dataset.api || window.LumoraConfig?.api || (script?.src ? new URL(script.src).origin : location.origin)).replace(/\/$/, '');
  if (!key) {
    console.warn('[Lumora] Missing data-key on the <script> tag.');
    return;
  }

  let reporter: ReporterInfo = {};
  let metadata: Record<string, string | number | boolean> = {};
  let widget: Widget | undefined;
  const pending: QueuedCall[] = [...(existing?.q ?? [])];

  const host = document.createElement('lumora-widget');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0;';
  const isOwnElement = (node: Node) => node === host || host.contains(node);

  // Start capturing immediately so errors before the widget opens are not lost.
  const consoleCapture = new ConsoleCapture();
  consoleCapture.install();
  const network = new NetworkCapture([`${apiBase}/api/widget/`]);
  network.install();
  const actions = new ActionCapture({ maskInputs: true, redactSelectors: [], isOwnElement });
  actions.install();

  const run = ([command, ...args]: QueuedCall) => {
    switch (command) {
      case 'identify': {
        const { id, email, name, ...custom } = (args[0] ?? {}) as Record<string, unknown>;
        reporter = {
          id: id === undefined ? undefined : String(id),
          email: typeof email === 'string' ? email : undefined,
          name: typeof name === 'string' ? name : undefined,
          custom: sanitize(custom),
        };
        return;
      }
      case 'metadata':
        metadata = { ...metadata, ...sanitize((args[0] ?? {}) as Record<string, unknown>) };
        return;
    }
    if (!widget) {
      pending.push([command, ...args]);
      return;
    }
    const kinds: Partial<Record<Command, ReportKind>> = { screenshot: 'screenshot', record: 'recording' };
    switch (command) {
      case 'open':
      case 'screenshot':
      case 'record':
        widget.open(kinds[command]);
        break;
      case 'close':
        widget.close();
        break;
      case 'hide':
        widget.setLauncherVisible(false);
        break;
      case 'show':
        widget.setLauncherVisible(true);
        break;
      case 'destroy':
        widget.destroy();
        widget = undefined;
        break;
    }
  };

  const lumora: LumoraFn = (command, ...args) => run([command, ...args]);
  lumora.loaded = true;
  lumora.version = VERSION;
  window.Lumora = lumora;

  // identify/metadata calls can be applied right away.
  const queued = pending.splice(0);
  for (const call of queued) run(call);

  const api = new LumoraApi(apiBase, key);
  api
    .config()
    .then((config) => {
      const c = config.settings.capture;
      actions.options.maskInputs = c.maskInputs;
      actions.options.redactSelectors = c.redactSelectors;
      const mount = () => {
        (document.body ?? document.documentElement).append(host);
        widget = new Widget({
          config,
          api,
          console: consoleCapture,
          network,
          actions,
          host,
          getReporter: () => filterReporter(reporter, c.user),
          getMetadata: () => metadata,
        });
        for (const call of pending.splice(0)) run(call);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
      else mount();
    })
    .catch((error) => console.warn(`[Lumora] Widget disabled: ${error instanceof Error ? error.message : error}`));
})();

function sanitize(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (v !== undefined && v !== null) out[k] = JSON.stringify(v);
  }
  return out;
}

function filterReporter(reporter: ReporterInfo, allowed: { id: boolean; email: boolean; name: boolean; custom: boolean }): ReporterInfo {
  return {
    id: allowed.id ? reporter.id : undefined,
    email: allowed.email ? reporter.email : undefined,
    name: allowed.name ? reporter.name : undefined,
    custom: allowed.custom ? reporter.custom : undefined,
  };
}
