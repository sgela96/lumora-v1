// Help content shown in the integration forms and the Help panel.

/** Where to find the credentials each connector asks for. */
export const SETUP_GUIDES: Record<string, string[]> = {
  jira: [
    'Your site URL is the address you open Jira at, like https://yourcompany.atlassian.net.',
    'Create an API token at id.atlassian.com → Security → Create and manage API tokens.',
    'Use the e-mail of the Atlassian account that created the token.',
    'The project key is the prefix of your issues (SUP in SUP-123).',
  ],
  azure_devops: [
    'The organization is the first part of dev.azure.com/<organization>.',
    'Create a personal access token in User settings → Personal access tokens with “Work Items: Read & write”.',
    'Use the project name exactly as it appears in Azure DevOps.',
  ],
  github: [
    'Create a fine-grained token at github.com → Settings → Developer settings → Personal access tokens.',
    'Give it access to the repository with “Issues: Read and write” (and “Webhooks: Read and write” for live status).',
    'Write the repository as owner/repo.',
  ],
  gitlab: [
    'Create an access token in GitLab → Preferences → Access tokens with the “api” scope.',
    'Use the project path (group/project) or its numeric ID.',
    'Self-managed GitLab? Put your instance URL in “Base URL”.',
  ],
  linear: ['Create a personal API key in Linear → Settings → Account → Security & access.', 'The team key is the prefix of your issues (ENG in ENG-42).'],
  clickup: ['Copy your personal token in ClickUp → Settings → Apps.', 'Open the list where tasks should go; its ID is the number in the URL after /li/.'],
  asana: ['Create a personal access token in Asana → My settings → Apps → Developer apps.', 'Open the project; its ID is the long number in the URL.'],
  shortcut: ['Create an API token in Shortcut → Settings → API Tokens.', 'The workflow state ID is in Settings → Workflows; pick the state new stories should start in.'],
  youtrack: ['Create a permanent token in YouTrack → Profile → Account security.', 'Use the short name of the project (shown in issue IDs like WEB-12).'],
  trello: ['Get your API key and generate a token at trello.com/power-ups/admin.', 'Open the list’s card menu → “Copy link”; Lumora needs the list ID from the board’s JSON (add .json to the board URL).'],
  zendesk: [
    'Your subdomain is the first part of yourcompany.zendesk.com.',
    'Turn on token access and create a token in Admin Center → Apps and integrations → Zendesk API.',
    'Use the e-mail of an agent or admin.',
  ],
  freshdesk: ['Your domain is yourcompany.freshdesk.com.', 'Copy your API key from Profile settings (top right) → View API key.'],
  hubspot: ['Create a private app in HubSpot → Settings → Integrations → Private apps.', 'Give it the “tickets” scope and copy the access token.'],
  salesforce: [
    'Create an External Client App (or Connected App) in Setup with OAuth enabled.',
    'Enable the Client Credentials Flow and set a “Run As” user who can create Cases.',
    'Copy the consumer key and secret; use your My Domain URL.',
  ],
  servicenow: ['Use your instance name (yourcompany in yourcompany.service-now.com).', 'Create an integration user with the itil role, then use its username and password.'],
  freshservice: ['Your domain is yourcompany.freshservice.com.', 'Copy your API key from Profile settings.'],
  slack: ['In Slack, create an app → Incoming Webhooks → turn on → “Add New Webhook to Workspace”.', 'Pick the channel and copy the webhook URL.'],
  webhook: ['Any HTTPS endpoint that accepts JSON works: your backend, Zapier, Make or n8n.', 'Set a signing secret to verify requests with the X-Lumora-Signature header.'],
  email: ['Write the inbox that should receive reports, like support@yourcompany.com.', 'Many help desks turn e-mails into tickets automatically.'],
};

/** Turns a failed connection test into what to check. */
export function troubleshoot(message: string): string | null {
  const m = message.toLowerCase();
  if (/\b401\b|unauthori[sz]ed|invalid.*(token|key|credential)|authentication/.test(m)) return 'The credentials were rejected. Check the token or API key is complete, not expired, and belongs to the account you entered.';
  if (/\b403\b|forbidden|permission|scope/.test(m)) return 'The credentials work but lack permission. Give the token access to this project and the right to create issues or tickets.';
  if (/\b404\b|not found|no .* with key|does not exist/.test(m)) return 'Something you named wasn’t found: check the project key, repository, list or site URL for typos.';
  if (/could not reach|enotfound|getaddrinfo|timeout|timed out|econnrefused/.test(m)) return 'Lumora couldn’t reach the tool. Check the URL or subdomain, and that the service isn’t behind a VPN or firewall.';
  if (/\b429\b|rate limit/.test(m)) return 'The tool is rate-limiting requests. Wait a minute and test again.';
  if (/smtp/.test(m)) return 'E-mail needs SMTP configured on the Lumora server (SMTP_URL).';
  if (/https/.test(m)) return 'The URL must start with https://.';
  return null;
}

export interface HelpArticle {
  id: string;
  title: string;
  body: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'install',
    title: 'Install the widget',
    body: [
      'Copy the snippet from Settings → Install and paste it before </body> on every page of your app.',
      'Single-page apps (React, Vue, Angular) only need it once, in the HTML template.',
      'Using Google Tag Manager? Add it as a Custom HTML tag on all pages.',
      'The setup checklist turns green as soon as the widget loads on your site.',
    ],
  },
  {
    id: 'not-showing',
    title: 'The widget doesn’t show up',
    body: [
      'Open your browser console: Lumora prints a warning starting with [Lumora] that says why.',
      '“This site is not allowed”: add your domain in Settings → General → Allowed domains (or leave the list empty).',
      'Check the data-key in the snippet matches the one in Settings → General.',
      'A strict Content-Security-Policy must allow the Lumora script and API domain.',
    ],
  },
  {
    id: 'identify',
    title: 'Send who the user is',
    body: [
      'Call Lumora(“identify”, { id, email, name }) after sign-in; add any extra field like plan or tenant.',
      'It works even before the script has loaded, thanks to the small queue snippet in Settings → Install.',
    ],
  },
  {
    id: 'connect',
    title: 'Connect your ticketing tool',
    body: [
      'Settings → Integrations → pick your tool. Each form has a “Where do I find this?” guide.',
      'Lumora tests the connection when you save and tells you what to fix if it fails.',
      'Tickets follow your template (Settings → Ticket template), converted to each tool’s format.',
    ],
  },
  {
    id: 'status',
    title: 'Live ticket status (Business)',
    body: [
      'Lumora checks the status of linked tickets every couple of minutes automatically.',
      'For instant updates, open the integration and click “Set up automatically”; for tools that don’t allow it, follow the steps shown and paste the URL.',
      'The integration shows when the last update arrived, so you can see it’s working.',
    ],
  },
  {
    id: 'ai',
    title: 'AI Powered reports',
    body: [
      'Turn it on in Settings → Data capture (Pro extra, included in Business).',
      'When a recording has the user’s voice, Lumora transcribes it, then writes a summary, steps, expected vs. actual, a suggested priority, possible duplicates and the likely cause.',
      'Everything is written in your team’s language, set in Settings → Widget → Language.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    body: [
      'What users type is never sent; steps only name the field. Passwords and card fields are always hidden.',
      'E-mails, card numbers and tokens are removed in the browser before anything is sent.',
      'Hide sensitive parts of your app in screenshots with CSS selectors (Settings → Data capture, Business).',
    ],
  },
];
