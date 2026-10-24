export const STYLES = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
.lu-root {
  --lu-accent: #F59E0B;
  --lu-on-accent: #1a1300;
  --lu-bg: #ffffff;
  --lu-surface: #f7f7f8;
  --lu-surface-2: #efeff1;
  --lu-text: #18181b;
  --lu-muted: #6b6b76;
  --lu-border: #e4e4e7;
  --lu-danger: #e5484d;
  --lu-ok: #2f9e6b;
  --lu-shadow: 0 24px 60px -12px rgba(24, 24, 27, .28), 0 0 0 1px rgba(24, 24, 27, .06);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--lu-text);
  -webkit-font-smoothing: antialiased;
}
.lu-root[data-theme="dark"] {
  --lu-bg: #17171a;
  --lu-surface: #212126;
  --lu-surface-2: #2a2a30;
  --lu-text: #f4f4f5;
  --lu-muted: #a1a1aa;
  --lu-border: #33333a;
  --lu-shadow: 0 24px 60px -12px rgba(0, 0, 0, .6), 0 0 0 1px rgba(255, 255, 255, .06);
}

/* ---------- Launcher: the floating sun ---------- */
.lu-launcher {
  position: fixed;
  z-index: 2147483646;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  animation: lu-float 4.5s ease-in-out infinite;
  -webkit-tap-highlight-color: transparent;
}
.lu-launcher:focus-visible { outline: 3px solid var(--lu-accent); outline-offset: 4px; border-radius: 50%; }
.lu-launcher svg { width: 100%; height: 100%; overflow: visible; display: block; }
.lu-sun-glow { transform-origin: 50px 50px; animation: lu-pulse 3.2s ease-in-out infinite; }
.lu-sun-rays { transform-origin: 50px 50px; animation: lu-spin 28s linear infinite; transition: transform .35s cubic-bezier(.34,1.56,.64,1); }
.lu-sun-rays-inner { transform-origin: 50px 50px; transition: transform .35s cubic-bezier(.34,1.56,.64,1); }
.lu-launcher:hover .lu-sun-rays-inner { transform: scale(1.12); }
.lu-launcher:hover .lu-sun-core { transform: scale(1.04); }
.lu-sun-core { transform-origin: 50px 50px; transition: transform .3s ease; }
.lu-sun-eye { transform-origin: center; transform-box: fill-box; animation: lu-blink 5.5s infinite; }
.lu-sun-mouth-worried { opacity: 0; }
.lu-launcher[data-mood="worried"] { animation: lu-wobble .9s ease-in-out 2, lu-float 4.5s ease-in-out infinite .9s; }
.lu-launcher[data-mood="worried"] .lu-sun-mouth-happy { opacity: 0; }
.lu-launcher[data-mood="worried"] .lu-sun-mouth-worried { opacity: 1; }
.lu-launcher[data-open="true"] .lu-sun-rays-inner { transform: scale(.82); }
.lu-launcher[hidden] { display: none; }

@keyframes lu-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes lu-spin { to { transform: rotate(360deg); } }
@keyframes lu-pulse { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: .9; transform: scale(1.08); } }
@keyframes lu-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
@keyframes lu-wobble { 0%, 100% { rotate: 0deg; } 20% { rotate: -10deg; } 40% { rotate: 8deg; } 60% { rotate: -5deg; } 80% { rotate: 3deg; } }
@media (prefers-reduced-motion: reduce) {
  .lu-launcher, .lu-sun-glow, .lu-sun-rays, .lu-sun-eye { animation: none !important; }
}

.lu-tooltip {
  position: fixed;
  z-index: 2147483646;
  max-width: 260px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--lu-bg);
  color: var(--lu-text);
  box-shadow: var(--lu-shadow);
  font-size: 13px;
  animation: lu-pop .25s cubic-bezier(.34,1.56,.64,1);
}
.lu-tooltip-actions { display: flex; gap: 6px; margin-top: 8px; }
.lu-tooltip[hidden] { display: none; }

/* ---------- Panel ---------- */
.lu-panel {
  position: fixed;
  z-index: 2147483647;
  width: min(384px, calc(100vw - 24px));
  max-height: min(680px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--lu-bg);
  border-radius: 22px;
  box-shadow: var(--lu-shadow);
  overflow: hidden;
  animation: lu-pop .28s cubic-bezier(.34,1.4,.64,1);
}
.lu-panel[hidden] { display: none; }
@keyframes lu-pop { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }
@media (max-width: 480px) {
  .lu-panel { left: 12px !important; right: 12px !important; bottom: 12px !important; top: auto !important; width: auto; max-height: calc(100vh - 24px); }
}

.lu-header {
  position: relative;
  padding: 20px 20px 16px;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--lu-accent) 32%, transparent) 0%, transparent 60%),
    var(--lu-bg);
}
.lu-header h2 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
.lu-header p { margin: 4px 0 0; color: var(--lu-muted); font-size: 13px; padding-right: 24px; }
.lu-header-row { display: flex; align-items: center; gap: 8px; }
.lu-icon-btn {
  display: inline-grid; place-items: center;
  width: 32px; height: 32px;
  border: 0; border-radius: 10px;
  background: transparent; color: var(--lu-muted);
  cursor: pointer;
}
.lu-icon-btn:hover { background: var(--lu-surface-2); color: var(--lu-text); }
.lu-icon-btn:focus-visible { outline: 2px solid var(--lu-accent); }
.lu-close { position: absolute; top: 14px; right: 14px; }
.lu-body { padding: 4px 20px 20px; overflow-y: auto; flex: 1; }
.lu-footer { padding: 10px 20px 14px; border-top: 1px solid var(--lu-border); display: flex; justify-content: center; color: var(--lu-muted); font-size: 11.5px; }
.lu-footer a { color: inherit; font-weight: 600; text-decoration: none; margin-left: 4px; }

.lu-options { display: grid; gap: 10px; margin-top: 8px; }
.lu-option {
  display: flex; align-items: center; gap: 14px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--lu-border);
  border-radius: 16px;
  background: var(--lu-bg);
  color: var(--lu-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: border-color .15s, transform .15s, box-shadow .15s;
}
.lu-option:hover { border-color: var(--lu-accent); transform: translateY(-1px); box-shadow: 0 6px 18px -8px color-mix(in srgb, var(--lu-accent) 60%, transparent); }
.lu-option:focus-visible { outline: 2px solid var(--lu-accent); outline-offset: 2px; }
.lu-option-icon {
  flex: none; display: grid; place-items: center;
  width: 42px; height: 42px; border-radius: 12px;
  background: color-mix(in srgb, var(--lu-accent) 16%, var(--lu-bg));
  color: color-mix(in srgb, var(--lu-accent) 75%, var(--lu-text));
}
.lu-option strong { display: block; font-weight: 600; }
.lu-option span { display: block; color: var(--lu-muted); font-size: 12.5px; }
.lu-option .lu-badge { margin-left: auto; }

.lu-field { margin-top: 14px; }
.lu-field label { display: block; font-weight: 550; font-size: 13px; margin-bottom: 6px; }
.lu-field label .lu-req { color: var(--lu-danger); margin-left: 2px; }
.lu-input, .lu-textarea, .lu-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--lu-border);
  border-radius: 12px;
  background: var(--lu-surface);
  color: var(--lu-text);
  font: inherit;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.lu-textarea { min-height: 96px; resize: vertical; }
.lu-input:focus, .lu-textarea:focus, .lu-select:focus {
  outline: none;
  border-color: var(--lu-accent);
  background: var(--lu-bg);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lu-accent) 25%, transparent);
}
.lu-field[data-invalid="true"] .lu-input, .lu-field[data-invalid="true"] .lu-textarea, .lu-field[data-invalid="true"] .lu-select { border-color: var(--lu-danger); }
.lu-error-text { color: var(--lu-danger); font-size: 12px; margin-top: 4px; }
.lu-check { display: flex; gap: 8px; align-items: center; font-size: 13px; cursor: pointer; }
.lu-check input { accent-color: var(--lu-accent); width: 16px; height: 16px; }

.lu-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lu-chip {
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--lu-border); background: var(--lu-bg); color: var(--lu-text);
  font: inherit; font-size: 13px; cursor: pointer;
}
.lu-chip[aria-pressed="true"] { background: var(--lu-accent); border-color: var(--lu-accent); color: var(--lu-on-accent); font-weight: 600; }

.lu-attachments { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.lu-attachment {
  position: relative; overflow: hidden;
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  background: var(--lu-surface-2);
  border: 1px solid var(--lu-border);
}
.lu-attachment img, .lu-attachment video { width: 100%; height: 100%; object-fit: cover; display: block; }
.lu-attachment-bar { position: absolute; left: 6px; right: 6px; bottom: 6px; display: flex; gap: 4px; justify-content: flex-end; }
.lu-attachment-tag { position: absolute; left: 6px; top: 6px; }
.lu-attach-add {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  aspect-ratio: 16 / 10; border-radius: 12px;
  border: 1.5px dashed var(--lu-border); background: transparent; color: var(--lu-muted);
  font: inherit; font-size: 12.5px; cursor: pointer;
}
.lu-attach-add:hover { border-color: var(--lu-accent); color: var(--lu-text); }

.lu-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 999px;
  background: rgba(0,0,0,.62); color: #fff;
  font-size: 11.5px; font-weight: 600;
  border: 0; cursor: pointer; font-family: inherit;
}
.lu-badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--lu-surface-2); color: var(--lu-muted); }

.lu-steps { margin: 8px 0 0; padding: 10px 12px 10px 30px; background: var(--lu-surface); border-radius: 12px; font-size: 12.5px; max-height: 140px; overflow: auto; }
.lu-steps li { margin: 2px 0; }
.lu-steps time { color: var(--lu-muted); font-variant-numeric: tabular-nums; margin-right: 6px; }

.lu-data { margin-top: 16px; border: 1px solid var(--lu-border); border-radius: 14px; }
.lu-data summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 550; }
.lu-data summary::-webkit-details-marker { display: none; }
.lu-data summary .lu-chev { margin-left: auto; transition: transform .2s; color: var(--lu-muted); }
.lu-data[open] summary .lu-chev { transform: rotate(180deg); }
.lu-data-body { padding: 0 12px 12px; display: grid; gap: 8px; }
.lu-data-body p { margin: 0 0 4px; color: var(--lu-muted); font-size: 12px; }

.lu-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 16px;
  border: 0; border-radius: 12px;
  font: inherit; font-weight: 600;
  cursor: pointer;
  transition: filter .15s, transform .1s;
}
.lu-btn:active { transform: scale(.98); }
.lu-btn:disabled { opacity: .6; cursor: default; }
.lu-btn-primary { background: var(--lu-accent); color: var(--lu-on-accent); width: 100%; margin-top: 18px; }
.lu-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.lu-btn-ghost { background: var(--lu-surface-2); color: var(--lu-text); padding: 7px 12px; font-size: 13px; }
.lu-btn-small { padding: 6px 10px; font-size: 12.5px; border-radius: 10px; }
.lu-btn-danger { background: var(--lu-danger); color: #fff; }

.lu-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: lu-spin .7s linear infinite; }

.lu-center { text-align: center; padding: 18px 4px 6px; }
.lu-center h2 { margin: 12px 0 4px; font-size: 18px; }
.lu-center p { margin: 0; color: var(--lu-muted); }
.lu-ref { display: inline-block; margin-top: 14px; padding: 6px 12px; border-radius: 10px; background: var(--lu-surface); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.lu-done-sun { width: 84px; height: 84px; margin: 0 auto; animation: lu-pop .5s cubic-bezier(.34,1.56,.64,1); }
.lu-done-sun .lu-sun-rays { animation-duration: 6s; }
.lu-notice { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--lu-danger) 12%, var(--lu-bg)); color: var(--lu-text); font-size: 13px; }

/* ---------- Recording bar ---------- */
.lu-recbar {
  position: fixed; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 8px 8px 14px;
  border-radius: 999px;
  background: #18181b; color: #fff;
  box-shadow: 0 12px 32px -8px rgba(0,0,0,.45);
  font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px;
  animation: lu-pop .25s ease;
}
.lu-recbar[hidden] { display: none; }
.lu-recdot { width: 10px; height: 10px; border-radius: 50%; background: #ff4d4f; animation: lu-pulse 1.2s ease-in-out infinite; }
.lu-recbar .lu-btn { padding: 7px 12px; border-radius: 999px; font-size: 12.5px; }
.lu-recbar .lu-muted { color: #a1a1aa; font-weight: 500; }

/* ---------- Annotator ---------- */
.lu-annotator {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; flex-direction: column;
  background: rgba(10,10,12,.82);
  backdrop-filter: blur(4px);
  animation: lu-fade .2s ease;
}
@keyframes lu-fade { from { opacity: 0; } }
.lu-annotator-toolbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin: 14px auto 0; padding: 6px;
  border-radius: 14px; background: var(--lu-bg);
  box-shadow: var(--lu-shadow);
}
.lu-tool {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 10px; border: 0; border-radius: 10px;
  background: transparent; color: var(--lu-text); font: inherit; font-size: 13px; cursor: pointer;
}
.lu-tool[aria-pressed="true"] { background: var(--lu-surface-2); font-weight: 600; }
.lu-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--lu-bg); box-shadow: 0 0 0 1px var(--lu-border); cursor: pointer; padding: 0; }
.lu-swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--lu-text); }
.lu-sep { width: 1px; height: 22px; background: var(--lu-border); margin: 0 2px; }
.lu-annotator-stage { flex: 1; display: grid; place-items: center; padding: 16px; min-height: 0; }
.lu-annotator-stage canvas { max-width: 100%; max-height: 100%; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,.5); cursor: crosshair; touch-action: none; background: #fff; }
.lu-annotator-hint { text-align: center; color: #d4d4d8; font-size: 12.5px; padding: 0 16px 14px; }

.lu-flash { position: fixed; inset: 0; z-index: 2147483647; background: #fff; pointer-events: none; animation: lu-flash .45s ease-out forwards; }
@keyframes lu-flash { from { opacity: .7; } to { opacity: 0; } }
.lu-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
