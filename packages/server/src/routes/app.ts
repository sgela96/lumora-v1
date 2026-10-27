import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  ADDON_ORDER,
  ADDONS,
  defaultDashboard,
  defaultSettings,
  mergeSettings,
  sanitizeDashboard,
  PLANS,
  TEMPLATE_VARIABLES,
  type ProjectSettings, formatError } from '@lumora/shared';
import { Router, type Request, type Response } from 'express';
import { endSession, requireJsonForMutations, requireUser, startSession } from '../auth';
import { config } from '../config';
import { connectorCatalog, getConnector } from '../connectors';
import { all, one, run, transaction } from '../db';
import { aiAvailable } from '../lib/ai';
import { resetPasswordMail, sendMail, welcomeMail } from '../lib/mail';
import { transcriptionAvailable } from '../lib/transcribe';
import { centerRouter } from './center';
import { hashPassword, id, randomToken, sha256, verifyPassword } from '../lib/crypto';
import type { Connector } from '../connectors/types';
import {
  accountAddons,
  accountLimits,
  accountOnboarding,
  planKey,
  type HookCapable,
  accountPlan,
  canStartTrial,
  canUseIntegration,
  deliverTicket,
  getAccount,
  getOwnedProject,
  HttpError,
  integrationConfig,
  isAccountOwner,
  monthlyAiUsage,
  monthlyUsage,
  sealConfig,
  serializeIntegration,
  serializeProject,
  serializeTicket,
  subscriptionActive,
  uploadsDir,
  type IntegrationRow,
  type ProjectRow,
  type TicketRow,
} from '../services';

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function appRouter(): Router {
  const router = Router();
  router.use(requireJsonForMutations);

  // ------------------------------------------------------------ Auth

  router.post('/auth/register', async (req, res) => {
    const name = str(req.body.name, 100);
    const email = str(req.body.email, 200).toLowerCase();
    const company = str(req.body.company, 100) || name;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Name and a valid e-mail are required');
    if (password.length < 8) throw new HttpError(400, 'Password must have at least 8 characters');
    if (one('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this e-mail already exists');

    const passwordHash = await hashPassword(password);
    const accountId = id('acc');
    const userId = id('usr');
    const project = transaction(() => {
      // New accounts start on Free; a Pro trial is opt-in from the back office (POST /api/billing/trial).
      run('INSERT INTO accounts (id, name, plan, plan_status, trial_ends_at, onboarding) VALUES (?, ?, ?, ?, ?, ?)', accountId, company, 'free', 'active', null, JSON.stringify({ seenPlan: 'free|paid|' }));
      run('INSERT INTO users (id, account_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)', userId, accountId, email, name, passwordHash);
      return createProject(accountId, company);
    });
    startSession(res, userId);
    void sendMail(welcomeMail(email, name, `<script src="${config.publicUrl}/lumora.js" data-key="${project.public_key}" async></script>`));
    res.status(201).json({ ok: true });
  });

  router.post('/auth/login', async (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = one<{ id: string; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = ?', email);
    if (!user || !(await verifyPassword(password, user.password_hash))) throw new HttpError(401, 'Wrong e-mail or password');
    startSession(res, user.id);
    res.json({ ok: true });
  });

  /** Always answers the same, so it can't be used to find out which e-mails have accounts. */
  router.post('/auth/forgot', async (req, res) => {
    const email = str(req.body.email, 200).toLowerCase();
    const user = one<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = ?', email);
    if (user) {
      const token = randomToken();
      run('UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?', sha256(token), new Date(Date.now() + 3600_000).toISOString(), user.id);
      void sendMail(resetPasswordMail(user.email, token));
    }
    res.json({ ok: true });
  });

  router.post('/auth/reset', async (req, res) => {
    const token = str(req.body.token, 200);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < 8) throw new HttpError(400, 'Password must have at least 8 characters');
    const user = one<{ id: string; reset_expires_at: string | null }>('SELECT id, reset_expires_at FROM users WHERE reset_token_hash = ?', sha256(token));
    if (!user || !user.reset_expires_at || new Date(user.reset_expires_at) < new Date()) throw new HttpError(400, 'This link expired. Ask for a new one.');
    run('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?', await hashPassword(password), user.id);
    run('DELETE FROM sessions WHERE user_id = ?', user.id);
    startSession(res, user.id);
    res.json({ ok: true });
  });

  router.post('/auth/logout', (req, res) => {
    endSession(req, res);
    res.json({ ok: true });
  });

  router.use(requireUser);

  router.get('/me', (req, res) => {
    const account = getAccount(req.user!.accountId);
    const plan = accountPlan(account);
    res.json({
      user: req.user,
      account: {
        id: account.id,
        name: account.name,
        plan,
        chosenPlan: account.plan,
        addons: accountAddons(account),
        planStatus: account.plan_status,
        planKey: planKey(account),
        onboarding: accountOnboarding(account),
        trialEndsAt: account.trial_ends_at,
        canTrial: canStartTrial(account),
        active: subscriptionActive(account),
        hasBillingCustomer: !!account.stripe_customer_id,
      },
      limits: accountLimits(account),
      dashboard: {
        layout: sanitizeDashboard(account.dashboard_layout ? JSON.parse(account.dashboard_layout) : null) ?? defaultDashboard(plan),
        custom: !!account.dashboard_layout,
        canEdit: isAccountOwner(account.id, req.user!.id),
      },
      usage: { month: new Date().toISOString().slice(0, 7), reports: monthlyUsage(account.id), aiReports: monthlyAiUsage(account.id) },
      server: {
        publicUrl: config.publicUrl,
        billingEnabled: !!config.stripe.secretKey,
        aiAvailable: aiAvailable(),
        transcriptionAvailable: transcriptionAvailable(),
        emailAvailable: !!config.smtp.url,
        supportEmail: config.supportEmail,
      },
    });
  });

  /** The Overview layout for the whole organization. Only the account owner changes it; null goes back to the default. */
  router.put('/account/dashboard', (req, res) => {
    const account = getAccount(req.user!.accountId);
    if (!accountLimits(account).features.basicDashboard) throw new HttpError(402, 'The dashboard is part of Pro', 'upgrade');
    if (!isAccountOwner(account.id, req.user!.id)) throw new HttpError(403, 'Only the account owner can change the dashboard');
    const layout = req.body?.layout === null ? null : sanitizeDashboard(req.body?.layout);
    if (req.body?.layout !== null && !layout) throw new HttpError(400, 'layout must be a list of cards');
    run('UPDATE accounts SET dashboard_layout = ? WHERE id = ?', layout ? JSON.stringify(layout) : null, account.id);
    res.json({ layout: layout ?? defaultDashboard(accountPlan(account)), custom: !!layout, canEdit: true });
  });

  router.patch('/me/onboarding', (req, res) => {
    const account = getAccount(req.user!.accountId);
    const state = accountOnboarding(account);
    if (typeof req.body.setupDone === 'boolean') state.setupDone = req.body.setupDone;
    if (typeof req.body.tourDone === 'boolean') state.tourDone = req.body.tourDone;
    if (req.body.seenPlan === true) state.seenPlan = planKey(account);
    run('UPDATE accounts SET onboarding = ? WHERE id = ?', JSON.stringify(state), account.id);
    res.json(state);
  });

  router.get('/catalog', (_req, res) => {
    res.json({ plans: PLANS, addons: ADDONS, addonOrder: ADDON_ORDER, integrations: connectorCatalog(), templateVariables: TEMPLATE_VARIABLES, defaults: defaultSettings() });
  });

  // ------------------------------------------------------------ Projects

  router.get('/projects', (req, res) => {
    const rows = all<ProjectRow & { tickets: number; destinations: number; last_ticket: string | null }>(
      `SELECT p.*, (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id) AS tickets,
              (SELECT COUNT(*) FROM integrations i WHERE i.project_id = p.id AND i.enabled = 1) AS destinations,
              (SELECT MAX(created_at) FROM tickets t WHERE t.project_id = p.id) AS last_ticket
       FROM projects p WHERE account_id = ? ORDER BY created_at`,
      req.user!.accountId,
    );
    res.json(rows.map((r) => ({ ...serializeProject(r), tickets: r.tickets, destinations: r.destinations, lastTicketAt: r.last_ticket })));
  });

  router.post('/projects', (req, res) => {
    const account = getAccount(req.user!.accountId);
    const count = one<{ n: number }>('SELECT COUNT(*) AS n FROM projects WHERE account_id = ?', account.id)!.n;
    if (count >= accountLimits(account).projects) throw new HttpError(402, 'Your plan does not include more apps. Add an extra app or upgrade.', 'upgrade');
    const name = str(req.body.name, 80);
    if (!name) throw new HttpError(400, 'Name is required');
    const project = createProject(account.id, name);
    res.status(201).json(serializeProject(project));
  });

  router.get('/projects/:id', (req, res) => {
    res.json(serializeProject(getOwnedProject(req.user!.accountId, req.params.id)));
  });

  router.patch('/projects/:id', (req, res) => {
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const name = req.body.name !== undefined ? str(req.body.name, 80) : project.name;
    if (!name) throw new HttpError(400, 'Name is required');
    const prefix = req.body.ticketPrefix !== undefined ? str(req.body.ticketPrefix, 10).toUpperCase() : project.ticket_prefix;
    if (!/^[A-Z][A-Z0-9]{0,9}$/.test(prefix)) throw new HttpError(400, 'Ticket prefix must be letters/numbers, starting with a letter');
    let origins = JSON.parse(project.allowed_origins) as string[];
    if (Array.isArray(req.body.allowedOrigins)) origins = req.body.allowedOrigins.map((o: unknown) => normalizeOrigin(str(o, 200))).filter(Boolean);
    let settings: ProjectSettings = mergeSettings(JSON.parse(project.settings || '{}'));
    if (req.body.settings !== undefined) settings = validateSettings(mergeSettings(req.body.settings));
    run(
      'UPDATE projects SET name = ?, ticket_prefix = ?, allowed_origins = ?, settings = ? WHERE id = ?',
      name,
      prefix,
      JSON.stringify(origins),
      JSON.stringify(settings),
      project.id,
    );
    res.json(serializeProject(getOwnedProject(req.user!.accountId, project.id)));
  });

  router.post('/projects/:id/rotate-key', (req, res) => {
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    run('UPDATE projects SET public_key = ? WHERE id = ?', `pk_${randomToken(18)}`, project.id);
    res.json(serializeProject(getOwnedProject(req.user!.accountId, project.id)));
  });

  router.delete('/projects/:id', (req, res) => {
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    run('DELETE FROM projects WHERE id = ?', project.id);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ Integrations

  router.get('/projects/:id/integrations', (req, res) => {
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    res.json(all<IntegrationRow>('SELECT * FROM integrations WHERE project_id = ? ORDER BY created_at', project.id).map(serializeIntegration));
  });

  router.post('/projects/:id/integrations', (req, res) => {
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const limits = accountLimits(getAccount(req.user!.accountId));
    const type = str(req.body.type, 30);
    const connector = getConnector(type);
    if (!connector) throw new HttpError(400, 'Unknown integration type');
    if (!canUseIntegration(limits, type)) throw new HttpError(402, `${connector.label} is not included in your plan`, 'upgrade');
    const active = one<{ n: number }>('SELECT COUNT(*) AS n FROM integrations WHERE project_id = ? AND enabled = 1', project.id)!.n;
    if (active >= limits.destinationsPerProject) throw new HttpError(402, `Your plan allows ${limits.destinationsPerProject} destination(s) per app`, 'upgrade');
    const cfg = cleanConfig(type, req.body.config, {});
    const row: IntegrationRow = {
      id: id('int'),
      project_id: project.id,
      type,
      name: str(req.body.name, 80) || connector.label,
      config_enc: sealConfig(cfg),
      categories: JSON.stringify(cleanCategories(req.body.categories)),
      enabled: 1,
      hook_token: randomToken(24),
      last_hook_at: null,
      remote_hook_id: null,
      created_at: new Date().toISOString(),
    };
    run(
      'INSERT INTO integrations (id, project_id, type, name, config_enc, categories, enabled, hook_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id,
      row.project_id,
      row.type,
      row.name,
      row.config_enc,
      row.categories,
      row.enabled,
      row.hook_token,
      row.created_at,
    );
    res.status(201).json(serializeIntegration(row));
  });

  router.patch('/integrations/:id', (req, res) => {
    const row = ownedIntegration(req);
    const cfg = req.body.config !== undefined ? cleanConfig(row.type, req.body.config, integrationConfig(row)) : integrationConfig(row);
    const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
    if (enabled && !row.enabled) {
      const limits = accountLimits(getAccount(req.user!.accountId));
      const active = one<{ n: number }>('SELECT COUNT(*) AS n FROM integrations WHERE project_id = ? AND enabled = 1', row.project_id)!.n;
      if (active >= limits.destinationsPerProject) throw new HttpError(402, `Your plan allows ${limits.destinationsPerProject} destination(s) per app`, 'upgrade');
    }
    run(
      'UPDATE integrations SET name = ?, config_enc = ?, categories = ?, enabled = ? WHERE id = ?',
      req.body.name !== undefined ? str(req.body.name, 80) || row.name : row.name,
      sealConfig(cfg),
      req.body.categories !== undefined ? JSON.stringify(cleanCategories(req.body.categories)) : row.categories,
      enabled,
      row.id,
    );
    res.json(serializeIntegration(one<IntegrationRow>('SELECT * FROM integrations WHERE id = ?', row.id)!));
  });

  /** Creates the status webhook in the remote tool (Jira, GitHub…) so status updates arrive instantly. */
  router.post('/integrations/:id/auto-hook', async (req, res) => {
    const row = ownedIntegration(req);
    const connector = getConnector(row.type) as (Connector & HookCapable) | undefined;
    if (!connector?.registerStatusWebhook || !row.hook_token) throw new HttpError(400, 'This tool needs the webhook to be added by hand — follow the guide.');
    const url = `${config.publicUrl}/api/hooks/status/${row.id}/${row.hook_token}`;
    try {
      const created = await connector.registerStatusWebhook(integrationConfig(row), url);
      run('UPDATE integrations SET remote_hook_id = ? WHERE id = ?', created.id, row.id);
      res.json({ ok: true, message: created.note ?? 'Webhook created — status changes now arrive instantly.' });
    } catch (error) {
      res.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  router.delete('/integrations/:id', async (req, res) => {
    const row = ownedIntegration(req);
    const connector = getConnector(row.type) as (Connector & HookCapable) | undefined;
    // Best effort: remove the webhook we created in the remote tool.
    if (row.remote_hook_id && connector?.unregisterStatusWebhook) {
      await connector.unregisterStatusWebhook(integrationConfig(row), row.remote_hook_id).catch(() => {});
    }
    run('DELETE FROM integrations WHERE id = ?', row.id);
    res.json({ ok: true });
  });

  router.post('/integrations/:id/test', async (req, res) => {
    const row = ownedIntegration(req);
    const connector = getConnector(row.type)!;
    try {
      const message = await connector.test(integrationConfig(row));
      res.json({ ok: true, message });
    } catch (error) {
      res.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  // ------------------------------------------------------------ Tickets

  // List, filters, metrics and status live in routes/center.ts.
  router.use(centerRouter());

  router.get('/tickets/:id', (req, res) => {
    // Every plan can open its reports; status tracking and grouping stay in the Support Center.
    res.json(serializeTicket(ownedTicket(req), true));
  });

  router.post('/tickets/:id/resend', async (req, res) => {
    const ticket = ownedTicket(req);
    const deliveries = await deliverTicket(ticket.id, str(req.body.integrationId, 40) || undefined);
    res.json({ deliveries });
  });

  router.get('/tickets/:id/files/:file', async (req, res) => {
    const ticket = ownedTicket(req);
    const file = req.params.file;
    if (file !== ticket.screenshot_file && file !== ticket.recording_file) throw new HttpError(404, 'File not found');
    await sendFile(req, res, path.join(uploadsDir(), ticket.id, file));
  });

  return router;
}

// ------------------------------------------------------------ Helpers

function createProject(accountId: string, name: string): ProjectRow {
  const projectId = id('prj');
  const prefix = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'LUM';
  run(
    'INSERT INTO projects (id, account_id, name, public_key, settings, ticket_prefix) VALUES (?, ?, ?, ?, ?, ?)',
    projectId,
    accountId,
    name,
    `pk_${randomToken(18)}`,
    JSON.stringify(defaultSettings()),
    prefix.length >= 2 ? prefix : 'LUM',
  );
  return one<ProjectRow>('SELECT * FROM projects WHERE id = ?', projectId)!;
}

function normalizeOrigin(value: string): string {
  if (!value) return '';
  if (/^https?:\/\/\*\.[\w.-]+$/.test(value)) return value;
  try {
    return new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).origin;
  } catch {
    return '';
  }
}

function validateSettings(s: ProjectSettings): ProjectSettings {
  if (!/^#[0-9a-fA-F]{6}$/.test(s.appearance.accentColor)) throw new HttpError(400, 'Accent color must be a hex color like #F59E0B');
  s.appearance.offsetX = clamp(s.appearance.offsetX, 0, 200);
  s.appearance.offsetY = clamp(s.appearance.offsetY, 0, 200);
  s.appearance.greeting = s.appearance.greeting.slice(0, 80);
  s.capture.console.maxEntries = clamp(s.capture.console.maxEntries, 1, 200);
  s.capture.network.maxEntries = clamp(s.capture.network.maxEntries, 1, 100);
  s.recording.maxSeconds = clamp(s.recording.maxSeconds, 10, 600);
  s.capture.redactSelectors = s.capture.redactSelectors.map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, 50);
  if (!['always', 'onError', 'manual'].includes(s.smart.launcher)) throw new HttpError(400, `Unknown launcher mode ${s.smart.launcher}`);
  s.smart.errorSelectors = s.smart.errorSelectors.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 30);
  s.template.titleTemplate = s.template.titleTemplate.slice(0, 300);
  s.template.descriptionTemplate = s.template.descriptionTemplate.slice(0, 10_000);
  const ids = new Set<string>();
  s.template.fields = s.template.fields.slice(0, 15).map((f) => {
    const fieldId = String(f.id || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!fieldId || ids.has(fieldId)) throw new HttpError(400, `Each field needs a unique id (got “${f.id}”)`);
    ids.add(fieldId);
    if (!['text', 'textarea', 'select', 'email', 'checkbox'].includes(f.type)) throw new HttpError(400, `Unknown field type ${f.type}`);
    return {
      id: fieldId,
      label: String(f.label || fieldId).slice(0, 80),
      type: f.type,
      required: !!f.required,
      placeholder: f.placeholder ? String(f.placeholder).slice(0, 120) : undefined,
      options: f.type === 'select' ? (f.options ?? []).map((o) => String(o).slice(0, 60)).filter(Boolean).slice(0, 20) : undefined,
    };
  });
  return s;
}

function clamp(n: unknown, min: number, max: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;
}

function cleanConfig(type: string, input: unknown, previous: Record<string, string>): Record<string, string> {
  const connector = getConnector(type)!;
  const src = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of connector.fields) {
    const value = typeof src[field.key] === 'string' ? (src[field.key] as string).trim().slice(0, 2000) : '';
    // "••••" means "unchanged" for secrets the dashboard never received.
    out[field.key] = field.type === 'password' && (value === '' || /^•+$/.test(value)) ? (previous[field.key] ?? '') : value;
    if (field.required && !out[field.key]) throw new HttpError(400, `${field.label} is required`);
    const bad = formatError(field.type, out[field.key], field.label);
    if (bad) throw new HttpError(400, bad);
  }
  return out;
}

function cleanCategories(input: unknown): string[] {
  return Array.isArray(input) ? input.map((c) => String(c).slice(0, 60)).filter(Boolean).slice(0, 20) : [];
}

function ownedIntegration(req: Request): IntegrationRow {
  const row = one<IntegrationRow>(
    'SELECT i.* FROM integrations i JOIN projects p ON p.id = i.project_id WHERE i.id = ? AND p.account_id = ?',
    String(req.params.id),
    req.user!.accountId,
  );
  if (!row) throw new HttpError(404, 'Integration not found');
  return row;
}

function ownedTicket(req: Request): TicketRow {
  const row = one<TicketRow>(
    'SELECT t.* FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.account_id = ?',
    String(req.params.id),
    req.user!.accountId,
  );
  if (!row) throw new HttpError(404, 'Ticket not found');
  return row;
}

/** Streams a file with Range support (needed for video seeking). */
export async function sendFile(req: Request, res: Response, filePath: string): Promise<void> {
  const info = await stat(filePath).catch(() => null);
  if (!info) throw new HttpError(404, 'File not found');
  const type = filePath.endsWith('.png') ? 'image/png' : filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      res.status(416).setHeader('Content-Range', `bytes */${info.size}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Length', String(info.size));
  createReadStream(filePath).pipe(res);
}
