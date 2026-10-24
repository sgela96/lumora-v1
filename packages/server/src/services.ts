import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  clampSettingsToPlan,
  isPlanId,
  mergeSettings,
  PLANS,
  type IntegrationType,
  type PlanId,
  type ProjectSettings,
  type ReportPayload,
} from '@lumora/shared';
import { billingEnabled, config } from './config';
import { getConnector } from './connectors';
import type { LocalFile } from './connectors/types';
import { all, one, run, transaction } from './db';
import { improveReport } from './lib/ai';
import { decrypt, encrypt, id, signFileUrl } from './lib/crypto';
import { renderTicket, stepsFor, ticketLocale, type Attachment } from './lib/ticket';

// ---------------------------------------------------------------- Accounts & plans

export interface AccountRow {
  id: string;
  name: string;
  plan: string;
  plan_status: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

export function getAccount(accountId: string): AccountRow {
  const account = one<AccountRow>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!account) throw new HttpError(404, 'Account not found');
  return account;
}

export function accountPlan(account: AccountRow): PlanId {
  return isPlanId(account.plan) ? account.plan : 'starter';
}

/** Whether the subscription currently allows the widget to work. */
export function subscriptionActive(account: AccountRow): boolean {
  if (!billingEnabled()) return true;
  if (account.plan_status === 'active') return true;
  if (account.plan_status === 'trialing') return !account.trial_ends_at || new Date(account.trial_ends_at) > new Date();
  return false;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthlyUsage(accountId: string): number {
  return one<{ reports: number }>('SELECT reports FROM usage WHERE account_id = ? AND month = ?', accountId, currentMonth())?.reports ?? 0;
}

// ---------------------------------------------------------------- Projects

export interface ProjectRow {
  id: string;
  account_id: string;
  name: string;
  public_key: string;
  allowed_origins: string;
  settings: string;
  ticket_prefix: string;
  ticket_counter: number;
  created_at: string;
}

export function projectSettings(project: ProjectRow): ProjectSettings {
  return mergeSettings(JSON.parse(project.settings || '{}'));
}

export function effectiveSettings(project: ProjectRow, plan: PlanId): ProjectSettings {
  return clampSettingsToPlan(projectSettings(project), plan);
}

export function allowedOrigins(project: ProjectRow): string[] {
  try {
    return JSON.parse(project.allowed_origins) as string[];
  } catch {
    return [];
  }
}

/** Origins match exactly, or by wildcard subdomain: "https://*.acme.com". Empty list = any origin. */
export function originAllowed(project: ProjectRow, origin: string | undefined): boolean {
  const list = allowedOrigins(project);
  if (!list.length) return true;
  if (!origin) return false;
  return list.some((pattern) => {
    if (pattern === origin) return true;
    const m = pattern.match(/^(https?):\/\/\*\.(.+)$/);
    if (!m) return false;
    try {
      const o = new URL(origin);
      return o.protocol === `${m[1]}:` && (o.hostname === m[2] || o.hostname.endsWith(`.${m[2]}`));
    } catch {
      return false;
    }
  });
}

export function serializeProject(project: ProjectRow) {
  return {
    id: project.id,
    name: project.name,
    publicKey: project.public_key,
    allowedOrigins: allowedOrigins(project),
    ticketPrefix: project.ticket_prefix,
    settings: projectSettings(project),
    createdAt: project.created_at,
  };
}

export function getOwnedProject(accountId: string, projectId: string): ProjectRow {
  const project = one<ProjectRow>('SELECT * FROM projects WHERE id = ? AND account_id = ?', projectId, accountId);
  if (!project) throw new HttpError(404, 'Project not found');
  return project;
}

// ---------------------------------------------------------------- Integrations

export interface IntegrationRow {
  id: string;
  project_id: string;
  type: string;
  name: string;
  config_enc: string;
  categories: string;
  enabled: number;
  created_at: string;
}

export function integrationConfig(row: IntegrationRow): Record<string, string> {
  return JSON.parse(decrypt(row.config_enc));
}

export function serializeIntegration(row: IntegrationRow) {
  const connector = getConnector(row.type);
  const cfg = integrationConfig(row);
  // Never send secrets back to the browser; the dashboard shows "••••" and keeps them unless replaced.
  const visible: Record<string, string> = {};
  for (const field of connector?.fields ?? []) visible[field.key] = field.type === 'password' ? (cfg[field.key] ? '••••••••' : '') : (cfg[field.key] ?? '');
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: !!row.enabled,
    categories: JSON.parse(row.categories) as string[],
    config: visible,
    createdAt: row.created_at,
  };
}

export function sealConfig(cfg: Record<string, string>): string {
  return encrypt(JSON.stringify(cfg));
}

export function canUseIntegration(plan: PlanId, type: string): boolean {
  return PLANS[plan].integrations.includes(type as IntegrationType);
}

// ---------------------------------------------------------------- Reports → tickets

export interface UploadedFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface Delivery {
  integrationId: string;
  type: string;
  name: string;
  status: 'pending' | 'sent' | 'failed';
  externalId?: string;
  url?: string;
  error?: string;
  at: string;
}

export function uploadsDir(): string {
  return path.join(config.dataDir, 'uploads');
}

/**
 * Stores the report as a ticket in Lumora (the inbox in the dashboard always has it),
 * then forwards it to the configured destinations in the background.
 */
export async function createTicket(
  project: ProjectRow,
  account: AccountRow,
  payload: ReportPayload,
  files: { screenshot?: UploadedFile; recording?: UploadedFile },
): Promise<{ id: string; reference: string }> {
  const plan = accountPlan(account);
  const settings = effectiveSettings(project, plan);
  sanitizePayload(payload, settings);

  const ticketId = id('tkt');
  const { reference } = transaction(() => {
    run('UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = ?', project.id);
    const counter = one<{ ticket_counter: number }>('SELECT ticket_counter FROM projects WHERE id = ?', project.id)!.ticket_counter;
    run(
      `INSERT INTO usage (account_id, month, reports) VALUES (?, ?, 1)
       ON CONFLICT(account_id, month) DO UPDATE SET reports = reports + 1`,
      account.id,
      currentMonth(),
    );
    return { reference: `${project.ticket_prefix}-${counter}` };
  });

  // Move uploads into the ticket's folder.
  const dir = path.join(uploadsDir(), ticketId);
  await mkdir(dir, { recursive: true });
  const stored: { screenshot?: LocalFile; recording?: LocalFile } = {};
  if (files.screenshot && settings.reportTypes.screenshot) {
    const name = 'screenshot.png';
    await rename(files.screenshot.path, path.join(dir, name));
    stored.screenshot = { path: path.join(dir, name), name, mime: 'image/png', size: files.screenshot.size };
  }
  if (files.recording && settings.reportTypes.recording) {
    const ext = files.recording.mimetype.includes('mp4') ? 'mp4' : 'webm';
    const name = `recording.${ext}`;
    await rename(files.recording.path, path.join(dir, name));
    stored.recording = { path: path.join(dir, name), name, mime: ext === 'mp4' ? 'video/mp4' : 'video/webm', size: (await stat(path.join(dir, name))).size };
  }

  const attachments: Attachment[] = [];
  if (stored.screenshot) attachments.push({ name: stored.screenshot.name, kind: 'screenshot', url: signFileUrl(ticketId, stored.screenshot.name) });
  if (stored.recording) attachments.push({ name: stored.recording.name, kind: 'recording', url: signFileUrl(ticketId, stored.recording.name) });

  const { steps, relative } = stepsFor(payload, settings);
  const rendered = renderTicket({ settings, payload, steps, stepsAreRelative: relative, attachments, reference });
  run(
    `INSERT INTO tickets (id, project_id, reference, kind, title, description, category, reporter_email, payload, steps, screenshot_file, recording_file)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ticketId,
    project.id,
    reference,
    payload.kind,
    rendered.title,
    rendered.description,
    rendered.category ?? null,
    payload.reporter?.email ?? null,
    JSON.stringify(payload),
    JSON.stringify(steps),
    stored.screenshot?.name ?? null,
    stored.recording?.name ?? null,
  );

  // The user gets their reference right away; AI and forwarding happen in the background.
  void (async () => {
    if (settings.capture.aiSteps) {
      const ai = await improveReport(payload, steps, relative, ticketLocale(settings));
      if (ai) {
        const aiSteps = ai.steps.length ? ai.steps : steps;
        const improved = renderTicket({ settings, payload, steps: aiSteps, stepsAreRelative: ai.steps.length ? false : relative, attachments, aiSummary: ai.summary, reference });
        run('UPDATE tickets SET title = ?, description = ?, steps = ?, ai_summary = ? WHERE id = ?', improved.title, improved.description, JSON.stringify(aiSteps), ai.summary, ticketId);
      }
    }
    await deliverTicket(ticketId);
  })().catch((error) => console.error('[deliver]', error));
  return { id: ticketId, reference };
}

/** Enforce plan & privacy settings server-side, whatever the widget sent. */
function sanitizePayload(payload: ReportPayload, settings: ProjectSettings): void {
  const c = settings.capture;
  if (!c.console.enabled) delete payload.console;
  else payload.console = payload.console?.filter((e) => c.console.levels.includes(e.level)).slice(-c.console.maxEntries);
  if (!c.network.enabled) delete payload.network;
  else payload.network = payload.network?.filter((n) => !c.network.failedOnly || !n.ok).slice(-c.network.maxEntries);
  if (!c.environment) delete payload.environment;
  if (!c.breadcrumbs) delete payload.breadcrumbs;
  if (!c.recordingSteps) delete payload.recordingActions;
  if (!c.user.id) delete payload.reporter.id;
  if (!c.user.name) delete payload.reporter.name;
  if (!c.user.custom) delete payload.reporter.custom;
  if (!c.user.email && !c.askEmailIfAnonymous) delete payload.reporter.email;
  // Only keep fields defined in the template.
  const allowed = new Set(settings.template.fields.map((f) => f.id));
  for (const key of Object.keys(payload.fields)) if (!allowed.has(key)) delete payload.fields[key];
}

export interface TicketRow {
  id: string;
  project_id: string;
  reference: string;
  kind: string;
  title: string;
  description: string;
  category: string | null;
  reporter_email: string | null;
  payload: string;
  steps: string;
  ai_summary: string | null;
  screenshot_file: string | null;
  recording_file: string | null;
  deliveries: string;
  status: string;
  created_at: string;
}

/** Sends a ticket to every enabled destination of its project (respecting category routing). */
export async function deliverTicket(ticketId: string, onlyIntegrationId?: string): Promise<Delivery[]> {
  const ticket = one<TicketRow>('SELECT * FROM tickets WHERE id = ?', ticketId);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  const project = one<ProjectRow>('SELECT * FROM projects WHERE id = ?', ticket.project_id)!;
  const account = getAccount(project.account_id);
  const plan = accountPlan(account);
  const payload = JSON.parse(ticket.payload) as ReportPayload;

  let integrations = all<IntegrationRow>('SELECT * FROM integrations WHERE project_id = ? AND enabled = 1 ORDER BY created_at', project.id)
    .filter((i) => canUseIntegration(plan, i.type))
    .slice(0, PLANS[plan].destinationsPerProject);
  if (onlyIntegrationId) integrations = integrations.filter((i) => i.id === onlyIntegrationId);
  if (PLANS[plan].features.routingByCategory) {
    integrations = integrations.filter((i) => {
      const cats = JSON.parse(i.categories) as string[];
      return !cats.length || (ticket.category !== null && cats.includes(ticket.category));
    });
  }

  const dir = path.join(uploadsDir(), ticket.id);
  const files: LocalFile[] = [];
  const attachments: Attachment[] = [];
  for (const [name, kind, mime] of [
    [ticket.screenshot_file, 'screenshot', 'image/png'],
    [ticket.recording_file, 'recording', ticket.recording_file?.endsWith('mp4') ? 'video/mp4' : 'video/webm'],
  ] as const) {
    if (!name) continue;
    const size = (await stat(path.join(dir, name)).catch(() => null))?.size;
    if (size === undefined) continue;
    files.push({ path: path.join(dir, name), name: `${ticket.reference}-${name}`, mime, size });
    attachments.push({ name, kind, url: signFileUrl(ticket.id, name) });
  }

  const previous = (JSON.parse(ticket.deliveries) as Delivery[]).filter((d) => !integrations.some((i) => i.id === d.integrationId));
  const results: Delivery[] = [];
  for (const integration of integrations) {
    const connector = getConnector(integration.type);
    const base = { integrationId: integration.id, type: integration.type, name: integration.name, at: new Date().toISOString() };
    if (!connector) {
      results.push({ ...base, status: 'failed', error: 'Unknown integration type' });
      continue;
    }
    try {
      const result = await connector.send(
        {
          ticketId: ticket.id,
          reference: ticket.reference,
          title: ticket.title,
          description: ticket.description,
          category: ticket.category ?? undefined,
          payload,
          aiSummary: ticket.ai_summary ?? undefined,
          files,
          attachments,
          dashboardUrl: `${config.publicUrl}/app/#/projects/${project.id}/tickets/${ticket.id}`,
        },
        integrationConfig(integration),
      );
      results.push({ ...base, status: 'sent', ...result });
    } catch (error) {
      results.push({ ...base, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  const deliveries = [...previous, ...results];
  const status = results.some((r) => r.status === 'failed') ? 'delivery_failed' : results.length ? 'forwarded' : ticket.status;
  run('UPDATE tickets SET deliveries = ?, status = ? WHERE id = ?', JSON.stringify(deliveries), status, ticket.id);
  return deliveries;
}

export function serializeTicket(row: TicketRow, full = false) {
  const base = {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    title: row.title,
    category: row.category,
    reporterEmail: row.reporter_email,
    status: row.status,
    deliveries: JSON.parse(row.deliveries) as Delivery[],
    hasScreenshot: !!row.screenshot_file,
    hasRecording: !!row.recording_file,
    createdAt: row.created_at,
  };
  if (!full) return base;
  return {
    ...base,
    description: row.description,
    aiSummary: row.ai_summary,
    steps: JSON.parse(row.steps),
    payload: JSON.parse(row.payload) as ReportPayload,
    screenshotUrl: row.screenshot_file ? `/api/tickets/${row.id}/files/${row.screenshot_file}` : null,
    recordingUrl: row.recording_file ? `/api/tickets/${row.id}/files/${row.recording_file}` : null,
  };
}

// ---------------------------------------------------------------- Errors

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
