import { toHtml, toPlain } from '../lib/markdown';
import { freshStatus } from './helpdesks';
import { basicAuth, ConnectorError, fileBlob, normalizeBaseUrl, request, required } from './http';
import type { Connector, ExternalStatus } from './types';

// ---------------------------------------------------------------- HubSpot Service Hub

const HUBSPOT = 'https://api.hubapi.com';

/** Default HubSpot support pipeline stages. Custom pipelines fall back to "in progress". */
const HUBSPOT_STAGES: Record<string, ExternalStatus> = {
  '1': { status: 'open', label: 'New' },
  '2': { status: 'in_progress', label: 'Waiting on contact' },
  '3': { status: 'in_progress', label: 'Waiting on us' },
  '4': { status: 'resolved', label: 'Closed' },
};

export const hubspot: Connector = {
  type: 'hubspot',
  label: 'HubSpot',
  description: 'Create a ticket in HubSpot Service Hub (default support pipeline).',
  fields: [
    { key: 'token', label: 'Private app token', type: 'password', required: true, help: 'Settings → Integrations → Private apps. Scope: tickets.' },
    { key: 'pipeline', label: 'Pipeline ID', type: 'text', required: false, placeholder: '0' },
    { key: 'stage', label: 'Initial stage ID', type: 'text', required: false, placeholder: '1' },
  ],
  webhookGuide: [
    'HubSpot → Automation → Workflows → ticket-based workflow, trigger “Ticket status is any of…”.',
    'Add the action “Send a webhook” (Operations Hub) with method POST and the URL below.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'token');
    const headers = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
    const content = (ctx.aiSummary ? `SUMMARY: ${ctx.aiSummary}\n\n` : '') + toPlain(ctx.description);
    const ticket = await request<{ id: string }>(`${HUBSPOT}/crm/v3/objects/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          subject: ctx.title,
          content: content.slice(0, 65_000),
          hs_pipeline: cfg.pipeline || '0',
          hs_pipeline_stage: cfg.stage || '1',
        },
      }),
    });
    const portalId = await hubspotPortal(cfg.token).catch(() => undefined);
    return {
      externalId: ticket.id,
      displayId: `#${ticket.id}`,
      url: portalId ? `https://app.hubspot.com/contacts/${portalId}/ticket/${ticket.id}` : undefined,
    };
  },
  async test(cfg) {
    required(cfg, 'token');
    const portalId = await hubspotPortal(cfg.token);
    return `Connected to HubSpot account ${portalId}.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'token');
    const ticket = await request<{ properties: { hs_pipeline_stage?: string; hs_pipeline?: string } }>(
      `${HUBSPOT}/crm/v3/objects/tickets/${encodeURIComponent(id)}?properties=hs_pipeline_stage,hs_pipeline`,
      { headers: { Authorization: `Bearer ${cfg.token}` } },
    );
    const stage = ticket.properties.hs_pipeline_stage ?? '';
    const pipeline = ticket.properties.hs_pipeline ?? '0';
    if (pipeline === '0' && HUBSPOT_STAGES[stage]) return HUBSPOT_STAGES[stage];
    return { status: 'in_progress', label: `Stage ${stage || 'unknown'}` };
  },
};

async function hubspotPortal(token: string): Promise<number> {
  const details = await request<{ portalId: number }>(`${HUBSPOT}/account-info/v3/details`, { headers: { Authorization: `Bearer ${token}` } });
  return details.portalId;
}

// ---------------------------------------------------------------- ServiceNow

const SN_STATES: Record<string, string> = { '1': 'New', '2': 'In Progress', '3': 'On Hold', '6': 'Resolved', '7': 'Closed', '8': 'Canceled' };

export function serviceNowStatus(state: string): ExternalStatus {
  const label = SN_STATES[state] ?? `State ${state}`;
  if (state === '1') return { status: 'open', label };
  if (['6', '7', '8'].includes(state)) return { status: 'resolved', label };
  return { status: 'in_progress', label };
}

function serviceNowBase(instance: string): string {
  const clean = instance.trim();
  return /^https?:\/\//.test(clean) || clean.includes('.') ? normalizeBaseUrl(clean) : `https://${clean}.service-now.com`;
}

export const servicenow: Connector = {
  type: 'servicenow',
  label: 'ServiceNow',
  description: 'Open an Incident in ServiceNow ITSM, with files attached.',
  fields: [
    { key: 'instance', label: 'Instance', type: 'text', required: true, placeholder: 'yourcompany (from yourcompany.service-now.com)' },
    { key: 'username', label: 'Integration user', type: 'text', required: true, help: 'A user with the itil role (or rest_api_explorer + incident write).' },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'assignmentGroup', label: 'Assignment group (sys_id or name)', type: 'text', required: false },
  ],
  webhookGuide: [
    'ServiceNow updates arrive through regular status checks every few minutes.',
    'For instant updates, an admin can add a Business Rule on Incident (after update, State changes) that sends a REST message (POST) to the URL below with the sys_id.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'instance', 'username', 'password');
    const base = serviceNowBase(cfg.instance);
    const auth = basicAuth(cfg.username, cfg.password);
    const description = (ctx.aiSummary ? `SUMMARY: ${ctx.aiSummary}\n\n` : '') + toPlain(ctx.description);
    const created = await request<{ result: { sys_id: string; number: string } }>(`${base}/api/now/table/incident?sysparm_fields=sys_id,number`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        short_description: ctx.title.slice(0, 160),
        description: description.slice(0, 32_000),
        contact_type: 'web',
        ...(cfg.assignmentGroup ? { assignment_group: cfg.assignmentGroup } : {}),
      }),
    });
    const { sys_id: sysId, number } = created.result;
    for (const file of ctx.files) {
      await request(
        `${base}/api/now/attachment/file?table_name=incident&table_sys_id=${sysId}&file_name=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': file.mime, Accept: 'application/json' },
          body: await fileBlob(file),
          timeoutMs: 120_000,
        },
      );
    }
    return { externalId: sysId, displayId: number, url: `${base}/nav_to.do?uri=incident.do?sys_id=${sysId}` };
  },
  async test(cfg) {
    required(cfg, 'instance', 'username', 'password');
    await request(`${serviceNowBase(cfg.instance)}/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id`, {
      headers: { Authorization: basicAuth(cfg.username, cfg.password), Accept: 'application/json' },
    });
    return 'Connected to ServiceNow.';
  },
  async fetchStatus(cfg, sysId) {
    required(cfg, 'instance', 'username', 'password');
    const res = await request<{ result: { state: string } }>(
      `${serviceNowBase(cfg.instance)}/api/now/table/incident/${encodeURIComponent(sysId)}?sysparm_fields=state`,
      { headers: { Authorization: basicAuth(cfg.username, cfg.password), Accept: 'application/json' } },
    );
    if (!res?.result) throw new ConnectorError('Incident not found');
    return serviceNowStatus(String(res.result.state));
  },
};

// ---------------------------------------------------------------- Freshservice

function freshserviceBase(domain: string): string {
  const clean = domain.trim();
  return clean.includes('.') || /^https?:\/\//.test(clean) ? normalizeBaseUrl(clean) : `https://${clean}.freshservice.com`;
}

export const freshservice: Connector = {
  type: 'freshservice',
  label: 'Freshservice',
  description: 'Create a Freshservice ticket (incident) with attachments.',
  fields: [
    { key: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'yourcompany.freshservice.com' },
    { key: 'apiKey', label: 'API key', type: 'password', required: true, help: 'Profile settings → Your API Key' },
    { key: 'fallbackEmail', label: 'Requester e-mail for anonymous reports', type: 'email', required: true, placeholder: 'reports@yourcompany.com' },
  ],
  webhookGuide: [
    'Admin → Workflow Automator → New automator (Ticket, on update) → condition “Status is changed”.',
    'Action: Trigger webhook, POST, the URL below, content {"ticket": "{{ticket.id_numeric}}"}.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'domain', 'apiKey', 'fallbackEmail');
    const base = freshserviceBase(cfg.domain);
    const reporter = ctx.payload.reporter ?? {};
    const form = new FormData();
    form.append('subject', ctx.title);
    form.append('description', (ctx.aiSummary ? `<p><strong>Summary:</strong> ${ctx.aiSummary}</p>` : '') + toHtml(ctx.description));
    form.append('email', reporter.email || cfg.fallbackEmail);
    form.append('priority', '2');
    form.append('status', '2');
    form.append('source', '2');
    for (const file of ctx.files.filter((f) => f.size < 15 * 1024 * 1024)) form.append('attachments[]', await fileBlob(file), file.name);
    const res = await request<{ ticket: { id: number } }>(`${base}/api/v2/tickets`, {
      method: 'POST',
      headers: { Authorization: basicAuth(cfg.apiKey, 'X') },
      body: form,
      timeoutMs: 120_000,
    });
    return { externalId: String(res.ticket.id), displayId: `#INC-${res.ticket.id}`, url: `${base}/a/tickets/${res.ticket.id}` };
  },
  async test(cfg) {
    required(cfg, 'domain', 'apiKey');
    await request(`${freshserviceBase(cfg.domain)}/api/v2/tickets?per_page=1`, { headers: { Authorization: basicAuth(cfg.apiKey, 'X') } });
    return 'Connected to Freshservice.';
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'domain', 'apiKey');
    const res = await request<{ ticket: { status: number } }>(`${freshserviceBase(cfg.domain)}/api/v2/tickets/${encodeURIComponent(id)}`, {
      headers: { Authorization: basicAuth(cfg.apiKey, 'X') },
    });
    return freshStatus(res.ticket.status);
  },
};
