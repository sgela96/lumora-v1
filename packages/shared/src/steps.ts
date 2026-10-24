import type { Locale, UserAction } from './types';

const PHRASES = {
  en: {
    clickButton: (l: string) => `Click the "${l}" button`,
    clickLink: (l: string) => `Click the "${l}" link`,
    clickTab: (l: string) => `Open the "${l}" tab`,
    clickMenu: (l: string) => `Choose "${l}" from the menu`,
    clickElement: (l: string) => `Click on "${l}"`,
    clickField: (l: string) => `Click the "${l}" field`,
    type: (l: string) => `Type into the "${l}" field`,
    typeValue: (l: string, v: string) => `Enter "${v}" in the "${l}" field`,
    select: (l: string, v: string) => `Select "${v}" in "${l}"`,
    check: (l: string) => `Check "${l}"`,
    uncheck: (l: string) => `Uncheck "${l}"`,
    submit: (l: string) => (l ? `Submit the "${l}" form` : 'Submit the form'),
    navigate: (l: string) => `Go to ${l}`,
    key: (l: string, target: string) => (target ? `Press ${l} in "${target}"` : `Press ${l}`),
    error: (l: string) => `⚠️ The page shows an error: ${l}`,
    start: (l: string) => `Open ${l}`,
  },
  es: {
    clickButton: (l: string) => `Hacer clic en el botón "${l}"`,
    clickLink: (l: string) => `Hacer clic en el enlace "${l}"`,
    clickTab: (l: string) => `Abrir la pestaña "${l}"`,
    clickMenu: (l: string) => `Elegir "${l}" en el menú`,
    clickElement: (l: string) => `Hacer clic en "${l}"`,
    clickField: (l: string) => `Hacer clic en el campo "${l}"`,
    type: (l: string) => `Escribir en el campo "${l}"`,
    typeValue: (l: string, v: string) => `Ingresar "${v}" en el campo "${l}"`,
    select: (l: string, v: string) => `Seleccionar "${v}" en "${l}"`,
    check: (l: string) => `Marcar "${l}"`,
    uncheck: (l: string) => `Desmarcar "${l}"`,
    submit: (l: string) => (l ? `Enviar el formulario "${l}"` : 'Enviar el formulario'),
    navigate: (l: string) => `Ir a ${l}`,
    key: (l: string, target: string) => (target ? `Presionar ${l} en "${target}"` : `Presionar ${l}`),
    error: (l: string) => `⚠️ La página muestra un error: ${l}`,
    start: (l: string) => `Abrir ${l}`,
  },
} satisfies Record<Locale, Record<string, (...args: string[]) => string>>;

export interface Step {
  text: string;
  /** ms since the start of the recording (or epoch ms for breadcrumbs). */
  timestamp: number;
}

/** Collapses noisy event streams into one step per meaningful user intention. */
export function compactActions(actions: UserAction[]): UserAction[] {
  const out: UserAction[] = [];
  for (const action of actions) {
    const prev = out[out.length - 1];
    // Typing in the same field several times is one step: keep the latest value.
    if (prev && action.type === 'input' && prev.type === 'input' && prev.selector === action.selector) {
      out[out.length - 1] = action;
      continue;
    }
    // A click on a field immediately followed by typing in it reads better as just "type".
    if (prev && action.type === 'input' && prev.type === 'click' && prev.kind === 'field' && prev.selector === action.selector) {
      out[out.length - 1] = action;
      continue;
    }
    // Clicking a checkbox/select produces a click + a change: keep the change.
    if (prev && (action.type === 'check' || action.type === 'select') && prev.type === 'click' && prev.selector === action.selector) {
      out[out.length - 1] = action;
      continue;
    }
    // Clicking a link and the navigation it causes are one step; same for a submit button and the submit.
    const soon = prev && action.timestamp - prev.timestamp < 1500;
    if (soon && action.type === 'navigate' && prev.type === 'click' && prev.kind === 'link') continue;
    if (soon && action.type === 'submit' && prev.type === 'click' && prev.kind === 'button') continue;
    // Duplicate navigations (pushState + popstate on the same path).
    if (prev && action.type === 'navigate' && prev.type === 'navigate' && prev.label === action.label) continue;
    // The same error repeated in a row.
    if (prev && action.type === 'error' && prev.type === 'error' && prev.label === action.label) continue;
    out.push(action);
  }
  return out;
}

export function actionToText(action: UserAction, locale: Locale = 'en'): string {
  const p = PHRASES[locale] ?? PHRASES.en;
  const label = action.label || action.kind;
  switch (action.type) {
    case 'click':
      if (action.kind === 'button') return p.clickButton(label);
      if (action.kind === 'link') return p.clickLink(label);
      if (action.kind === 'tab') return p.clickTab(label);
      if (action.kind === 'menuitem' || action.kind === 'option') return p.clickMenu(label);
      if (action.kind === 'field') return p.clickField(label);
      return p.clickElement(label);
    case 'input':
      return action.value ? p.typeValue(label, action.value) : p.type(label);
    case 'select':
      return p.select(label, action.value ?? '…');
    case 'check':
      return action.checked === false ? p.uncheck(label) : p.check(label);
    case 'submit':
      return p.submit(action.label);
    case 'navigate':
      return p.navigate(label);
    case 'key':
      return p.key(action.value ?? 'Enter', action.label);
    case 'error':
      return p.error(label);
    default:
      return label;
  }
}

/**
 * Builds human steps to reproduce. `startUrl` adds an initial "Open <url>" step so the
 * steps can be followed from a fresh tab.
 */
export function buildSteps(actions: UserAction[], locale: Locale = 'en', startUrl?: string): Step[] {
  const steps: Step[] = [];
  const compacted = compactActions(actions);
  if (startUrl && compacted[0]?.type !== 'navigate') {
    steps.push({ text: (PHRASES[locale] ?? PHRASES.en).start(startUrl), timestamp: compacted[0]?.timestamp ?? 0 });
  }
  for (const action of compacted) steps.push({ text: actionToText(action, locale), timestamp: action.timestamp });
  return steps;
}

export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
