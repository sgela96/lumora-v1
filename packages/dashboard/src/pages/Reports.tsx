import type { TicketStatus } from '@lumora/shared';
import { useEffect, useMemo, useState, type DragEvent, type ReactElement, type ReactNode } from 'react';
import { api, PRIORITIES, type IssueGroup, type Priority, type Project, type RemoteStatus, type SavedView, type TicketList, type TicketSummary, type Workflow } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { Avatar, Nebula, PageHead, PriorityIcon, priorityLabel, PriorityPicker, Segmented, StatusBadge, StatusPicker, timeAgo, useDismiss, useToast } from '../components/ui';
import { navigate, useApp, useHashQuery, useWorkflow } from '../state';

const KIND: Record<string, { icon: (p: { size?: number }) => ReactElement; label: string }> = {
  screenshot: { icon: Icons.camera, label: 'Screenshot' },
  recording: { icon: Icons.video, label: 'Recording' },
  describe: { icon: Icons.text, label: 'Text only' },
};

const PAGE = 50;
const FILTER_KEYS = ['category', 'kind', 'browser', 'page', 'issue', 'range', 'hasErrors', 'hasRecording', 'delivery', 'priority', 'assignee', 'external', 'q'] as const;
/** Everything a saved view stores in its query (filters, status, sort). */
const VIEW_KEYS = [...FILTER_KEYS, 'status', 'sort'] as const;

type ColumnId = 'status' | 'priority' | 'assignee' | 'linked' | 'category' | 'page' | 'browser' | 'reporter' | 'received';
const COLUMNS: { id: ColumnId; label: string; num?: boolean }[] = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'linked', label: 'Linked ticket' },
  { id: 'category', label: 'Category' },
  { id: 'page', label: 'Page' },
  { id: 'browser', label: 'Browser' },
  { id: 'reporter', label: 'Reporter' },
  { id: 'received', label: 'Received', num: true },
];
const DEFAULT_COLUMNS: ColumnId[] = ['status', 'priority', 'assignee', 'linked', 'received'];
const BASIC_COLUMNS: ColumnId[] = ['linked', 'reporter', 'received'];
const COLUMNS_KEY = 'lumora-report-columns';

type GroupBy = 'status' | 'priority' | 'category' | 'assignee';

function storedColumns(): ColumnId[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    if (Array.isArray(saved)) return saved.filter((c) => COLUMNS.some((k) => k.id === c));
  } catch {
    /* private mode */
  }
  return DEFAULT_COLUMNS;
}

export function ReportsPage({ project }: { project: Project }) {
  const { me } = useApp();
  const toast = useToast();
  const supportCenter = me.limits.features.supportCenter;
  const workflow = useWorkflow(project.id, supportCenter);
  const [params, setParams] = useHashQuery();
  const mode = supportCenter ? ((params.get('mode') as 'list' | 'board' | 'issues' | null) ?? 'list') : 'list';
  const groupBy = (params.get('group') as GroupBy | null) ?? 'status';
  const status = (supportCenter && mode === 'list' ? params.get('status') ?? 'open' : 'all') as TicketStatus | 'all';
  const [list, setList] = useState<TicketList | null>(null);
  const [issues, setIssues] = useState<IssueGroup[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [columns, setColumnsState] = useState<ColumnId[]>(storedColumns);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [views, setViews] = useState<SavedView[]>([]);
  const [reload, setReload] = useState(0);

  const setColumns = (next: ColumnId[]) => {
    setColumnsState(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (params.get('sort')) query.set('sort', params.get('sort')!);
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (!v) continue;
    if (k === 'range') query.set('from', new Date(Date.now() - Number(v) * 86400_000).toISOString().slice(0, 10));
    else query.set(k, v);
  }
  const queryString = query.toString();
  const pageSize = mode === 'board' ? 200 : limit;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (mode === 'issues') return api<IssueGroup[]>(`/projects/${project.id}/issues?${queryString}`).then((r) => !cancelled && setIssues(r));
      return api<TicketList>(`/projects/${project.id}/tickets?${queryString}&limit=${pageSize}`).then((r) => !cancelled && setList(r));
    };
    load();
    // New reports and synced statuses show up without a refresh.
    const poll = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [project.id, queryString, mode, pageSize, reload]);

  useEffect(() => {
    if (supportCenter) api<SavedView[]>(`/projects/${project.id}/views`).then(setViews, () => {});
  }, [project.id, supportCenter]);

  useEffect(() => {
    const t = setTimeout(() => params.get('q') !== search && setParams({ q: search || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The selection only makes sense for what's on screen.
  useEffect(() => setSelected(new Set()), [queryString, mode]);

  const activeFilters = FILTER_KEYS.filter((k) => k !== 'q' && params.get(k));
  const counts = list?.counts;
  const shownColumns = supportCenter ? COLUMNS.filter((c) => columns.includes(c.id)) : COLUMNS.filter((c) => BASIC_COLUMNS.includes(c.id));

  // The view that matches the current query exactly is highlighted.
  const currentViewQuery = viewQuery(params);
  const activeView = views.find((v) => v.query === currentViewQuery && (v.layout.mode ?? 'list') === mode && (mode !== 'board' || (v.layout.groupBy ?? 'status') === groupBy));

  const applyView = (v: SavedView | null) => {
    const next: Record<string, string | undefined> = Object.fromEntries(VIEW_KEYS.map((k) => [k, undefined]));
    if (v) for (const [k, val] of new URLSearchParams(v.query)) next[k] = val;
    next.mode = v?.layout.mode && v.layout.mode !== 'list' ? v.layout.mode : undefined;
    next.group = v?.layout.groupBy;
    setParams(next);
    setSearch(next.q ?? '');
    if (v?.layout.columns?.length) setColumns(v.layout.columns as ColumnId[]);
    setLimit(PAGE);
  };

  const saveView = async (name: string) => {
    const view = await api<SavedView>(`/projects/${project.id}/views`, {
      body: { name, query: currentViewQuery, layout: { mode, groupBy: mode === 'board' ? groupBy : undefined, columns } },
    });
    setViews([...views, view]);
    toast(`Saved “${name}”`);
  };

  const deleteView = async (v: SavedView) => {
    await api(`/views/${v.id}`, { method: 'DELETE', body: {} });
    setViews(views.filter((x) => x.id !== v.id));
  };

  const bulk = async (patch: object, label: string) => {
    const ids = [...selected];
    try {
      const r = await api<{ results: { ok: boolean; error?: string }[] }>(`/projects/${project.id}/tickets/bulk`, { body: { ids, patch } });
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length) toast(`${r.results.length - failed.length} updated, ${failed.length} failed: ${failed[0].error}`, true);
      else toast(`${label} on ${ids.length} report${ids.length > 1 ? 's' : ''}`);
      setSelected(new Set());
      setReload((n) => n + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  const statusPatch = (s: RemoteStatus) => (workflow?.source === 'tool' ? { externalStatus: s.name } : { status: s.category });

  return (
    <div className="stack">
      <PageHead
        title="Reports"
        subtitle={supportCenter ? 'Every report from your app, with its live status in your ticketing tools.' : `Reports from the last ${list?.historyDays ?? me.limits.historyDays} days.`}
        actions={<input className="input input-search" placeholder="Search" aria-label="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />}
      />

      {!supportCenter && (
        <div className="notice notice-accent spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span>
            Every report from the last {list?.historyDays ?? me.limits.historyDays} days, with its screenshot, steps and console. <strong>Business</strong> adds statuses synced
            from your tools, priorities, a board, saved views and similar reports grouped into issues.
          </span>
          <a className="btn btn-sm" href="#/billing" style={{ textDecoration: 'none' }}>
            See Business
          </a>
        </div>
      )}

      {supportCenter && (
        <div className="views-bar" role="tablist" aria-label="Saved views">
          <button role="tab" aria-selected={!activeView && !currentViewQuery && mode === 'list'} className="view-tab" onClick={() => applyView(null)}>
            All reports
          </button>
          {views.map((v) => (
            <span key={v.id} className="view-tab-wrap">
              <button role="tab" aria-selected={activeView?.id === v.id} className="view-tab" onClick={() => applyView(v)}>
                {v.layout.mode === 'board' ? <Icons.board size={14} /> : <Icons.bookmark size={14} />}
                {v.name}
              </button>
              <button className="view-remove" aria-label={`Delete view ${v.name}`} title="Delete view" onClick={() => deleteView(v)}>
                <Icons.x size={12} />
              </button>
            </span>
          ))}
          {!activeView && (currentViewQuery || mode !== 'list') && <SaveViewButton onSave={saveView} />}
        </div>
      )}

      {supportCenter && (
        <div className="spread" style={{ flexWrap: 'wrap' }}>
          {mode === 'list' ? (
            <Segmented
              label="Status"
              value={status}
              onChange={(v) => {
                setLimit(PAGE);
                setParams({ status: v });
              }}
              options={[
                { value: 'open', label: 'Open', count: counts?.open },
                { value: 'in_progress', label: 'In progress', count: counts?.in_progress },
                { value: 'resolved', label: 'Resolved', count: counts?.resolved },
                { value: 'all', label: 'All', count: counts?.all },
              ]}
            />
          ) : mode === 'board' ? (
            <div className="row small" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <span className="muted">Group by</span>
              <select className="select select-sm" aria-label="Group by" value={groupBy} onChange={(e) => setParams({ group: e.target.value === 'status' ? undefined : e.target.value })}>
                <option value="status">{workflow?.source === 'tool' ? `${workflow.tool!.name} status` : 'Status'}</option>
                <option value="priority">Priority</option>
                <option value="category">Category</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>
          ) : (
            <span />
          )}
          <div className="row">
            {mode === 'list' && <ColumnChooser columns={columns} onChange={setColumns} />}
            <Segmented
              label="Layout"
              value={mode}
              onChange={(v) => setParams({ mode: v === 'list' ? undefined : v, status: v === 'list' ? params.get('status') ?? undefined : undefined })}
              options={[
                { value: 'list', label: <><Icons.list size={14} /> List</> },
                { value: 'board', label: <><Icons.board size={14} /> Board</> },
                { value: 'issues', label: <><Icons.layers size={14} /> Issues</> },
              ]}
            />
          </div>
        </div>
      )}

      {supportCenter && mode !== 'issues' && <Filters list={list} params={params} setParams={setParams} activeFilters={activeFilters} workflow={workflow} />}

      {params.get('issue') && list?.items[0]?.issue && (
        <div className="notice spread">
          <span>
            Showing reports of one issue: <strong>{list.items[0].issue.label}</strong>
          </span>
          <button className="btn btn-sm" onClick={() => setParams({ issue: undefined })}>
            Show all
          </button>
        </div>
      )}

      {mode === 'issues' ? (
        <section className="card">
          <IssuesTable issues={issues} onOpen={(i) => setParams({ mode: undefined, issue: i.fingerprint, status: 'all' })} />
        </section>
      ) : !list ? (
        <section className="card">
          <div className="empty muted">Loading…</div>
        </section>
      ) : list.items.length === 0 && mode === 'list' ? (
        <section className="card">
          <EmptyState project={project} filtered={activeFilters.length > 0 || !!params.get('q') || status !== 'all'} />
        </section>
      ) : mode === 'board' ? (
        <Board
          items={list.items}
          projectId={project.id}
          groupBy={groupBy}
          workflow={workflow}
          facets={list.facets}
          onMove={async (t, patch) => {
            setList({ ...list, items: list.items.map((x) => (x.id === t.id ? { ...x, ...optimistic(patch, workflow) } : x)) });
            try {
              await api(`/tickets/${t.id}`, { method: 'PATCH', body: patch });
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), true);
            }
            setReload((n) => n + 1);
          }}
        />
      ) : (
        <section className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  {supportCenter && (
                    <th className="check-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={selected.size > 0 && selected.size === list.items.length}
                        ref={(el) => void (el && (el.indeterminate = selected.size > 0 && selected.size < list.items.length))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(list.items.map((t) => t.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>
                    {supportCenter ? (
                      <button className="th-sort" onClick={() => setParams({ sort: params.get('sort') === 'oldest' ? undefined : 'oldest' })}>
                        Report {params.get('sort') === 'oldest' ? <Icons.chevronUp size={12} /> : params.get('sort') ? null : <Icons.chevronDown size={12} />}
                      </button>
                    ) : (
                      'Report'
                    )}
                  </th>
                  {shownColumns.map((c) => (
                    <th key={c.id} className={c.num ? 'num' : undefined}>
                      {c.id === 'priority' ? (
                        <button className="th-sort" onClick={() => setParams({ sort: params.get('sort') === 'priority' ? undefined : 'priority' })}>
                          Priority {params.get('sort') === 'priority' && <Icons.chevronDown size={12} />}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.items.map((t) => (
                  <ReportRow
                    key={t.id}
                    ticket={t}
                    projectId={project.id}
                    columns={shownColumns.map((c) => c.id)}
                    selectable={supportCenter}
                    selected={selected.has(t.id)}
                    onSelect={(on) => {
                      const next = new Set(selected);
                      if (on) next.add(t.id);
                      else next.delete(t.id);
                      setSelected(next);
                    }}
                    workflow={workflow}
                    onPatch={async (patch) => {
                      try {
                        const updated = await api<TicketSummary>(`/tickets/${t.id}`, { method: 'PATCH', body: patch });
                        setList({ ...list, items: list.items.map((x) => (x.id === t.id ? { ...x, ...updated } : x)) });
                      } catch (e) {
                        toast(e instanceof Error ? e.message : String(e), true);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
            {list.total > list.items.length && (
              <div style={{ textAlign: 'center', padding: 14 }}>
                <button className="btn btn-sm" onClick={() => setLimit(limit + PAGE)}>
                  Show more ({list.total - list.items.length})
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar card" role="toolbar" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          <StatusPicker value="open" placeholder="Set status" statuses={workflow?.statuses} onChange={(s) => bulk(statusPatch(s), `Moved to “${s.name}”`)} />
          <PriorityPicker value={null} placeholder="Set priority" onChange={(p) => bulk({ priority: p ?? 'none' }, `Priority set to ${priorityLabel(p)}`)} />
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/** The filter and sort part of the hash query, in a stable order, as a saved view stores it. */
function viewQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const k of VIEW_KEYS) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  return q.toString();
}

/** What a board move looks like before the server answers. */
function optimistic(patch: Record<string, unknown>, workflow: Workflow | null): Partial<TicketSummary> {
  if ('priority' in patch) return { priority: patch.priority === 'none' ? null : (patch.priority as Priority) };
  if ('category' in patch) return { category: (patch.category as string) || null };
  if ('externalStatus' in patch) {
    const s = workflow?.statuses.find((x) => x.name === patch.externalStatus);
    return { externalStatus: patch.externalStatus as string, status: s?.category ?? 'open' };
  }
  if ('status' in patch) return { status: patch.status as TicketStatus, externalStatus: null };
  return {};
}

function SaveViewButton({ onSave }: { onSave: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="status-picker" ref={ref}>
      <button className="view-tab view-add" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icons.plus size={14} /> Save view
      </button>
      {open && (
        <form
          className="status-menu card align-left stack-sm"
          style={{ padding: 12, width: 260 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await onSave(name.trim());
            setName('');
            setOpen(false);
          }}
        >
          <label className="label" htmlFor="view-name">
            Name this view
          </label>
          <input id="view-name" className="input" autoFocus placeholder="Urgent bugs on checkout" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <span className="muted small">Saves the filters, sort, layout and columns you see now.</span>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'end' }}>
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function ColumnChooser({ columns, onChange }: { columns: ColumnId[]; onChange: (c: ColumnId[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="status-picker" ref={ref}>
      <button className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.columns size={14} /> Columns
      </button>
      {open && (
        <div className="status-menu card align-right" role="group" aria-label="Columns">
          <div className="menu-head">Show columns</div>
          {COLUMNS.map((c) => {
            const on = columns.includes(c.id);
            return (
              <label key={c.id} className="menu-check">
                <input type="checkbox" checked={on} onChange={() => onChange(on ? columns.filter((x) => x !== c.id) : COLUMNS.map((k) => k.id).filter((id) => id === c.id || columns.includes(id)))} />
                {c.label}
              </label>
            );
          })}
          <button className="menu-reset" onClick={() => onChange(DEFAULT_COLUMNS)}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}

function Filters({
  list,
  params,
  setParams,
  activeFilters,
  workflow,
}: {
  list: TicketList | null;
  params: URLSearchParams;
  setParams: (next: Record<string, string | undefined>) => void;
  activeFilters: readonly string[];
  workflow: Workflow | null;
}) {
  const select = (key: string, label: string, all: string, options: { value: string; label: string }[]) => (
    <select className="select" aria-label={label} value={params.get(key) ?? ''} onChange={(e) => setParams({ [key]: e.target.value })}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const facet = (k: keyof TicketList['facets']) => (list?.facets[k] ?? []).map((f) => ({ value: f.value, label: f.value }));
  return (
    <div className="filters">
      {workflow?.source === 'tool' && select('external', `${workflow.tool!.name} status`, `Any ${workflow.tool!.name} status`, workflow.statuses.map((s) => ({ value: s.name, label: s.name })))}
      {select('priority', 'Priority', 'Any priority', [...PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) })), { value: 'none', label: 'No priority' }])}
      {select('assignee', 'Assignee', 'Anyone', [...facet('assignee'), { value: 'none', label: 'Unassigned' }])}
      {select('category', 'Category', 'All categories', facet('category'))}
      {select('kind', 'Type', 'Any capture', [
        { value: 'screenshot', label: 'Screenshot' },
        { value: 'recording', label: 'Recording' },
        { value: 'describe', label: 'Text only' },
      ])}
      {select('page', 'Page', 'All pages', facet('page'))}
      {select('browser', 'Browser', 'All browsers', facet('browser'))}
      {select('range', 'Date range', 'Any time', [
        { value: '1', label: 'Last 24 hours' },
        { value: '7', label: 'Last 7 days' },
        { value: '30', label: 'Last 30 days' },
      ])}
      <select
        className="select"
        aria-label="More filters"
        value={params.get('hasErrors') ? 'errors' : params.get('hasRecording') ? 'recording' : params.get('delivery') ? 'failed' : ''}
        onChange={(e) =>
          setParams({
            hasErrors: e.target.value === 'errors' ? '1' : undefined,
            hasRecording: e.target.value === 'recording' ? '1' : undefined,
            delivery: e.target.value === 'failed' ? 'failed' : undefined,
          })
        }
      >
        <option value="">Everything</option>
        <option value="errors">With console errors</option>
        <option value="recording">With a recording</option>
        <option value="failed">Delivery failed</option>
      </select>
      {activeFilters.length > 0 && (
        <button className="btn btn-sm btn-ghost" onClick={() => setParams(Object.fromEntries(activeFilters.map((k) => [k, undefined])))}>
          Clear filters
        </button>
      )}
    </div>
  );
}

function LinkedChip({ ticket: t }: { ticket: TicketSummary }) {
  const linked = t.deliveries.find((d) => d.status === 'sent' && (d.displayId || d.externalId));
  if (linked)
    return (
      <span className="ref-chip" title={linked.name}>
        <LogoTile type={linked.type} />
        {linked.displayId ?? linked.externalId}
      </span>
    );
  if (t.deliveries.some((d) => d.status === 'failed')) return <span className="badge badge-danger">Delivery failed</span>;
  return <span className="muted small">—</span>;
}

function ReportRow({
  ticket: t,
  projectId,
  columns,
  selectable,
  selected,
  onSelect,
  workflow,
  onPatch,
}: {
  ticket: TicketSummary;
  projectId: string;
  columns: ColumnId[];
  selectable: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  workflow: Workflow | null;
  onPatch: (patch: object) => Promise<void>;
}) {
  const kind = KIND[t.kind] ?? KIND.describe;
  const cell: Record<ColumnId, ReactNode> = {
    status: <StatusPicker value={t.status} label={t.externalStatus} statuses={workflow?.statuses} onChange={(s) => onPatch(workflow?.source === 'tool' ? { externalStatus: s.name } : { status: s.category })} align="left" />,
    priority: <PriorityPicker value={t.priority} onChange={(p) => onPatch({ priority: p ?? 'none' })} align="left" />,
    assignee: t.assignee ? (
      <span className="row small" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <Avatar name={t.assignee.name} /> <span className="ellipsis">{t.assignee.name}</span>
      </span>
    ) : (
      <span className="muted small">—</span>
    ),
    linked: <LinkedChip ticket={t} />,
    category: t.category ? <span className="small">{t.category}</span> : <span className="muted small">—</span>,
    page: <span className="small mono ellipsis" style={{ maxWidth: 180, display: 'inline-block' }}>{t.pagePath ?? '—'}</span>,
    browser: <span className="small">{t.browser ?? '—'}</span>,
    reporter: <span className="small">{t.reporterEmail ?? <span className="muted">Anonymous</span>}</span>,
    received: <span className="muted small">{timeAgo(t.createdAt)}</span>,
  };
  return (
    <tr className={`clickable${selected ? ' selected' : ''}`} onClick={() => navigate(`/p/${projectId}/reports/${t.id}`)}>
      {selectable && (
        <td className="check-cell" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" aria-label={`Select ${t.reference}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        </td>
      )}
      <td>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
          <span className="kind-icon" title={kind.label}>
            <kind.icon size={16} />
          </span>
          <div className="title-cell">
            <a className="t" href={`#/p/${projectId}/reports/${t.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
              {t.title}
            </a>
            <span className="sub">
              <span className="mono">{t.reference}</span>
              {!columns.includes('category') && t.category && <span>· {t.category}</span>}
              {!columns.includes('page') && t.pagePath && <span>· {t.pagePath}</span>}
              {t.errorCount > 0 && (
                <span className="badge badge-danger" style={{ padding: '0 6px' }}>
                  {t.errorCount} error{t.errorCount > 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
        </div>
      </td>
      {columns.map((c) => (
        <td key={c} className={c === 'received' ? 'num' : undefined} style={{ whiteSpace: 'nowrap' }}>
          {cell[c]}
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------- Board

interface Lane {
  id: string;
  title: ReactNode;
  /** The change that moves a card into this lane; null when the lane can't be dropped on. */
  patch: Record<string, string> | null;
  match: (t: TicketSummary) => boolean;
}

function lanesFor(groupBy: GroupBy, workflow: Workflow | null, items: TicketSummary[], facets: TicketList['facets']): Lane[] {
  if (groupBy === 'priority')
    return [...PRIORITIES, null].map((p) => ({
      id: p ?? 'none',
      title: (
        <>
          <PriorityIcon priority={p} /> {priorityLabel(p)}
        </>
      ),
      patch: { priority: p ?? 'none' },
      match: (t) => t.priority === p,
    }));
  if (groupBy === 'category') {
    const names = [...new Set([...facets.category.map((f) => f.value), ...items.map((t) => t.category).filter((c): c is string => !!c)])];
    return [
      ...names.map((c) => ({ id: c, title: c, patch: { category: c }, match: (t: TicketSummary) => t.category === c })),
      { id: '__none', title: 'No category', patch: { category: '' }, match: (t) => !t.category },
    ];
  }
  if (groupBy === 'assignee') {
    const names = [...new Set(items.map((t) => t.assignee?.name).filter((n): n is string => !!n))];
    return [
      ...names.map((n) => ({
        id: n,
        title: (
          <>
            <Avatar name={n} size={20} /> {n}
          </>
        ),
        patch: null,
        match: (t: TicketSummary) => t.assignee?.name === n,
      })),
      { id: '__none', title: 'Unassigned', patch: null, match: (t) => !t.assignee },
    ];
  }
  const statuses = workflow?.statuses ?? [];
  if (workflow?.source === 'tool' && statuses.length) {
    // A report without a tool status sits in the first status of its category.
    const home = (t: TicketSummary) => statuses.find((s) => s.name === t.externalStatus) ?? statuses.find((s) => s.category === t.status) ?? statuses[0];
    return statuses.map((s) => ({ id: s.name, title: <StatusBadge status={s.category} label={s.name} />, patch: { externalStatus: s.name }, match: (t) => home(t).name === s.name }));
  }
  return (['open', 'in_progress', 'resolved'] as TicketStatus[]).map((s) => ({ id: s, title: <StatusBadge status={s} />, patch: { status: s }, match: (t) => t.status === s }));
}

function Board({
  items,
  projectId,
  groupBy,
  workflow,
  facets,
  onMove,
}: {
  items: TicketSummary[];
  projectId: string;
  groupBy: GroupBy;
  workflow: Workflow | null;
  facets: TicketList['facets'];
  onMove: (t: TicketSummary, patch: Record<string, string>) => void;
}) {
  const lanes = useMemo(() => lanesFor(groupBy, workflow, items, facets), [groupBy, workflow, items, facets]);
  const [dragging, setDragging] = useState<TicketSummary | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (lane: Lane) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    if (dragging && lane.patch && !lane.match(dragging)) onMove(dragging, lane.patch);
    setDragging(null);
  };

  return (
    <div className="board" role="list">
      {lanes.map((lane) => {
        const cards = items.filter(lane.match);
        const droppable = !!dragging && !!lane.patch && !lane.match(dragging);
        return (
          <section
            key={lane.id}
            className={`lane${over === lane.id && droppable ? ' over' : ''}${dragging && !lane.patch ? ' locked' : ''}`}
            role="listitem"
            aria-label={typeof lane.title === 'string' ? lane.title : lane.id}
            onDragOver={(e) => {
              if (!droppable) return;
              e.preventDefault();
              setOver(lane.id);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
            onDrop={drop(lane)}
          >
            <header className="lane-head">
              <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                {lane.title}
              </span>
              <span className="lane-count">{cards.length}</span>
            </header>
            <div className="lane-cards">
              {cards.map((t) => (
                <a
                  key={t.id}
                  href={`#/p/${projectId}/reports/${t.id}`}
                  className={`board-card${dragging?.id === t.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', t.id);
                    setDragging(t);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  <span className="board-card-title">{t.title}</span>
                  <span className="board-card-meta">
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
                      {groupBy !== 'priority' && <PriorityIcon priority={t.priority} />}
                      <span className="mono muted">{t.reference}</span>
                      {t.errorCount > 0 && <span className="badge badge-danger" style={{ padding: '0 6px' }}>{t.errorCount}</span>}
                    </span>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      {groupBy !== 'status' && t.externalStatus && <span className="muted small ellipsis">{t.externalStatus}</span>}
                      {groupBy !== 'assignee' && t.assignee && <Avatar name={t.assignee.name} size={20} />}
                    </span>
                  </span>
                </a>
              ))}
              {cards.length === 0 && <div className="lane-empty muted small">{droppable ? 'Drop here' : 'Nothing here'}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function IssuesTable({ issues, onOpen }: { issues: IssueGroup[] | null; onOpen: (i: IssueGroup) => void }) {
  if (!issues) return <div className="empty muted">Loading…</div>;
  if (!issues.length) return <div className="empty muted">No issues match these filters.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Issue</th>
            <th className="num">Reports</th>
            <th className="num">Unresolved</th>
            <th className="num" title="Different people who reported it">People affected</th>
            <th className="num">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.fingerprint} className="clickable" onClick={() => onOpen(i)}>
              <td>
                <div className="title-cell">
                  <span className="t">{i.label}</span>
                  <span className="sub">
                    First seen {timeAgo(i.firstSeen)}
                    {i.pages.length > 0 && <span>· {i.pages.join(', ')}</span>}
                  </span>
                </div>
              </td>
              <td className="num">
                <strong>{i.reports}</strong>
              </td>
              <td className="num">{i.unresolved}</td>
              <td className="num">{i.reporters}</td>
              <td className="num muted small">{timeAgo(i.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ project, filtered }: { project: Project; filtered: boolean }) {
  return (
    <div className="empty stack-sm">
      <Nebula className="mark" />
      <h2>{filtered ? 'Nothing here' : 'No reports yet'}</h2>
      <p className="muted">{filtered ? 'No reports match this view. Try another status or clear the filters.' : 'Install the snippet and send the first report from your app.'}</p>
      {!filtered && (
        <div>
          <a className="btn btn-primary" href={`#/p/${project.id}/settings/install`} style={{ marginTop: 12, textDecoration: 'none' }}>
            Install Lumora
          </a>
        </div>
      )}
    </div>
  );
}
