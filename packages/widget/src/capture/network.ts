import type { NetworkEntry } from '@lumora/shared';
import { RingBuffer, truncate } from '../util';

/** Records fetch / XHR calls (method, URL, status, timing). Bodies are never captured. */
export class NetworkCapture {
  private buffer = new RingBuffer<NetworkEntry>(150);
  private listeners = new Set<(entry: NetworkEntry) => void>();

  /** URLs starting with these prefixes are ignored (Lumora's own API). */
  constructor(private ignorePrefixes: string[]) {}

  install(): void {
    this.patchFetch();
    this.patchXhr();
  }

  onEntry(listener: (entry: NetworkEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  entries(failedOnly: boolean, max: number): NetworkEntry[] {
    return this.buffer.toArray().filter((e) => !failedOnly || !e.ok).slice(-max);
  }

  private ignored(url: string): boolean {
    return this.ignorePrefixes.some((p) => url.startsWith(p));
  }

  private record(entry: NetworkEntry): void {
    if (this.ignored(entry.url)) return;
    const stored = { ...entry, url: truncate(entry.url, 500) };
    this.buffer.push(stored);
    for (const listener of this.listeners) {
      try {
        listener(stored);
      } catch {
        // never break the host page's requests
      }
    }
  }

  private patchFetch(): void {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const timestamp = Date.now();
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = absolute(input instanceof Request ? input.url : String(input));
      try {
        const response = await originalFetch(input, init);
        this.record({ method, url, status: response.status, ok: response.ok, durationMs: Math.round(performance.now() - started), timestamp });
        return response;
      } catch (error) {
        this.record({
          method,
          url,
          status: 0,
          ok: false,
          durationMs: Math.round(performance.now() - started),
          timestamp,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }

  private patchXhr(): void {
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number; timestamp: number }>();
    const self = this;

    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      meta.set(this, { method: method.toUpperCase(), url: absolute(String(url)), started: 0, timestamp: 0 });
      // eslint-disable-next-line prefer-rest-params
      return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;

    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const m = meta.get(this);
      if (m) {
        m.started = performance.now();
        m.timestamp = Date.now();
        this.addEventListener('loadend', () => {
          const ok = this.status >= 200 && this.status < 400;
          self.record({
            method: m.method,
            url: m.url,
            status: this.status,
            ok,
            durationMs: Math.round(performance.now() - m.started),
            timestamp: m.timestamp,
            error: this.status === 0 ? 'Network error' : undefined,
          });
        });
      }
      return originalSend.call(this, body);
    };
  }
}

function absolute(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}
