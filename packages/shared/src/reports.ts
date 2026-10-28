// How the report repository is displayed: layout, grouping, ordering and which properties show.
// Each person can change it for themselves; the account owner can set the default for everyone.

export type ReportLayout = 'list' | 'board' | 'issues';
export type ReportGroupBy = 'status' | 'priority' | 'category' | 'assignee';
export type ReportOrdering = 'newest' | 'oldest' | 'priority';
export type ReportProperty = 'id' | 'status' | 'priority' | 'assignee' | 'linked' | 'category' | 'page' | 'browser' | 'reporter' | 'errors' | 'received';

export interface ReportDisplay {
  layout: ReportLayout;
  /** Board columns. */
  groupBy: ReportGroupBy;
  ordering: ReportOrdering;
  /** Board: show columns with no reports. */
  showEmptyGroups: boolean;
  /** Board: show the resolved column / resolved reports. */
  showResolved: boolean;
  properties: ReportProperty[];
}

export const REPORT_PROPERTIES: { id: ReportProperty; label: string }[] = [
  { id: 'id', label: 'ID' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'linked', label: 'Linked ticket' },
  { id: 'category', label: 'Category' },
  { id: 'page', label: 'Page' },
  { id: 'browser', label: 'Browser' },
  { id: 'reporter', label: 'Reporter' },
  { id: 'errors', label: 'Errors' },
  { id: 'received', label: 'Received' },
];

export const DEFAULT_REPORT_DISPLAY: ReportDisplay = {
  layout: 'list',
  groupBy: 'status',
  ordering: 'newest',
  showEmptyGroups: true,
  showResolved: true,
  properties: ['id', 'status', 'priority', 'assignee', 'linked', 'errors', 'received'],
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Fills gaps with the defaults and drops anything unknown. Also reads the older saved-view layout ({ mode, columns }). */
export function sanitizeReportDisplay(input: unknown, base: ReportDisplay = DEFAULT_REPORT_DISPLAY): ReportDisplay {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const props = Array.isArray(raw.properties) ? raw.properties : Array.isArray(raw.columns) ? ['id', ...raw.columns] : null;
  const known = REPORT_PROPERTIES.map((p) => p.id);
  return {
    layout: pick(raw.layout ?? raw.mode, ['list', 'board', 'issues'] as const, base.layout),
    groupBy: pick(raw.groupBy, ['status', 'priority', 'category', 'assignee'] as const, base.groupBy),
    ordering: pick(raw.ordering, ['newest', 'oldest', 'priority'] as const, base.ordering),
    showEmptyGroups: typeof raw.showEmptyGroups === 'boolean' ? raw.showEmptyGroups : base.showEmptyGroups,
    showResolved: typeof raw.showResolved === 'boolean' ? raw.showResolved : base.showResolved,
    properties: props ? known.filter((id) => props.includes(id)) : [...base.properties],
  };
}

export function sameDisplay(a: ReportDisplay, b: ReportDisplay): boolean {
  return JSON.stringify(sanitizeReportDisplay(a)) === JSON.stringify(sanitizeReportDisplay(b));
}
