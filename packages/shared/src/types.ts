// Types shared by the widget, the server and the dashboard.

export type PlanId = 'starter' | 'pro' | 'business';

export type Locale = 'en' | 'es';

export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export type FieldType = 'text' | 'textarea' | 'select' | 'email' | 'checkbox';

export interface TemplateField {
  /** Stable key used in templates as {{fields.<id>}}. */
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  /** Options for `select` fields. */
  options?: string[];
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ProjectSettings {
  appearance: {
    position: WidgetPosition;
    accentColor: string;
    theme: 'auto' | 'light' | 'dark';
    locale: 'auto' | Locale;
    greeting: string;
    offsetX: number;
    offsetY: number;
    /** The sun reacts when the page throws an error and invites the user to report it. */
    proactiveOnError: boolean;
    showBranding: boolean;
  };
  reportTypes: {
    screenshot: boolean;
    recording: boolean;
    describe: boolean;
  };
  template: {
    /** e.g. "[{{fields.category}}] {{summary}}" */
    titleTemplate: string;
    /** Markdown. See TEMPLATE_VARIABLES for the available variables. */
    descriptionTemplate: string;
    fields: TemplateField[];
  };
  capture: {
    user: { id: boolean; email: boolean; name: boolean; custom: boolean };
    askEmailIfAnonymous: boolean;
    console: { enabled: boolean; levels: LogLevel[]; maxEntries: number };
    network: { enabled: boolean; failedOnly: boolean; maxEntries: number };
    environment: boolean;
    /** Record the last user actions before the report (clicks, inputs, navigation). */
    breadcrumbs: boolean;
    /** Turn screen recordings into written steps to reproduce. */
    recordingSteps: boolean;
    /** Rewrite the captured actions into clean steps with AI. */
    aiSteps: boolean;
    /** Never send what the user typed, only which field. */
    maskInputs: boolean;
    /** CSS selectors whose content is hidden in screenshots and never recorded. */
    redactSelectors: string[];
    /** Strip e-mails, card numbers and tokens from logs and URLs. */
    redactSensitiveData: boolean;
  };
  recording: {
    maxSeconds: number;
    allowMicrophone: boolean;
  };
}

/** What the widget receives from GET /api/widget/config. Already clamped to the plan. */
export interface WidgetConfig {
  projectName: string;
  plan: PlanId;
  settings: ProjectSettings;
}

export interface ConsoleEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  stack?: string;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  timestamp: number;
  error?: string;
}

export type UserActionType = 'click' | 'input' | 'select' | 'check' | 'submit' | 'navigate' | 'key' | 'error';

export interface UserAction {
  type: UserActionType;
  timestamp: number;
  /** Human label of the target: "Save", "Email", "/settings" … */
  label: string;
  /** button | link | field | checkbox | form | page … */
  kind: string;
  selector?: string;
  /** Only present when inputs are not masked. */
  value?: string;
  checked?: boolean;
}

export interface Environment {
  url: string;
  title: string;
  referrer: string;
  userAgent: string;
  browser: string;
  os: string;
  language: string;
  timezone: string;
  viewport: string;
  screen: string;
  devicePixelRatio: number;
  online: boolean;
  timestamp: string;
}

export interface ReporterInfo {
  id?: string;
  email?: string;
  name?: string;
  custom?: Record<string, string | number | boolean>;
}

export type ReportKind = 'screenshot' | 'recording' | 'describe';

/** JSON part of the multipart POST /api/widget/reports. */
export interface ReportPayload {
  kind: ReportKind;
  fields: Record<string, string | boolean>;
  reporter: ReporterInfo;
  metadata: Record<string, string | number | boolean>;
  environment?: Environment;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  breadcrumbs?: UserAction[];
  /** Actions captured during the screen recording, timestamps relative to recording start (ms). */
  recordingActions?: UserAction[];
  recordingDurationMs?: number;
}
