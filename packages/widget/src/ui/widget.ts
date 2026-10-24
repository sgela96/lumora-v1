import {
  buildSteps,
  formatOffset,
  redactText,
  redactUrl,
  type Locale,
  type ReportKind,
  type ReportPayload,
  type ReporterInfo,
  type Step,
  type TemplateField,
  type UserAction,
  type WidgetConfig,
} from '@lumora/shared';
import type { LumoraApi } from '../api';
import type { ActionCapture } from '../capture/actions';
import type { ConsoleCapture } from '../capture/console';
import { captureEnvironment } from '../capture/environment';
import type { NetworkCapture } from '../capture/network';
import { isRecordingSupported, ScreenRecorder } from '../capture/recorder';
import { canvasToBlob, captureDisplay, captureDom } from '../capture/screenshot';
import { el, formatDuration } from '../util';
import { annotate } from './annotator';
import { resolveLocale, STRINGS, type Strings } from './i18n';
import { icons, sunSvg } from './icons';
import { STYLES } from './styles';

type View = 'home' | 'form' | 'sending' | 'done' | 'error';

interface ScreenshotState {
  canvas: HTMLCanvasElement;
  url: string;
}

interface RecordingState {
  blob: Blob;
  url: string;
  durationMs: number;
  actions: UserAction[];
}

export interface WidgetDeps {
  config: WidgetConfig;
  api: LumoraApi;
  console: ConsoleCapture;
  network: NetworkCapture;
  actions: ActionCapture;
  host: HTMLElement;
  getReporter: () => ReporterInfo;
  getMetadata: () => Record<string, string | number | boolean>;
}

export class Widget {
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  private launcher!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private tooltip!: HTMLDivElement;
  private recbar!: HTMLDivElement;
  private t: Strings;
  private locale: Locale;

  private view: View = 'home';
  private kind: ReportKind = 'describe';
  private screenshot?: ScreenshotState;
  private recording?: RecordingState;
  private screenshotError = false;
  private notice = '';
  private values: Record<string, string | boolean> = {};
  private email = '';
  private include = { console: true, network: true, environment: true, actions: true };
  private invalid = new Set<string>();
  private result?: { reference: string; externalUrl?: string };
  private errorMessage = '';
  private recorder?: ScreenRecorder;
  private recordingActions: UserAction[] = [];
  private stopActionListener?: () => void;
  private proactiveShown = false;
  private moodTimer?: number;

  constructor(private deps: WidgetDeps) {
    const s = deps.config.settings;
    this.locale = resolveLocale(s.appearance.locale);
    this.t = STRINGS[this.locale];
    this.shadow = deps.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.root = el('div', { class: 'lu-root' });
    this.root.style.setProperty('--lu-accent', s.appearance.accentColor);
    this.root.style.setProperty('--lu-on-accent', readableOn(s.appearance.accentColor));
    this.shadow.append(style, this.root);
    this.applyTheme();
    this.build();
    this.resetForm();

    deps.console.onEntry((entry) => {
      if (entry.level !== 'error') return;
      deps.actions.recordError(entry.message);
      this.onPageError();
    });
  }

  // ---------- Public controls ----------

  open(kind?: ReportKind): void {
    this.hideTooltip();
    if (kind === 'screenshot') return void this.startScreenshot();
    if (kind === 'recording') return void this.startRecording();
    const types = this.deps.config.settings.reportTypes;
    const onlyDescribe = !types.screenshot && !types.recording;
    this.setView(onlyDescribe || kind === 'describe' || this.hasDraft() ? 'form' : 'home');
    this.panel.hidden = false;
    this.launcher.setAttribute('data-open', 'true');
    this.launcher.setAttribute('aria-expanded', 'true');
    queueMicrotask(() => this.panel.querySelector<HTMLElement>('button, input, textarea, select')?.focus());
  }

  close(): void {
    this.panel.hidden = true;
    this.launcher.setAttribute('data-open', 'false');
    this.launcher.setAttribute('aria-expanded', 'false');
    if (this.view === 'done' || this.view === 'error') this.resetForm();
  }

  toggle(): void {
    if (this.panel.hidden) this.open();
    else this.close();
  }

  setLauncherVisible(visible: boolean): void {
    this.launcher.hidden = !visible;
  }

  destroy(): void {
    this.recorder?.cancel();
    this.deps.host.remove();
  }

  // ---------- Layout ----------

  private applyTheme(): void {
    const theme = this.deps.config.settings.appearance.theme;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => this.root.setAttribute('data-theme', theme === 'auto' ? (media?.matches ? 'dark' : 'light') : theme);
    apply();
    media?.addEventListener?.('change', apply);
  }

  private build(): void {
    const { appearance } = this.deps.config.settings;
    const [vertical, horizontal] = appearance.position.split('-') as ['top' | 'bottom', 'left' | 'right'];
    const ox = `${appearance.offsetX}px`;
    const oy = `${appearance.offsetY}px`;

    this.launcher = el('button', {
      class: 'lu-launcher',
      type: 'button',
      'aria-label': this.t.launcher,
      title: this.t.launcher,
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'data-mood': 'happy',
    });
    this.launcher.innerHTML = sunSvg(appearance.accentColor);
    this.launcher.style[vertical] = oy;
    this.launcher.style[horizontal] = ox;
    this.launcher.addEventListener('click', () => this.toggle());

    this.panel = el('div', { class: 'lu-panel', role: 'dialog', 'aria-label': this.t.launcher, hidden: true });
    this.panel.style[vertical] = `calc(${oy} + 76px)`;
    this.panel.style[horizontal] = ox;
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
        this.launcher.focus();
      }
    });

    this.tooltip = el('div', { class: 'lu-tooltip', role: 'status', hidden: true });
    this.tooltip.style[vertical] = `calc(${oy} + 8px)`;
    this.tooltip.style[horizontal] = `calc(${ox} + 76px)`;

    this.recbar = el('div', { class: 'lu-recbar', hidden: true });
    this.recbar.style[vertical] = oy;
    this.recbar.style[horizontal] = ox;

    this.root.append(this.launcher, this.tooltip, this.panel, this.recbar);
  }

  private setView(view: View): void {
    this.view = view;
    this.render();
  }

  private render(): void {
    const t = this.t;
    this.panel.replaceChildren();
    const closeBtn = this.iconButton(icons.close, t.close, () => this.close());
    closeBtn.classList.add('lu-close');

    if (this.view === 'home') {
      const greeting = this.deps.config.settings.appearance.greeting || t.greeting;
      this.panel.append(
        el('div', { class: 'lu-header' }, [el('h2', { text: greeting }), el('p', { text: t.subtitle }), closeBtn]),
        el('div', { class: 'lu-body' }, [this.renderOptions()]),
      );
    } else if (this.view === 'form') {
      const types = this.deps.config.settings.reportTypes;
      const canGoBack = (types.screenshot || types.recording) && !this.hasDraft();
      const title = el('div', { class: 'lu-header-row' }, [
        canGoBack ? this.iconButton(icons.back, t.back, () => this.setView('home')) : null,
        el('h2', { text: this.deps.config.settings.appearance.greeting || t.greeting }),
      ]);
      this.panel.append(el('div', { class: 'lu-header' }, [title, closeBtn]), el('div', { class: 'lu-body' }, [this.renderForm()]));
    } else if (this.view === 'sending') {
      const spinner = el('div', { class: 'lu-center' }, [el('div', { class: 'lu-done-sun' }), el('h2', { text: t.sending })]);
      spinner.querySelector('.lu-done-sun')!.innerHTML = sunSvg(this.deps.config.settings.appearance.accentColor);
      this.panel.append(el('div', { class: 'lu-body' }, [spinner]));
    } else if (this.view === 'done') {
      const done = el('div', { class: 'lu-center' }, [
        el('div', { class: 'lu-done-sun' }),
        el('h2', { text: t.doneTitle }),
        el('p', { text: t.doneBody }),
        this.result ? el('div', { class: 'lu-ref', text: `${t.doneRef}: ${this.result.reference}` }) : null,
      ]);
      done.querySelector('.lu-done-sun')!.innerHTML = sunSvg(this.deps.config.settings.appearance.accentColor);
      const ok = el('button', { class: 'lu-btn lu-btn-primary', type: 'button', text: t.doneClose });
      ok.addEventListener('click', () => this.close());
      this.panel.append(el('div', { class: 'lu-header' }, [closeBtn]), el('div', { class: 'lu-body' }, [done, ok]));
    } else if (this.view === 'error') {
      const retry = el('button', { class: 'lu-btn lu-btn-primary', type: 'button', text: t.retry });
      retry.addEventListener('click', () => this.submit());
      const back = el('button', { class: 'lu-btn lu-btn-ghost', type: 'button', text: t.back });
      back.style.width = '100%';
      back.style.marginTop = '8px';
      back.addEventListener('click', () => this.setView('form'));
      this.panel.append(
        el('div', { class: 'lu-header' }, [el('h2', { text: t.errorTitle }), closeBtn]),
        el('div', { class: 'lu-body' }, [el('div', { class: 'lu-notice', text: this.errorMessage }), retry, back]),
      );
    }

    if (this.deps.config.settings.appearance.showBranding) {
      const link = el('a', { href: 'https://lumora.app', target: '_blank', rel: 'noopener', text: 'Lumora ☀' });
      this.panel.append(el('div', { class: 'lu-footer' }, [t.poweredBy, link]));
    }
  }

  private renderOptions(): HTMLElement {
    const t = this.t;
    const types = this.deps.config.settings.reportTypes;
    const option = (icon: string, title: string, hint: string, onClick: () => void, badge?: string) => {
      const b = el('button', { class: 'lu-option', type: 'button' });
      const iconBox = el('span', { class: 'lu-option-icon' });
      iconBox.innerHTML = icon;
      b.append(iconBox, el('div', {}, [el('strong', { text: title }), el('span', { text: hint })]));
      if (badge) b.append(el('span', { class: 'lu-badge', text: badge }));
      b.addEventListener('click', onClick);
      return b;
    };
    const list = el('div', { class: 'lu-options' });
    if (types.screenshot) list.append(option(icons.camera, t.optScreenshot, t.optScreenshotHint, () => this.startScreenshot()));
    if (types.recording && isRecordingSupported()) {
      const max = this.deps.config.settings.recording.maxSeconds;
      list.append(option(icons.video, t.optRecord, t.optRecordHint, () => this.startRecording(), max ? t.limit(max) : undefined));
    }
    if (types.describe) list.append(option(icons.pencil, t.optDescribe, t.optDescribeHint, () => { this.kind = 'describe'; this.setView('form'); }));
    if (this.notice) list.append(el('div', { class: 'lu-notice', text: this.notice }));
    return list;
  }

  private renderForm(): HTMLElement {
    const t = this.t;
    const s = this.deps.config.settings;
    const form = el('form', { novalidate: true });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    // Attachments
    const attachments = el('div', { class: 'lu-attachments' });
    if (this.screenshot) {
      const card = el('div', { class: 'lu-attachment' }, [el('img', { src: this.screenshot.url, alt: t.optScreenshot })]);
      const edit = this.pill(icons.edit, t.editScreenshot, () => this.editScreenshot());
      const remove = this.pill(icons.trash, t.remove, () => {
        this.screenshot = undefined;
        this.render();
      });
      card.append(el('div', { class: 'lu-attachment-bar' }, [edit, remove]));
      attachments.append(card);
    }
    if (this.recording) {
      const video = el('video', { src: this.recording.url, controls: true, playsinline: true, preload: 'metadata' });
      const card = el('div', { class: 'lu-attachment' }, [video]);
      const tag = el('span', { class: 'lu-pill lu-attachment-tag', text: formatDuration(this.recording.durationMs) });
      const remove = this.pill(icons.trash, t.remove, () => {
        URL.revokeObjectURL(this.recording!.url);
        this.recording = undefined;
        this.render();
      });
      card.append(tag, el('div', { class: 'lu-attachment-bar' }, [remove]));
      attachments.append(card);
    }
    if (!this.screenshot && s.reportTypes.screenshot) attachments.append(this.addButton(icons.camera, t.attachScreenshot, () => this.startScreenshot()));
    if (!this.recording && s.reportTypes.recording && isRecordingSupported()) attachments.append(this.addButton(icons.video, t.attachRecording, () => this.startRecording()));
    if (attachments.childElementCount) form.append(attachments);

    if (this.screenshotError) {
      const retry = el('button', { class: 'lu-btn lu-btn-ghost lu-btn-small', type: 'button', text: t.screenshotUseScreen });
      retry.style.marginTop = '8px';
      retry.addEventListener('click', () => this.startScreenshot(true));
      form.append(el('div', { class: 'lu-notice' }, [t.screenshotFailed, el('br'), retry]));
    } else if (this.notice) {
      form.append(el('div', { class: 'lu-notice', text: this.notice }));
    }

    // Steps detected from the recording
    const steps = this.recordingSteps();
    if (steps.length) {
      form.append(
        el('div', { class: 'lu-field' }, [
          el('label', { text: t.stepsDetected(steps.length) }),
          el('ol', { class: 'lu-steps' }, steps.map((step) => el('li', {}, [el('time', { text: formatOffset(step.timestamp) }), step.text]))),
        ]),
      );
    }

    // Template fields
    for (const field of s.template.fields) form.append(this.renderField(field));

    // E-mail for anonymous users
    const reporter = this.deps.getReporter();
    if (s.capture.askEmailIfAnonymous && !reporter.email) {
      const input = el('input', { class: 'lu-input', type: 'email', name: 'lumora-email', placeholder: t.emailPlaceholder, autocomplete: 'email' });
      input.value = this.email;
      input.addEventListener('input', () => {
        this.email = input.value;
        this.clearInvalid('__email', wrap);
      });
      const wrap = el('div', { class: 'lu-field', 'data-invalid': String(this.invalid.has('__email')) }, [el('label', { text: t.email }), input]);
      if (this.invalid.has('__email')) wrap.append(el('div', { class: 'lu-error-text', text: t.invalidEmail }));
      form.append(wrap);
    }

    // Transparency: what technical data is attached
    const data = this.renderIncludedData();
    if (data) form.append(data);

    form.append(el('button', { class: 'lu-btn lu-btn-primary', type: 'submit', text: t.send }));
    return form;
  }

  private renderField(field: TemplateField): HTMLElement {
    const t = this.t;
    const id = `lu-f-${field.id}`;
    const invalid = this.invalid.has(field.id);
    const wrap = el('div', { class: 'lu-field', 'data-invalid': String(invalid) });
    const label = el('label', { for: id }, [field.label]);
    if (field.required) label.append(el('span', { class: 'lu-req', 'aria-hidden': 'true', text: '*' }));
    const onValue = (value: string | boolean) => {
      this.values[field.id] = value;
      this.clearInvalid(field.id, wrap);
    };

    if (field.type === 'checkbox') {
      const input = el('input', { type: 'checkbox', id });
      input.checked = this.values[field.id] === true;
      input.addEventListener('change', () => onValue(input.checked));
      wrap.append(el('label', { class: 'lu-check' }, [input, field.label]));
    } else if (field.type === 'select' && (field.options?.length ?? 0) <= 5) {
      // Few options read better as chips than as a dropdown.
      const chips = el('div', { class: 'lu-chips', role: 'radiogroup', 'aria-label': field.label });
      for (const option of field.options ?? []) {
        const chip = el('button', { class: 'lu-chip', type: 'button', role: 'radio', 'aria-pressed': String(this.values[field.id] === option), 'aria-checked': String(this.values[field.id] === option), text: option });
        chip.addEventListener('click', () => {
          onValue(option);
          chips.querySelectorAll('.lu-chip').forEach((c) => {
            c.setAttribute('aria-pressed', String(c === chip));
            c.setAttribute('aria-checked', String(c === chip));
          });
        });
        chips.append(chip);
      }
      wrap.append(el('label', {}, [field.label, field.required ? el('span', { class: 'lu-req', text: '*' }) : null]), chips);
    } else if (field.type === 'select') {
      const select = el('select', { class: 'lu-select', id }, [el('option', { value: '', text: '—' }), ...(field.options ?? []).map((o) => el('option', { value: o, text: o }))]);
      select.value = String(this.values[field.id] ?? '');
      select.addEventListener('change', () => onValue(select.value));
      wrap.append(label, select);
    } else {
      const input =
        field.type === 'textarea'
          ? el('textarea', { class: 'lu-textarea', id, placeholder: field.placeholder ?? '' })
          : el('input', { class: 'lu-input', id, type: field.type === 'email' ? 'email' : 'text', placeholder: field.placeholder ?? '' });
      input.value = String(this.values[field.id] ?? '');
      input.addEventListener('input', () => onValue(input.value));
      wrap.append(label, input);
    }
    if (invalid) wrap.append(el('div', { class: 'lu-error-text', text: field.type === 'email' ? t.invalidEmail : t.required }));
    return wrap;
  }

  private renderIncludedData(): HTMLElement | null {
    const t = this.t;
    const c = this.deps.config.settings.capture;
    const rows: HTMLElement[] = [];
    const toggle = (key: keyof Widget['include'], label: string) => {
      const input = el('input', { type: 'checkbox' });
      input.checked = this.include[key];
      input.addEventListener('change', () => (this.include[key] = input.checked));
      rows.push(el('label', { class: 'lu-check' }, [input, label]));
    };
    if (c.console.enabled) toggle('console', t.dataConsole(this.deps.console.entries(c.console.levels, c.console.maxEntries).length));
    if (c.network.enabled) toggle('network', t.dataNetwork(this.deps.network.entries(true, c.network.maxEntries).length));
    if (c.breadcrumbs && !this.recording) toggle('actions', t.dataActions(this.deps.actions.recent(20).length));
    if (c.environment) toggle('environment', t.dataEnvironment);
    if (!rows.length) return null;
    const summary = el('summary', {}, [t.includedData]);
    const chev = el('span', { class: 'lu-chev' });
    chev.innerHTML = icons.chevron;
    summary.append(chev);
    return el('details', { class: 'lu-data' }, [summary, el('div', { class: 'lu-data-body' }, [el('p', { text: t.includedDataHint }), ...rows])]);
  }

  // ---------- Screenshot ----------

  private async startScreenshot(useDisplay = false): Promise<void> {
    const s = this.deps.config.settings;
    this.notice = '';
    this.screenshotError = false;
    this.kind = this.recording ? 'recording' : 'screenshot';
    this.hideAll();
    await nextFrames(2);
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = useDisplay
        ? await captureDisplay(s.capture.redactSelectors)
        : await captureDom({ exclude: (node) => node === this.deps.host, redactSelectors: s.capture.redactSelectors });
      this.flash();
    } catch (error) {
      if (useDisplay) this.notice = this.t.recordingDenied;
      else this.screenshotError = true;
    }
    this.showLauncher();
    if (canvas) {
      const edited = await annotate(this.root, canvas, this.t);
      this.setScreenshot(edited ?? canvas);
    }
    this.open('describe');
  }

  private async editScreenshot(): Promise<void> {
    if (!this.screenshot) return;
    this.panel.hidden = true;
    const edited = await annotate(this.root, this.screenshot.canvas, this.t);
    if (edited) this.setScreenshot(edited);
    this.open('describe');
  }

  private setScreenshot(canvas: HTMLCanvasElement): void {
    // A data URL keeps the preview synchronous; the PNG blob is encoded at submit time.
    this.screenshot = { canvas, url: canvas.toDataURL('image/jpeg', 0.7) };
  }

  // ---------- Recording ----------

  private async startRecording(): Promise<void> {
    const t = this.t;
    const s = this.deps.config.settings;
    this.notice = '';
    if (!isRecordingSupported()) {
      this.notice = t.recordingUnsupported;
      return this.open();
    }
    this.hideAll();
    const recorder = new ScreenRecorder();
    this.recorder = recorder;
    this.recordingActions = [];
    try {
      await recorder.start({
        maxSeconds: s.recording.maxSeconds,
        microphone: s.recording.allowMicrophone,
        onTick: (ms) => this.updateRecbar(ms),
        onAutoStop: () => this.stopRecording(),
      });
    } catch {
      this.recorder = undefined;
      this.notice = t.recordingDenied;
      this.showLauncher();
      return this.open();
    }
    this.stopActionListener = this.deps.actions.onAction((action) => {
      this.recordingActions.push({ ...action, timestamp: action.timestamp - recorder.startTime });
    });
    this.showRecbar();
  }

  private async stopRecording(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = undefined;
    this.stopActionListener?.();
    this.recbar.hidden = true;
    const result = await recorder.stop();
    if (this.recording) URL.revokeObjectURL(this.recording.url);
    this.recording = { blob: result.blob, url: URL.createObjectURL(result.blob), durationMs: result.durationMs, actions: this.recordingActions };
    this.kind = 'recording';
    this.showLauncher();
    this.open('describe');
  }

  private cancelRecording(): void {
    this.recorder?.cancel();
    this.recorder = undefined;
    this.stopActionListener?.();
    this.recbar.hidden = true;
    this.showLauncher();
  }

  private showRecbar(): void {
    const t = this.t;
    const stop = el('button', { class: 'lu-btn lu-btn-danger', type: 'button' });
    stop.innerHTML = icons.stop;
    stop.append(t.stop);
    stop.addEventListener('click', () => this.stopRecording());
    const cancel = el('button', { class: 'lu-btn lu-btn-ghost', type: 'button', text: t.cancel });
    cancel.addEventListener('click', () => this.cancelRecording());
    const max = this.deps.config.settings.recording.maxSeconds;
    this.recbar.replaceChildren(
      el('span', { class: 'lu-recdot' }),
      el('span', { class: 'lu-rectime', text: '0:00' }),
      ...(max ? [el('span', { class: 'lu-muted', text: `/ ${formatDuration(max * 1000)}` })] : []),
      cancel,
      stop,
    );
    this.recbar.setAttribute('aria-label', t.recording);
    this.recbar.hidden = false;
  }

  private updateRecbar(ms: number): void {
    const time = this.recbar.querySelector('.lu-rectime');
    if (time) time.textContent = formatDuration(ms);
  }

  private recordingSteps(): Step[] {
    if (!this.recording || !this.deps.config.settings.capture.recordingSteps) return [];
    return buildSteps(this.recording.actions, this.locale);
  }

  // ---------- Submit ----------

  private validate(): boolean {
    this.invalid.clear();
    const s = this.deps.config.settings;
    for (const field of s.template.fields) {
      const value = this.values[field.id];
      if (field.required && (value === undefined || value === '' || value === false)) this.invalid.add(field.id);
      else if (field.type === 'email' && typeof value === 'string' && value && !isEmail(value)) this.invalid.add(field.id);
    }
    if (s.capture.askEmailIfAnonymous && !this.deps.getReporter().email && this.email && !isEmail(this.email)) this.invalid.add('__email');
    return this.invalid.size === 0;
  }

  private async submit(): Promise<void> {
    if (!this.validate()) {
      this.render();
      this.panel.querySelector<HTMLElement>('[data-invalid="true"] input, [data-invalid="true"] textarea, [data-invalid="true"] select, [data-invalid="true"] button')?.focus();
      return;
    }
    this.setView('sending');
    try {
      const payload = this.buildPayload();
      const screenshot = this.screenshot ? await canvasToBlob(this.screenshot.canvas) : undefined;
      const result = await this.deps.api.submit(payload, { screenshot, recording: this.recording?.blob });
      this.result = result;
      this.setView('done');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.setView('error');
    }
  }

  private buildPayload(): ReportPayload {
    const c = this.deps.config.settings.capture;
    const scrub = c.redactSensitiveData;
    const text = (v: string) => (scrub ? redactText(v) : v);

    const reporter = { ...this.deps.getReporter() };
    if (!reporter.email && this.email) reporter.email = this.email;

    const payload: ReportPayload = {
      kind: this.recording ? 'recording' : this.screenshot ? 'screenshot' : this.kind,
      fields: { ...this.values },
      reporter,
      metadata: this.deps.getMetadata(),
    };
    if (c.environment && this.include.environment) {
      const env = captureEnvironment();
      payload.environment = scrub ? { ...env, url: redactUrl(env.url), referrer: redactUrl(env.referrer) } : env;
    }
    if (c.console.enabled && this.include.console) {
      payload.console = this.deps.console.entries(c.console.levels, c.console.maxEntries).map((e) => ({
        ...e,
        message: text(e.message),
        stack: e.stack ? text(e.stack) : undefined,
      }));
    }
    if (c.network.enabled && this.include.network) {
      payload.network = this.deps.network.entries(c.network.failedOnly, c.network.maxEntries).map((e) => ({ ...e, url: scrub ? redactUrl(e.url) : e.url }));
    }
    const cleanAction = (a: UserAction): UserAction => ({ ...a, label: text(a.label), value: a.value ? text(a.value) : undefined });
    if (c.breadcrumbs && this.include.actions) payload.breadcrumbs = this.deps.actions.recent(20).map(cleanAction);
    if (this.recording) {
      payload.recordingDurationMs = this.recording.durationMs;
      if (c.recordingSteps) payload.recordingActions = this.recording.actions.map(cleanAction);
    }
    return payload;
  }

  private resetForm(): void {
    if (this.recording) URL.revokeObjectURL(this.recording.url);
    this.screenshot = undefined;
    this.recording = undefined;
    this.screenshotError = false;
    this.notice = '';
    this.email = '';
    this.invalid.clear();
    this.result = undefined;
    this.include = { console: true, network: true, environment: true, actions: true };
    this.values = {};
    for (const field of this.deps.config.settings.template.fields) {
      if (field.type === 'select' && field.options?.length) this.values[field.id] = field.options[0];
    }
    this.kind = 'describe';
    this.view = 'home';
  }

  private hasDraft(): boolean {
    return !!(this.screenshot || this.recording || this.screenshotError);
  }

  // ---------- Proactive help ----------

  private onPageError(): void {
    if (!this.deps.config.settings.appearance.proactiveOnError) return;
    if (!this.panel.hidden || this.recorder || this.launcher.hidden) return;
    this.launcher.setAttribute('data-mood', 'worried');
    window.clearTimeout(this.moodTimer);
    this.moodTimer = window.setTimeout(() => this.launcher.setAttribute('data-mood', 'happy'), 20000);
    if (this.proactiveShown) return;
    this.proactiveShown = true;
    const report = el('button', { class: 'lu-btn lu-btn-small', type: 'button', text: this.t.proactiveCta });
    report.style.background = 'var(--lu-accent)';
    report.style.color = 'var(--lu-on-accent)';
    report.addEventListener('click', () => this.open());
    const dismiss = el('button', { class: 'lu-btn lu-btn-ghost lu-btn-small', type: 'button', text: this.t.dismiss });
    dismiss.addEventListener('click', () => this.hideTooltip());
    this.tooltip.replaceChildren(el('div', { text: this.t.proactive }), el('div', { class: 'lu-tooltip-actions' }, [report, dismiss]));
    window.setTimeout(() => {
      if (this.panel.hidden && !this.recorder) this.tooltip.hidden = false;
    }, 600);
    window.setTimeout(() => this.hideTooltip(), 15000);
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
    this.launcher.setAttribute('data-mood', 'happy');
  }

  // ---------- Helpers ----------

  private hideAll(): void {
    this.panel.hidden = true;
    this.tooltip.hidden = true;
    this.launcher.hidden = true;
  }

  private showLauncher(): void {
    this.launcher.hidden = false;
  }

  private flash(): void {
    const flash = el('div', { class: 'lu-flash' });
    this.root.append(flash);
    setTimeout(() => flash.remove(), 500);
  }

  private clearInvalid(id: string, wrap: HTMLElement): void {
    if (!this.invalid.delete(id)) return;
    wrap.setAttribute('data-invalid', 'false');
    wrap.querySelector('.lu-error-text')?.remove();
  }

  private iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', { class: 'lu-icon-btn', type: 'button', 'aria-label': label, title: label });
    b.innerHTML = icon;
    b.addEventListener('click', onClick);
    return b;
  }

  private pill(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', { class: 'lu-pill', type: 'button', 'aria-label': label, title: label });
    b.innerHTML = icon;
    b.addEventListener('click', onClick);
    return b;
  }

  private addButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', { class: 'lu-attach-add', type: 'button' });
    b.innerHTML = icon;
    b.append(label);
    b.addEventListener('click', onClick);
    return b;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });
}

/** Black or white text, whichever reads better on the accent color. */
export function readableOn(hex: string): string {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (!m) return '#1a1300';
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.36 ? '#1a1300' : '#ffffff';
}
