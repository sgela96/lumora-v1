import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nodemailer, { type Transporter } from 'nodemailer';
import { config as appConfig } from '../config';
import { toHtml, toSlack } from '../lib/markdown';
import { ConnectorError, request, required } from './http';
import type { Connector } from './types';

/** Blocks obvious internal targets for customer-provided URLs (SSRF guard). */
export function assertPublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConnectorError('Invalid URL');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new ConnectorError('URL must be http(s)');
  if (appConfig.isProduction) {
    const host = url.hostname.toLowerCase();
    const internal =
      url.protocol !== 'https:' ||
      host === 'localhost' ||
      host.endsWith('.internal') ||
      host.endsWith('.local') ||
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host.startsWith('[');
    if (internal) throw new ConnectorError('URL must be a public https address');
  }
  return url;
}

export const webhook: Connector = {
  type: 'webhook',
  label: 'Webhook',
  description: 'POST every report as JSON to your own endpoint (Zapier, Make, n8n, your backend…).',
  fields: [
    { key: 'url', label: 'Endpoint URL', type: 'url', required: true, placeholder: 'https://example.com/hooks/lumora' },
    { key: 'secret', label: 'Signing secret', type: 'password', required: false, help: 'If set, requests carry X-Lumora-Signature: sha256=HMAC(body).' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'url');
    const url = assertPublicUrl(cfg.url);
    const body = JSON.stringify({
      event: 'report.created',
      id: ctx.ticketId,
      reference: ctx.reference,
      title: ctx.title,
      description: ctx.description,
      category: ctx.category,
      aiSummary: ctx.aiSummary,
      attachments: ctx.attachments,
      dashboardUrl: ctx.dashboardUrl,
      report: ctx.payload,
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'Lumora-Webhook/1' };
    if (cfg.secret) headers['X-Lumora-Signature'] = `sha256=${createHmac('sha256', cfg.secret).update(body).digest('hex')}`;
    await request(url.href, { method: 'POST', headers, body });
    return {};
  },
  async test(cfg) {
    required(cfg, 'url');
    const url = assertPublicUrl(cfg.url);
    await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'ping' }) });
    return 'Endpoint answered the ping.';
  },
};

export const slack: Connector = {
  type: 'slack',
  label: 'Slack',
  description: 'Post new reports to a channel, and remind the assignee by direct message.',
  fields: [
    { key: 'webhookUrl', label: 'Incoming webhook URL', type: 'url', required: true, placeholder: 'https://hooks.slack.com/services/…' },
    {
      key: 'botToken',
      label: 'Bot token for reminders',
      type: 'password',
      required: false,
      placeholder: 'xoxb-…',
      help: 'Optional (Business). Lets Lumora message the assignee directly. Scopes: chat:write, users:read, users:read.email.',
    },
  ],
  async send(ctx, cfg) {
    required(cfg, 'webhookUrl');
    const url = assertPublicUrl(cfg.webhookUrl);
    const shot = ctx.attachments.find((a) => a.kind === 'screenshot');
    const text = toSlack(ctx.description);
    const blocks: unknown[] = [
      { type: 'header', text: { type: 'plain_text', text: ctx.title.slice(0, 150) } },
      { type: 'section', text: { type: 'mrkdwn', text: (ctx.aiSummary ? `*Summary:* ${ctx.aiSummary}\n\n` : '') + text.slice(0, 2800) } },
    ];
    if (shot) blocks.push({ type: 'image', image_url: shot.url, alt_text: 'Screenshot' });
    blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Lumora' }, url: ctx.dashboardUrl }] });
    await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ctx.title, blocks }) });
    return {};
  },
  async test(cfg) {
    required(cfg, 'webhookUrl');
    const url = assertPublicUrl(cfg.webhookUrl);
    await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Lumora is connected to this channel.' }) });
    if (cfg.botToken) {
      const auth = await request<{ ok: boolean; error?: string; team?: string }>('https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${cfg.botToken}` } });
      if (!auth.ok) throw new ConnectorError(`The bot token was rejected (${auth.error}).`);
      return `Test message posted. Reminders can be sent as direct messages in ${auth.team}.`;
    }
    return 'Test message posted.';
  },
  async remind(cfg, r) {
    const lines = [
      `${r.note ? `${r.note}\n\n` : ''}*<${r.url}|${r.reference} · ${r.title}>*`,
      [r.status && `Status: ${r.status}`, r.ticketUrl && `<${r.ticketUrl}|Open the ticket>`].filter(Boolean).join(' · '),
      `_Sent from Lumora by ${r.from}_`,
    ].filter(Boolean);
    // A direct message when we can find the person in Slack, otherwise a mention in the channel.
    if (cfg.botToken && r.assignee?.email) {
      const auth = { Authorization: `Bearer ${cfg.botToken}`, 'Content-Type': 'application/json; charset=utf-8' };
      const user = await request<{ ok: boolean; error?: string; user?: { id: string } }>(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(r.assignee.email)}`, { headers: { Authorization: `Bearer ${cfg.botToken}` } });
      if (user.ok && user.user) {
        const sent = await request<{ ok: boolean; error?: string }>('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ channel: user.user.id, text: `Reminder about a report assigned to you\n${lines.join('\n')}` }),
        });
        if (!sent.ok) throw new ConnectorError(`Slack didn’t send the message (${sent.error}).`);
        return `Sent ${r.assignee.name} a direct message on Slack.`;
      }
    }
    required(cfg, 'webhookUrl');
    const who = r.assignee ? `*${r.assignee.name}*` : 'Team';
    await request(assertPublicUrl(cfg.webhookUrl).href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${who}, a reminder about this report:\n${lines.join('\n')}` }) });
    return r.assignee ? `Posted a reminder for ${r.assignee.name} in the Slack channel.` : 'Posted a reminder in the Slack channel.';
  },
};

/** Microsoft Teams through a channel workflow ("Post to a channel when a webhook request is received"). */
export const teams: Connector = {
  type: 'teams',
  label: 'Microsoft Teams',
  description: 'Post new reports and reminders to a Teams channel.',
  fields: [{ key: 'webhookUrl', label: 'Workflow webhook URL', type: 'url', required: true, placeholder: 'https://….logic.azure.com/workflows/…' }],
  async send(ctx, cfg) {
    required(cfg, 'webhookUrl');
    await postTeamsCard(cfg.webhookUrl, ctx.title, [ctx.aiSummary && `**Summary:** ${ctx.aiSummary}`, ctx.description.slice(0, 2500)].filter(Boolean).join('\n\n'), ctx.dashboardUrl);
    return {};
  },
  async test(cfg) {
    required(cfg, 'webhookUrl');
    await postTeamsCard(cfg.webhookUrl, 'Lumora is connected', 'New reports and reminders will appear in this channel.');
    return 'Test message posted.';
  },
  async remind(cfg, r) {
    required(cfg, 'webhookUrl');
    const who = r.assignee ? r.assignee.name : 'Team';
    await postTeamsCard(
      cfg.webhookUrl,
      `Reminder for ${who}: ${r.reference}`,
      [r.note, `**${r.title}**`, r.status && `Status: ${r.status}`, `_Sent from Lumora by ${r.from}_`].filter(Boolean).join('\n\n'),
      r.url,
      r.ticketUrl,
    );
    return `Posted a reminder${r.assignee ? ` for ${r.assignee.name}` : ''} in the Teams channel.`;
  },
};

async function postTeamsCard(webhookUrl: string, title: string, text: string, url?: string, ticketUrl?: string): Promise<void> {
  const actions = [url && { type: 'Action.OpenUrl', title: 'Open in Lumora', url }, ticketUrl && { type: 'Action.OpenUrl', title: 'Open the ticket', url: ticketUrl }].filter(Boolean);
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text, wrap: true },
          ],
          actions,
        },
      },
    ],
  };
  await request(assertPublicUrl(webhookUrl).href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card) });
}

let transport: Transporter | undefined;
function mailer(): Transporter {
  if (!appConfig.smtp.url) throw new ConnectorError('E-mail delivery is not configured on this server (SMTP_URL).');
  transport ??= nodemailer.createTransport(appConfig.smtp.url);
  return transport;
}

export const email: Connector = {
  type: 'email',
  label: 'E-mail',
  description: 'Send each report to a support inbox (works with any help desk that creates tickets from e-mail).',
  fields: [{ key: 'to', label: 'Send to', type: 'email', required: true, placeholder: 'support@yourcompany.com' }],
  async send(ctx, cfg) {
    required(cfg, 'to');
    const replyTo = ctx.payload.reporter?.email;
    const attachments = await Promise.all(
      ctx.files.filter((f) => f.size < 15 * 1024 * 1024).map(async (f) => ({ filename: f.name, content: await readFile(f.path), contentType: f.mime })),
    );
    await mailer().sendMail({
      from: appConfig.smtp.from,
      to: cfg.to,
      replyTo,
      subject: `[${ctx.reference}] ${ctx.title}`,
      html: toHtml(ctx.description),
      text: ctx.description,
      attachments,
    });
    return {};
  },
  async test(cfg) {
    required(cfg, 'to');
    await mailer().verify();
    return 'SMTP connection works.';
  },
};
