export class RingBuffer<T> {
  private items: T[] = [];
  constructor(private capacity: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }

  toArray(): T[] {
    return this.items.slice();
  }

  get size(): number {
    return this.items.length;
  }
}

const MAX_STRING = 2000;

export function truncate(value: string, max = MAX_STRING): string {
  return value.length > max ? `${value.slice(0, max)}… (${value.length - max} more chars)` : value;
}

function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `<${el.tagName.toLowerCase()}${id}${cls}>`;
}

/** Safe, bounded stringification of anything passed to console.*. */
export function stringify(value: unknown, depth = 0, seen = new WeakSet<object>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return depth === 0 ? value : JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `ƒ ${value.name || 'anonymous'}()`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof Element !== 'undefined' && value instanceof Element) return describeElement(value);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth > 3) return Array.isArray(value) ? '[Array]' : '[Object]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, 20).map((v) => stringify(v, depth + 1, seen));
      if (value.length > 20) items.push(`…${value.length - 20} more`);
      return `[${items.join(', ')}]`;
    }
    const entries = Object.keys(value).slice(0, 30).map((k) => `${k}: ${stringify((value as Record<string, unknown>)[k], depth + 1, seen)}`);
    const name = value.constructor && value.constructor !== Object ? `${value.constructor.name} ` : '';
    return `${name}{${entries.join(', ')}}`;
  } catch {
    return '[Unserializable]';
  } finally {
    seen.delete(value);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  children: (Node | string | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'text') node.textContent = String(v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
