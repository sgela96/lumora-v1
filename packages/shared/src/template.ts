// The ticket template as building blocks. The stored format stays a Markdown string with
// {{variables}} (connectors and existing settings keep working); the back office edits it as a
// list of pieces and converts back and forth.
import type { PlanLimits } from './plans';
import type { TemplateField } from './types';

export type TemplateBlock =
  | { id: string; kind: 'var'; name: string; heading: string }
  | { id: string; kind: 'text'; text: string };

export type PieceGroup = 'report' | 'technical' | 'ai' | 'context';

export interface TemplatePiece {
  /** Variable name without braces, e.g. "steps" or "fields.description". */
  name: string;
  label: string;
  description: string;
  group: PieceGroup;
  /** Section title it gets when added; empty for pieces that read well without one. */
  heading: string;
  /** Plan feature the piece needs to have content (shown as a hint, never blocks the layout). */
  feature?: keyof PlanLimits['features'];
}

export const PIECE_GROUPS: Record<PieceGroup, string> = {
  report: 'What the user sent',
  technical: 'Technical details',
  ai: 'AI Powered',
  context: 'Context',
};

const BASE_PIECES: TemplatePiece[] = [
  { name: 'reporter', label: 'Reporter', description: 'Name, e-mail and user ID passed by your app', group: 'report', heading: 'Reporter' },
  { name: 'transcript', label: 'What the user said', description: 'Their voice note, with timestamps', group: 'report', heading: 'What the user said', feature: 'microphone' },
  { name: 'attachments', label: 'Screenshot and recording', description: 'Links to the files, with their own heading', group: 'report', heading: '' },
  { name: 'steps', label: 'Steps to reproduce', description: 'Numbered steps from the recording or the last clicks', group: 'technical', heading: 'Steps to reproduce' },
  { name: 'console', label: 'Console', description: 'Errors and warnings with stack traces', group: 'technical', heading: 'Console', feature: 'console' },
  { name: 'network', label: 'Failed requests', description: 'Method, URL, status and timing', group: 'technical', heading: 'Failed network requests', feature: 'network' },
  { name: 'environment', label: 'Environment', description: 'Browser, OS, screen, language and time zone', group: 'technical', heading: 'Environment' },
  { name: 'ai.overview', label: 'AI overview', description: 'Summary, expected vs. actual, priority and likely cause', group: 'ai', heading: '', feature: 'aiSteps' },
  { name: 'ai.summary', label: 'AI summary', description: 'One or two sentences on the problem', group: 'ai', heading: 'Summary', feature: 'aiSteps' },
  { name: 'ai.priority', label: 'Suggested priority', description: 'Low, medium, high or urgent', group: 'ai', heading: 'Priority', feature: 'aiSteps' },
  { name: 'ai.hint', label: 'Likely cause', description: 'Where the bug probably is', group: 'ai', heading: 'Likely cause', feature: 'aiSteps' },
  { name: 'page.url', label: 'Page', description: 'The URL where the report was sent', group: 'context', heading: 'Page' },
  { name: 'reference', label: 'Lumora reference', description: 'Like SAN-42, to find it in Lumora', group: 'context', heading: 'Lumora reference' },
];

/** Every piece available for a form: the built-in ones plus one per form field. */
export function templatePieces(fields: TemplateField[]): TemplatePiece[] {
  const fromForm: TemplatePiece[] = fields.map((f) => ({
    name: `fields.${f.id}`,
    label: f.label || f.id,
    description: f.id === 'description' ? 'What the user wrote' : `Answer to “${f.label || f.id}”`,
    group: 'report',
    heading: f.id === 'description' ? '' : f.label || f.id,
  }));
  return [...fromForm, ...BASE_PIECES];
}

let counter = 0;
export const newBlockId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`;

const ONLY_VAR = /^\{\{\s*([\w.-]+)\s*\}\}$/;

/** Markdown template → pieces. Anything that isn't "## Heading + one variable" stays as a text block. */
export function blocksFromTemplate(markdown: string): TemplateBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: TemplateBlock[] = [];
  let text: string[] = [];
  const flushText = () => {
    const body = text.join('\n').trim();
    if (body) blocks.push({ id: newBlockId(), kind: 'text', text: body });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const v = lines[j]?.trim().match(ONLY_VAR);
      const after = lines[j + 1]?.trim() ?? '';
      if (v && (!after || /^##\s/.test(after))) {
        flushText();
        blocks.push({ id: newBlockId(), kind: 'var', name: v[1], heading: heading[1].trim() });
        i = j;
        continue;
      }
    }
    const v = line.match(ONLY_VAR);
    if (v) {
      flushText();
      blocks.push({ id: newBlockId(), kind: 'var', name: v[1], heading: '' });
      continue;
    }
    text.push(lines[i]);
  }
  flushText();
  return blocks;
}

/** Pieces → the Markdown template that is stored and rendered. */
export function templateFromBlocks(blocks: TemplateBlock[]): string {
  return blocks
    .map((b) => (b.kind === 'text' ? b.text.trim() : b.heading.trim() ? `## ${b.heading.trim()}\n{{${b.name}}}` : `{{${b.name}}}`))
    .filter(Boolean)
    .join('\n\n');
}

// ------------------------------------------------------------------ Rendering

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name: string) => vars[name] ?? '');
}

/** One-line title: empty brackets from missing values disappear. */
export function collapseTitle(text: string): string {
  return text.replace(/\[\s*\]\s*/g, '').replace(/\s+/g, ' ').trim();
}

/** Drops headings whose section ended up empty and squeezes blank lines. */
export function cleanupMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || /^#{1,6}\s/.test(lines[j])) continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Realistic example values for the template preview. */
export function sampleTemplateVars(fields: TemplateField[]): Record<string, string> {
  const vars: Record<string, string> = {
    summary: 'Saving billing details fails with a VAT error',
    reference: 'SAN-42',
    reporter: '- **Name:** Ana García\n- **E-mail:** ana@globex.com\n- **User ID:** 4821\n- **plan:** business',
    'reporter.email': 'ana@globex.com',
    'reporter.name': 'Ana García',
    'reporter.id': '4821',
    steps: '1. [0:01] Click the "Settings" link\n2. [0:02] Select "Mexico" in "Country"\n3. [0:03] Type into the "Company name" field\n4. [0:04] Click the "Save details" button\n5. [0:04] ⚠️ The page shows an error: ValidationError: VAT number is required',
    transcript: '- [0:01] I’m going to the settings to update our billing details.\n- [0:03] I change the country to Mexico and press save…\n- [0:05] and nothing happens, it just won’t save.',
    console: '```\n[14:02:11] ERROR Uncaught ValidationError: VAT number is required\n    at validateBilling (billing.js:88:13)\n[14:02:11] WARN Deprecated: invoices API v1 will be removed\n```',
    network: '- `POST https://app.globex.com/api/billing` → **422** in 184 ms',
    environment: '- **URL:** https://app.globex.com/settings/billing\n- **Browser:** Chrome 129\n- **OS:** macOS 15\n- **Viewport:** 1440×900 (screen 2560×1440, DPR 2)\n- **Language / timezone:** es-MX / America/Mexico_City',
    'page.url': 'https://app.globex.com/settings/billing',
    'page.path': '/settings/billing',
    attachments: '## Attachments\n- [Screenshot](https://app.lumora.app/f/screenshot.png)\n- [Screen recording (0:42)](https://app.lumora.app/f/recording.webm)',
    'ai.summary': 'Customers in Mexico can’t save billing details: the form asks for a VAT number Mexico doesn’t use.',
    'ai.priority': 'High',
    'ai.hint': 'The validator requires a VAT number for every country instead of only EU ones.',
    'ai.expected': 'The details save and a confirmation appears.',
    'ai.actual': 'Nothing is saved; the console shows “VAT number is required”.',
    'ai.duplicate': 'SAN-38',
    'ai.title': 'Saving billing details fails with a VAT error',
    'ai.overview':
      '> **Summary:** Customers in Mexico can’t save billing details: the form asks for a VAT number Mexico doesn’t use.\n> **Expected:** The details save and a confirmation appears.\n> **Actual:** Nothing is saved; the console shows “VAT number is required”.\n> **Suggested priority:** High · **Possible duplicate of** SAN-38\n> **Likely cause:** The validator requires a VAT number for every country instead of only EU ones.',
  };
  for (const f of fields) {
    if (f.id === 'description') vars[`fields.${f.id}`] = 'I changed the country to Mexico and pressed Save, but nothing happens.';
    else if (f.type === 'select') vars[`fields.${f.id}`] = f.options?.[0] ?? 'Option';
    else if (f.type === 'checkbox') vars[`fields.${f.id}`] = 'Yes';
    else if (f.type === 'email') vars[`fields.${f.id}`] = 'ana@globex.com';
    else vars[`fields.${f.id}`] = 'Example answer';
  }
  return vars;
}
