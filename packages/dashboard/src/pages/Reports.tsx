import { DEFAULT_REPORT_DISPLAY, sameDisplay, sanitizeReportDisplay, type ReportDisplay, type ReportGroupBy, type ReportProperty, type TicketStatus } from '@lumora/shared';
import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { api, PRIORITIES, type IssueGroup, type Priority, type Project, type RemoteStatus, type SavedView, type TicketList, type TicketSummary, type Workflow } from '../api';
import { Icons, LogoTile } from '../components/icons';
import { DisplayMenu, FilterChips, FilterMenu, type FilterField } from '../components/ReportToolbar';
import { Avatar, Nebula, PriorityIcon, priorityLabel, PriorityPicker, Segmented, StatusBadge, StatusPicker, timeAgo, useDismiss, useToast } from '../components/ui';
import { useApp, useHashQuery, useWorkflow } from '../state';
import { createPortal } from 'react-dom';
import { TicketPage } from './Ticket';

const KIND: Record<string, { icon: (p: { size?: number }) => ReactElement; label: string }> = {
  screenshot: { icon: Icons.camera, label: 'Screenshot' },
  recording: { icon: Icons.video, label: 'Recording' },
  describe: { icon: Icons.text, label: 'Text only' },
};

const PAGE = 50;
/** Filters in the URL; every one but `range` and the flags can hold several values. */
const FILTER_KEYS = ['category', 'kind', 'browser', 'page', 'issue', 'range', 'hasErrors', 'hasRecording', 'delivery', 'priority', 'assignee', 'external', 'q'] as const;
/** What a saved view stores in its query: the filters and the status tab. */
const VIEW_KEYS = [...FILTER_KEYS, 'status'] as const;

type ColumnId = Exclude<ReportProperty, 'id' | 'errors'>;
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
const BASIC_COLUMNS: ColumnId[] = ['linked', 'reporter', 'received'];
const displayKey = (projectId: string) => `lumora-report-display:${projectId}`;

/** Your own display for this app, or the one the owner set for everyone. */
function storedDisplay(project: Project): ReportDisplay {
  const base = project.reportDisplay ?? DEFAULT_REPORT_DISPLAY;
  try {
    const saved = localStorage.getItem(displayKey(project.id));
    if (saved) return sanitizeReportDisplay(JSON.parse(saved), base);
  } catch {
    /* private mode */
  }
  return base;
}

export function ReportsPage({ project }: { project: Project }) {
  const { me, updateProject } = useApp();
  const toast = useToast();
  const supportCenter = me.limits.features.supportCenter;
  const workflow = useWorkflow(project.id, supportCenter);
  const [params, setParams] = useHashQuery();
  const [display, setDisplayState] = useState<ReportDisplay>(() => storedDisplay(project));
  const layout = supportCenter ? display.layout : 'list';
  const status = (supportCenter && layout === 'list' ? params.get('status') ?? 'open' : 'all') as TicketStatus | 'all';
  const openId = params.get('open');
  const [list, setList] = useState<TicketList | null>(null);
  const [issues, setIssues] = useState<IssueGroup[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [views, setViews] = useState<SavedView[]>([]);
  const [reload, setReload] = useState(0);
  const orgDefault = project.reportDisplay ?? DEFAULT_REPORT_DISPLAY;

  const setDisplay = (next: ReportDisplay) => {
    setDisplayState(next);
    try {
      if (sameDisplay(next, orgDefault)) localStorage.removeItem(displayKey(project.id));
      else localStorage.setItem(displayKey(project.id), JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (display.ordering !== 'newest') query.set('sort', display.ordering);
  for (const k of FILTER_KEYS) {
    for (const v of params.getAll(k)) {
      if (!v) continue;
      if (k === 'range') query.set('from', new Date(Date.now() - Number(v) * 86400_000).toISOString().slice(0, 10));
      else query.append(k, v);
    }
  }
  const queryString = query.toString();
  const pageSize = layout === 'board' ? 200 : limit;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (layout === 'issues') return api<IssueGroup[]>(`/projects/${project.id}/issues?${queryString}`).then((r) => !cancelled && setIssues(r));
      return api<TicketList>(`/projects/${project.id}/tickets?${queryString}&limit=${pageSize}`).then((r) => !cancelled && setList(r));
    };
    load();
    // New reports and synced statuses show up without a refresh.
    const poll = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [project.id, queryString, layout, pageSize, reload]);

  useEffect(() => {
    if (supportCenter) api<SavedView[]>(`/projects/${project.id}/views`).then(setViews, () => {});
  }, [project.id, supportCenter]);

  useEffect(() => {
    const t = setTimeout(() => params.get('q') !== search && setParams({ q: search || undefined }), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The selection only makes sense for what's on screen.
  useEffect(() => setSelected(new Set()), [queryString, layout]);

  const counts = list?.counts;
  const allColumns = supportCenter ? COLUMNS.filter((c) => display.properties.includes(c.id)) : COLUMNS.filter((c) => BASIC_COLUMNS.includes(c.id));
  // With the report open beside the list, the list keeps only what fits: the title, status and priority.
  const columns = openId ? allColumns.filter((c) => c.id === 'status' || c.id === 'priority') : allColumns;
  const fields = useMemo(() => filterFields(params, list, workflow), [params.toString(), list?.facets, workflow]);
  const filtering = fields.some((f) => f.values.length) || !!params.get('issue');

  // The saved view that matches what's on screen is highlighted.
  const currentViewQuery = viewQuery(params);
  const activeView = views.find((v) => v.query === currentViewQuery && sameDisplay(sanitizeReportDisplay(v.layout, orgDefault), display));
  const pristine = !currentViewQuery && sameDisplay(display, orgDefault);

  const applyView = (v: SavedView | null) => {
    const next: Record<string, string | string[] | undefined> = Object.fromEntries(VIEW_KEYS.map((k) => [k, undefined]));
    if (v) for (const k of new URLSearchParams(v.query).keys()) next[k] = new URLSearchParams(v.query).getAll(k);
    setParams({ ...next, open: undefined });
    setSearch(typeof next.q === 'string' ? next.q : next.q?.[0] ?? '');
    setDisplay(v ? sanitizeReportDisplay(v.layout, orgDefault) : orgDefault);
    setLimit(PAGE);
  };

  const saveView = async (name: string) => {
    const view = await api<SavedView>(`/projects/${project.id}/views`, { body: { name, query: currentViewQuery, layout: display } });
    setViews([...views, view]);
    toast(`Saved “${name}”`);
  };

  const deleteView = async (v: SavedView) => {
    await api(`/views/${v.id}`, { method: 'DELETE', body: {} });
    setViews(views.filter((x) => x.id !== v.id));
  };

  const setDefaultForEveryone = async () => {
    try {
      const r = await api<{ display: ReportDisplay }>(`/projects/${project.id}/report-display`, { method: 'PUT', body: { display } });
      updateProject({ ...project, reportDisplay: r.display });
      try {
        localStorage.removeItem(displayKey(project.id));
      } catch {
        /* private mode */
      }
      toast('This is now the default display for everyone');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
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
  const open = useCallback((id: string | null) => setParams({ open: id ?? undefined }), [setParams]);
  // Board and list share the order of what's on screen, for the panel's previous / next.
  const ordered = list?.items ?? [];

  const content =
    layout === 'issues' ? (
      <section className="card">
        <IssuesTable issues={issues} onOpen={(i) => {
          setParams({ issue: i.fingerprint, status: 'all' });
          setDisplay({ ...display, layout: 'list' });
        }} />
      </section>
    ) : !list ? (
      <section className="card">
        <div className="empty muted">Loading…</div>
      </section>
    ) : list.items.length === 0 && layout === 'list' ? (
      <section className="card">
        <EmptyState project={project} filtered={filtering || !!params.get('q') || status !== 'all'} />
      </section>
    ) : layout === 'board' ? (
      <Board
        items={display.showResolved ? list.items : list.items.filter((t) => t.status !== 'resolved')}
        groupBy={display.groupBy}
        properties={display.properties}
        showEmpty={display.showEmptyGroups}
        showResolved={display.showResolved}
        workflow={workflow}
        facets={list.facets}
        openId={openId}
        onOpen={open}
        projectId={project.id}
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
                <th>Report</th>
                {columns.map((c) => (
                  <th key={c.id} className={c.num ? 'num' : undefined}>
                    {c.label}
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
                  columns={columns.map((c) => c.id)}
                  showId={!supportCenter || display.properties.includes('id')}
                  showErrors={!supportCenter || display.properties.includes('errors')}
                  selectable={supportCenter}
                  selected={selected.has(t.id)}
                  active={openId === t.id}
                  onOpen={() => open(t.id)}
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
    );

  return (
    <div className="stack reports-page">
      <header className="reports-head">
        <div className="reports-title">
          <h1>Reports</h1>
          {supportCenter && (
            <div className="views-bar" role="tablist" aria-label="Saved views">
              <button role="tab" aria-selected={!activeView && pristine} className="view-tab" onClick={() => applyView(null)}>
                All reports
              </button>
              {views.map((v) => (
                <span key={v.id} className="view-tab-wrap">
                  <button role="tab" aria-selected={activeView?.id === v.id} className="view-tab" onClick={() => applyView(v)}>
                    {sanitizeReportDisplay(v.layout).layout === 'board' ? <Icons.board size={14} /> : <Icons.bookmark size={14} />}
                    {v.name}
                  </button>
                  <button className="view-remove" aria-label={`Delete view ${v.name}`} title="Delete view" onClick={() => deleteView(v)}>
                    <Icons.x size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="reports-tools">
          <label className="search-pill">
            <Icons.search size={15} />
            <input placeholder="Search" aria-label="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {supportCenter && layout !== 'issues' && <FilterMenu fields={fields} apply={setParams} />}
          {supportCenter && (
            <DisplayMenu
              display={display}
              onChange={setDisplay}
              isDefault={sameDisplay(display, orgDefault)}
              statusLabel={workflow?.source === 'tool' ? `${workflow.tool!.name} status` : 'Status'}
              canSetDefault={me.dashboard.canEdit}
              onSetDefault={setDefaultForEveryone}
              onReset={() => setDisplay(orgDefault)}
            />
          )}
        </div>
      </header>

      {!supportCenter && (
        <div className="notice notice-accent spread" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span>
            Every report from the last {list?.historyDays ?? me.limits.historyDays} days, with its screenshot, steps and console. <strong>Business</strong> adds statuses synced
            from your tools, filters, a board, saved views and similar reports grouped into issues.
          </span>
          <a className="btn btn-sm" href="#/billing" style={{ textDecoration: 'none' }}>
            See Business
          </a>
        </div>
      )}

      {supportCenter && (
        <div className="reports-sub">
          {layout === 'list' && (
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
          )}
          <FilterChips
            fields={layout === 'issues' ? [] : fields}
            apply={setParams}
            onClear={() => setParams(Object.fromEntries(FILTER_KEYS.filter((k) => k !== 'q').map((k) => [k, undefined])))}
            trailing={!activeView && !pristine ? <SaveViewButton onSave={saveView} /> : undefined}
          />
        </div>
      )}

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

      <div className={`reports-body${openId ? ' with-panel' : ''}`}>
        <div className="reports-content">{content}</div>
        {openId && <ReportPanel project={project} ticketId={openId} order={ordered} onOpen={open} onChanged={() => setReload((n) => n + 1)} />}
      </div>

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

/** The report beside the list, like Jira: previous / next, open as a page, close. */
function ReportPanel({ project, ticketId, order, onOpen, onChanged }: { project: Project; ticketId: string; order: TicketSummary[]; onOpen: (id: string | null) => void; onChanged: () => void }) {
  const index = order.findIndex((t) => t.id === ticketId);
  const prev = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/input|textarea|select/i.test(target.tagName) || target.isContentEditable || document.querySelector('.modal-scrim, .lu-annotator')) return;
      if (e.key === 'Escape') onOpen(null);
      else if ((e.key === 'k' || e.key === 'ArrowUp') && prev) {
        e.preventDefault();
        onOpen(prev.id);
      } else if ((e.key === 'j' || e.key === 'ArrowDown') && next) {
        e.preventDefault();
        onOpen(next.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prev, next, onOpen]);

  // On narrow screens the panel becomes a drawer over the page, outside the main column's stacking context.
  const narrow = useMediaQuery('(max-width: 1100px)');
  const panel = (
    <aside className={`report-panel card${narrow ? ' drawer-mode' : ''}`} aria-label="Report">
      <div className="report-panel-bar">
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Previous report" title="Previous (K)" disabled={!prev} onClick={() => prev && onOpen(prev.id)}>
            <Icons.chevronUp size={15} />
          </button>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Next report" title="Next (J)" disabled={!next} onClick={() => next && onOpen(next.id)}>
            <Icons.chevronDown size={15} />
          </button>
          {index >= 0 && (
            <span className="muted small" style={{ marginLeft: 6 }}>
              {index + 1} of {order.length}
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <a className="icon-btn icon-btn-sm" href={`#/p/${project.id}/reports/${ticketId}`} aria-label="Open as a page" title="Open as a page">
            <Icons.expand size={14} />
          </a>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Close" title="Close (Esc)" onClick={() => onOpen(null)}>
            <Icons.x size={15} />
          </button>
        </div>
      </div>
      <div className="report-panel-body">
        <TicketPage key={ticketId} project={project} ticketId={ticketId} embedded={{ onChanged }} />
      </div>
    </aside>
  );
  return narrow ? createPortal(panel, document.body) : panel;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const on = () => setMatches(media.matches);
    media.addEventListener('change', on);
    return () => media.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Builds the filter menu's fields from the URL, the list's facets and the connected tool's workflow. */
function filterFields(params: URLSearchParams, list: TicketList | null, workflow: Workflow | null): FilterField[] {
  const multi = (key: string) => ({ values: params.getAll(key).filter(Boolean), set: (values: string[]) => ({ [key]: values }) });
  const facet = (k: keyof TicketList['facets']) => (list?.facets[k] ?? []).map((f) => ({ value: f.value, label: f.value, count: f.n }));
  const flags = [
    { value: 'errors', label: 'With console errors', key: 'hasErrors', on: '1' },
    { value: 'recording', label: 'With a recording', key: 'hasRecording', on: '1' },
    { value: 'failed', label: 'Delivery failed', key: 'delivery', on: 'failed' },
  ];
  const fields: FilterField[] = [];
  if (workflow?.source === 'tool')
    fields.push({
      id: 'external',
      label: `${workflow.tool!.name} status`,
      icon: <Icons.status size={15} />,
      options: workflow.statuses.map((s) => ({ value: s.name, label: s.name, icon: <StatusDot status={s.category} />, count: list?.facets.external.find((f) => f.value === s.name)?.n })),
      ...multi('external'),
    });
  fields.push(
    {
      id: 'priority',
      label: 'Priority',
      icon: <PriorityIcon priority="high" size={15} />,
      options: [...PRIORITIES, null].map((p) => ({ value: p ?? 'none', label: priorityLabel(p), icon: <PriorityIcon priority={p} /> })),
      ...multi('priority'),
    },
    {
      id: 'assignee',
      label: 'Assignee',
      icon: <Icons.user size={15} />,
      options: [...facet('assignee').map((o) => ({ ...o, icon: <Avatar name={o.label} size={18} /> })), { value: 'none', label: 'Unassigned' }],
      ...multi('assignee'),
    },
    { id: 'category', label: 'Category', icon: <Icons.tag size={15} />, options: [...facet('category'), { value: 'none', label: 'No category' }], ...multi('category') },
    {
      id: 'kind',
      label: 'Capture',
      icon: <Icons.camera size={15} />,
      options: Object.entries(KIND).map(([value, k]) => ({ value, label: k.label, icon: <k.icon size={14} /> })),
      ...multi('kind'),
    },
    { id: 'page', label: 'Page', icon: <Icons.file size={15} />, options: facet('page'), ...multi('page') },
    { id: 'browser', label: 'Browser', icon: <Icons.monitor size={15} />, options: facet('browser'), ...multi('browser') },
    {
      id: 'received',
      label: 'Received',
      icon: <Icons.calendar size={15} />,
      single: true,
      options: [
        { value: '1', label: 'Last 24 hours' },
        { value: '7', label: 'Last 7 days' },
        { value: '30', label: 'Last 30 days' },
      ],
      values: params.get('range') ? [params.get('range')!] : [],
      set: (values) => ({ range: values[0] }),
    },
    {
      id: 'details',
      label: 'Details',
      icon: <Icons.alert size={15} />,
      options: flags.map((f) => ({ value: f.value, label: f.label })),
      values: flags.filter((f) => params.get(f.key) === f.on).map((f) => f.value),
      set: (values) => Object.fromEntries(flags.map((f) => [f.key, values.includes(f.value) ? f.on : undefined])),
    },
  );
  return fields;
}

function StatusDot({ status }: { status: TicketStatus }) {
  return <span className={`status-dot ${status === 'open' ? 'ring' : status === 'in_progress' ? 'half' : ''} status-${status}`} aria-hidden />;
}

/** The filter part of the hash query, in a stable order, as a saved view stores it. */
function viewQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const k of VIEW_KEYS) for (const v of params.getAll(k)) if (v) q.append(k, v);
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
    <div className="tb-pop" ref={ref}>
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icons.bookmark size={14} /> Save view
      </button>
      {open && (
        <form
          className="menu-pop align-end stack-sm"
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
          <span className="muted small">Saves the filters and display options you see now.</span>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'end' }}>
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function LinkedChip({ ticket: t, quiet }: { ticket: TicketSummary; quiet?: boolean }) {
  const linked = t.deliveries.find((d) => d.status === 'sent' && (d.displayId || d.externalId));
  if (!linked && quiet) return null;
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
  showId,
  showErrors,
  selectable,
  selected,
  active,
  onOpen,
  onSelect,
  workflow,
  onPatch,
}: {
  ticket: TicketSummary;
  projectId: string;
  columns: ColumnId[];
  showId: boolean;
  showErrors: boolean;
  selectable: boolean;
  selected: boolean;
  /** Open in the side panel. */
  active: boolean;
  onOpen: () => void;
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
    <tr className={`clickable${selected ? ' selected' : ''}${active ? ' active' : ''}`} onClick={onOpen} aria-current={active || undefined}>
      {selectable && (
        <td className="check-cell" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" aria-label={`Select ${t.reference}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
        </td>
      )}
      <td className="report-cell">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
          <span className="kind-icon" title={kind.label}>
            <kind.icon size={16} />
          </span>
          <div className="title-cell">
            <a className="t" href={`#/p/${projectId}/reports/${t.id}`} onClick={(e) => openUnlessModified(e, onOpen)} style={{ color: 'var(--text)' }}>
              {t.title}
            </a>
            <span className="sub">
              {showId && <span className="mono">{t.reference}</span>}
              {!columns.includes('category') && t.category && <span>{showId ? '· ' : ''}{t.category}</span>}
              {!columns.includes('page') && t.pagePath && <span>· {t.pagePath}</span>}
              {showErrors && t.errorCount > 0 && (
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
  /** For status lanes: the Lumora category, so resolved columns can be hidden. */
  statusCategory?: TicketStatus;
  title: ReactNode;
  /** The change that moves a card into this lane; null when the lane can't be dropped on. */
  patch: Record<string, string> | null;
  match: (t: TicketSummary) => boolean;
}

function lanesFor(groupBy: ReportGroupBy, workflow: Workflow | null, items: TicketSummary[], facets: TicketList['facets']): Lane[] {
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
    return statuses.map((s) => ({ id: s.name, statusCategory: s.category, title: <StatusBadge status={s.category} label={s.name} />, patch: { externalStatus: s.name }, match: (t) => home(t).name === s.name }));
  }
  return (['open', 'in_progress', 'resolved'] as TicketStatus[]).map((s) => ({ id: s, statusCategory: s, title: <StatusBadge status={s} />, patch: { status: s }, match: (t) => t.status === s }));
}

function Board({
  items,
  projectId,
  groupBy,
  properties,
  showEmpty,
  showResolved,
  workflow,
  facets,
  openId,
  onOpen,
  onMove,
}: {
  items: TicketSummary[];
  projectId: string;
  groupBy: ReportGroupBy;
  properties: ReportProperty[];
  showEmpty: boolean;
  showResolved: boolean;
  workflow: Workflow | null;
  facets: TicketList['facets'];
  openId: string | null;
  onOpen: (id: string) => void;
  onMove: (t: TicketSummary, patch: Record<string, string>) => void;
}) {
  const allLanes = useMemo(() => lanesFor(groupBy, workflow, items, facets), [groupBy, workflow, items, facets]);
  const show = (p: ReportProperty) => properties.includes(p);
  const [dragging, setDragging] = useState<TicketSummary | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (lane: Lane) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    if (dragging && lane.patch && !lane.match(dragging)) onMove(dragging, lane.patch);
    setDragging(null);
  };

  const lanes = allLanes.filter((lane) => {
    if (!showResolved && groupBy === 'status' && lane.statusCategory === 'resolved') return false;
    return showEmpty || !!dragging || items.some(lane.match);
  });

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
                  onClick={(e) => openUnlessModified(e, () => onOpen(t.id))}
                  aria-current={openId === t.id || undefined}
                  className={`board-card${dragging?.id === t.id ? ' dragging' : ''}${openId === t.id ? ' active' : ''}`}
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
                      {show('priority') && groupBy !== 'priority' && <PriorityIcon priority={t.priority} />}
                      {show('id') && <span className="mono muted">{t.reference}</span>}
                      {show('errors') && t.errorCount > 0 && <span className="badge badge-danger" style={{ padding: '0 6px' }}>{t.errorCount}</span>}
                    </span>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
                      {show('status') && groupBy !== 'status' && t.externalStatus && <span className="muted small ellipsis">{t.externalStatus}</span>}
                      {show('assignee') && groupBy !== 'assignee' && t.assignee && <Avatar name={t.assignee.name} size={20} />}
                    </span>
                  </span>
                  {(show('category') || show('page') || show('browser') || show('reporter') || show('received') || show('linked')) && (
                    <span className="board-card-props">
                      {show('category') && groupBy !== 'category' && t.category && <span className="prop">{t.category}</span>}
                      {show('page') && t.pagePath && <span className="prop mono">{t.pagePath}</span>}
                      {show('browser') && t.browser && <span className="prop">{t.browser}</span>}
                      {show('reporter') && t.reporterEmail && <span className="prop">{t.reporterEmail}</span>}
                      {show('linked') && <LinkedChip ticket={t} quiet />}
                      {show('received') && <span className="prop muted">{timeAgo(t.createdAt)}</span>}
                    </span>
                  )}
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

/** A plain click opens the report beside the list; Cmd/Ctrl-click or a middle click still opens it as a page. */
function openUnlessModified(e: MouseEvent, open: () => void) {
  e.stopPropagation();
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  open();
}
