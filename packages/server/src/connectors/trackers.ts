import type { TicketStatus } from '@lumora/shared';
import { toHtml, toPlain } from '../lib/markdown';
import { basicAuth, ConnectorError, fileBlob, normalizeBaseUrl, request, required } from './http';
import type { Connector, DeliveryContext } from './types';

/** Markdown body with the AI summary on top and the screenshot embedded, for tools that render Markdown. */
function markdownBody(ctx: DeliveryContext, embedScreenshot = true): string {
  const shot = embedScreenshot ? ctx.attachments.find((a) => a.kind === 'screenshot') : undefined;
  return [ctx.aiSummary && `> **Summary:** ${ctx.aiSummary}`, shot && `![Screenshot](${shot.url})`, ctx.description, `---\n_Reported with Lumora · ${ctx.reference}_`]
    .filter(Boolean)
    .join('\n\n');
}

function plainBody(ctx: DeliveryContext): string {
  return (ctx.aiSummary ? `SUMMARY: ${ctx.aiSummary}\n\n` : '') + toPlain(ctx.description);
}

function htmlBody(ctx: DeliveryContext): string {
  return (ctx.aiSummary ? `<p><strong>Summary:</strong> ${ctx.aiSummary}</p>` : '') + toHtml(ctx.description);
}

const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

// ---------------------------------------------------------------- Azure DevOps Boards

const ADO_API = 'api-version=7.1';

function adoBase(cfg: Record<string, string>): string {
  const org = cfg.organization.replace(/^https?:\/\/dev\.azure\.com\//, '').replace(/\/.*$/, '');
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(cfg.project)}`;
}

export function adoStatus(state: string): TicketStatus {
  const s = state.toLowerCase();
  if (['new', 'to do', 'proposed'].includes(s)) return 'open';
  if (['resolved', 'closed', 'done', 'removed', 'completed'].includes(s)) return 'resolved';
  return 'in_progress';
}

export const azureDevops: Connector = {
  type: 'azure_devops',
  label: 'Azure DevOps',
  description: 'Create a Bug (or any work item type) in Azure Boards, with files attached.',
  fields: [
    { key: 'organization', label: 'Organization', type: 'text', required: true, placeholder: 'yourcompany (from dev.azure.com/yourcompany)' },
    { key: 'project', label: 'Project', type: 'text', required: true },
    { key: 'token', label: 'Personal access token', type: 'password', required: true, help: 'Scope: Work Items (Read & write).' },
    { key: 'workItemType', label: 'Work item type', type: 'text', required: false, placeholder: 'Bug' },
    { key: 'tags', label: 'Tags (comma separated)', type: 'text', required: false, placeholder: 'lumora; customer-report' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'organization', 'project', 'token');
    const base = adoBase(cfg);
    const auth = basicAuth('', cfg.token);
    const type = cfg.workItemType || 'Bug';

    const relations: unknown[] = [];
    for (const file of ctx.files) {
      const uploaded = await request<{ url: string }>(`${base}/_apis/wit/attachments?fileName=${encodeURIComponent(file.name)}&${ADO_API}`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/octet-stream' },
        body: await fileBlob(file),
        timeoutMs: 120_000,
      });
      relations.push({ op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url: uploaded.url, attributes: { comment: 'Captured with Lumora' } } });
    }

    const descriptionField = type.toLowerCase() === 'bug' ? 'Microsoft.VSTS.TCM.ReproSteps' : 'System.Description';
    const tags = splitList((cfg.tags || 'lumora').replace(/;/g, ','));
    const patch = [
      { op: 'add', path: '/fields/System.Title', value: ctx.title.slice(0, 255) },
      { op: 'add', path: `/fields/${descriptionField}`, value: htmlBody(ctx) },
      ...(tags.length ? [{ op: 'add', path: '/fields/System.Tags', value: tags.join('; ') }] : []),
      ...relations,
    ];
    const item = await request<{ id: number; _links?: { html?: { href: string } } }>(`${base}/_apis/wit/workitems/$${encodeURIComponent(type)}?${ADO_API}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(patch),
    });
    return { externalId: String(item.id), displayId: `#${item.id}`, url: item._links?.html?.href ?? `${base}/_workitems/edit/${item.id}` };
  },
  async test(cfg) {
    required(cfg, 'organization', 'project', 'token');
    const org = adoBase(cfg).replace(/\/[^/]+$/, '');
    const project = await request<{ name: string }>(`${org}/_apis/projects/${encodeURIComponent(cfg.project)}?${ADO_API}`, {
      headers: { Authorization: basicAuth('', cfg.token) },
    });
    return `Connected to project “${project.name}”.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'organization', 'project', 'token');
    const item = await request<{ fields: { 'System.State': string } }>(`${adoBase(cfg)}/_apis/wit/workitems/${encodeURIComponent(id)}?fields=System.State&${ADO_API}`, {
      headers: { Authorization: basicAuth('', cfg.token) },
    });
    const state = item.fields['System.State'];
    return { status: adoStatus(state), label: state };
  },
};

// ---------------------------------------------------------------- GitLab Issues

function gitlabProject(cfg: Record<string, string>): { api: string; project: string } {
  const base = normalizeBaseUrl(cfg.baseUrl || 'https://gitlab.com');
  const path = cfg.project.replace(/^https?:\/\/[^/]+\//, '').replace(/\/-\/.*$/, '').replace(/\/$/, '');
  return { api: `${base}/api/v4`, project: encodeURIComponent(path) };
}

export const gitlab: Connector = {
  type: 'gitlab',
  label: 'GitLab Issues',
  description: 'Open an issue in a GitLab project (cloud or self-managed), with uploads embedded.',
  fields: [
    { key: 'baseUrl', label: 'GitLab URL', type: 'url', required: false, placeholder: 'https://gitlab.com' },
    { key: 'project', label: 'Project path or ID', type: 'text', required: true, placeholder: 'group/project' },
    { key: 'token', label: 'Access token', type: 'password', required: true, help: 'Project or personal token with the “api” scope.' },
    { key: 'labels', label: 'Labels (comma separated)', type: 'text', required: false, placeholder: 'bug, from-users' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'project', 'token');
    const { api, project } = gitlabProject(cfg);
    const headers = { 'PRIVATE-TOKEN': cfg.token };
    const uploads: string[] = [];
    for (const file of ctx.files) {
      const form = new FormData();
      form.append('file', await fileBlob(file), file.name);
      const res = await request<{ markdown: string }>(`${api}/projects/${project}/uploads`, { method: 'POST', headers, body: form, timeoutMs: 120_000 });
      uploads.push(res.markdown);
    }
    const description = [markdownBody(ctx, uploads.length === 0), ...uploads].join('\n\n');
    const issue = await request<{ iid: number; web_url: string }>(`${api}/projects/${project}/issues`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: ctx.title.slice(0, 255), description: description.slice(0, 1_000_000), labels: splitList(cfg.labels).join(',') }),
    });
    return { externalId: String(issue.iid), displayId: `#${issue.iid}`, url: issue.web_url };
  },
  async test(cfg) {
    required(cfg, 'project', 'token');
    const { api, project } = gitlabProject(cfg);
    const p = await request<{ path_with_namespace: string; issues_enabled?: boolean }>(`${api}/projects/${project}`, { headers: { 'PRIVATE-TOKEN': cfg.token } });
    if (p.issues_enabled === false) throw new ConnectorError('Issues are disabled on this project.');
    return `Connected to ${p.path_with_namespace}.`;
  },
  async fetchStatus(cfg, iid) {
    required(cfg, 'project', 'token');
    const { api, project } = gitlabProject(cfg);
    const issue = await request<{ state: string }>(`${api}/projects/${project}/issues/${encodeURIComponent(iid.replace(/^#/, ''))}`, {
      headers: { 'PRIVATE-TOKEN': cfg.token },
    });
    return issue.state === 'closed' ? { status: 'resolved', label: 'Closed' } : { status: 'open', label: 'Open' };
  },
};

// ---------------------------------------------------------------- ClickUp

export const clickup: Connector = {
  type: 'clickup',
  label: 'ClickUp',
  description: 'Create a task in a ClickUp list, with attachments.',
  fields: [
    { key: 'token', label: 'API token', type: 'password', required: true, help: 'Settings → Apps → API Token (starts with pk_).' },
    { key: 'listId', label: 'List ID', type: 'text', required: true, help: 'The number at the end of the list URL.' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'token', 'listId');
    const task = await request<{ id: string; url: string; custom_id?: string | null }>(
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(cfg.listId)}/task`,
      {
        method: 'POST',
        headers: { Authorization: cfg.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ctx.title, markdown_description: markdownBody(ctx), tags: ['lumora'] }),
      },
    );
    for (const file of ctx.files) {
      const form = new FormData();
      form.append('attachment', await fileBlob(file), file.name);
      await request(`https://api.clickup.com/api/v2/task/${task.id}/attachment`, { method: 'POST', headers: { Authorization: cfg.token }, body: form, timeoutMs: 120_000 });
    }
    return { externalId: task.id, displayId: task.custom_id || undefined, url: task.url };
  },
  async test(cfg) {
    required(cfg, 'token', 'listId');
    const list = await request<{ name: string }>(`https://api.clickup.com/api/v2/list/${encodeURIComponent(cfg.listId)}`, { headers: { Authorization: cfg.token } });
    return `Connected to list “${list.name}”.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'token');
    const task = await request<{ status: { status: string; type: string } }>(`https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}`, {
      headers: { Authorization: cfg.token },
    });
    const type = task.status.type;
    return { status: type === 'closed' || type === 'done' ? 'resolved' : type === 'open' ? 'open' : 'in_progress', label: task.status.status };
  },
};

// ---------------------------------------------------------------- Asana

const ASANA = 'https://app.asana.com/api/1.0';

export const asana: Connector = {
  type: 'asana',
  label: 'Asana',
  description: 'Create a task in an Asana project, with attachments.',
  fields: [
    { key: 'token', label: 'Personal access token', type: 'password', required: true, help: 'My settings → Apps → Developer apps.' },
    { key: 'projectId', label: 'Project ID', type: 'text', required: true, help: 'The number in the project URL.' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'token', 'projectId');
    const headers = { Authorization: `Bearer ${cfg.token}` };
    const created = await request<{ data: { gid: string; permalink_url: string } }>(`${ASANA}/tasks?opt_fields=gid,permalink_url`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { name: ctx.title, notes: plainBody(ctx).slice(0, 60_000), projects: [cfg.projectId] } }),
    });
    for (const file of ctx.files) {
      const form = new FormData();
      form.append('parent', created.data.gid);
      form.append('file', await fileBlob(file), file.name);
      await request(`${ASANA}/attachments`, { method: 'POST', headers, body: form, timeoutMs: 120_000 });
    }
    return { externalId: created.data.gid, url: created.data.permalink_url };
  },
  async test(cfg) {
    required(cfg, 'token', 'projectId');
    const project = await request<{ data: { name: string } }>(`${ASANA}/projects/${encodeURIComponent(cfg.projectId)}?opt_fields=name`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    return `Connected to project “${project.data.name}”.`;
  },
  async fetchStatus(cfg, gid) {
    required(cfg, 'token');
    const task = await request<{ data: { completed: boolean } }>(`${ASANA}/tasks/${encodeURIComponent(gid)}?opt_fields=completed`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    return task.data.completed ? { status: 'resolved', label: 'Completed' } : { status: 'open', label: 'Incomplete' };
  },
};

// ---------------------------------------------------------------- Shortcut

const SHORTCUT = 'https://api.app.shortcut.com/api/v3';

export const shortcut: Connector = {
  type: 'shortcut',
  label: 'Shortcut',
  description: 'Create a bug story in Shortcut.',
  fields: [
    { key: 'token', label: 'API token', type: 'password', required: true, help: 'Settings → Your account → API Tokens.' },
    {
      key: 'workflowStateId',
      label: 'Workflow state ID',
      type: 'text',
      required: true,
      help: 'The state new bugs should start in (Settings → Workflows → click a state; the ID is in the URL).',
    },
  ],
  async send(ctx, cfg) {
    required(cfg, 'token', 'workflowStateId');
    const story = await request<{ id: number; app_url: string }>(`${SHORTCUT}/stories`, {
      method: 'POST',
      headers: { 'Shortcut-Token': cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ctx.title.slice(0, 512),
        description: markdownBody(ctx).slice(0, 100_000),
        story_type: 'bug',
        workflow_state_id: Number(cfg.workflowStateId),
        labels: [{ name: 'lumora' }],
      }),
    });
    return { externalId: String(story.id), displayId: `sc-${story.id}`, url: story.app_url };
  },
  async test(cfg) {
    required(cfg, 'token', 'workflowStateId');
    const me = await request<{ name: string }>(`${SHORTCUT}/member`, { headers: { 'Shortcut-Token': cfg.token } });
    return `Connected as ${me.name}.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'token');
    const story = await request<{ completed: boolean; started: boolean; workflow_state_id: number }>(`${SHORTCUT}/stories/${encodeURIComponent(id)}`, {
      headers: { 'Shortcut-Token': cfg.token },
    });
    let label = story.completed ? 'Done' : story.started ? 'In progress' : 'Unstarted';
    try {
      const workflowState = await request<{ name: string }>(`${SHORTCUT}/workflow-states/${story.workflow_state_id}`, { headers: { 'Shortcut-Token': cfg.token } });
      label = workflowState.name;
    } catch {
      // The derived label is good enough.
    }
    return { status: story.completed ? 'resolved' : story.started ? 'in_progress' : 'open', label };
  },
};

// ---------------------------------------------------------------- YouTrack

interface YouTrackCustomField {
  name: string;
  value?: { name?: string } | null;
}

export const youtrack: Connector = {
  type: 'youtrack',
  label: 'YouTrack',
  description: 'Create an issue in a JetBrains YouTrack project, with attachments.',
  fields: [
    { key: 'baseUrl', label: 'YouTrack URL', type: 'url', required: true, placeholder: 'https://yourcompany.youtrack.cloud' },
    { key: 'token', label: 'Permanent token', type: 'password', required: true, help: 'Profile → Account security → Tokens.' },
    { key: 'project', label: 'Project short name', type: 'text', required: true, placeholder: 'SUP' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'baseUrl', 'token', 'project');
    const base = normalizeBaseUrl(cfg.baseUrl);
    const headers = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' };
    const projectId = await youtrackProjectId(base, cfg);
    const issue = await request<{ id: string; idReadable: string }>(`${base}/api/issues?fields=id,idReadable`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: { id: projectId }, summary: ctx.title, description: markdownBody(ctx, false) }),
    });
    for (const file of ctx.files) {
      const form = new FormData();
      form.append('file', await fileBlob(file), file.name);
      await request(`${base}/api/issues/${issue.id}/attachments?fields=id`, { method: 'POST', headers, body: form, timeoutMs: 120_000 });
    }
    return { externalId: issue.idReadable, displayId: issue.idReadable, url: `${base}/issue/${issue.idReadable}` };
  },
  async test(cfg) {
    required(cfg, 'baseUrl', 'token', 'project');
    await youtrackProjectId(normalizeBaseUrl(cfg.baseUrl), cfg);
    return `Connected to project ${cfg.project.toUpperCase()}.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'baseUrl', 'token');
    const base = normalizeBaseUrl(cfg.baseUrl);
    const issue = await request<{ resolved: number | null; customFields?: YouTrackCustomField[] }>(
      `${base}/api/issues/${encodeURIComponent(id)}?fields=resolved,customFields(name,value(name))`,
      { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' } },
    );
    const state = issue.customFields?.find((f) => f.name === 'State')?.value?.name;
    if (issue.resolved) return { status: 'resolved', label: state ?? 'Resolved' };
    const inProgress = !!state && !/^(open|submitted|new|reopened|to do)$/i.test(state);
    return { status: inProgress ? 'in_progress' : 'open', label: state ?? 'Open' };
  },
};

async function youtrackProjectId(base: string, cfg: Record<string, string>): Promise<string> {
  const projects = await request<{ id: string; shortName: string }[]>(`${base}/api/admin/projects?fields=id,shortName&$top=500`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
  });
  const project = projects.find((p) => p.shortName.toUpperCase() === cfg.project.toUpperCase());
  if (!project) throw new ConnectorError(`No YouTrack project with short name ${cfg.project}`);
  return project.id;
}

// ---------------------------------------------------------------- Trello

const TRELLO = 'https://api.trello.com/1';

function trelloAuth(cfg: Record<string, string>): string {
  return `key=${encodeURIComponent(cfg.apiKey)}&token=${encodeURIComponent(cfg.token)}`;
}

export const trello: Connector = {
  type: 'trello',
  label: 'Trello',
  description: 'Add a card to a Trello list, with attachments.',
  fields: [
    { key: 'apiKey', label: 'API key', type: 'text', required: true, help: 'trello.com/power-ups/admin → your Power-Up → API key.' },
    { key: 'token', label: 'Token', type: 'password', required: true },
    { key: 'listId', label: 'List ID', type: 'text', required: true, help: 'Add .json to a card URL in that list and look for idList.' },
  ],
  async send(ctx, cfg) {
    required(cfg, 'apiKey', 'token', 'listId');
    const card = await request<{ id: string; shortUrl: string; idShort: number }>(`${TRELLO}/cards?${trelloAuth(cfg)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idList: cfg.listId, name: ctx.title, desc: markdownBody(ctx, false).slice(0, 16_000), pos: 'top' }),
    });
    for (const file of ctx.files.filter((f) => f.size < 10 * 1024 * 1024)) {
      const form = new FormData();
      form.append('file', await fileBlob(file), file.name);
      form.append('name', file.name);
      await request(`${TRELLO}/cards/${card.id}/attachments?${trelloAuth(cfg)}`, { method: 'POST', body: form, timeoutMs: 120_000 });
    }
    return { externalId: card.id, displayId: `#${card.idShort}`, url: card.shortUrl };
  },
  async test(cfg) {
    required(cfg, 'apiKey', 'token', 'listId');
    const list = await request<{ name: string }>(`${TRELLO}/lists/${encodeURIComponent(cfg.listId)}?fields=name&${trelloAuth(cfg)}`);
    return `Connected to list “${list.name}”.`;
  },
  async fetchStatus(cfg, id) {
    required(cfg, 'apiKey', 'token');
    const card = await request<{ closed: boolean; dueComplete?: boolean; list?: { name: string } }>(
      `${TRELLO}/cards/${encodeURIComponent(id)}?fields=closed,dueComplete&list=true&list_fields=name&${trelloAuth(cfg)}`,
    );
    if (card.closed) return { status: 'resolved', label: 'Archived' };
    const listName = card.list?.name ?? 'Open';
    if (card.dueComplete || /^(done|closed|resolved|complete[d]?)$/i.test(listName)) return { status: 'resolved', label: listName };
    return { status: /progress|doing|review|testing/i.test(listName) ? 'in_progress' : 'open', label: listName };
  },
};
