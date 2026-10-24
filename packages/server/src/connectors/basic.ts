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
  description: 'Post a message to a channel through an incoming webhook.',
  fields: [{ key: 'webhookUrl', label: 'Incoming webhook URL', type: 'url', required: true, placeholder: 'https://hooks.slack.com/services/…' }],
  async send(ctx, cfg) {
    required(cfg, 'webhookUrl');
    const url = assertPublicUrl(cfg.webhookUrl);
    const shot = ctx.attachments.find((a) => a.kind === 'screenshot');
    const text = toSlack(ctx.description);
    const blocks: unknown[] = [
      { type: 'header', text: { type: 'plain_text', text: `☀️ ${ctx.title}`.slice(0, 150) } },
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
    await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '☀️ Lumora is connected to this channel.' }) });
    return 'Test message posted.';
  },
};

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
