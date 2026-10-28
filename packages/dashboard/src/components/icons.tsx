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
  users: (p: P) => (
    <Icon {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20" />
    </Icon>
  ),
  mail: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </Icon>
  ),
  link: (p: P) => (
    <Icon {...p}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Icon>
  ),
  filter: (p: P) => (
    <Icon {...p}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </Icon>
  ),
  chevronRight: (p: P) => (
    <Icon {...p}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  ),
  expand: (p: P) => (
    <Icon {...p}>
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </Icon>
  ),
  search: (p: P) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Icon>
  ),
  calendar: (p: P) => (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  ),
  tag: (p: P) => (
    <Icon {...p}>
      <path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1.06.44l6.4 6.4a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-6.4-6.4a1.5 1.5 0 0 1-.44-1.06z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </Icon>
  ),
  monitor: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  ),
  file: (p: P) => (
    <Icon {...p}>
      <path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9z" />
      <path d="M14 3.5V9h5.5" />
    </Icon>
  ),
  status: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3.3" />
    </Icon>
  ),
  list: (p: P) => (
    <Icon {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Icon>
  ),
  board: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="10" rx="1.5" />
      <rect x="17" y="4" width="4" height="13" rx="1.5" />
    </Icon>
  ),
  columns: (p: P) => (
    <Icon {...p}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Icon>
  ),
  bell: (p: P) => (
    <Icon {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Icon>
  ),
  bookmark: (p: P) => (
    <Icon {...p}>
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Icon>
  ),
  sun: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  ),
  grip: (p: P) => (
    <Icon {...p}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </Icon>
  ),
  chevronUp: (p: P) => (
    <Icon {...p}>
      <path d="m6 15 6-6 6 6" />
    </Icon>
  ),
  x: (p: P) => (
    <Icon {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  ),
  plus: (p: P) => (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  ),
  code: (p: P) => (
    <Icon {...p}>
      <path d="m8 9-4 3 4 3M16 9l4 3-4 3M13 6l-2 12" />
    </Icon>
  ),
  user: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.9-3.5 3.6-5.5 7-5.5s6.1 2 7 5.5" />
    </Icon>
  ),
  globe: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Icon>
  ),
  chevronDown: (p: P) => (
    <Icon {...p}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  ),
  moon: (p: P) => (
    <Icon {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Icon>
  ),
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
  help: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" />
    </Icon>
  ),
  sparkle: (p: P) => (
    <Icon {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
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
  teams: ['Te', '#5B5FC7'],
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
