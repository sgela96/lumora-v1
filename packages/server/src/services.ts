import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  clampSettingsToPlan,
  effectiveLimits,
  isPlanId,
  mergeSettings,
  type AddonQuantities,
  type PlanLimits,
  type IntegrationType,
  type PlanId,
  type ProjectSettings,
  type ReportPayload,
  type TicketStatus,
} from '@lumora/shared';
import { billingEnabled, config } from './config';
import { getConnector } from './connectors';
import type { Connector, LocalFile } from './connectors/types';
import { all, one, run, transaction } from './db';
import { improveReport, type AiResult } from './lib/ai';
import { decrypt, encrypt, id, signFileUrl } from './lib/crypto';
import { issueSignature, normalizePath, pathOf } from './lib/signature';
import { transcribe, type Transcript } from './lib/transcribe';
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
  /** JSON AddonQuantities, e.g. {"ai":1,"extra_app":2} */
  addons: string;
  /** JSON OnboardingState */
  onboarding: string;
  created_at: string;
}

export function getAccount(accountId: string): AccountRow {
  const account = one<AccountRow>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!account) throw new HttpError(404, 'Account not found');
  return account;
}

/**
 * The plan the account gets right now. Paid plans need an active subscription or a running
 * trial; otherwise the account falls back to Free (the widget keeps working with Free limits).
 */
export function accountPlan(account: AccountRow): PlanId {
  const stored = isPlanId(account.plan) ? account.plan : 'free';
  if (stored === 'free') return 'free';
  if (account.plan_status === 'active') return stored;
  if (account.plan_status === 'trialing' && (!account.trial_ends_at || new Date(account.trial_ends_at) > new Date())) return stored;
  return 'free';
}

export function accountAddons(account: AccountRow): AddonQuantities {
  try {
    return JSON.parse(account.addons || '{}') as AddonQuantities;
  } catch {
    return {};
  }
}

/** Plan limits plus the add-ons the account pays for. */
export function accountLimits(account: AccountRow): PlanLimits {
  return effectiveLimits(accountPlan(account), accountAddons(account));
}

/** Whether the paid plan the account chose is currently in force (false = fell back to Free). */
export function subscriptionActive(account: AccountRow): boolean {
  return accountPlan(account) === (isPlanId(account.plan) ? account.plan : 'free');
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Counts one AI-processed report against the monthly AI quota; false when it's used up. */
function consumeAiQuota(account: AccountRow, limits: PlanLimits): boolean {
  const used = one<{ ai_reports: number }>('SELECT ai_reports FROM usage WHERE account_id = ? AND month = ?', account.id, currentMonth())?.ai_reports ?? 0;
  if (used >= limits.aiReportsPerMonth) return false;
  run('UPDATE usage SET ai_reports = ai_reports + 1 WHERE account_id = ? AND month = ?', account.id, currentMonth());
  return true;
}

export function monthlyAiUsage(accountId: string): number {
  return one<{ ai_reports: number }>('SELECT ai_reports FROM usage WHERE account_id = ? AND month = ?', accountId, currentMonth())?.ai_reports ?? 0;
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
  installed_at: string | null;
  installed_origin: string | null;
  first_report_at: string | null;
  created_at: string;
}

export function projectSettings(project: ProjectRow): ProjectSettings {
  return mergeSettings(JSON.parse(project.settings || '{}'));
}

export function effectiveSettings(project: ProjectRow, limits: PlanLimits): ProjectSettings {
  return clampSettingsToPlan(projectSettings(project), limits);
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
    installedAt: project.installed_at,
    installedOrigin: project.installed_origin,
    firstReportAt: project.first_report_at,
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
  /** Secret part of the inbound status webhook URL. */
  hook_token: string | null;
  last_hook_at: string | null;
  remote_hook_id: string | null;
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
    syncsStatus: typeof connector?.fetchStatus === 'function',
    autoHook: typeof (connector as HookCapable | undefined)?.registerStatusWebhook === 'function',
    hookConfigured: !!row.remote_hook_id,
    lastHookAt: row.last_hook_at,
    webhookGuide: (connector as HookCapable | undefined)?.webhookGuide ?? [],
    hookUrl: connector?.fetchStatus && row.hook_token ? `${config.publicUrl}/api/hooks/status/${row.id}/${row.hook_token}` : null,
    createdAt: row.created_at,
  };
}

/** Optional connector capabilities for creating the status webhook in the remote tool. */
export type HookCapable = Pick<Connector, 'registerStatusWebhook' | 'unregisterStatusWebhook' | 'webhookGuide'>;

export interface OnboardingState {
  setupDone?: boolean;
  tourDone?: boolean;
  /** Plan key the user already saw the "welcome to your plan" moment for. */
  seenPlan?: string;
}

export function accountOnboarding(account: AccountRow): OnboardingState {
  try {
    return JSON.parse(account.onboarding || '{}') as OnboardingState;
  } catch {
    return {};
  }
}

/** Changes when the plan, its paid status or the extras change — drives the "welcome to your plan" modal. */
export function planKey(account: AccountRow): string {
  const addons = accountAddons(account);
  const sorted = Object.keys(addons).sort().map((k) => `${k}:${addons[k as keyof typeof addons]}`).join(',');
  return `${accountPlan(account)}|${account.plan_status === 'trialing' ? 'trial' : 'paid'}|${sorted}`;
}

export function sealConfig(cfg: Record<string, string>): string {
  return encrypt(JSON.stringify(cfg));
}

export function canUseIntegration(limits: PlanLimits, type: string): boolean {
  return limits.integrations.includes(type as IntegrationType);
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
  displayId?: string;
  url?: string;
  error?: string;
  at: string;
  /** Last status read from the linked ticket (Support Center). */
  external?: { status: TicketStatus; label: string; syncedAt: string; error?: string };
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
  const limits = accountLimits(account);
  const settings = effectiveSettings(project, limits);
  sanitizePayload(payload, settings);

  const ticketId = id('tkt');
  const { reference } = transaction(() => {
    run('UPDATE projects SET ticket_counter = ticket_counter + 1 WHERE id = ?', project.id);
    const counter = one<{ ticket_counter: number }>('SELECT ticket_counter FROM projects WHERE id = ?', project.id)!.ticket_counter;
    run("UPDATE projects SET first_report_at = COALESCE(first_report_at, datetime('now')) WHERE id = ?", project.id);
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
  const signature = issueSignature(payload, rendered.category);
  run(
    `INSERT INTO tickets (id, project_id, reference, kind, title, description, category, reporter_email, payload, steps, screenshot_file, recording_file,
                          fingerprint, issue_label, page_path, browser, os, error_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
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
    signature.fingerprint,
    signature.label,
    payload.environment?.url ? normalizePath(pathOf(payload.environment.url)) : null,
    payload.environment?.browser ?? null,
    payload.environment?.os ?? null,
    payload.console?.filter((e) => e.level === 'error').length ?? 0,
  );

  // The user gets their reference right away; AI and forwarding happen in the background.
  void (async () => {
    if (settings.capture.aiSteps && consumeAiQuota(account, limits)) {
      // 1. What the user said while recording (speech-to-text), 2. Claude turns everything into a triaged ticket.
      const transcript = stored.recording && payload.recordingHasAudio ? await transcribe(stored.recording) : undefined;
      const categories = settings.template.fields.find((f) => f.id === 'category' && f.type === 'select')?.options ?? [];
      const openReports = all<{ reference: string; title: string }>(
        "SELECT reference, title FROM tickets WHERE project_id = ? AND id != ? AND status != 'resolved' ORDER BY created_at DESC LIMIT 25",
        project.id,
        ticketId,
      );
      const ai = await improveReport({ payload, rawSteps: steps, relative, locale: ticketLocale(settings), transcript, screenshot: stored.screenshot, categories, openReports });
      if (ai || transcript) {
        const finalSteps = ai?.steps.length ? ai.steps : steps;
        const improved = renderTicket({ settings, payload, steps: finalSteps, stepsAreRelative: ai?.steps.length ? false : relative, attachments, ai, transcript, reference });
        run(
          'UPDATE tickets SET title = ?, description = ?, steps = ?, ai_summary = ?, ai_data = ?, transcript = ?, category = COALESCE(category, ?) WHERE id = ?',
          improved.title,
          improved.description,
          JSON.stringify(finalSteps),
          ai?.summary ?? null,
          ai ? JSON.stringify(ai) : null,
          transcript ? JSON.stringify(transcript) : null,
          ai?.category ?? null,
          ticketId,
        );
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
  ai_data: string | null;
  transcript: string | null;
  screenshot_file: string | null;
  recording_file: string | null;
  deliveries: string;
  /** open | in_progress | resolved — synced from the linked ticket when there is one. */
  status: string;
  /** pending | sent | failed | none */
  delivery_status: string;
  external_status: string | null;
  fingerprint: string | null;
  issue_label: string | null;
  page_path: string | null;
  browser: string | null;
  os: string | null;
  error_count: number;
  synced_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** Sends a ticket to every enabled destination of its project (respecting category routing). */
export async function deliverTicket(ticketId: string, onlyIntegrationId?: string): Promise<Delivery[]> {
  const ticket = one<TicketRow>('SELECT * FROM tickets WHERE id = ?', ticketId);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  const project = one<ProjectRow>('SELECT * FROM projects WHERE id = ?', ticket.project_id)!;
  const account = getAccount(project.account_id);
  const limits = accountLimits(account);
  const payload = JSON.parse(ticket.payload) as ReportPayload;

  let integrations = all<IntegrationRow>('SELECT * FROM integrations WHERE project_id = ? AND enabled = 1 ORDER BY created_at', project.id)
    .filter((i) => canUseIntegration(limits, i.type))
    .slice(0, limits.destinationsPerProject);
  if (onlyIntegrationId) integrations = integrations.filter((i) => i.id === onlyIntegrationId);
  if (limits.features.routingByCategory) {
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
          dashboardUrl: `${config.publicUrl}/app/#/p/${project.id}/reports/${ticket.id}`,
        },
        integrationConfig(integration),
      );
      results.push({ ...base, status: 'sent', ...result });
      if (result.externalId) results[results.length - 1].external = { status: 'open', label: 'Created', syncedAt: base.at };
    } catch (error) {
      results.push({ ...base, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  const deliveries = [...previous, ...results];
  const deliveryStatus = !deliveries.length ? 'none' : deliveries.some((d) => d.status === 'failed') ? 'failed' : 'sent';
  run('UPDATE tickets SET deliveries = ?, delivery_status = ? WHERE id = ?', JSON.stringify(deliveries), deliveryStatus, ticket.id);
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
    status: row.status as TicketStatus,
    deliveryStatus: row.delivery_status,
    externalStatus: row.external_status,
    syncedAt: row.synced_at,
    resolvedAt: row.resolved_at,
    issue: row.fingerprint ? { fingerprint: row.fingerprint, label: row.issue_label ?? '' } : null,
    pagePath: row.page_path,
    browser: row.browser,
    os: row.os,
    errorCount: row.error_count,
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
    ai: row.ai_data ? (JSON.parse(row.ai_data) as AiResult) : null,
    transcript: row.transcript ? (JSON.parse(row.transcript) as Transcript) : null,
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
