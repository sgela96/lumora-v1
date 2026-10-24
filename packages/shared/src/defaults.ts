import { PLANS } from './plans';
import type { PlanId, ProjectSettings } from './types';

export const DEFAULT_TITLE_TEMPLATE = '[{{fields.category}}] {{summary}}';

export const DEFAULT_DESCRIPTION_TEMPLATE = `{{fields.description}}

## Reporter
{{reporter}}

## Steps to reproduce
{{steps}}

## Console
{{console}}

## Failed network requests
{{network}}

## Environment
{{environment}}

{{attachments}}`;

/** Variables documented in the dashboard template editor. */
export const TEMPLATE_VARIABLES: { name: string; description: string }[] = [
  { name: '{{summary}}', description: 'First line of the description, trimmed to 80 characters' },
  { name: '{{fields.<id>}}', description: 'Any form field, e.g. {{fields.category}}' },
  { name: '{{reporter}}', description: 'User id / name / e-mail block' },
  { name: '{{reporter.email}}', description: 'Reporter e-mail' },
  { name: '{{steps}}', description: 'Numbered steps (from the recording or the last actions)' },
  { name: '{{console}}', description: 'Console entries as a code block' },
  { name: '{{network}}', description: 'Failed HTTP requests as a list' },
  { name: '{{environment}}', description: 'Browser, OS, viewport, URL…' },
  { name: '{{page.url}}', description: 'URL where the report was sent' },
  { name: '{{page.path}}', description: 'Path of that URL' },
  { name: '{{attachments}}', description: 'Links to screenshot / recording' },
  { name: '{{metadata.<key>}}', description: 'Values sent with Lumora("metadata", …)' },
  { name: '{{ai.summary}}', description: 'AI summary of the problem (Business)' },
];

export function defaultSettings(): ProjectSettings {
  return {
    appearance: {
      position: 'bottom-right',
      accentColor: '#F59E0B',
      theme: 'auto',
      locale: 'auto',
      greeting: '',
      offsetX: 24,
      offsetY: 24,
      proactiveOnError: true,
      showBranding: true,
    },
    reportTypes: { screenshot: true, recording: true, describe: true },
    template: {
      titleTemplate: DEFAULT_TITLE_TEMPLATE,
      descriptionTemplate: DEFAULT_DESCRIPTION_TEMPLATE,
      fields: [
        {
          id: 'category',
          label: 'Type',
          type: 'select',
          required: true,
          options: ['Bug', 'Question', 'Idea'],
        },
        {
          id: 'description',
          label: 'What happened?',
          type: 'textarea',
          required: true,
          placeholder: 'Describe what you expected and what happened instead',
        },
      ],
    },
    capture: {
      user: { id: true, email: true, name: true, custom: true },
      askEmailIfAnonymous: true,
      console: { enabled: true, levels: ['error', 'warn'], maxEntries: 50 },
      network: { enabled: true, failedOnly: true, maxEntries: 30 },
      environment: true,
      breadcrumbs: true,
      recordingSteps: true,
      aiSteps: false,
      maskInputs: true,
      redactSelectors: [],
      redactSensitiveData: true,
    },
    recording: { maxSeconds: 120, allowMicrophone: false },
  };
}

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges stored (possibly older / partial) settings over the current defaults. */
export function mergeSettings(stored: unknown): ProjectSettings {
  const merge = (base: unknown, over: unknown): unknown => {
    if (isPlain(base) && isPlain(over)) {
      const out: Plain = { ...base };
      for (const key of Object.keys(base)) {
        if (key in over) out[key] = merge(base[key], over[key]);
      }
      return out;
    }
    if (over === undefined || over === null) return base;
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    return typeof over === typeof base ? over : base;
  };
  return merge(defaultSettings(), stored) as ProjectSettings;
}

/**
 * Turns off everything the plan doesn't include. Applied when serving the widget config
 * and again when accepting a report, so a stale or tampered config can't unlock features.
 */
export function clampSettingsToPlan(settings: ProjectSettings, plan: PlanId): ProjectSettings {
  const f = PLANS[plan].features;
  const s: ProjectSettings = structuredClone(settings);

  s.reportTypes.recording = s.reportTypes.recording && f.recording;
  s.reportTypes.screenshot = s.reportTypes.screenshot && f.screenshot;
  s.recording.maxSeconds = Math.max(0, Math.min(s.recording.maxSeconds, f.recordingMaxSeconds));
  s.recording.allowMicrophone = s.recording.allowMicrophone && f.microphone;
  s.capture.console.enabled = s.capture.console.enabled && f.console;
  s.capture.network.enabled = s.capture.network.enabled && f.network;
  s.capture.breadcrumbs = s.capture.breadcrumbs && f.breadcrumbs;
  s.capture.recordingSteps = s.capture.recordingSteps && f.recordingSteps;
  s.capture.aiSteps = s.capture.aiSteps && f.aiSteps;
  if (!f.removeBranding) s.appearance.showBranding = true;
  if (!f.redactionRules) s.capture.redactSelectors = [];
  if (!f.customTemplate) {
    const d = defaultSettings();
    s.template = d.template;
  }
  if (!s.reportTypes.screenshot && !s.reportTypes.recording) s.reportTypes.describe = true;
  return s;
}
