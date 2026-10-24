import type { ReactNode } from 'react';

function Icon({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

type P = { size?: number };

export const Icons = {
  overview: (p: P) => (
    <Icon {...p}>
      <path d="M4 19V10M10 19V5M16 19v-7M22 19H2" />
    </Icon>
  ),
  reports: (p: P) => (
    <Icon {...p}>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    </Icon>
  ),
  settings: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </Icon>
  ),
  billing: (p: P) => (
    <Icon {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 15h4" />
    </Icon>
  ),
  camera: (p: P) => (
    <Icon {...p}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  ),
  video: (p: P) => (
    <Icon {...p}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 10 6-3v10l-6-3" />
    </Icon>
  ),
  text: (p: P) => (
    <Icon {...p}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Icon>
  ),
  check: (p: P) => (
    <Icon {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  ),
  lock: (p: P) => (
    <Icon {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  ),
  sync: (p: P) => (
    <Icon {...p}>
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5M3 21v-5h5" />
    </Icon>
  ),
  external: (p: P) => (
    <Icon {...p}>
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
  ),
  back: (p: P) => (
    <Icon {...p}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  ),
  menu: (p: P) => (
    <Icon {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  ),
  layers: (p: P) => (
    <Icon {...p}>
      <path d="m12 2 10 5-10 5L2 7Z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </Icon>
  ),
  alert: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </Icon>
  ),
};

/** Monogram tiles for integrations — neutral, consistent, no third-party logos. */
const BRAND: Record<string, [string, string]> = {
  jira: ['Ji', '#2684FF'],
  azure_devops: ['Az', '#0078D4'],
  github: ['GH', '#24292F'],
  gitlab: ['GL', '#E2432A'],
  linear: ['Li', '#5E6AD2'],
  clickup: ['CU', '#7B68EE'],
  asana: ['As', '#F06A6A'],
  shortcut: ['Sc', '#58B1E4'],
  youtrack: ['YT', '#9B51E0'],
  trello: ['Tr', '#0079BF'],
  zendesk: ['Zd', '#03363D'],
  freshdesk: ['Fd', '#25C16F'],
  hubspot: ['Hs', '#FF7A59'],
  salesforce: ['Sf', '#00A1E0'],
  servicenow: ['SN', '#293E40'],
  freshservice: ['Fs', '#0DB4BE'],
  webhook: ['{ }', '#636366'],
  slack: ['Sl', '#4A154B'],
  email: ['@', '#8E8E93'],
};

export function LogoTile({ type, size }: { type: string; size?: number }) {
  const [text, color] = BRAND[type] ?? [type.slice(0, 2), '#8E8E93'];
  return (
    <span className="logo-tile" style={{ background: color, ...(size ? { width: size, height: size } : {}) }} aria-hidden>
      {text}
    </span>
  );
}
