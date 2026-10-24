import { PLANS, type TicketStatus } from '@lumora/shared';
import express, { Router, type Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { all, one, run } from '../db';
import {
  accountLimits,
  getAccount,
  getOwnedProject,
  HttpError,
  serializeTicket,
  type IntegrationRow,
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
  const q = req.query;

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
    requireSupportCenter(req);
    const project = getOwnedProject(req.user!.accountId, req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const order = req.query.sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';
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
      facets: { category: facet('category'), browser: facet('browser'), page: facet('page_path') },
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

  router.patch('/tickets/:id', (req, res) => {
    const ticket = ownedTicket(req);
    const status = str(req.body.status, 20) as TicketStatus;
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
    const resolvedAt = status === 'resolved' ? ticket.resolved_at ?? new Date().toISOString() : null;
    run('UPDATE tickets SET status = ?, resolved_at = ? WHERE id = ?', status, resolvedAt, ticket.id);
    res.json(serializeTicket(one<TicketRow>('SELECT * FROM tickets WHERE id = ?', ticket.id)!));
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
