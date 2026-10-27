// The Overview dashboard: which cards exist, which plan each needs, and the ready-made layouts.
// One layout per organization, set by the account owner; everyone on the team sees the same one.

export type DashboardCardId =
  | 'kpi.reports'
  | 'kpi.withRecording'
  | 'kpi.withErrors'
  | 'kpi.open'
  | 'kpi.resolution'
  | 'kpi.deliveryFailures'
  | 'trend.reports'
  | 'trend.resolved'
  | 'recent'
  | 'byCategory'
  | 'byBrowser'
  | 'byOs'
  | 'byKind'
  | 'topPages'
  | 'topIssues'
  | 'peopleAffected'
  | 'byToolStatus'
  | 'byAssignee'
  | 'byPriority'
  | 'aging'
  | 'screenErrors';

/** S = a quarter of the row, M = half, L = the whole row. */
export type CardSize = 'S' | 'M' | 'L';

export interface DashboardCardDef {
  id: DashboardCardId;
  title: string;
  description: string;
  /** The plan that includes the card. Cards above the account's plan show with a lock. */
  plan: 'pro' | 'business';
  sizes: CardSize[];
  group: 'Numbers' | 'Trends' | 'Breakdowns' | 'Issues' | 'Team';
}

export interface DashboardItem {
  id: DashboardCardId;
  size: CardSize;
}

const KPI: CardSize[] = ['S'];
const BREAKDOWN: CardSize[] = ['S', 'M', 'L'];
const WIDE: CardSize[] = ['M', 'L'];

export const DASHBOARD_CARDS: DashboardCardDef[] = [
  { id: 'kpi.reports', title: 'Reports', description: 'Reports in the period and the change against the period before.', plan: 'pro', sizes: KPI, group: 'Numbers' },
  { id: 'kpi.withRecording', title: 'With a screen recording', description: 'Share of reports that came with a recording.', plan: 'pro', sizes: KPI, group: 'Numbers' },
  { id: 'kpi.withErrors', title: 'With console errors', description: 'Share of reports with an error in the console.', plan: 'pro', sizes: KPI, group: 'Numbers' },
  { id: 'kpi.open', title: 'Open now', description: 'Reports waiting for the team, and how many are in progress.', plan: 'business', sizes: KPI, group: 'Numbers' },
  { id: 'kpi.resolution', title: 'Median time to resolve', description: 'How long a report takes to be resolved in your tool.', plan: 'business', sizes: KPI, group: 'Numbers' },
  { id: 'kpi.deliveryFailures', title: 'Failed deliveries', description: 'Reports that couldn’t be sent to your tools.', plan: 'business', sizes: KPI, group: 'Numbers' },
  { id: 'trend.reports', title: 'Reports per day', description: 'How many reports arrive each day.', plan: 'pro', sizes: WIDE, group: 'Trends' },
  { id: 'trend.resolved', title: 'Reports and resolutions', description: 'Reports in and reports resolved, day by day.', plan: 'business', sizes: WIDE, group: 'Trends' },
  { id: 'recent', title: 'Latest reports', description: 'The newest reports with their linked ticket.', plan: 'pro', sizes: WIDE, group: 'Trends' },
  { id: 'byCategory', title: 'By category', description: 'Bugs, questions, ideas… as people chose them.', plan: 'pro', sizes: BREAKDOWN, group: 'Breakdowns' },
  { id: 'byBrowser', title: 'By browser', description: 'Which browsers the reports come from.', plan: 'pro', sizes: BREAKDOWN, group: 'Breakdowns' },
  { id: 'byOs', title: 'By operating system', description: 'Windows, macOS, iOS, Android…', plan: 'pro', sizes: BREAKDOWN, group: 'Breakdowns' },
  { id: 'byKind', title: 'How people reported', description: 'Screenshot, recording or text only.', plan: 'pro', sizes: BREAKDOWN, group: 'Breakdowns' },
  { id: 'topPages', title: 'Where people get stuck', description: 'The pages with the most reports.', plan: 'pro', sizes: BREAKDOWN, group: 'Breakdowns' },
  { id: 'topIssues', title: 'Top issues', description: 'Similar reports grouped into issues, most reported first.', plan: 'business', sizes: WIDE, group: 'Issues' },
  { id: 'peopleAffected', title: 'People affected', description: 'Issues ranked by how many different people reported them.', plan: 'business', sizes: WIDE, group: 'Issues' },
  { id: 'screenErrors', title: 'Errors people saw', description: 'Error messages shown on screen (toasts, alerts, Salesforce) that came with reports.', plan: 'business', sizes: WIDE, group: 'Issues' },
  { id: 'byToolStatus', title: 'By status in your tool', description: 'Open reports by their status in Jira, Zendesk, Linear…', plan: 'business', sizes: BREAKDOWN, group: 'Team' },
  { id: 'byAssignee', title: 'Open by assignee', description: 'Who has the open reports.', plan: 'business', sizes: BREAKDOWN, group: 'Team' },
  { id: 'byPriority', title: 'Open by priority', description: 'Urgent, high, medium and low among the open reports.', plan: 'business', sizes: BREAKDOWN, group: 'Team' },
  { id: 'aging', title: 'Waiting the longest', description: 'Open reports by age: under a week, 1–2 weeks, 2–4 weeks, older.', plan: 'business', sizes: BREAKDOWN, group: 'Team' },
];

export type DashboardPresetId = 'essentials' | 'product' | 'support' | 'engineering';

export const DASHBOARD_PRESETS: { id: DashboardPresetId; name: string; description: string; plan: 'pro' | 'business'; items: DashboardItem[] }[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    description: 'Volume, trend, categories and the latest reports.',
    plan: 'pro',
    items: [
      { id: 'kpi.reports', size: 'S' },
      { id: 'kpi.withRecording', size: 'S' },
      { id: 'kpi.withErrors', size: 'S' },
      { id: 'trend.reports', size: 'L' },
      { id: 'byCategory', size: 'M' },
      { id: 'recent', size: 'M' },
    ],
  },
  {
    id: 'product',
    name: 'Product',
    description: 'What hurts most and how many people it reaches.',
    plan: 'business',
    items: [
      { id: 'kpi.reports', size: 'S' },
      { id: 'kpi.open', size: 'S' },
      { id: 'kpi.withRecording', size: 'S' },
      { id: 'kpi.resolution', size: 'S' },
      { id: 'trend.resolved', size: 'L' },
      { id: 'peopleAffected', size: 'M' },
      { id: 'topPages', size: 'M' },
      { id: 'topIssues', size: 'M' },
      { id: 'byCategory', size: 'M' },
    ],
  },
  {
    id: 'support',
    name: 'Support',
    description: 'What’s open, who has it and what’s been waiting.',
    plan: 'business',
    items: [
      { id: 'kpi.reports', size: 'S' },
      { id: 'kpi.open', size: 'S' },
      { id: 'kpi.resolution', size: 'S' },
      { id: 'kpi.withErrors', size: 'S' },
      { id: 'trend.resolved', size: 'L' },
      { id: 'aging', size: 'S' },
      { id: 'byPriority', size: 'S' },
      { id: 'byAssignee', size: 'M' },
      { id: 'topIssues', size: 'M' },
      { id: 'byToolStatus', size: 'M' },
      { id: 'recent', size: 'L' },
    ],
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Errors, where they happen and on which devices.',
    plan: 'business',
    items: [
      { id: 'kpi.withErrors', size: 'S' },
      { id: 'kpi.deliveryFailures', size: 'S' },
      { id: 'kpi.open', size: 'S' },
      { id: 'kpi.resolution', size: 'S' },
      { id: 'screenErrors', size: 'M' },
      { id: 'topIssues', size: 'M' },
      { id: 'byBrowser', size: 'S' },
      { id: 'byOs', size: 'S' },
      { id: 'topPages', size: 'M' },
    ],
  },
];

/** What a dashboard shows before the owner customizes it. */
export function defaultDashboard(plan: 'free' | 'pro' | 'business'): DashboardItem[] {
  return structuredClone(DASHBOARD_PRESETS.find((p) => p.id === (plan === 'business' ? 'support' : 'essentials'))!.items);
}

export function dashboardCard(id: string): DashboardCardDef | undefined {
  return DASHBOARD_CARDS.find((c) => c.id === id);
}

/** Keeps known cards in allowed sizes, each once, in order. Returns null for anything that isn't a list. */
export function sanitizeDashboard(input: unknown): DashboardItem[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: DashboardItem[] = [];
  for (const raw of input.slice(0, 40)) {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    const def = dashboardCard(id);
    if (!def || seen.has(id)) continue;
    seen.add(id);
    out.push({ id: def.id, size: def.sizes.includes(raw.size) ? raw.size : def.sizes[0] });
  }
  return out;
}
