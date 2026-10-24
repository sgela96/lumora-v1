import type { ConsoleEntry, LogLevel } from '@lumora/shared';
import { RingBuffer, stringify, truncate } from '../util';

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

type Listener = (entry: ConsoleEntry) => void;

/**
 * Hooks console.*, window.onerror and unhandled promise rejections as early as possible,
 * so errors that happen before the user opens the widget are already in the buffer.
 */
export class ConsoleCapture {
  private buffer = new RingBuffer<ConsoleEntry>(200);
  private listeners = new Set<Listener>();

  install(): void {
    for (const level of LEVELS) {
      const original = console[level];
      if (typeof original !== 'function') continue;
      console[level] = (...args: unknown[]) => {
        try {
          const error = args.find((a): a is Error => a instanceof Error);
          this.record({
            level,
            message: truncate(args.map((a) => stringify(a)).join(' ')),
            timestamp: Date.now(),
            stack: error?.stack ? truncate(error.stack, 4000) : undefined,
          });
        } catch {
          // Never break the host page's logging.
        }
        return original.apply(console, args);
      };
    }

    window.addEventListener('error', (event) => {
      // Resource loading errors (img/script 404) bubble here with a target element.
      const target = event.target as Element | null;
      if (target && target !== (window as unknown as Element) && 'tagName' in target) {
        const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href || '';
        this.record({ level: 'error', message: `Failed to load <${target.tagName.toLowerCase()}> ${src}`, timestamp: Date.now() });
        return;
      }
      const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : '';
      this.record({
        level: 'error',
        message: truncate(`${/^Uncaught/.test(event.message) ? '' : 'Uncaught '}${event.message || 'error'}${where}`),
        timestamp: Date.now(),
        stack: event.error?.stack ? truncate(String(event.error.stack), 4000) : undefined,
      });
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.record({
        level: 'error',
        message: truncate(`Unhandled promise rejection: ${stringify(reason)}`),
        timestamp: Date.now(),
        stack: reason instanceof Error && reason.stack ? truncate(reason.stack, 4000) : undefined,
      });
    });
  }

  onEntry(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  entries(levels: LogLevel[], max: number): ConsoleEntry[] {
    return this.buffer.toArray().filter((e) => levels.includes(e.level)).slice(-max);
  }

  private record(entry: ConsoleEntry): void {
    this.buffer.push(entry);
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // ignore
      }
    }
  }
}
