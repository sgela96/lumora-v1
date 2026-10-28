import { REPORT_PROPERTIES, type ReportDisplay, type ReportGroupBy, type ReportLayout, type ReportOrdering } from '@lumora/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icons } from './icons';
import { Switch, useDismiss } from './ui';

// ---------------------------------------------------------- Filters

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface FilterField {
  id: string;
  label: string;
  icon: ReactNode;
  options: FilterOption[];
  /** One value at a time (a date range), instead of "any of". */
  single?: boolean;
  /** Current values, read from the URL. */
  values: string[];
  /** The URL change that sets these values (an empty list removes the filter). */
  set: (values: string[]) => Record<string, string | string[] | undefined>;
}

type Apply = (next: Record<string, string | string[] | undefined>) => void;

/** The funnel button: a searchable list of fields, each opening its values beside it (as in Linear). */
export function FilterMenu({ fields, apply }: { fields: FilterField[]; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [rowTop, setRowTop] = useState(0);
  const ref = useDismiss(open, () => setOpen(false));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // "F" opens the filter menu, like in Linear.
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (open) queueMicrotask(() => input.current?.focus());
    else {
      setQuery('');
      setActive(null);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const matchingFields = fields.filter((f) => !q || f.label.toLowerCase().includes(q));
  // Typing a value ("urgent", "safari") finds it directly.
  const matchingValues = q
    ? fields.flatMap((f) => f.options.filter((o) => o.label.toLowerCase().includes(q)).map((o) => ({ field: f, option: o }))).slice(0, 8)
    : [];
  const activeField = fields.find((f) => f.id === active);

  const toggle = (field: FilterField, value: string) => {
    const has = field.values.includes(value);
    apply(field.set(field.single ? (has ? [] : [value]) : has ? field.values.filter((v) => v !== value) : [...field.values, value]));
    if (field.single) setOpen(false);
  };

  return (
    <div className="tb-pop" ref={ref}>
      <button type="button" className={`icon-btn${open ? ' active' : ''}`} aria-label="Filter" title="Filter (F)" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.filter size={16} />
      </button>
      {open && (
        <div className="menu-pop filter-pop" role="menu">
          <div className="menu-search">
            <input
              ref={input}
              placeholder="Add filter…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matchingValues[0]) toggle(matchingValues[0].field, matchingValues[0].option.value);
                else if (e.key === 'Enter' && matchingFields[0]) setActive(matchingFields[0].id);
              }}
              aria-label="Add filter"
            />
            <kbd>F</kbd>
          </div>
          <div className="menu-list">
            {matchingFields.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitem"
                className={`menu-row${active === f.id ? ' hover' : ''}`}
                aria-haspopup="menu"
                aria-expanded={active === f.id}
                onMouseEnter={(e) => {
                  setActive(f.id);
                  setRowTop((e.currentTarget as HTMLElement).offsetTop);
                }}
                onClick={(e) => {
                  setActive(f.id);
                  setRowTop((e.currentTarget as HTMLElement).offsetTop);
                }}
              >
                <span className="menu-icon">{f.icon}</span>
                <span className="menu-label">{f.label}</span>
                {f.values.length > 0 && <span className="menu-count">{f.values.length}</span>}
                <Icons.chevronRight size={13} />
              </button>
            ))}
            {matchingValues.length > 0 && (
              <>
                <div className="menu-head">Values</div>
                {matchingValues.map(({ field, option }) => (
                  <button key={`${field.id}:${option.value}`} type="button" role="menuitemcheckbox" aria-checked={field.values.includes(option.value)} className="menu-row" onClick={() => toggle(field, option.value)}>
                    <span className="menu-icon">{option.icon ?? field.icon}</span>
                    <span className="menu-label">
                      <span className="muted">{field.label}:</span> {option.label}
                    </span>
                    {field.values.includes(option.value) && <Icons.check size={14} />}
                  </button>
                ))}
              </>
            )}
            {!matchingFields.length && !matchingValues.length && <p className="muted small menu-empty">No filters match “{query}”.</p>}
          </div>
          {activeField && <ValueList field={activeField} onToggle={(v) => toggle(activeField, v)} className="flyout" style={{ top: Math.max(0, rowTop - 6) }} onBack={() => setActive(null)} />}
        </div>
      )}
    </div>
  );
}

/** The values of one field, with checkboxes (or a single choice) and a search box when the list is long. */
function ValueList({ field, onToggle, className = '', style, onBack }: { field: FilterField; onToggle: (value: string) => void; className?: string; style?: React.CSSProperties; onBack?: () => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const options = field.options.filter((o) => !q || o.label.toLowerCase().includes(q));
  return (
    <div className={`menu-pop value-pop ${className}`} style={style} role="menu" aria-label={field.label}>
      {onBack && (
        <button type="button" className="menu-back" onClick={onBack}>
          <Icons.back size={13} /> {field.label}
        </button>
      )}
      {field.options.length > 7 && (
        <div className="menu-search">
          <input autoFocus placeholder={`Search ${field.label.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${field.label}`} />
        </div>
      )}
      <div className="menu-list">
        {options.map((o) => {
          const on = field.values.includes(o.value);
          return (
            <button key={o.value} type="button" role={field.single ? 'menuitemradio' : 'menuitemcheckbox'} aria-checked={on} className="menu-row" onClick={() => onToggle(o.value)}>
              <span className={`menu-check-box${field.single ? ' radio' : ''}${on ? ' on' : ''}`} aria-hidden>
                {on && <Icons.check size={11} />}
              </span>
              {o.icon && <span className="menu-icon">{o.icon}</span>}
              <span className="menu-label">{o.label}</span>
              {o.count !== undefined && <span className="menu-count">{o.count}</span>}
            </button>
          );
        })}
        {!options.length && <p className="muted small menu-empty">{field.options.length ? 'Nothing matches.' : 'No values yet.'}</p>}
      </div>
    </div>
  );
}

/** Active filters as chips: "Priority · is any of · Urgent, High · ×". The value part reopens the list. */
export function FilterChips({ fields, apply, onClear, trailing }: { fields: FilterField[]; apply: Apply; onClear: () => void; trailing?: ReactNode }) {
  const active = fields.filter((f) => f.values.length);
  if (!active.length && !trailing) return null;
  return (
    <div className="filter-chips">
      {active.map((f) => (
        <FilterChip key={f.id} field={f} apply={apply} />
      ))}
      {active.length > 0 && (
        <button type="button" className="chip-clear" onClick={onClear}>
          Clear
        </button>
      )}
      {trailing && <span className="filter-chips-trailing">{trailing}</span>}
    </div>
  );
}

function FilterChip({ field, apply }: { field: FilterField; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const labels = field.values.map((v) => field.options.find((o) => o.value === v)?.label ?? v);
  const summary = labels.length > 2 ? `${labels.length} ${field.label.toLowerCase()}` : labels.join(', ');
  return (
    <span className="fchip tb-pop" ref={ref}>
      <span className="fchip-part fchip-field">
        {field.icon}
        {field.label}
      </span>
      <span className="fchip-part fchip-op">{field.values.length > 1 ? 'is any of' : 'is'}</span>
      <button type="button" className="fchip-part fchip-value" aria-expanded={open} onClick={() => setOpen(!open)}>
        {summary}
      </button>
      <button type="button" className="fchip-part fchip-x" aria-label={`Remove ${field.label} filter`} onClick={() => apply(field.set([]))}>
        <Icons.x size={12} />
      </button>
      {open && (
        <ValueList
          field={field}
          className="below"
          onToggle={(v) => {
            const has = field.values.includes(v);
            apply(field.set(field.single ? [v] : has ? field.values.filter((x) => x !== v) : [...field.values, v]));
            if (field.single) setOpen(false);
          }}
        />
      )}
    </span>
  );
}

// ---------------------------------------------------------- Display

const LAYOUTS: { id: ReportLayout; label: string; icon: ReactNode }[] = [
  { id: 'list', label: 'List', icon: <Icons.list size={16} /> },
  { id: 'board', label: 'Board', icon: <Icons.board size={16} /> },
  { id: 'issues', label: 'Issues', icon: <Icons.layers size={16} /> },
];

/** The sliders button: layout, grouping, ordering and which properties show, plus "set default for everyone". */
export function DisplayMenu({
  display,
  onChange,
  isDefault,
  statusLabel,
  canSetDefault,
  onSetDefault,
  onReset,
}: {
  display: ReportDisplay;
  onChange: (d: ReportDisplay) => void;
  isDefault: boolean;
  /** "Jira status" when a tool is connected. */
  statusLabel: string;
  canSetDefault: boolean;
  onSetDefault: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const set = <K extends keyof ReportDisplay>(key: K, value: ReportDisplay[K]) => onChange({ ...display, [key]: value });
  const board = display.layout === 'board';
  return (
    <div className="tb-pop" ref={ref}>
      <button type="button" className={`icon-btn${open ? ' active' : ''}`} aria-label="Display options" title="Display options" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icons.columns size={16} />
        {!isDefault && <span className="icon-btn-dot" aria-label="Changed from the default" />}
      </button>
      {open && (
        <div className="menu-pop display-pop" role="dialog" aria-label="Display options">
          <div className="display-layouts" role="radiogroup" aria-label="Layout">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={display.layout === l.id} className="display-layout" onClick={() => set('layout', l.id)}>
                {l.icon}
                {l.label}
              </button>
            ))}
          </div>

          {display.layout !== 'issues' && (
            <div className="display-section">
              {board && (
                <DisplayRow label="Columns" icon={<Icons.board size={14} />}>
                  <select className="select select-sm" value={display.groupBy} onChange={(e) => set('groupBy', e.target.value as ReportGroupBy)} aria-label="Columns">
                    <option value="status">{statusLabel}</option>
                    <option value="priority">Priority</option>
                    <option value="category">Category</option>
                    <option value="assignee">Assignee</option>
                  </select>
                </DisplayRow>
              )}
              <DisplayRow label="Ordering" icon={<Icons.filter size={14} />}>
                <select className="select select-sm" value={display.ordering} onChange={(e) => set('ordering', e.target.value as ReportOrdering)} aria-label="Ordering">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="priority">Priority</option>
                </select>
              </DisplayRow>
              {board && (
                <>
                  <DisplayRow label="Show resolved reports">
                    <Switch checked={display.showResolved} onChange={(v) => set('showResolved', v)} label="Show resolved reports" />
                  </DisplayRow>
                  <DisplayRow label="Show empty columns">
                    <Switch checked={display.showEmptyGroups} onChange={(v) => set('showEmptyGroups', v)} label="Show empty columns" />
                  </DisplayRow>
                </>
              )}
            </div>
          )}

          {display.layout !== 'issues' && (
            <div className="display-section">
              <span className="display-title">Display properties</span>
              <div className="prop-chips">
                {REPORT_PROPERTIES.map((p) => {
                  const on = display.properties.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      className="prop-chip"
                      onClick={() => set('properties', on ? display.properties.filter((x) => x !== p.id) : REPORT_PROPERTIES.map((x) => x.id).filter((id) => id === p.id || display.properties.includes(id)))}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="display-foot">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onReset} disabled={isDefault}>
              Reset
            </button>
            {canSetDefault && (
              <button
                type="button"
                className="btn btn-sm btn-link"
                disabled={isDefault}
                onClick={() => {
                  onSetDefault();
                  setOpen(false);
                }}
              >
                Set default for everyone
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DisplayRow({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="display-row">
      <span className="display-label">
        {label}
        {icon && <span className="display-label-icon">{icon}</span>}
      </span>
      {children}
    </div>
  );
}
