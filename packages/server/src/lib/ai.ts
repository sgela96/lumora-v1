import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { formatOffset, type Locale, type ReportPayload, type Step } from '@lumora/shared';
import { z } from 'zod';
import { config } from '../config';

const AiReport = z.object({
  summary: z.string().describe('One or two sentences describing the problem for the support team'),
  steps: z.array(z.string()).describe('Clear, numbered-ready steps to reproduce, imperative mood'),
});

export interface AiResult {
  summary: string;
  steps: Step[];
}

let client: Anthropic | undefined;

export function aiAvailable(): boolean {
  return !!config.anthropic.apiKey;
}

/**
 * Business plan: rewrites the mechanically captured actions into clean steps to reproduce
 * and a short summary. Falls back silently (returns undefined) so a report is never lost.
 */
export async function improveReport(payload: ReportPayload, rawSteps: Step[], relative: boolean, locale: Locale): Promise<AiResult | undefined> {
  if (!aiAvailable() || (!rawSteps.length && !payload.console?.length)) return undefined;
  client ??= new Anthropic({ apiKey: config.anthropic.apiKey, timeout: 45_000, maxRetries: 1 });

  const userText = Object.entries(payload.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const actions = rawSteps.map((s, i) => `${i + 1}. ${relative ? `[${formatOffset(s.timestamp)}] ` : ''}${s.text}`).join('\n');
  const errors = (payload.console ?? [])
    .filter((e) => e.level === 'error')
    .slice(-10)
    .map((e) => `- ${e.message}`)
    .join('\n');
  const network = (payload.network ?? [])
    .slice(-10)
    .map((n) => `- ${n.method} ${n.url} → ${n.status || 'failed'}`)
    .join('\n');

  const prompt = `A user of a web app reported a problem. Write the summary and the steps to reproduce for the support ticket, in ${locale === 'es' ? 'Spanish' : 'English'}.

Rules:
- Base the steps only on the recorded actions below; merge noise (repeated clicks, focus changes) and keep every action needed to reproduce.
- Mention where an error appeared in the step where it happened.
- Do not invent data the user typed; inputs were masked on purpose.

<user_report>
${userText || '(no text)'}
</user_report>

<recorded_actions>
${actions || '(none)'}
</recorded_actions>

<console_errors>
${errors || '(none)'}
</console_errors>

<failed_requests>
${network || '(none)'}
</failed_requests>

Page: ${payload.environment?.url ?? 'unknown'}`;

  try {
    const response = await client.beta.messages.parse({
      model: config.anthropic.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(AiReport) },
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return undefined;
    const { summary, steps } = response.parsed_output;
    return { summary, steps: steps.map((text, i) => ({ text, timestamp: rawSteps[i]?.timestamp ?? 0 })) };
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.warn(`[ai] Claude API error ${error.status}: ${error.message}`);
    else console.warn('[ai] Could not improve report:', error);
    return undefined;
  }
}
