import { DASHBOARD_CARDS, DASHBOARD_PRESETS, dashboardCard, type CardSize, type DashboardCardDef, type DashboardItem, type DashboardPresetId } from '@lumora/shared';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BasicMetrics, IssueStat, Metrics, RecentReport } from '../api';
import { BarList, Legend, Sparkline, TrendChart, useCountUp, type Series } from './charts';
import { Icons, LogoTile } from './icons';
import { Card, formatHours, timeAgo, useDismiss } from './ui';

const SERIES: Series[] = [
  { key: 'created', label: 'Reports', color: '--series-reports' },
  { key: 'resolved', label: 'Resolved', color: '--series-resolved' },
];

const KIND_LABEL: Record<string, string> = { screenshot: 'Screenshot', recording: 'Recording', describe: 'Text only' };

export interface CardContext {
  m: Metrics | BasicMetrics;
  projectId: string;
  /** Opens the report list with these filters (Support Center only). */
  openReports?: (params: Record<string, string>) => void;
  openReport: (id: string) => void;
}

/** One dashboard card, or a locked placeholder when the plan doesn't include it. */
export function DashboardCard({ def, ctx, preview = false }: { def: DashboardCardDef; ctx: CardContext; preview?: boolean }) {
  const { m } = ctx;
  if (def.plan === 'business' && m.level !== 'advanced') return <LockedCard def={def} />;
  const a = m.level === 'advanced' ? m : null;
  const pct = (n: number) => (m.totals.reports ? Math.round((n / m.totals.reports) * 100) : 0);
  const go = (params: Record<string, string>) => (ctx.openReports && !preview ? () => ctx.openReports!(params) : undefined);
  const bars = (title: string, items: { label: string; value: number }[], filter?: string, empty?: string) => (
    <Card className="lift dash-card" title={title}>
      <BarList items={items} empty={empty} onSelect={filter && ctx.openReports && !preview ? (v) => ctx.openReports!({ [filter]: v, status: 'all' }) : undefined} />
    </Card>
  );

  switch (def.id) {
    case 'kpi.reports':
      return <Kpi label="Reports" value={m.totals.reports} delta={delta(m.totals.reports, m.totals.previous)} hint={`vs previous ${m.days} days`} spark={m.series.map((d) => d.created)} icon={<Icons.reports size={16} />} />;
    case 'kpi.withRecording':
      return <Kpi label="With a screen recording" value={pct(m.totals.withRecording)} format={(n) => `${n}%`} hint={`${m.totals.withRecording} recordings`} icon={<Icons.video size={16} />} />;
    case 'kpi.withErrors':
      return <Kpi label="With console errors" value={pct(m.totals.withErrors)} format={(n) => `${n}%`} hint={`${m.totals.withErrors} reports`} icon={<Icons.alert size={16} />} onClick={go({ hasErrors: '1', status: 'all' })} />;
    case 'kpi.open':
      return <Kpi label="Open now" value={a!.totals.open} hint={`${a!.totals.inProgress} in progress`} icon={<Icons.layers size={16} />} onClick={go({ status: 'open' })} />;
    case 'kpi.resolution':
      return (
        <Kpi
          label="Median time to resolve"
          value={a!.totals.medianResolutionHours === null ? null : Math.round(a!.totals.medianResolutionHours * 10)}
          format={(n) => formatHours(n / 10)}
          hint={`${a!.totals.resolved} resolved`}
          spark={a!.series.map((d) => d.resolved)}
          icon={<Icons.check size={16} />}
        />
      );
    case 'kpi.deliveryFailures':
      return <Kpi label="Failed deliveries" value={a!.totals.deliveryFailures} hint={a!.totals.deliveryFailures ? 'Couldn’t reach your tools' : 'Every report was delivered'} icon={<Icons.sync size={16} />} onClick={go({ delivery: 'failed', status: 'all' })} />;
    case 'trend.reports':
      return (
        <Card className="lift dash-card" title="Reports per day">
          <TrendChart data={m.series} series={SERIES.slice(0, 1)} />
        </Card>
      );
    case 'trend.resolved':
      return (
        <Card className="lift dash-card" title="Reports and resolutions" actions={<Legend series={SERIES} />}>
          <TrendChart data={a!.series} series={SERIES} />
        </Card>
      );
    case 'recent':
      return (
        <Card className="lift dash-card" title="Latest reports" actions={!preview && <a className="small" href={`#/p/${ctx.projectId}/reports?status=all`}>All reports</a>}>
          <Activity items={m.recent} onOpen={preview ? undefined : (r) => ctx.openReport(r.id)} />
        </Card>
      );
    case 'byCategory':
      return bars('By category', m.byCategory, 'category');
    case 'byBrowser':
      return bars('By browser', m.byBrowser, 'browser');
    case 'byOs':
      return bars('By operating system', m.byOs);
    case 'byKind':
      return bars('How people reported', m.byKind.map((k) => ({ ...k, label: KIND_LABEL[k.label] ?? k.label })));
    case 'topPages':
      return bars('Where people get stuck', m.topPages, 'page');
    case 'topIssues':
      return (
        <Card className="lift dash-card" title="Top issues" actions={!preview && <a className="small" href={`#/p/${ctx.projectId}/reports?mode=issues`}>All issues</a>}>
          <IssueTable issues={a!.topIssues} metric="reports" onOpen={ctx.openReports && !preview ? (i) => ctx.openReports!({ issue: i.fingerprint, status: 'all' }) : undefined} />
        </Card>
      );
    case 'peopleAffected':
      return (
        <Card className="lift dash-card" title="People affected">
          <IssueTable issues={a!.peopleAffected} metric="reporters" onOpen={ctx.openReports && !preview ? (i) => ctx.openReports!({ issue: i.fingerprint, status: 'all' }) : undefined} />
        </Card>
      );
    case 'screenErrors':
      return (
        <Card className="lift dash-card" title="Errors people saw">
          {a!.screenErrors.length === 0 ? (
            <p className="muted small">No error messages were seen on screen in this period. Turn on “Error messages on screen” in Settings → Widget to collect them.</p>
          ) : (
            <BarList items={a!.screenErrors.map((e) => ({ label: `“${e.label}”`, value: e.value }))} onSelect={ctx.openReports && !preview ? (label) => ctx.openReports!({ q: label.slice(1, 40), status: 'all' }) : undefined} />
          )}
        </Card>
      );
    case 'byToolStatus':
      return bars('By status in your tool', a!.byToolStatus, 'external', 'Nothing open');
    case 'byAssignee':
      return bars('Open by assignee', a!.byAssignee, undefined, 'Nothing open');
    case 'byPriority':
      return bars('Open by priority', a!.byPriority, undefined, 'Nothing open');
    case 'aging':
      return (
        <Card className="lift dash-card" title="Waiting the longest">
          {a!.aging.every((b) => !b.value) ? <p className="muted small">Nothing open.</p> : <BarList items={a!.aging} />}
        </Card>
      );
  }
}

function LockedCard({ def }: { def: DashboardCardDef }) {
  return (
    <div className="card dash-card dash-locked">
      <span className="dash-lock" aria-hidden>
        <Icons.lock size={16} />
      </span>
      <strong>{def.title}</strong>
      <span className="muted small">{def.description}</span>
      <a className="badge badge-accent" href="#/billing" style={{ textDecoration: 'none' }}>
        Business
      </a>
    </div>
  );
}

// ---------------------------------------------------------- Edit mode

/** A card in the grid: in edit mode it can be dragged, resized and removed. */
export function DashCell({
  item,
  editing,
  index,
  count,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onMove,
  onResize,
  onRemove,
  children,
}: {
  item: DashboardItem;
  editing: boolean;
  index: number;
  count: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onMove: (to: number) => void;
  onResize: (size: CardSize) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const def = dashboardCard(item.id)!;
  return (
    <div
      className={`dash-cell size-${item.size}${editing ? ' editing' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--i': index } as React.CSSProperties}
      draggable={editing}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        onDragStart();
      }}
      onDragEnter={editing ? onDragEnter : undefined}
      onDragOver={editing ? (e) => e.preventDefault() : undefined}
      onDragEnd={onDragEnd}
    >
      <div className="dash-cell-body" inert={editing ? true : undefined}>
        {children}
      </div>
      {editing && (
        <div className="dash-tools">
          <button
            type="button"
            className="dash-tool dash-grip"
            aria-label={`Move ${def.title}. Use the arrow keys.`}
            title="Drag to move"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onMove(Math.max(0, index - 1));
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onMove(Math.min(count - 1, index + 1));
            }}
          >
            <Icons.grip size={14} />
          </button>
          {def.sizes.length > 1 && (
            <div className="dash-sizes" role="group" aria-label={`Size of ${def.title}`}>
              {def.sizes.map((s) => (
                <button key={s} type="button" aria-pressed={item.size === s} onClick={() => onResize(s)} title={SIZE_LABEL[s]}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="dash-tool dash-remove" aria-label={`Remove ${def.title}`} title="Remove" onClick={onRemove}>
            <Icons.x size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

const SIZE_LABEL: Record<CardSize, string> = { S: 'Small: a quarter of the row', M: 'Medium: half the row', L: 'Large: the whole row' };

/** Every card, grouped, with a live preview from the real numbers. Locked cards stay visible with their plan. */
export function CardGallery({ ctx, layout, business, onAdd, onClose }: { ctx: CardContext; layout: DashboardItem[]; business: boolean; onAdd: (def: DashboardCardDef) => void; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const groups = [...new Set(DASHBOARD_CARDS.map((c) => c.group))];
  // Portaled to <body>: the page's entrance animation leaves a transform that would trap a fixed overlay.
  return createPortal(
    <div className="modal-scrim gallery-scrim" role="dialog" aria-modal="true" aria-label="Add a card" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card gallery">
        <header className="gallery-head">
          <div>
            <h2>Add a card</h2>
            <p className="muted small">Previews use your real numbers. Everyone in your organization sees the same dashboard.</p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <Icons.x size={16} />
          </button>
        </header>
        <div className="gallery-body">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="gallery-group">{g}</h3>
              <div className="gallery-grid">
                {DASHBOARD_CARDS.filter((c) => c.group === g).map((def) => {
                  const added = layout.some((i) => i.id === def.id);
                  const locked = def.plan === 'business' && !business;
                  return (
                    <div key={def.id} className={`gallery-tile${locked ? ' locked' : ''}`}>
                      <div className="gallery-preview" aria-hidden>
                        <div className="gallery-preview-inner">{locked ? <LockedPreview def={def} /> : <DashboardCard def={def} ctx={ctx} preview />}</div>
                      </div>
                      <div className="gallery-info">
                        <div className="spread" style={{ gap: 8, flexWrap: 'nowrap' }}>
                          <strong>{def.title}</strong>
                          {locked ? (
                            <a className="badge badge-accent" href="#/billing" style={{ textDecoration: 'none' }}>
                              <Icons.lock size={11} /> Business
                            </a>
                          ) : added ? (
                            <span className="badge badge-ok">
                              <Icons.check size={11} /> Added
                            </span>
                          ) : (
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => onAdd(def)}>
                              <Icons.plus size={13} /> Add
                            </button>
                          )}
                        </div>
                        <span className="muted small">{def.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A hint of what a locked card looks like, without data the plan doesn't include. */
function LockedPreview({ def }: { def: DashboardCardDef }) {
  return (
    <div className="card dash-card locked-preview">
      <strong className="small">{def.title}</strong>
      <div className="locked-bars">
        {[82, 64, 45, 30].map((w) => (
          <span key={w} style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

export function PresetMenu({ business, onPick }: { business: boolean; onPick: (id: DashboardPresetId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="status-picker" ref={ref}>
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.layers size={14} /> Presets <Icons.chevronDown size={13} />
      </button>
      {open && (
        <div className="status-menu card align-left preset-menu" role="menu">
          {DASHBOARD_PRESETS.map((p) => {
            const locked = p.plan === 'business' && !business;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className="preset-item"
                aria-disabled={locked}
                onClick={() => {
                  if (locked) return;
                  setOpen(false);
                  onPick(p.id);
                }}
              >
                <span className="preset-text">
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.description}</span>
                </span>
                {locked && (
                  <span className="badge badge-accent">
                    <Icons.lock size={11} /> Business
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------- Pieces

function Kpi({ label, value, format, hint, delta: d, spark, icon, onClick }: {
  label: string;
  value: number | null;
  format?: (n: number) => string;
  hint?: string;
  delta?: { text: string; dir: 'up' | 'down' | 'flat' };
  spark?: number[];
  icon: ReactNode;
  onClick?: () => void;
}) {
  const animated = useCountUp(value ?? 0);
  return (
    <div className="card kpi lift dash-card" style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <span className="chip">{icon}</span>
      <span className="label">{label}</span>
      <span className="value">{value === null ? '—' : format ? format(animated) : animated.toLocaleString()}</span>
      <span className="delta">
        {d && <span className={`delta ${d.dir}`}>{d.text} </span>}
        {hint}
      </span>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}

function IssueTable({ issues, metric, onOpen }: { issues: IssueStat[]; metric: 'reports' | 'reporters'; onOpen?: (i: IssueStat) => void }) {
  if (!issues.length) return <p className="muted small">No reports in this period.</p>;
  return (
    <table className="table small">
      <tbody>
        {issues.map((i) => (
          <tr key={i.fingerprint} className={onOpen ? 'clickable' : undefined} onClick={onOpen ? () => onOpen(i) : undefined}>
            <td style={{ paddingLeft: 0 }}>
              <div className="title-cell">
                <span className="t">{i.label}</span>
                <span className="sub">Last seen {timeAgo(i.lastSeen)}</span>
              </div>
            </td>
            <td className="num" style={{ paddingRight: 0, whiteSpace: 'nowrap' }}>
              <strong>{metric === 'reporters' ? `${i.reporters} ${i.reporters === 1 ? 'person' : 'people'}` : i.reports}</strong>
              <div className="muted">{metric === 'reporters' ? `${i.reports} report${i.reports === 1 ? '' : 's'}` : `${i.unresolved} open`}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Activity({ items, onOpen }: { items: RecentReport[]; onOpen?: (r: RecentReport) => void }) {
  if (!items.length) return <p className="muted small">No reports yet.</p>;
  return (
    <div className="activity">
      {items.map((r) => (
        <div key={r.id} className="activity-row" style={onOpen ? { cursor: 'pointer' } : undefined} onClick={onOpen ? () => onOpen(r) : undefined}>
          <span className="activity-dot" aria-hidden />
          <div className="title-cell">
            <span className="t">{r.title}</span>
            <span className="sub">
              <span className="mono">{r.reference}</span> · {timeAgo(r.createdAt)}
            </span>
          </div>
          {r.linked ? (
            r.linked.url ? (
              <a className="ref-chip" href={r.linked.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
                <LogoTile type={r.linked.type} />
                {r.linked.ref ?? 'Open'}
              </a>
            ) : (
              <span className="ref-chip">
                <LogoTile type={r.linked.type} />
                Sent
              </span>
            )
          ) : (
            <span className="muted small">—</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** More reports is bad news, so "up" reads as the warning direction. */
function delta(current: number, previous: number): { text: string; dir: 'up' | 'down' | 'flat' } | undefined {
  if (!previous) return current ? { text: 'New', dir: 'flat' } : undefined;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { text: '±0%', dir: 'flat' };
  return { text: `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}%`, dir: change > 0 ? 'up' : 'down' };
}
