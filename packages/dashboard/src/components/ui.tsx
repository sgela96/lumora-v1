import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NEBULA_CSS, nebulaSvg, PLANS, type PlanId, type TicketStatus } from '@lumora/shared';
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
  children?: ReactNode;
}) {
  return (
    <div className="toggle-row">
      <div className="text">
        <div className="row" style={{ gap: 8 }}>
          <strong>{title}</strong>
          {lockedTo && <UpgradeBadge plan={lockedTo} label={lockLabel} />}
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
export function Upsell({ title, children, cta = 'Upgrade to Business' }: { title: string; children: ReactNode; cta?: string }) {
  return (
    <div className="upsell card iris-border">
      <Nebula className="mark" />
      <h2>{title}</h2>
      <p className="muted" style={{ margin: '8px 0 18px' }}>
        {children}
      </p>
      <a className="btn btn-primary" href="#/billing" style={{ textDecoration: 'none' }}>
        <Icons.lock size={15} /> {cta}
      </a>
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
