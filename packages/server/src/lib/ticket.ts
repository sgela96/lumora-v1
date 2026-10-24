import { buildSteps, formatOffset, type Locale, type ProjectSettings, type ReportPayload, type Step } from '@lumora/shared';

export interface Attachment {
  name: string;
  url: string;
  kind: 'screenshot' | 'recording';
}

export interface RenderInput {
  settings: ProjectSettings;
  payload: ReportPayload;
  steps: Step[];
  stepsAreRelative: boolean;
  attachments: Attachment[];
  aiSummary?: string;
  reference: string;
}

export interface RenderedTicket {
  title: string;
  description: string;
  category?: string;
}

export function ticketLocale(settings: ProjectSettings): Locale {
  return settings.appearance.locale === 'es' ? 'es' : 'en';
}

/** Steps from the screen recording when there is one, else from the last actions before the report. */
export function stepsFor(payload: ReportPayload, settings: ProjectSettings): { steps: Step[]; relative: boolean } {
  const locale = ticketLocale(settings);
  if (payload.recordingActions?.length) return { steps: buildSteps(payload.recordingActions, locale), relative: true };
  if (payload.breadcrumbs?.length) return { steps: buildSteps(payload.breadcrumbs, locale), relative: false };
  return { steps: [], relative: false };
}

export function renderTicket(input: RenderInput): RenderedTicket {
  const { payload, settings } = input;
  const vars = buildVariables(input);
  const title = collapse(fill(settings.template.titleTemplate, vars)).slice(0, 250) || `Report ${input.reference}`;
  const description = cleanup(fill(settings.template.descriptionTemplate, vars));
  const category = typeof payload.fields.category === 'string' ? payload.fields.category : undefined;
  return { title, description, category };
}

function buildVariables({ payload, steps, stepsAreRelative, attachments, aiSummary, reference }: RenderInput): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.fields)) vars[`fields.${k}`] = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v;
  for (const [k, v] of Object.entries(payload.metadata ?? {})) vars[`metadata.${k}`] = String(v);

  const mainText = String(payload.fields.description ?? Object.values(payload.fields).find((v) => typeof v === 'string' && v.length > 10) ?? '');
  const firstLine = mainText.split('\n').find((l) => l.trim())?.trim() ?? '';
  vars.summary = firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine || 'New report';
  vars.reference = reference;

  const r = payload.reporter ?? {};
  vars['reporter.email'] = r.email ?? '';
  vars['reporter.name'] = r.name ?? '';
  vars['reporter.id'] = r.id ?? '';
  const reporterLines = [
    r.name && `- **Name:** ${r.name}`,
    r.email && `- **E-mail:** ${r.email}`,
    r.id && `- **User ID:** ${r.id}`,
    ...Object.entries(r.custom ?? {}).map(([k, v]) => `- **${k}:** ${v}`),
  ].filter(Boolean);
  vars.reporter = reporterLines.join('\n') || '- Anonymous';

  vars.steps = steps.map((s, i) => `${i + 1}. ${stepsAreRelative ? `[${formatOffset(s.timestamp)}] ` : ''}${s.text}`).join('\n');

  const consoleEntries = payload.console ?? [];
  vars.console = consoleEntries.length
    ? '```\n' +
      consoleEntries
        .map((e) => `[${new Date(e.timestamp).toISOString().slice(11, 19)}] ${e.level.toUpperCase()} ${e.message}${e.stack && !e.message.includes(e.stack.split('\n')[0]) ? `\n${indent(e.stack)}` : e.stack ? `\n${indent(e.stack.split('\n').slice(1).join('\n'))}` : ''}`)
        .join('\n') +
      '\n```'
    : '';

  vars.network = (payload.network ?? [])
    .map((n) => `- \`${n.method} ${n.url}\` → **${n.status || 'failed'}**${n.error ? ` (${n.error})` : ''} in ${n.durationMs} ms`)
    .join('\n');

  const env = payload.environment;
  vars['page.url'] = env?.url ?? '';
  vars['page.path'] = env?.url ? safePath(env.url) : '';
  vars.environment = env
    ? [
        `- **URL:** ${env.url}`,
        `- **Browser:** ${env.browser}`,
        `- **OS:** ${env.os}`,
        `- **Viewport:** ${env.viewport} (screen ${env.screen}, DPR ${env.devicePixelRatio})`,
        `- **Language / timezone:** ${env.language} / ${env.timezone}`,
        `- **Reported at:** ${env.timestamp}`,
        env.referrer && `- **Referrer:** ${env.referrer}`,
        `- **User agent:** \`${env.userAgent}\``,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  vars.attachments = attachments.length
    ? `## Attachments\n${attachments.map((a) => `- [${a.kind === 'screenshot' ? 'Screenshot' : `Screen recording${payload.recordingDurationMs ? ` (${formatOffset(payload.recordingDurationMs)})` : ''}`}](${a.url})`).join('\n')}`
    : '';
  vars['ai.summary'] = aiSummary ?? '';
  return vars;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name: string) => vars[name] ?? '');
}

function collapse(text: string): string {
  return text.replace(/\[\s*\]\s*/g, '').replace(/\s+/g, ' ').trim();
}

/** Drops headings whose section ended up empty and squeezes blank lines. */
function cleanup(markdown: string): string {
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

function indent(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 8)
    .map((l) => `    ${l.trim()}`)
    .join('\n');
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
