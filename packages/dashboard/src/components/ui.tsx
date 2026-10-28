import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, useRef } from 'react';
import { NEBULA_CSS, nebulaSvg, PLANS, type PlanId, type TicketStatus } from '@lumora/shared';
import { PRIORITIES, type Priority, type RemoteStatus } from '../api';
import { usePermissions } from '../state';
import { Icons } from './icons';

// The nebula animations are shared with the widget; inject them once.
if (typeof document !== 'undefined' && !document.getElementById('lu-nebula-css')) {
  const style = document.createElement('style');
  style.id = 'lu-nebula-css';
  style.textContent = NEBULA_CSS;
  document.head.append(style);
}

export function Nebula({ className = 'brand-mark', detail = 'high' }: { className?: string; detail?: 'low' | 'high' }) {
  const html = useMemo(() => nebulaSvg({ detail }), [detail]);
  return <span className={className} style={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="segment" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  lockedTo,
  lockLabel,
  tier,
  children,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** When set, the feature isn't in the current plan: show which plan unlocks it. */
  lockedTo?: PlanId;
  /** Badge text when the feature is unlocked by an extra rather than a plan. */
  lockLabel?: string;
  /** The plan this feature belongs to; labelled even after upgrading. */
  tier?: PlanId;
  children?: ReactNode;
}) {
  return (
    <div className="toggle-row">
      <div className="text">
        <div className="row" style={{ gap: 8 }}>
          <strong>{title}</strong>
          {lockedTo ? <UpgradeBadge plan={lockedTo} label={lockLabel} /> : tier && tier !== 'free' && <TierBadge plan={tier} />}
        </div>
        {description && <span className="hint">{description}</span>}
        {children && checked && !lockedTo && <div style={{ marginTop: 10 }}>{children}</div>}
      </div>
      <Switch checked={checked && !lockedTo} onChange={onChange} disabled={!!lockedTo} label={title} />
    </div>
  );
}

export function UpgradeBadge({ plan, label }: { plan: PlanId; label?: string }) {
  return (
    <a href="#/billing" className="badge badge-accent" style={{ textDecoration: 'none' }} title={label ?? `Available on ${PLANS[plan].name}`}>
      {label ?? PLANS[plan].name}
    </a>
  );
}

/** The plan a feature belongs to, shown even when the current plan includes it, so paid features stay easy to spot. */
export function TierBadge({ plan }: { plan: PlanId }) {
  return (
    <span className={`badge tier-badge tier-${plan}`} title={`${PLANS[plan].name} feature`}>
      {PLANS[plan].name}
    </span>
  );
}

export function Field({ label, hint, action, children }: { label: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {action ? (
        <div className="spread">
          <label>{label}</label>
          {action}
        </div>
      ) : (
        <label>{label}</label>
      )}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Card({ title, actions, children, pad = true, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? 'card-pad' : undefined}>{children}</div>
    </section>
  );
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/** Intro line for a settings section (the tab is the heading). */
export function SectionIntro({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="spread" style={{ marginBottom: 2 }}>
      <p className="muted" style={{ fontSize: 15 }}>{children}</p>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

const STATUS_META: Record<TicketStatus, { label: string; cls: string; dot: string }> = {
  open: { label: 'Open', cls: 'badge-info', dot: 'status-dot ring' },
  in_progress: { label: 'In progress', cls: 'badge-warn', dot: 'status-dot half' },
  resolved: { label: 'Resolved', cls: 'badge-ok', dot: 'status-dot' },
};

/** Workflow status — shape (ring / half / full) + label, never color alone. */
export function StatusBadge({ status, label }: { status: TicketStatus; label?: string | null }) {
  const meta = STATUS_META[status] ?? STATUS_META.open;
  return (
    <span className={`badge ${meta.cls}`}>
      <span className={meta.dot} aria-hidden />
      {label && label.toLowerCase() !== meta.label.toLowerCase() ? label : meta.label}
    </span>
  );
}

export const statusLabel = (s: TicketStatus) => STATUS_META[s].label;

/** Closes a popover on outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return ref;
}

const CATEGORY_HEAD: Record<TicketStatus, string> = { open: 'To do', in_progress: 'In progress', resolved: 'Done' };
const LUMORA_STATUSES: RemoteStatus[] = (Object.keys(STATUS_META) as TicketStatus[]).map((s) => ({ name: STATUS_META[s].label, category: s }));

/**
 * A status pick list: the current status as a pill that opens the list. With a connected tool the list is the
 * tool's own workflow (Jira, Zendesk…), grouped by the Lumora category each status maps to.
 */
export function StatusPicker({
  value,
  label,
  statuses,
  onChange,
  disabled,
  align = 'right',
  placeholder,
}: {
  value: TicketStatus;
  label?: string | null;
  statuses?: RemoteStatus[];
  onChange: (s: RemoteStatus) => void | Promise<void>;
  disabled?: boolean;
  align?: 'left' | 'right';
  /** Bulk mode: a neutral trigger with this text, and no current value. */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const list = statuses?.length ? statuses : LUMORA_STATUSES;
  const fromTool = list !== LUMORA_STATUSES;
  const current = placeholder ? null : (fromTool && label ? list.find((s) => s.name.toLowerCase() === label.toLowerCase()) : null) ?? list.find((s) => s.category === value && !fromTool) ?? null;
  const pick = async (s: RemoteStatus) => {
    setOpen(false);
    if (current && s.name === current.name) return;
    setBusy(true);
    try {
      await onChange(s);
    } finally {
      setBusy(false);
    }
  };
  const meta = STATUS_META[value] ?? STATUS_META.open;
  const groups = (Object.keys(STATUS_META) as TicketStatus[]).map((c) => ({ category: c, items: list.filter((s) => s.category === c) })).filter((g) => g.items.length);
  return (
    <div className="status-picker" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`status-trigger badge ${placeholder ? 'prio-trigger' : meta.cls}`} aria-haspopup="listbox" aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(!open)}>
        {!placeholder && <span className={meta.dot} aria-hidden />}
        {busy ? 'Saving…' : placeholder ?? (label && label.toLowerCase() !== meta.label.toLowerCase() ? label : meta.label)}
        <Icons.chevronDown size={13} />
      </button>
      {open && (
        <div className={`status-menu card align-${align}`} role="listbox" aria-label="Status">
          {groups.map((g) => (
            <div key={g.category} className="menu-group">
              {fromTool && <div className="menu-head">{CATEGORY_HEAD[g.category]}</div>}
              {g.items.map((s) => (
                <button key={s.name} type="button" role="option" aria-selected={current?.name === s.name} onClick={() => pick(s)}>
                  <span className={`badge ${STATUS_META[s.category].cls}`}>
                    <span className={STATUS_META[s.category].dot} aria-hidden />
                    {s.name}
                  </span>
                  {current?.name === s.name && <Icons.check size={14} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
export const priorityLabel = (p: Priority | null) => (p ? PRIORITY_LABEL[p] : 'No priority');

/** Signal bars (1–3) or an exclamation for urgent: readable without color. */
export function PriorityIcon({ priority, size = 14 }: { priority: Priority | null; size?: number }) {
  if (priority === 'urgent')
    return (
      <svg className="prio-icon prio-urgent" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <rect x="1" y="1" width="14" height="14" rx="4" fill="currentColor" />
        <path d="M8 4.5v4.2M8 11.2v.3" stroke="var(--surface)" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  const level = priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0;
  return (
    <svg className={`prio-icon prio-${priority ?? 'none'}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.6} y={10 - i * 3.5} width="3" height={4.5 + i * 3.5} rx="1" fill="currentColor" opacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  );
}

export function PriorityPicker({
  value,
  onChange,
  disabled,
  align = 'right',
  placeholder,
}: {
  value: Priority | null;
  onChange: (p: Priority | null) => void | Promise<void>;
  disabled?: boolean;
  align?: 'left' | 'right';
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const pick = async (p: Priority | null) => {
    setOpen(false);
    if (p === value && !placeholder) return;
    setBusy(true);
    try {
      await onChange(p);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="status-picker" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="status-trigger badge prio-trigger" aria-haspopup="listbox" aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(!open)}>
        {!placeholder && <PriorityIcon priority={value} />}
        {busy ? 'Saving…' : placeholder ?? priorityLabel(value)}
        <Icons.chevronDown size={13} />
      </button>
      {open && (
        <div className={`status-menu card align-${align}`} role="listbox" aria-label="Priority">
          {[...PRIORITIES, null].map((p) => (
            <button key={p ?? 'none'} type="button" role="option" aria-selected={!placeholder && p === value} onClick={() => pick(p)}>
              <span className="row" style={{ gap: 8 }}>
                <PriorityIcon priority={p} /> {priorityLabel(p)}
              </span>
              {!placeholder && p === value && <Icons.check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} title={name} aria-hidden>
      {initials || '?'}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function SaveBar({ dirty, saving, onSave, onReset }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="savebar" role="region" aria-label="Unsaved changes">
      <span>Unsaved changes</span>
      <button className="btn btn-sm" onClick={onReset} disabled={saving}>
        Discard
      </button>
      <button className="btn btn-sm btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

/** Shown over a Business-only screen for other plans, with the real UI blurred behind it. */
export function Upsell({ title, children, cta = 'Upgrade to Business', action }: { title: string; children: ReactNode; cta?: string; action?: ReactNode }) {
  const can = usePermissions();
  return (
    <div className="upsell card iris-border">
      <Nebula className="mark" />
      <h2>{title}</h2>
      <p className="muted" style={{ margin: '8px 0 18px' }}>
        {children}
      </p>
      {!can.billing ? (
        <p className="small muted">Ask {can.ownerName} to upgrade the plan.</p>
      ) : (
        action ?? (
          <a className="btn btn-primary" href="#/billing" style={{ textDecoration: 'none' }}>
            <Icons.lock size={15} /> {cta}
          </a>
        )
      )}
    </div>
  );
}

// ---------- Toasts ----------

type Toast = { message: string; error?: boolean } | null;
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((message: string, error?: boolean) => setToast({ message, error }), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast${toast.error ? ' error' : ''}`} role="status">
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function parseDate(iso: string): Date {
  return new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - parseDate(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return parseDate(iso).toLocaleDateString();
}

export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}
