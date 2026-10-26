import { PLANS, type TicketStatus } from '@lumora/shared';
import express, { Router, type Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { all, one, run } from '../db';
import { config } from '../config';
import { getConnector } from '../connectors';
import type { RemoteStatus } from '../connectors/types';
import { id as newId } from '../lib/crypto';
import {
  accountLimits,
  getAccount,
  getOwnedProject,
  HttpError,
  integrationConfig,
  PRIORITIES,
  serializeTicket,
  type Delivery,
  type IntegrationRow,
  type Priority,
  type ProjectRow,
  type TicketRow,
} from '../services';
import { syncForIntegration, syncTicket } from '../sync';

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved'];
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function planOf(req: Request) {
  return accountLimits(getAccount(req.user!.accountId));
}

function requireSupportCenter(req: Request): void {
  if (!planOf(req).features.supportCenter) throw new HttpError(402, 'The Support Center is part of the Business plan', 'upgrade');
}

/** WHERE clause shared by the list, the facets and the issue groups. */
function filters(req: Request, project: ProjectRow, opts: { ignoreStatus?: boolean } = {}) {
  const plan = planOf(req);
  const where: string[] = ['project_id = ?', 'created_at >= ?'];
  const params: (string | number)[] = [project.id, sqlDate(new Date(Date.now() - plan.historyDays * 86400_000))];
  // Free and Pro get the plain list (search only); status, filters and grouping are the Support Center.
  const q: Request['query'] = plan.features.supportCenter ? req.query : { q: req.query.q };

  const status = str(q.status, 20);
  if (!opts.ignoreStatus && STATUSES.includes(status as TicketStatus)) {
    where.push('status = ?');
    params.push(status);
  }
  for (const [param, column] of [
    ['category', 'category'],
    ['kind', 'kind'],
    ['browser', 'browser'],
    ['page', 'page_path'],
    ['issue', 'fingerprint'],
  ] as const) {
    const value = str(q[param], 300);
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  const priority = str(q.priority, 20);
  if (priority === 'none') where.push('priority IS NULL');
  else if (PRIORITIES.includes(priority as Priority)) {
    where.push('priority = ?');
    params.push(priority);
  }
  const assignee = str(q.assignee, 200);
  if (assignee === 'none') where.push('assignee_name IS NULL');
  else if (assignee) {
    where.push('assignee_name = ?');
    params.push(assignee);
  }
  const external = str(q.external, 100);
  if (external) {
    where.push('external_status = ?');
    params.push(external);
  }
  if (q.delivery === 'failed') where.push("delivery_status = 'failed'");
  if (q.hasRecording === '1') where.push('recording_file IS NOT NULL');
  if (q.hasErrors === '1') where.push('error_count > 0');
  const from = str(q.from, 30);
  if (from && !Number.isNaN(Date.parse(from))) {
    where.push('created_at >= ?');
    params.push(sqlDate(new Date(from)));
  }
  const to = str(q.to, 30);
  if (to && !Number.isNaN(Date.parse(to))) {
    where.push('created_at < ?');
    params.push(sqlDate(new Date(Date.parse(to) + 86400_000)));
  }
  const search = str(q.q, 100);
  if (search) {
    where.push('(title LIKE ? OR reference LIKE ? OR reporter_email LIKE ? OR issue_label LIKE ? OR external_status LIKE ?)');
    params.push(...Array(5).fill(`%${search}%`));
  }
  return { sql: where.join(' AND '), params };
}

/** SQLite's datetime('now') format, so string comparison matches created_at. */
function sqlDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export function centerRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------- Report repository

  router.get('/projects/:id/tickets', (req, res) => {
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const order =
      req.query.sort === 'oldest'
        ? 'created_at ASC'
        : req.query.sort === 'priority'
          ? "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at DESC"
          : 'created_at DESC';
    const f = filters(req, project);
    const rows = all<TicketRow>(`SELECT * FROM tickets WHERE ${f.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...f.params, limit, offset);
    const total = one<{ n: number }>(`SELECT COUNT(*) AS n FROM tickets WHERE ${f.sql}`, ...f.params)!.n;

    // Counts per status for the segmented control (same filters, any status).
    const fs = filters(req, project, { ignoreStatus: true });
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
    for (const r of all<{ status: TicketStatus; n: number }>(`SELECT status, COUNT(*) AS n FROM tickets WHERE ${fs.sql} GROUP BY status`, ...fs.params)) {
      byStatus[r.status] = r.n;
    }
    const facet = (column: string) =>
      all<{ value: string; n: number }>(
        `SELECT ${column} AS value, COUNT(*) AS n FROM tickets WHERE project_id = ? AND ${column} IS NOT NULL GROUP BY ${column} ORDER BY n DESC LIMIT 20`,
        project.id,
      );
    res.json({
      total,
      items: rows.map((r) => serializeTicket(r)),
      counts: { ...byStatus, all: Object.values(byStatus).reduce((a, b) => a + b, 0) },
      facets: { category: facet('category'), browser: facet('browser'), page: facet('page_path'), assignee: facet('assignee_name'), external: facet('external_status') },
      historyDays: planOf(req).historyDays,
    });
  });

  router.get('/projects/:id/issues', (req, res) => {
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const f = filters(req, project);
    const groups = all<{
      fingerprint: string;
      label: string;
      reports: number;
      unresolved: number;
      reporters: number;
      first_seen: string;
      last_seen: string;
      latest_id: string;
      pages: string | null;
    }>(
      `SELECT fingerprint, MAX(issue_label) AS label, COUNT(*) AS reports,
              SUM(status != 'resolved') AS unresolved,
              COUNT(DISTINCT reporter_email) AS reporters,
              MIN(created_at) AS first_seen, MAX(created_at) AS last_seen,
              (SELECT id FROM tickets t2 WHERE t2.fingerprint = tickets.fingerprint AND t2.project_id = tickets.project_id ORDER BY created_at DESC LIMIT 1) AS latest_id,
              GROUP_CONCAT(DISTINCT page_path) AS pages
       FROM tickets WHERE ${f.sql} AND fingerprint IS NOT NULL
       GROUP BY fingerprint ORDER BY unresolved DESC, reports DESC, last_seen DESC LIMIT 100`,
      ...f.params,
    );
    res.json(
      groups.map((g) => ({
        fingerprint: g.fingerprint,
        label: g.label,
        reports: g.reports,
        unresolved: g.unresolved,
        reporters: g.reporters,
        firstSeen: g.first_seen,
        lastSeen: g.last_seen,
        latestId: g.latest_id,
        pages: (g.pages ?? '').split(',').filter(Boolean).slice(0, 5),
      })),
    );
  });

  // ---------------------------------------------------------- Dashboard metrics

  router.get('/projects/:id/metrics', (req, res) => {
    const limits = planOf(req);
    if (!limits.features.basicDashboard) throw new HttpError(402, 'The dashboard is part of Pro', 'upgrade');
    const advanced = limits.features.supportCenter;
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    // The basic dashboard covers the last 30 days; the advanced one goes back up to a year.
    const days = advanced ? Math.min(Math.max(Number(req.query.days) || 30, 7), 365) : 30;
    const since = sqlDate(new Date(Date.now() - days * 86400_000));
    const prevSince = sqlDate(new Date(Date.now() - 2 * days * 86400_000));
    const p = project.id;
    const count = (sql: string, ...params: (string | number)[]) => one<{ n: number }>(sql, ...params)!.n;

    const reports = count('SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ?', p, since);
    const previous = count('SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND created_at < ?', p, prevSince, since);
    const resolvedRows = all<{ hours: number }>(
      `SELECT (julianday(resolved_at) - julianday(replace(created_at, ' ', 'T') || 'Z')) * 24 AS hours
       FROM tickets WHERE project_id = ? AND resolved_at >= ? ORDER BY hours`,
      p,
      new Date(Date.now() - days * 86400_000).toISOString(),
    ).filter((r) => r.hours !== null && r.hours >= 0);
    const median = resolvedRows.length ? resolvedRows[Math.floor(resolvedRows.length / 2)].hours : null;

    const series = all<{ day: string; created: number }>(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS created FROM tickets WHERE project_id = ? AND created_at >= ? GROUP BY day`,
      p,
      since,
    );
    const resolvedSeries = all<{ day: string; resolved: number }>(
      `SELECT substr(resolved_at, 1, 10) AS day, COUNT(*) AS resolved FROM tickets WHERE project_id = ? AND resolved_at >= ? GROUP BY day`,
      p,
      new Date(Date.now() - days * 86400_000).toISOString(),
    );
    const byDay = new Map<string, { day: string; created: number; resolved: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      byDay.set(day, { day, created: 0, resolved: 0 });
    }
    for (const s of series) if (byDay.has(s.day)) byDay.get(s.day)!.created = s.created;
    for (const s of resolvedSeries) if (byDay.has(s.day)) byDay.get(s.day)!.resolved = s.resolved;

    const breakdown = (column: string, limit = 6) =>
      all<{ label: string; value: number }>(
        `SELECT COALESCE(${column}, 'Unknown') AS label, COUNT(*) AS value FROM tickets
         WHERE project_id = ? AND created_at >= ? GROUP BY label ORDER BY value DESC LIMIT ?`,
        p,
        since,
        limit,
      );

    // Latest reports, each linked to the ticket it created (the basic dashboard's "activity").
    const recent = all<TicketRow>('SELECT * FROM tickets WHERE project_id = ? ORDER BY created_at DESC LIMIT 8', p).map((t) => {
      const linked = (JSON.parse(t.deliveries) as { status: string; type: string; displayId?: string; externalId?: string; url?: string }[]).find((d) => d.status === 'sent');
      return {
        id: t.id,
        reference: t.reference,
        title: t.title,
        category: t.category,
        kind: t.kind,
        createdAt: t.created_at,
        linked: linked ? { type: linked.type, ref: linked.displayId ?? linked.externalId ?? null, url: linked.url ?? null } : null,
      };
    });

    if (!advanced) {
      res.json({
        level: 'basic',
        days,
        totals: { reports, previous, withRecording: count('SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND recording_file IS NOT NULL', p, since), withErrors: count('SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND error_count > 0', p, since) },
        series: [...byDay.values()].map((d) => ({ day: d.day, created: d.created })),
        byCategory: breakdown('category'),
        recent,
      });
      return;
    }

    res.json({
      level: 'advanced',
      recent,
      days,
      totals: {
        reports,
        previous,
        open: count("SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND status = 'open'", p),
        inProgress: count("SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND status = 'in_progress'", p),
        resolved: resolvedRows.length,
        medianResolutionHours: median,
        reporters: count('SELECT COUNT(DISTINCT reporter_email) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND reporter_email IS NOT NULL', p, since),
        withRecording: count('SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND recording_file IS NOT NULL', p, since),
        withErrors: count('SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND error_count > 0', p, since),
        deliveryFailures: count("SELECT COUNT(*) AS n FROM tickets WHERE project_id = ? AND created_at >= ? AND delivery_status = 'failed'", p, since),
      },
      series: [...byDay.values()],
      byCategory: breakdown('category'),
      byKind: breakdown('kind', 3),
      byBrowser: breakdown('browser'),
      byOs: breakdown('os'),
      topPages: breakdown('page_path', 8),
      topIssues: all<{ fingerprint: string; label: string; reports: number; unresolved: number; last_seen: string }>(
        `SELECT fingerprint, MAX(issue_label) AS label, COUNT(*) AS reports, SUM(status != 'resolved') AS unresolved, MAX(created_at) AS last_seen
         FROM tickets WHERE project_id = ? AND created_at >= ? AND fingerprint IS NOT NULL
         GROUP BY fingerprint ORDER BY reports DESC LIMIT 6`,
        p,
        since,
      ).map((i) => ({ fingerprint: i.fingerprint, label: i.label, reports: i.reports, unresolved: i.unresolved, lastSeen: i.last_seen })),
    });
  });

  // ---------------------------------------------------------- Status

  /** The statuses to offer: the connected tool's workflow when there is one, else Lumora's three. */
  router.get('/projects/:id/workflow', async (req, res) => {
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    res.json(await workflowFor(project.id));
  });

  /** Status, priority or category of one report. A status change goes to the linked tool first. */
  router.patch('/tickets/:id', async (req, res) => {
    requireSupportCenter(req);
    const ticket = ownedTicket(req);
    await applyPatch(ticket, req.body ?? {});
    res.json(serializeTicket(one<TicketRow>('SELECT * FROM tickets WHERE id = ?', ticket.id)!, true));
  });

  /** The same change for several reports (board drag, bulk actions in the list). */
  router.post('/projects/:id/tickets/bulk', async (req, res) => {
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String).slice(0, 200) : [];
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const ticketId of ids) {
      const ticket = one<TicketRow>('SELECT * FROM tickets WHERE id = ? AND project_id = ?', ticketId, project.id);
      if (!ticket) continue;
      try {
        await applyPatch(ticket, req.body.patch ?? {});
        results.push({ id: ticketId, ok: true });
      } catch (error) {
        results.push({ id: ticketId, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    res.json({ results });
  });

  // ---------------------------------------------------------- Saved views

  router.get('/projects/:id/views', (req, res) => {
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    res.json(all<{ id: string; name: string; query: string; layout: string }>('SELECT id, name, query, layout FROM saved_views WHERE project_id = ? ORDER BY created_at', project.id).map((v) => ({ ...v, layout: JSON.parse(v.layout) })));
  });

  router.post('/projects/:id/views', (req, res) => {
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const name = str(req.body?.name, 60);
    if (!name) throw new HttpError(400, 'Give the view a name');
    const viewId = newId('vw');
    run('INSERT INTO saved_views (id, project_id, name, query, layout) VALUES (?, ?, ?, ?, ?)', viewId, project.id, name, str(req.body?.query, 1000), JSON.stringify(req.body?.layout ?? {}).slice(0, 2000));
    res.status(201).json({ id: viewId, name, query: str(req.body?.query, 1000), layout: req.body?.layout ?? {} });
  });

  router.delete('/views/:id', (req, res) => {
    run('DELETE FROM saved_views WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE account_id = ?)', String(req.params.id), req.user!.accountId);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------- Reminders

  /** Slack and Teams destinations that can nudge the assignee of a report. */
  router.get('/projects/:id/reminders', (req, res) => {
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    res.json(reminderChannels(project.id).map((i) => ({ integrationId: i.id, type: i.type, name: i.name, direct: i.type === 'slack' && Boolean(integrationConfig(i).botToken) })));
  });

  /** Sends a reminder about one report: a DM to the assignee when the tool allows it, else a channel post. */
  router.post('/tickets/:id/remind', async (req, res) => {
    requireSupportCenter(req);
    const ticket = ownedTicket(req);
    const channels = reminderChannels(ticket.project_id);
    const integration = channels.find((i) => i.id === str(req.body?.integrationId, 60)) ?? channels[0];
    if (!integration) throw new HttpError(400, 'Connect Slack or Microsoft Teams to send reminders');
    const linked = (JSON.parse(ticket.deliveries) as Delivery[]).find((d) => d.status === 'sent' && d.url && d.externalId);
    const assignee = ticket.assignee_name ? { name: ticket.assignee_name, email: ticket.assignee_email } : null;
    try {
      const sentTo = await getConnector(integration.type)!.remind!(integrationConfig(integration), {
        assignee,
        title: ticket.title,
        reference: ticket.reference,
        url: `${config.publicUrl}/app/#/p/${ticket.project_id}/reports/${ticket.id}`,
        ticketUrl: linked?.url,
        status: ticket.external_status ?? ticket.status,
        note: str(req.body?.note, 500) || undefined,
        from: req.user!.name,
      });
      res.json({ ok: true, sentTo, via: integration.name });
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : String(error));
    }
  });

  router.post('/tickets/:id/sync', async (req, res) => {
    requireSupportCenter(req);
    const ticket = ownedTicket(req);
    const synced = await syncTicket(ticket.id);
    res.json(serializeTicket(synced ?? ticket, true));
  });

  return router;
}

/**
 * Public endpoint for webhooks from the linked tools (Jira, Zendesk, GitHub…): any call with the
 * integration's secret token triggers an immediate status sync of the reports it mentions.
 */
export function statusHookRouter(): Router {
  const router = Router();
  // Trello checks the callback URL with a HEAD request before creating the webhook.
  router.head('/:integrationId/:token', (_req, res) => {
    res.status(200).end();
  });
  router.post('/:integrationId/:token', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
    const integration = one<IntegrationRow & { hook_token: string | null }>('SELECT * FROM integrations WHERE id = ?', req.params.integrationId);
    const given = Buffer.from(req.params.token);
    const expected = Buffer.from(integration?.hook_token ?? '');
    if (!integration || !expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(404, 'Unknown hook');
    }
    const body = typeof req.body === 'string' ? req.body : '';
    run('UPDATE integrations SET last_hook_at = ? WHERE id = ?', new Date().toISOString(), integration.id);
    // Asana's handshake: echo the secret it sends on the first call.
    const asanaSecret = req.headers['x-hook-secret'];
    if (typeof asanaSecret === 'string') res.setHeader('X-Hook-Secret', asanaSecret);
    // Answer right away: webhook senders time out quickly; the sync continues in the background.
    res.status(typeof asanaSecret === 'string' ? 200 : 202).json({ accepted: true });
    void syncForIntegration(integration.id, body).catch((e) => console.warn('[hook]', e));
  });
  return router;
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

function reminderChannels(projectId: string): IntegrationRow[] {
  return all<IntegrationRow>('SELECT * FROM integrations WHERE project_id = ? AND enabled = 1 ORDER BY created_at', projectId).filter((i) => getConnector(i.type)?.remind);
}

// ---------------------------------------------------------- Workflow helpers

const workflowCache = new Map<string, { at: number; statuses: RemoteStatus[] }>();

/** The first destination that can list its statuses drives the workflow (usually the only tracker). */
async function workflowFor(projectId: string) {
  const integrations = all<IntegrationRow>('SELECT * FROM integrations WHERE project_id = ? AND enabled = 1 ORDER BY created_at', projectId);
  for (const integration of integrations) {
    const connector = getConnector(integration.type);
    if (!connector?.listStatuses) continue;
    const cached = workflowCache.get(integration.id);
    let statuses = cached && Date.now() - cached.at < 10 * 60_000 ? cached.statuses : null;
    if (!statuses) {
      try {
        statuses = await connector.listStatuses(integrationConfig(integration));
        workflowCache.set(integration.id, { at: Date.now(), statuses });
      } catch (error) {
        return { source: 'lumora' as const, statuses: LUMORA_STATUSES, error: `Couldn’t read the statuses from ${integration.name}: ${error instanceof Error ? error.message : error}` };
      }
    }
    if (statuses.length) return { source: 'tool' as const, tool: { integrationId: integration.id, type: integration.type, name: integration.name }, statuses };
  }
  return { source: 'lumora' as const, statuses: LUMORA_STATUSES };
}

const LUMORA_STATUSES: RemoteStatus[] = [
  { name: 'Open', category: 'open' },
  { name: 'In progress', category: 'in_progress' },
  { name: 'Resolved', category: 'resolved' },
];

async function applyPatch(ticket: TicketRow, body: { status?: unknown; externalStatus?: unknown; priority?: unknown; category?: unknown }): Promise<void> {
  if (body.priority !== undefined) {
    const priority = body.priority === null || body.priority === 'none' ? null : str(body.priority, 20);
    if (priority !== null && !PRIORITIES.includes(priority as Priority)) throw new HttpError(400, 'Invalid priority');
    run('UPDATE tickets SET priority = ? WHERE id = ?', priority, ticket.id);
  }
  if (body.category !== undefined) run('UPDATE tickets SET category = ? WHERE id = ?', str(body.category, 60) || null, ticket.id);

  const externalName = str(body.externalStatus, 100);
  const category = str(body.status, 20) as TicketStatus;
  if (!externalName && !category) return;
  if (category && !STATUSES.includes(category)) throw new HttpError(400, 'Invalid status');

  // Linked to a tool that can change status: change it there, then read it back.
  const workflow = await workflowFor(ticket.project_id);
  const delivery = (JSON.parse(ticket.deliveries) as Delivery[]).find((d) => workflow.source === 'tool' && d.integrationId === workflow.tool.integrationId && d.status === 'sent' && d.externalId);
  if (workflow.source === 'tool' && delivery) {
    const target = externalName ? workflow.statuses.find((s) => s.name === externalName) : workflow.statuses.find((s) => s.category === category);
    if (!target) throw new HttpError(400, `${workflow.tool.name} has no status called “${externalName || category}”`);
    const integration = one<IntegrationRow>('SELECT * FROM integrations WHERE id = ?', delivery.integrationId)!;
    try {
      await getConnector(integration.type)!.setStatus!(integrationConfig(integration), delivery.externalId!, target);
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : String(error));
    }
    await syncTicket(ticket.id);
    return;
  }
  const status = category || workflow.statuses.find((s) => s.name === externalName)?.category || 'open';
  const resolvedAt = status === 'resolved' ? ticket.resolved_at ?? new Date().toISOString() : null;
  run('UPDATE tickets SET status = ?, resolved_at = ?, external_status = ? WHERE id = ?', status, resolvedAt, externalName && workflow.source === 'tool' ? externalName : null, ticket.id);
}
