import type { UserAction } from '@lumora/shared';
import { RingBuffer, truncate } from '../util';

export interface ActionCaptureOptions {
  maskInputs: boolean;
  redactSelectors: string[];
  /** Elements inside this node (the widget itself) are ignored. */
  isOwnElement: (node: Node) => boolean;
}

type Listener = (action: UserAction) => void;

const INTERACTIVE = 'a,button,input,select,textarea,summary,label,[role],[onclick],[tabindex]';

/**
 * Records what the user does on the page (clicks, typing, selects, navigation) in a
 * human-readable way. Used both as "last actions before the report" and to turn screen
 * recordings into written steps.
 */
export class ActionCapture {
  private buffer = new RingBuffer<UserAction>(60);
  private listeners = new Set<Listener>();

  constructor(public options: ActionCaptureOptions) {}

  install(): void {
    document.addEventListener('click', (e) => this.onClick(e), true);
    document.addEventListener('change', (e) => this.onChange(e), true);
    document.addEventListener('submit', (e) => this.onSubmit(e), true);
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    this.patchHistory();
  }

  onAction(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recent(max: number): UserAction[] {
    return this.buffer.toArray().slice(-max);
  }

  /** Errors are interleaved with actions so steps show where things broke. */
  recordError(message: string): void {
    this.emit({ type: 'error', kind: 'error', label: truncate(message, 160), timestamp: Date.now() });
  }

  private emit(action: UserAction): void {
    this.buffer.push(action);
    for (const listener of this.listeners) {
      try {
        listener(action);
      } catch {
        // ignore
      }
    }
  }

  private skip(target: EventTarget | null): target is null {
    if (!(target instanceof Element)) return true;
    if (this.options.isOwnElement(target)) return true;
    return this.options.redactSelectors.some((sel) => {
      try {
        return !!target.closest(sel);
      } catch {
        return false;
      }
    });
  }

  private onClick(event: MouseEvent): void {
    if (this.skip(event.target)) return;
    const raw = event.target as Element;
    const target = (raw.closest(INTERACTIVE) as Element | null) ?? raw;
    // Checkbox / radio / select clicks are reported by the change event instead.
    if (target instanceof HTMLInputElement && ['checkbox', 'radio'].includes(target.type)) return;
    if (target instanceof HTMLSelectElement || target instanceof HTMLOptionElement) return;
    // A click on a <label> is followed by a synthetic click on its control.
    if (target instanceof HTMLLabelElement && target.control) return;
    this.emit({
      type: 'click',
      kind: kindOf(target),
      label: labelOf(target),
      selector: selectorOf(target),
      timestamp: Date.now(),
    });
  }

  private onChange(event: Event): void {
    if (this.skip(event.target)) return;
    const target = event.target as Element;
    const base = { label: labelOf(target), selector: selectorOf(target), timestamp: Date.now() };
    if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
      this.emit({ ...base, type: 'check', kind: 'checkbox', checked: target.checked });
    } else if (target instanceof HTMLSelectElement) {
      const option = target.selectedOptions[0];
      this.emit({ ...base, type: 'select', kind: 'field', value: option ? option.text.trim() : target.value });
    } else if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const sensitive = target instanceof HTMLInputElement && ['password', 'hidden'].includes(target.type);
      const mask = this.options.maskInputs || sensitive || looksSensitive(target);
      this.emit({ ...base, type: 'input', kind: 'field', value: mask || !target.value ? undefined : truncate(target.value, 80) });
    }
  }

  private onSubmit(event: Event): void {
    if (this.skip(event.target)) return;
    const form = event.target as HTMLFormElement;
    const label = form.getAttribute('aria-label') || form.getAttribute('name') || form.id || '';
    this.emit({ type: 'submit', kind: 'form', label, selector: selectorOf(form), timestamp: Date.now() });
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    if (this.skip(event.target)) return;
    const target = event.target as Element;
    // Enter inside a textarea is just a newline.
    if (event.key === 'Enter' && target instanceof HTMLTextAreaElement) return;
    const isField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    this.emit({
      type: 'key',
      kind: 'key',
      value: event.key,
      label: isField ? labelOf(target) : '',
      selector: selectorOf(target),
      timestamp: Date.now(),
    });
  }

  private patchHistory(): void {
    // Query strings are left out: they're noisy in steps and often carry tokens.
    let last = location.pathname + location.hash;
    const notify = () => {
      const current = location.pathname + location.hash;
      if (current === last) return;
      last = current;
      this.emit({ type: 'navigate', kind: 'page', label: current, timestamp: Date.now() });
    };
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        queueMicrotask(notify);
        return result;
      };
    }
    window.addEventListener('popstate', notify);
    window.addEventListener('hashchange', notify);
  }
}

function looksSensitive(el: Element): boolean {
  const hint = `${el.getAttribute('name') ?? ''} ${el.getAttribute('autocomplete') ?? ''} ${el.id}`.toLowerCase();
  return /pass|card|cc-|cvc|cvv|ssn|secret|token|iban|pin/.test(hint);
}

function kindOf(el: Element): string {
  const role = el.getAttribute('role');
  if (role && ['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'switch'].includes(role)) return role === 'switch' ? 'checkbox' : role;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    return ['button', 'submit', 'reset', 'image'].includes(type) ? 'button' : 'field';
  }
  if (tag === 'textarea' || tag === 'select') return 'field';
  return 'element';
}

/** The best human name for an element, roughly following the accessible-name rules. */
export function labelOf(el: Element): string {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return truncate(aria, 60);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clean(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' '));
    if (text) return truncate(text, 60);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const fromLabel = clean(el.labels?.[0]?.textContent);
    if (fromLabel) return truncate(fromLabel, 60);
    if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type) && el.value) return truncate(clean(el.value), 60);
    const placeholder = clean(el.getAttribute('placeholder'));
    if (placeholder) return truncate(placeholder, 60);
    const name = clean(el.getAttribute('name'));
    if (name) return name;
  }
  const text = clean((el as HTMLElement).innerText ?? el.textContent);
  if (text) return truncate(text, 60);
  const alt = clean(el.getAttribute('alt') || el.querySelector('img')?.getAttribute('alt') || el.getAttribute('title'));
  if (alt) return truncate(alt, 60);
  return el.id ? `#${el.id}` : el.tagName.toLowerCase();
}

/** A short CSS selector that's good enough to tell elements apart in a report. */
export function selectorOf(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 4) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift(`#${node.id}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const testId = node.getAttribute('data-testid') || node.getAttribute('data-test');
    const name = node.getAttribute('name');
    if (testId) part += `[data-testid="${testId}"]`;
    else if (name) part += `[name="${name}"]`;
    else if (node.parentElement) {
      const siblings = Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    if (testId) break;
    node = node.parentElement;
  }
  return parts.join(' > ');
}
