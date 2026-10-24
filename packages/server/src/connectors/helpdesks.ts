import { toHtml, toJiraWiki, toPlain } from '../lib/markdown';
import { basicAuth, ConnectorError, fileBlob, normalizeBaseUrl, request, required } from './http';
import type { Connector } from './types';

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
  async send(ctx, cfg) {
    required(cfg, 'subdomain', 'email', 'apiToken');
    const base = `https://${cfg.subdomain.replace(/\.zendesk\.com.*$/, '').replace(/^https?:\/\//, '')}.zendesk.com`;
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
    const base = `https://${cfg.subdomain.replace(/\.zendesk\.com.*$/, '').replace(/^https?:\/\//, '')}.zendesk.com`;
    const me = await request<{ user: { name: string; role: string } }>(`${base}/api/v2/users/me.json`, {
      headers: { Authorization: basicAuth(`${cfg.email}/token`, cfg.apiToken) },
    });
    if (me.user.role === 'end-user') throw new ConnectorError('These credentials belong to an end-user, not an agent.');
    return `Connected as ${me.user.name}.`;
  },
};

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
};

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
    return { externalId: `#${issue.number}`, url: issue.html_url };
  },
  async test(cfg) {
    required(cfg, 'repository', 'token');
    const repo = await request<{ full_name: string; has_issues: boolean }>(`https://api.github.com/repos/${repoPath(cfg.repository)}`, { headers: githubHeaders(cfg.token) });
    if (!repo.has_issues) throw new ConnectorError('Issues are disabled on this repository.');
    return `Connected to ${repo.full_name}.`;
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
    return { externalId: caseInfo.CaseNumber, url: `${base}/lightning/r/Case/${created.id}/view` };
  },
  async test(cfg) {
    await salesforceToken(cfg);
    return 'Authenticated with Salesforce.';
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
