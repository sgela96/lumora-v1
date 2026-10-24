import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';
import { escapeHtml } from './markdown';

// Transactional e-mails (welcome, plan activated, password reset). Without SMTP_URL they are
// logged instead, so sign-up and checkout never fail because e-mail isn't configured.

let transport: Transporter | undefined;

export interface Mail {
  to: string;
  subject: string;
  /** Short HTML body (inside the branded layout). */
  html: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!config.smtp.url) {
    console.log(`[mail] (SMTP_URL not set) to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  transport ??= nodemailer.createTransport(config.smtp.url);
  try {
    await transport.sendMail({ from: config.smtp.from, to: mail.to, subject: mail.subject, html: layout(mail.subject, mail.html), text: mail.text });
  } catch (error) {
    console.warn('[mail] could not send:', error instanceof Error ? error.message : error);
  }
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="padding:36px 40px 8px;background:radial-gradient(circle at 85% 0%,#fff1c2 0%,#ffffff 60%)">
<div style="width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffffff 0%,#ffe8ab 35%,#ffd666 70%,rgba(255,214,102,0) 100%);box-shadow:0 0 24px rgba(255,214,102,.8)"></div>
<h1 style="font-size:24px;letter-spacing:-.02em;margin:20px 0 0">${escapeHtml(title)}</h1></td></tr>
<tr><td style="padding:12px 40px 36px;font-size:15px;line-height:1.6;color:#424245">${body}</td></tr>
</table>
<p style="font-size:12px;color:#86868b;margin-top:16px">Lumora · bug reports that explain themselves</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#ffd666;color:#3a2a00;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:12px">${escapeHtml(label)}</a></p>`;
}

export function welcomeMail(to: string, name: string, snippet: string): Mail {
  const url = `${config.publicUrl}/app/#/setup`;
  return {
    to,
    subject: 'Welcome to Lumora',
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>Your account is ready on the Free plan. A few minutes from now your users can send complete bug reports straight into Jira, GitHub or Linear. Whenever you want to try screen recordings and the dashboard, start a 7-day Pro trial from Plan &amp; billing.</p>
<p>Your install snippet:</p>
<pre style="background:#1d1d1f;color:#f5f5f7;padding:14px 16px;border-radius:12px;font-size:12px;white-space:pre-wrap;word-break:break-all">${escapeHtml(snippet)}</pre>
${button(url, 'Continue the setup')}
<p>Questions? Just reply to this e-mail.</p>`,
    text: `Hi ${name},\n\nYour Lumora account is ready on the Free plan. You can try Pro for 7 days from Plan & billing whenever you like.\n\nInstall snippet:\n${snippet}\n\nContinue the setup: ${url}`,
  };
}

export function planActivatedMail(to: string, name: string, planName: string, highlights: string[]): Mail {
  const url = `${config.publicUrl}/app/#/`;
  return {
    to,
    subject: `You’re on Lumora ${planName}`,
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>Thanks — your payment went through and <b>${escapeHtml(planName)}</b> is active. Here’s what you have now:</p>
<ul>${highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
${button(url, 'Open Lumora')}
<p>Your receipt comes from Stripe in a separate e-mail.</p>`,
    text: `Hi ${name},\n\n${planName} is active. You now have:\n${highlights.map((h) => `- ${h}`).join('\n')}\n\nOpen Lumora: ${url}`,
  };
}

export function resetPasswordMail(to: string, token: string): Mail {
  const url = `${config.publicUrl}/app/#/reset?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Reset your Lumora password',
    html: `<p>Someone asked to reset the password of this Lumora account. If it was you, choose a new one — the link works for one hour.</p>
${button(url, 'Choose a new password')}
<p>If it wasn’t you, ignore this e-mail; your password stays the same.</p>`,
    text: `Reset your Lumora password (valid for one hour): ${url}\n\nIf it wasn't you, ignore this e-mail.`,
  };
}
