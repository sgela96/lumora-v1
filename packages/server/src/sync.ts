import { PLANS, type TicketStatus } from '@lumora/shared';
import { getConnector } from './connectors';
import { all, one, run } from './db';
import { accountLimits, getAccount, integrationConfig, type Delivery, type IntegrationRow, type ProjectRow, type TicketRow } from './services';

// Keeps each report's status in step with the ticket it created in Jira, Zendesk, ServiceNow…
// Polling covers every tool; inbound webhooks (see routes/hooks.ts) make it near-instant.

const SYNC_INTERVAL_MS = Number(process.env.LUMORA_SYNC_INTERVAL_SEC ?? 120) * 1000;
/** Resolved tickets are still re-checked for a while, in case they get reopened. */
const RECHECK_RESOLVED_DAYS = 14;
const MAX_PER_RUN = 300;

export function supportCenterEnabled(projectId: string): boolean {
  const project = one<ProjectRow>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return false;
  return accountLimits(getAccount(project.account_id)).features.supportCenter;
}

/** Reads the status of every linked ticket of a report and derives the report's status. */
export async function syncTicket(ticketId: string): Promise<TicketRow | undefined> {
  const ticket = one<TicketRow>('SELECT * FROM tickets WHERE id = ?', ticketId);
  if (!ticket) return undefined;
  const deliveries = JSON.parse(ticket.deliveries) as Delivery[];
  const now = new Date().toISOString();
  let changed = false;

  for (const delivery of deliveries) {
    if (delivery.status !== 'sent' || !delivery.externalId) continue;
    const connector = getConnector(delivery.type);
    if (!connector?.fetchStatus) continue;
    const integration = one<IntegrationRow>('SELECT * FROM integrations WHERE id = ?', delivery.integrationId);
    if (!integration) continue;
    try {
      const remote = await connector.fetchStatus(integrationConfig(integration), delivery.externalId);
      delivery.external = { ...remote, syncedAt: now };
    } catch (error) {
      delivery.external = {
        status: delivery.external?.status ?? 'open',
        label: delivery.external?.label ?? 'Unknown',
        syncedAt: delivery.external?.syncedAt ?? now,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    changed = true;
  }
  if (!changed) return ticket;

  // The first linked tracker is the source of truth (usually the only one).
  const primary = deliveries.find((d) => d.external && !d.external.error) ?? deliveries.find((d) => d.external);
  const status: TicketStatus = (primary?.external?.status as TicketStatus) ?? (ticket.status as TicketStatus);
  const resolvedAt = status === 'resolved' ? ticket.resolved_at ?? now : null;
  const assignee = primary?.external && 'assignee' in primary.external ? primary.external.assignee : undefined;
  run(
    'UPDATE tickets SET deliveries = ?, status = ?, external_status = ?, synced_at = ?, resolved_at = ?, assignee_name = ?, assignee_email = ? WHERE id = ?',
    JSON.stringify(deliveries),
    status,
    primary?.external?.label ?? null,
    now,
    resolvedAt,
    assignee === undefined ? ticket.assignee_name : assignee?.name ?? null,
    assignee === undefined ? ticket.assignee_email : assignee?.email ?? null,
    ticket.id,
  );
  return one<TicketRow>('SELECT * FROM tickets WHERE id = ?', ticket.id);
}

/** Tickets worth polling: linked to a tracker, on a Support Center plan, not long-resolved. */
function dueTickets(limit: number): { id: string }[] {
  const cutoff = new Date(Date.now() - RECHECK_RESOLVED_DAYS * 86400_000).toISOString();
  const staleBefore = new Date(Date.now() - SYNC_INTERVAL_MS).toISOString();
  const businessPlans = Object.values(PLANS).filter((p) => p.features.supportCenter).map((p) => `'${p.id}'`).join(',');
  return all<{ id: string }>(
    `SELECT t.id FROM tickets t
       JOIN projects p ON p.id = t.project_id
       JOIN accounts a ON a.id = p.account_id
     WHERE a.plan IN (${businessPlans})
       AND t.delivery_status = 'sent'
       AND t.deliveries LIKE '%"externalId"%'
       AND (t.status != 'resolved' OR t.resolved_at > ?)
       AND (t.synced_at IS NULL OR t.synced_at < ?)
     ORDER BY t.synced_at IS NOT NULL, t.synced_at
     LIMIT ?`,
    cutoff,
    staleBefore,
    limit,
  );
}

let running = false;

export async function syncDue(limit = MAX_PER_RUN): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const due = dueTickets(limit);
    // Small parallelism keeps us well under the rate limits of the remote APIs.
    for (let i = 0; i < due.length; i += 4) {
      await Promise.all(due.slice(i, i + 4).map((t) => syncTicket(t.id).catch((e) => console.warn('[sync]', t.id, e))));
    }
    return due.length;
  } finally {
    running = false;
  }
}

/** Syncs the reports linked through one integration — called when its webhook fires. */
export async function syncForIntegration(integrationId: string, rawBody: string): Promise<number> {
  const candidates = all<TicketRow>(
    `SELECT * FROM tickets WHERE deliveries LIKE ? AND (status != 'resolved' OR resolved_at > ?) ORDER BY created_at DESC LIMIT 200`,
    `%${integrationId}%`,
    new Date(Date.now() - 90 * 86400_000).toISOString(),
  );
  // Prefer the tickets the webhook payload mentions (issue key, ticket id, sys_id…).
  const mentioned = candidates.filter((t) =>
    (JSON.parse(t.deliveries) as Delivery[]).some(
      (d) => d.integrationId === integrationId && [d.externalId, d.displayId].some((ref) => ref && containsRef(rawBody, ref)),
    ),
  );
  const targets = mentioned.length ? mentioned : candidates.slice(0, 25);
  for (const t of targets) await syncTicket(t.id).catch((e) => console.warn('[sync]', t.id, e));
  return targets.length;
}

function containsRef(body: string, ref: string): boolean {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}([^A-Za-z0-9-]|$)`).test(body);
}

export function startSyncLoop(): () => void {
  if (SYNC_INTERVAL_MS <= 0) return () => {};
  const timer = setInterval(() => void syncDue().catch((e) => console.error('[sync]', e)), SYNC_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
