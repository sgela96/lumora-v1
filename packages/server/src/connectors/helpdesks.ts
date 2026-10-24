import { toHtml, toJiraWiki, toPlain } from '../lib/markdown';
import { basicAuth, ConnectorError, fileBlob, normalizeBaseUrl, request, required } from './http';
import type { Connector, ExternalStatus } from './types';

// ---------------------------------------------------------------- Jira Cloud

export const jira: Connector = {
  type: 'jira',
  label: 'Jira',
  description: 'Create an issue in a Jira Cloud project, with the screenshot and recording attached.',
  fields: [
    { key: 'siteUrl', label: 'Site URL', type: 'url', required: true, placeholder: 'https://yourcompany.atlassian.net' },
    { key: 'email', label: 'Account e-mail', type: 'email', required: true },
    { key: 'apiToken', label: 'API token', type: 'password', required: true, help: 'id.atlassian.com → Security → API tokens' },
    { key: 'projectKey', label: 'Project key', type: 'text', required: true, placeholder: 'SUP' },
    { key: 'issueType', label: 'Issue type', type: 'text', required: false, placeholder: 'Bug' },
    { key: 'labels', label: 'Labels (comma separated)', type: 'text', required: false, placeholder: 'lumora, customer-report' },
  ],
  async registerStatusWebhook(cfg, url) {
    required(cfg, 'siteUrl', 'email', 'apiToken', 'projectKey');
    const base = normalizeBaseUrl(cfg.siteUrl);
    const hook = await request<{ self: string }>(`${base}/rest/webhooks/1.0/webhook`, {
      method: 'POST',
      headers: { Authorization: basicAuth(cfg.email, cfg.apiToken), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: 'Lumora status sync',
        url,
        events: ['jira:issue_updated'],
        filters: { 'issue-related-events-section': `project = "${cfg.projectKey}"` },
        excludeBody: false,
      }),
    });
    return { id: hook.self.split('/').pop()!, note: 'Webhook created in Jira (needs a Jira admin account).' };
  },
  async unregisterStatusWebhook(cfg, id) {
    await request(`${normalizeBaseUrl(cfg.siteUrl)}/rest/webhooks/1.0/webhook/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: basicAuth(cfg.email, cfg.apiToken) },
    });
  },
  webhookGuide: [
    'Jira → Settings (⚙) → System → WebHooks → Create a WebHook (Jira admins only).',
    'Paste the URL below, tick Issue → updated, and optionally limit it with the JQL: project = YOURKEY.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'siteUrl', 'email', 'apiToken', 'projectKey');
    const base = normalizeBaseUrl(cfg.siteUrl);
    const auth = basicAuth(cfg.email, cfg.apiToken);
    const labels = (cfg.labels || 'lumora').split(',').map((l) => l.trim().replace(/\s+/g, '-')).filter(Boolean);
    const description = (ctx.aiSummary ? `*Summary:* ${ctx.aiSummary}\n\n` : '') + toJiraWiki(ctx.description);
    const issue = await request<{ key: string }>(`${base}/rest/api/2/issue`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: cfg.projectKey },
          summary: ctx.title.slice(0, 254),
          description: description.slice(0, 32000),
          issuetype: { name: cfg.issueType || 'Bug' },
          labels,
        },
      }),
    });
    for (const file of ctx.files) {
      const form = new FormData();
      form.append('file', await fileBlob(file), file.name);
      await request(`${base}/rest/api/2/issue/${issue.key}/attachments`, {
        method: 'POST',
        headers: { Authorization: auth, 'X-Atlassian-Token': 'no-check' },
        body: form,
        timeoutMs: 120_000,
      });
    }
    return { externalId: issue.key, url: `${base}/browse/${issue.key}` };
  },
  async test(cfg) {
    required(cfg, 'siteUrl', 'email', 'apiToken', 'projectKey');
    const base = normalizeBaseUrl(cfg.siteUrl);
    const project = await request<{ name: string }>(`${base}/rest/api/2/project/${encodeURIComponent(cfg.projectKey)}`, {
      headers: { Authorization: basicAuth(cfg.email, cfg.apiToken), Accept: 'application/json' },
    });
    return `Connected to project “${project.name}”.`;
  },
  async fetchStatus(cfg, key) {
    required(cfg, 'siteUrl', 'email', 'apiToken');
    const base = normalizeBaseUrl(cfg.siteUrl);
    const issue = await request<{ fields: { status: { name: string; statusCategory?: { key: string } } } }>(
      `${base}/rest/api/2/issue/${encodeURIComponent(key)}?fields=status`,
      { headers: { Authorization: basicAuth(cfg.email, cfg.apiToken), Accept: 'application/json' } },
    );
    const category = issue.fields.status.statusCategory?.key;
    return { status: category === 'done' ? 'resolved' : category === 'indeterminate' ? 'in_progress' : 'open', label: issue.fields.status.name };
  },
};

// ---------------------------------------------------------------- Zendesk

export const zendesk: Connector = {
  type: 'zendesk',
  label: 'Zendesk',
  description: 'Open a Zendesk ticket on behalf of the user, with attachments.',
  fields: [
    { key: 'subdomain', label: 'Subdomain', type: 'text', required: true, placeholder: 'yourcompany (from yourcompany.zendesk.com)' },
    { key: 'email', label: 'Agent e-mail', type: 'email', required: true },
    { key: 'apiToken', label: 'API token', type: 'password', required: true, help: 'Admin Center → Apps and integrations → Zendesk API' },
    { key: 'tags', label: 'Tags (comma separated)', type: 'text', required: false, placeholder: 'lumora' },
  ],
  webhookGuide: [
    'Admin Center → Apps and integrations → Webhooks → Create webhook → Trigger or automation.',
    'Paste the URL below as the endpoint, method POST, format JSON.',
    'Admin Center → Objects and rules → Triggers → Add trigger: “Ticket is updated” and tag contains lumora → Notify webhook with body {"ticket": "{{ticket.id}}"}.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'subdomain', 'email', 'apiToken');
    const base = zendeskBase(cfg.subdomain);
    const auth = basicAuth(`${cfg.email}/token`, cfg.apiToken);
    const uploads: string[] = [];
    for (const file of ctx.files) {
      const res = await request<{ upload: { token: string } }>(`${base}/api/v2/uploads.json?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': file.mime },
        body: await fileBlob(file),
        timeoutMs: 120_000,
      });
      uploads.push(res.upload.token);
    }
    const reporter = ctx.payload.reporter ?? {};
    const tags = (cfg.tags || 'lumora').split(',').map((t) => t.trim().replace(/\s+/g, '_')).filter(Boolean);
    const html = (ctx.aiSummary ? `<p><strong>Summary:</strong> ${ctx.aiSummary}</p>` : '') + toHtml(ctx.description);
    const created = await request<{ ticket: { id: number } }>(`${base}/api/v2/tickets.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket: {
          subject: ctx.title,
          comment: { html_body: html, uploads, public: false },
          requester: reporter.email ? { email: reporter.email, name: reporter.name || reporter.email } : undefined,
          tags,
          type: ctx.category?.toLowerCase() === 'question' ? 'question' : 'problem',
        },
      }),
    });
    return { externalId: String(created.ticket.id), url: `${base}/agent/tickets/${created.ticket.id}` };
  },
  async test(cfg) {
    required(cfg, 'subdomain', 'email', 'apiToken');
    const base = zendeskBase(cfg.subdomain);
    const me = await request<{ user: { name: string; role: string } }>(`${base}/api/v2/users/me.json`, {
      headers: { Authorization: basicAuth(`${cfg.email}/token`, cfg.apiToken) },
    });
    if (me.user.role === 'end-user') throw new ConnectorError('These credentials belong to an end-user, not an agent.');
    return `Connected as ${me.user.name}.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'subdomain', 'email', 'apiToken');
    const res = await request<{ ticket: { status: string } }>(`${zendeskBase(cfg.subdomain)}/api/v2/tickets/${encodeURIComponent(id)}.json`, {
      headers: { Authorization: basicAuth(`${cfg.email}/token`, cfg.apiToken) },
    });
    const status = res.ticket.status;
    return { status: ['solved', 'closed'].includes(status) ? 'resolved' : ['pending', 'hold'].includes(status) ? 'in_progress' : 'open', label: capitalize(status) };
  },
};

function zendeskBase(subdomain: string): string {
  return `https://${subdomain.replace(/\.zendesk\.com.*$/, '').replace(/^https?:\/\//, '')}.zendesk.com`;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

// ---------------------------------------------------------------- Freshdesk

export const freshdesk: Connector = {
  type: 'freshdesk',
  label: 'Freshdesk',
  description: 'Create a Freshdesk ticket with the attachments.',
  fields: [
    { key: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'yourcompany.freshdesk.com' },
    { key: 'apiKey', label: 'API key', type: 'password', required: true, help: 'Profile settings → Your API Key' },
    { key: 'fallbackEmail', label: 'Requester e-mail for anonymous reports', type: 'email', required: true, placeholder: 'reports@yourcompany.com' },
  ],
  webhookGuide: [
    'Admin → Workflows → Automations → Ticket updates → New rule.',
    'Condition: “Status is changed”; action: Trigger webhook, POST, the URL below, content {"ticket": "{{ticket.id}}"}.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'domain', 'apiKey', 'fallbackEmail');
    const base = normalizeBaseUrl(cfg.domain);
    const form = new FormData();
    const reporter = ctx.payload.reporter ?? {};
    form.append('subject', ctx.title);
    form.append('description', (ctx.aiSummary ? `<p><strong>Summary:</strong> ${ctx.aiSummary}</p>` : '') + toHtml(ctx.description));
    form.append('email', reporter.email || cfg.fallbackEmail);
    if (reporter.name) form.append('name', reporter.name);
    form.append('priority', '2');
    form.append('status', '2');
    form.append('tags[]', 'lumora');
    for (const file of ctx.files.filter((f) => f.size < 20 * 1024 * 1024)) form.append('attachments[]', await fileBlob(file), file.name);
    const ticket = await request<{ id: number }>(`${base}/api/v2/tickets`, {
      method: 'POST',
      headers: { Authorization: basicAuth(cfg.apiKey, 'X') },
      body: form,
      timeoutMs: 120_000,
    });
    return { externalId: String(ticket.id), url: `${base}/a/tickets/${ticket.id}` };
  },
  async test(cfg) {
    required(cfg, 'domain', 'apiKey');
    const base = normalizeBaseUrl(cfg.domain);
    const me = await request<{ contact?: { name: string } }>(`${base}/api/v2/agents/me`, { headers: { Authorization: basicAuth(cfg.apiKey, 'X') } });
    return `Connected${me.contact?.name ? ` as ${me.contact.name}` : ''}.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'domain', 'apiKey');
    const ticket = await request<{ status: number }>(`${normalizeBaseUrl(cfg.domain)}/api/v2/tickets/${encodeURIComponent(id)}`, {
      headers: { Authorization: basicAuth(cfg.apiKey, 'X') },
    });
    return freshStatus(ticket.status);
  },
};

/** Freshdesk / Freshservice numeric statuses: 2 Open, 3 Pending, 4 Resolved, 5 Closed (others are custom). */
export function freshStatus(code: number): ExternalStatus {
  const labels: Record<number, string> = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed' };
  const label = labels[code] ?? `Status ${code}`;
  if (code === 4 || code === 5) return { status: 'resolved', label };
  if (code === 2) return { status: 'open', label };
  return { status: 'in_progress', label };
}

// ---------------------------------------------------------------- GitHub Issues

export const github: Connector = {
  type: 'github',
  label: 'GitHub Issues',
  description: 'Open an issue in a repository. Screenshots are embedded through signed links.',
  fields: [
    { key: 'repository', label: 'Repository', type: 'text', required: true, placeholder: 'owner/repo' },
    { key: 'token', label: 'Fine-grained token', type: 'password', required: true, help: 'Needs “Issues: read and write” on the repository.' },
    { key: 'labels', label: 'Labels (comma separated)', type: 'text', required: false, placeholder: 'bug, from-users' },
  ],
  async registerStatusWebhook(cfg, url) {
    required(cfg, 'repository', 'token');
    const hook = await request<{ id: number }>(`https://api.github.com/repos/${repoPath(cfg.repository)}/hooks`, {
      method: 'POST',
      headers: githubHeaders(cfg.token),
      body: JSON.stringify({ name: 'web', active: true, events: ['issues'], config: { url, content_type: 'json' } }),
    });
    return { id: String(hook.id) };
  },
  async unregisterStatusWebhook(cfg, id) {
    await request(`https://api.github.com/repos/${repoPath(cfg.repository)}/hooks/${encodeURIComponent(id)}`, { method: 'DELETE', headers: githubHeaders(cfg.token) });
  },
  webhookGuide: [
    'Repository → Settings → Webhooks → Add webhook.',
    'Paste the URL below as Payload URL, content type application/json.',
    'Choose “Let me select individual events” → Issues, then Add webhook.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'repository', 'token');
    const shot = ctx.attachments.find((a) => a.kind === 'screenshot');
    const body = [
      ctx.aiSummary && `> **Summary:** ${ctx.aiSummary}`,
      shot && `![Screenshot](${shot.url})`,
      ctx.description,
      `---\n_Reported with [Lumora](${ctx.dashboardUrl}) · ${ctx.reference}_`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const issue = await request<{ number: number; html_url: string }>(`https://api.github.com/repos/${repoPath(cfg.repository)}/issues`, {
      method: 'POST',
      headers: githubHeaders(cfg.token),
      body: JSON.stringify({
        title: ctx.title,
        body: body.slice(0, 65000),
        labels: (cfg.labels || '').split(',').map((l) => l.trim()).filter(Boolean),
      }),
    });
    return { externalId: String(issue.number), displayId: `#${issue.number}`, url: issue.html_url };
  },
  async test(cfg) {
    required(cfg, 'repository', 'token');
    const repo = await request<{ full_name: string; has_issues: boolean }>(`https://api.github.com/repos/${repoPath(cfg.repository)}`, { headers: githubHeaders(cfg.token) });
    if (!repo.has_issues) throw new ConnectorError('Issues are disabled on this repository.');
    return `Connected to ${repo.full_name}.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'repository', 'token');
    const issue = await request<{ state: string; state_reason?: string | null }>(
      `https://api.github.com/repos/${repoPath(cfg.repository)}/issues/${encodeURIComponent(id.replace(/^#/, ''))}`,
      { headers: githubHeaders(cfg.token) },
    );
    return issue.state === 'closed' ? { status: 'resolved', label: issue.state_reason === 'not_planned' ? 'Closed (not planned)' : 'Closed' } : { status: 'open', label: 'Open' };
  },
};

function repoPath(value: string): string {
  const clean = value.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) throw new ConnectorError('Repository must look like owner/repo');
  return clean;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Lumora',
  };
}

// ---------------------------------------------------------------- Linear

export const linear: Connector = {
  type: 'linear',
  label: 'Linear',
  description: 'Create a Linear issue in a team.',
  fields: [
    { key: 'apiKey', label: 'API key', type: 'password', required: true, help: 'Settings → Account → Security & access → Personal API keys' },
    { key: 'teamKey', label: 'Team key', type: 'text', required: true, placeholder: 'ENG' },
  ],
  webhookGuide: [
    'Linear → Settings → API → Webhooks → New webhook (workspace admins).',
    'Paste the URL below, pick your team and the “Issues” data change event.',
  ],
  async send(ctx, cfg) {
    required(cfg, 'apiKey', 'teamKey');
    const teamId = await linearTeamId(cfg);
    const shot = ctx.attachments.find((a) => a.kind === 'screenshot');
    const description = [ctx.aiSummary && `> **Summary:** ${ctx.aiSummary}`, shot && `![Screenshot](${shot.url})`, ctx.description].filter(Boolean).join('\n\n');
    const data = await linearQuery<{ issueCreate: { success: boolean; issue: { identifier: string; url: string } } }>(
      cfg,
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }`,
      { input: { teamId, title: ctx.title, description } },
    );
    if (!data.issueCreate.success) throw new ConnectorError('Linear did not create the issue.');
    return { externalId: data.issueCreate.issue.identifier, url: data.issueCreate.issue.url };
  },
  async test(cfg) {
    required(cfg, 'apiKey', 'teamKey');
    await linearTeamId(cfg);
    return `Connected to team ${cfg.teamKey.toUpperCase()}.`;
  },
  async fetchStatus(cfg, identifier) {
    required(cfg, 'apiKey');
    const data = await linearQuery<{ issue: { state: { name: string; type: string } } }>(
      cfg,
      `query($id: String!) { issue(id: $id) { state { name type } } }`,
      { id: identifier },
    );
    const type = data.issue.state.type;
    return { status: type === 'completed' || type === 'canceled' ? 'resolved' : type === 'started' ? 'in_progress' : 'open', label: data.issue.state.name };
  },
};

async function linearQuery<T>(cfg: Record<string, string>, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await request<{ data?: T; errors?: { message: string }[] }>('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: cfg.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.errors?.length || !res.data) throw new ConnectorError(`Linear: ${res.errors?.map((e) => e.message).join(', ') || 'empty response'}`);
  return res.data;
}

async function linearTeamId(cfg: Record<string, string>): Promise<string> {
  const data = await linearQuery<{ teams: { nodes: { id: string; key: string }[] } }>(cfg, `query { teams(first: 100) { nodes { id key } } }`);
  const team = data.teams.nodes.find((t) => t.key.toUpperCase() === cfg.teamKey.toUpperCase());
  if (!team) throw new ConnectorError(`No Linear team with key ${cfg.teamKey}`);
  return team.id;
}

// ---------------------------------------------------------------- Salesforce Service Cloud

const SF_API = 'v61.0';

export const salesforce: Connector = {
  type: 'salesforce',
  label: 'Salesforce Service Cloud',
  description: 'Create a Case (with files) using an External Client App and the client-credentials flow.',
  fields: [
    { key: 'instanceUrl', label: 'My Domain URL', type: 'url', required: true, placeholder: 'https://yourcompany.my.salesforce.com' },
    { key: 'clientId', label: 'Consumer key', type: 'text', required: true },
    { key: 'clientSecret', label: 'Consumer secret', type: 'password', required: true, help: 'Enable “Client Credentials Flow” and set a Run As user on the app.' },
    { key: 'origin', label: 'Case origin', type: 'text', required: false, placeholder: 'Web' },
    { key: 'priority', label: 'Case priority', type: 'text', required: false, placeholder: 'Medium' },
  ],
  webhookGuide: [
    'Salesforce updates arrive through regular status checks every few minutes — no setup needed.',
    'For instant updates, an admin can add a Flow on Case update with an HTTP Callout (POST) to the URL below.',
  ],
  async send(ctx, cfg) {
    const { base, token } = await salesforceToken(cfg);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const reporter = ctx.payload.reporter ?? {};
    const description = (ctx.aiSummary ? `SUMMARY: ${ctx.aiSummary}\n\n` : '') + toPlain(ctx.description);
    const created = await request<{ id: string }>(`${base}/services/data/${SF_API}/sobjects/Case`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Subject: ctx.title.slice(0, 255),
        Description: description.slice(0, 32000),
        Origin: cfg.origin || 'Web',
        Priority: cfg.priority || 'Medium',
        Type: ctx.category ? ctx.category.slice(0, 40) : undefined,
        SuppliedEmail: reporter.email,
        SuppliedName: reporter.name,
      }),
    });
    const { readFile } = await import('node:fs/promises');
    // ContentVersion goes through JSON (base64), so very large recordings stay as links.
    for (const file of ctx.files.filter((f) => f.size < 25 * 1024 * 1024)) {
      await request(`${base}/services/data/${SF_API}/sobjects/ContentVersion`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Title: file.name,
          PathOnClient: file.name,
          VersionData: (await readFile(file.path)).toString('base64'),
          FirstPublishLocationId: created.id,
        }),
        timeoutMs: 120_000,
      });
    }
    const caseInfo = await request<{ CaseNumber: string }>(`${base}/services/data/${SF_API}/sobjects/Case/${created.id}?fields=CaseNumber`, { headers });
    return { externalId: created.id, displayId: caseInfo.CaseNumber, url: `${base}/lightning/r/Case/${created.id}/view` };
  },
  async test(cfg) {
    await salesforceToken(cfg);
    return 'Authenticated with Salesforce.';
  },
  async fetchStatus(cfg, caseId) {
    const { base, token } = await salesforceToken(cfg);
    const c = await request<{ Status: string; IsClosed: boolean }>(
      `${base}/services/data/${SF_API}/sobjects/Case/${encodeURIComponent(caseId)}?fields=Status,IsClosed`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return { status: c.IsClosed ? 'resolved' : c.Status === 'New' ? 'open' : 'in_progress', label: c.Status };
  },
};

async function salesforceToken(cfg: Record<string, string>): Promise<{ base: string; token: string }> {
  required(cfg, 'instanceUrl', 'clientId', 'clientSecret');
  const base = normalizeBaseUrl(cfg.instanceUrl);
  const res = await request<{ access_token: string; instance_url?: string }>(`${base}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  });
  return { base: res.instance_url ? normalizeBaseUrl(res.instance_url) : base, token: res.access_token };
}
