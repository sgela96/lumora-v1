import { readFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { formatOffset, type Locale, type ReportPayload, type Step } from '@lumora/shared';
import { z } from 'zod';
import { config } from '../config';
import type { Transcript } from './transcribe';

const Priority = z.enum(['low', 'medium', 'high', 'urgent']);

const AiReport = z.object({
  title: z.string().describe('Ticket title, max 80 characters, specific (what is broken and where)'),
  summary: z.string().describe('One or two sentences for the support agent: what happened and the impact'),
  steps: z.array(z.string()).describe('Clean steps to reproduce, imperative mood, one action per step'),
  expected: z.string().describe('What the user expected to happen; empty string if unknown'),
  actual: z.string().describe('What actually happened; empty string if unknown'),
  category: z.string().describe('One of the allowed categories, or empty string if none fits'),
  priority: Priority.describe('urgent = blocks payments/login/data loss for many; high = core flow broken; medium = workaround exists; low = cosmetic or question'),
  technicalHint: z.string().describe('For developers: the most likely cause based on console errors and failed requests, one or two sentences; empty string if there is no technical evidence'),
  duplicateOf: z.string().nullable().describe('Reference of an existing open report that describes the same problem, or null'),
});

export type AiPriority = z.infer<typeof Priority>;

export interface AiResult {
  title: string;
  summary: string;
  steps: Step[];
  expected: string;
  actual: string;
  category?: string;
  priority: AiPriority;
  technicalHint: string;
  duplicateOf?: string;
}

export interface AiContext {
  payload: ReportPayload;
  rawSteps: Step[];
  relative: boolean;
  /** Language the support team works in — the report is translated into it. */
  locale: Locale;
  transcript?: Transcript;
  screenshot?: { path: string; size: number };
  categories: string[];
  /** Recent open reports in the same app, for duplicate detection. */
  openReports: { reference: string; title: string }[];
}

let client: Anthropic | undefined;

export function aiAvailable(): boolean {
  return !!config.anthropic.apiKey;
}

/**
 * AI Powered: turns the raw capture (clicks, narration, errors, screenshot) into a triaged ticket.
 * Falls back silently (returns undefined) so a report is never lost because of the AI step.
 */
export async function improveReport(ctx: AiContext): Promise<AiResult | undefined> {
  const { payload, rawSteps, relative, locale, transcript } = ctx;
  if (!aiAvailable()) return undefined;
  client ??= new Anthropic({ apiKey: config.anthropic.apiKey, timeout: 60_000, maxRetries: 1 });

  const userText = Object.entries(payload.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const actions = rawSteps.map((s, i) => `${i + 1}. ${relative ? `[${formatOffset(s.timestamp)}] ` : ''}${s.text}`).join('\n');
  const narration = transcript?.segments.length
    ? transcript.segments.map((s) => `[${formatOffset(s.start * 1000)}] ${s.text}`).join('\n')
    : transcript?.text ?? '';
  const errors = (payload.console ?? [])
    .filter((e) => e.level === 'error')
    .slice(-10)
    .map((e) => `- ${e.message}${e.stack ? `\n  ${e.stack.split('\n').slice(1, 3).join('\n  ')}` : ''}`)
    .join('\n');
  const network = (payload.network ?? [])
    .slice(-10)
    .map((n) => `- ${n.method} ${n.url} → ${n.status || 'failed'}${n.error ? ` (${n.error})` : ''}`)
    .join('\n');
  const language = locale === 'es' ? 'Spanish' : 'English';

  const prompt = `A user of a web app reported a problem through an in-app widget. Turn everything captured below into a ready-to-work support ticket.

Write every text field in ${language}, translating what the user said or typed if it is in another language.

Rules:
- Steps come from the recorded actions; use the narration to explain intent and to fill gaps, but never invent actions or values the user typed (inputs were masked on purpose).
- Mention in the step where it happened when an error appeared.
- Pick the category only from: ${ctx.categories.length ? ctx.categories.join(', ') : '(none — return an empty string)'}.
- Only set duplicateOf when one of the open reports clearly describes the same problem.

<user_report>
${userText || '(no text)'}
</user_report>

<narration>
${narration || '(no voice)'}
</narration>

<recorded_actions>
${actions || '(none)'}
</recorded_actions>

<console_errors>
${errors || '(none)'}
</console_errors>

<failed_requests>
${network || '(none)'}
</failed_requests>

<open_reports>
${ctx.openReports.map((r) => `${r.reference}: ${r.title}`).join('\n') || '(none)'}
</open_reports>

Page: ${payload.environment?.url ?? 'unknown'} · ${payload.environment?.browser ?? ''} on ${payload.environment?.os ?? ''}`;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  // The screenshot (with the user's markup) often says more than the text.
  if (ctx.screenshot && ctx.screenshot.size < 4.5 * 1024 * 1024) {
    try {
      const data = (await readFile(ctx.screenshot.path)).toString('base64');
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } });
    } catch {
      // Text alone is still useful.
    }
  }
  content.push({ type: 'text', text: prompt });

  try {
    const response = await client.beta.messages.parse({
      model: config.anthropic.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(AiReport) },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return undefined;
    const out = response.parsed_output;
    const duplicate = out.duplicateOf && ctx.openReports.some((r) => r.reference === out.duplicateOf) ? out.duplicateOf : undefined;
    return {
      title: out.title.slice(0, 120),
      summary: out.summary,
      steps: out.steps.map((text) => ({ text, timestamp: 0 })),
      expected: out.expected,
      actual: out.actual,
      category: ctx.categories.includes(out.category) ? out.category : undefined,
      priority: out.priority,
      technicalHint: out.technicalHint,
      duplicateOf: duplicate,
    };
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.warn(`[ai] Claude API error ${error.status}: ${error.message}`);
    else console.warn('[ai] Could not improve report:', error);
    return undefined;
  }
}
