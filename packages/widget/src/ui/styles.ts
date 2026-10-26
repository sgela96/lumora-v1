import { NEBULA_CSS } from '@lumora/shared';

export const STYLES = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
.lu-root {
  --lu-accent: #FFD666;
  --lu-accent-soft: #FDF1D2;
  --lu-on-accent: #3A2A00;
  --lu-bg: rgba(255, 255, 255, .86);
  --lu-solid: #ffffff;
  --lu-surface: rgba(118, 118, 128, .08);
  --lu-surface-2: rgba(118, 118, 128, .14);
  --lu-text: #1d1d1f;
  --lu-muted: #6e6e73;
  --lu-border: rgba(0, 0, 0, .08);
  --lu-danger: #e0453a;
  --lu-shadow: 0 30px 80px -20px rgba(29, 29, 31, .28), 0 10px 24px -12px rgba(29, 29, 31, .12), 0 0 0 .5px rgba(0, 0, 0, .1);
  --lu-ease: cubic-bezier(.32, .72, 0, 1);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: -.005em;
  color: var(--lu-text);
  -webkit-font-smoothing: antialiased;
}
.lu-root[data-theme="dark"] {
  --lu-bg: rgba(30, 30, 32, .84);
  --lu-solid: #1c1c1e;
  --lu-surface: rgba(118, 118, 128, .18);
  --lu-surface-2: rgba(118, 118, 128, .26);
  --lu-text: #f5f5f7;
  --lu-muted: #98989d;
  --lu-border: rgba(255, 255, 255, .1);
  --lu-shadow: 0 30px 80px -20px rgba(0, 0, 0, .7), 0 0 0 .5px rgba(255, 255, 255, .12);
}
${NEBULA_CSS}

/* ---------- Launcher: the nebula ---------- */
.lu-launcher {
  position: fixed;
  z-index: 2147483646;
  width: 62px;
  height: 62px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform .5s var(--lu-ease);
}
.lu-launcher:hover { transform: scale(1.06); }
.lu-launcher:active { transform: scale(.96); }
.lu-launcher:focus-visible { outline: 2px solid var(--lu-accent); outline-offset: 4px; }
.lu-launcher[hidden] { display: none; }
/* Hidden-until-needed: the nebula blooms into its corner, and folds away again. */
.lu-launcher.lu-arrive { animation: lu-arrive .9s var(--lu-ease) both; }
.lu-launcher.lu-depart { animation: lu-depart .6s var(--lu-ease) both; pointer-events: none; }
@keyframes lu-arrive { 0% { opacity: 0; transform: scale(.2) rotate(-40deg); filter: blur(6px) brightness(1.4); } 60% { opacity: 1; transform: scale(1.12) rotate(6deg); filter: none; } 100% { opacity: 1; transform: scale(1); } }
@keyframes lu-depart { 0% { opacity: 1; transform: scale(1); } 30% { transform: scale(1.08) rotate(6deg); } 100% { opacity: 0; transform: scale(.2) rotate(-40deg); filter: blur(6px); } }
.lu-orb { position: absolute; inset: 0; transition: transform .7s var(--lu-ease), filter .7s var(--lu-ease); }
.lu-launcher[data-open="true"] .lu-orb { transform: scale(1.14) rotate(25deg); filter: brightness(1.05) saturate(1.1); }
.lu-orb.lu-expand { animation: lu-expand .75s var(--lu-ease); }
.lu-orb.lu-contract { animation: lu-contract .7s var(--lu-ease); }
.lu-orb.lu-absorb { animation: lu-absorb 1.1s var(--lu-ease); }
@keyframes lu-expand { 0% { transform: scale(1); } 45% { transform: scale(1.38) rotate(18deg); filter: brightness(1.15); } 100% { transform: scale(1.14) rotate(25deg); } }
@keyframes lu-contract { 0% { transform: scale(1.14) rotate(25deg); } 45% { transform: scale(.8) rotate(10deg); } 100% { transform: scale(1); } }
@keyframes lu-absorb { 0% { transform: scale(.85); } 35% { transform: scale(1.32); filter: brightness(1.3) saturate(1.2); } 100% { transform: scale(1); } }

/* Gentle alert when the page throws an error */
.lu-alert-ring { position: absolute; inset: 6px; border-radius: 50%; pointer-events: none; opacity: 0; }
.lu-launcher[data-mood="alert"] .lu-alert-ring { animation: lu-ring 2.2s ease-out 3; }
.lu-launcher[data-mood="alert"] .lu-dot { opacity: 1; transform: scale(1); }
@keyframes lu-ring { 0% { opacity: .7; box-shadow: 0 0 0 0 rgba(240, 120, 90, .55); } 100% { opacity: 0; box-shadow: 0 0 0 18px rgba(240, 120, 90, 0); } }
.lu-dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: #F08A6B; box-shadow: 0 0 0 2px var(--lu-solid); opacity: 0; transform: scale(.4); transition: opacity .3s, transform .4s var(--lu-ease); }

.lu-tooltip {
  position: fixed;
  z-index: 2147483646;
  max-width: 270px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--lu-bg);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  color: var(--lu-text);
  box-shadow: var(--lu-shadow);
  font-size: 13px;
  animation: lu-rise .45s var(--lu-ease);
}
.lu-tooltip-actions { display: flex; gap: 6px; margin-top: 10px; }
.lu-tooltip-title { font-weight: 600; }
.lu-tooltip-quote { margin-top: 6px; padding-left: 9px; border-left: 2px solid var(--lu-accent); color: var(--lu-muted, inherit); opacity: .85; font-size: 12.5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.lu-tooltip[hidden] { display: none; }

/* ---------- Panel ---------- */
.lu-panel {
  position: fixed;
  z-index: 2147483647;
  width: min(380px, calc(100vw - 24px));
  max-height: min(680px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--lu-bg);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  backdrop-filter: blur(30px) saturate(180%);
  border-radius: 24px;
  box-shadow: var(--lu-shadow);
  overflow: hidden;
}
.lu-panel[hidden] { display: none; }
.lu-panel.lu-opening { animation: lu-panel-in .55s var(--lu-ease) both; }
.lu-panel.lu-closing { animation: lu-panel-out .38s var(--lu-ease) both; pointer-events: none; }
@keyframes lu-panel-in { from { opacity: 0; transform: scale(.4); filter: blur(10px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes lu-panel-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(.3); filter: blur(8px); } }
@keyframes lu-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (max-width: 480px) {
  .lu-panel { left: 10px !important; right: 10px !important; bottom: 10px !important; top: auto !important; width: auto; max-height: calc(100vh - 20px); }
}

.lu-header { position: relative; padding: 22px 22px 10px; }
.lu-header h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -.02em; }
.lu-header p { margin: 4px 0 0; color: var(--lu-muted); font-size: 13px; padding-right: 28px; }
.lu-header-row { display: flex; align-items: center; gap: 6px; }
.lu-icon-btn {
  display: inline-grid; place-items: center;
  width: 30px; height: 30px;
  border: 0; border-radius: 50%;
  background: var(--lu-surface); color: var(--lu-muted);
  cursor: pointer;
  transition: background .2s;
}
.lu-icon-btn:hover { background: var(--lu-surface-2); color: var(--lu-text); }
.lu-icon-btn:focus-visible { outline: 2px solid var(--lu-accent); }
.lu-close { position: absolute; top: 16px; right: 16px; }
.lu-body { padding: 6px 22px 22px; overflow-y: auto; flex: 1; }
.lu-footer { padding: 10px 22px 14px; display: flex; justify-content: center; align-items: center; gap: 6px; color: var(--lu-muted); font-size: 11px; }
.lu-footer a { color: inherit; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.lu-footer .lu-mini { width: 14px; height: 14px; display: inline-block; }

.lu-options { display: grid; gap: 8px; margin-top: 10px; }
.lu-option {
  display: flex; align-items: center; gap: 14px;
  width: 100%;
  padding: 13px 14px;
  border: 0;
  border-radius: 16px;
  background: var(--lu-surface);
  color: var(--lu-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: background .2s, transform .3s var(--lu-ease);
}
.lu-option:hover { background: var(--lu-surface-2); }
.lu-option:active { transform: scale(.985); }
.lu-option:focus-visible { outline: 2px solid var(--lu-accent); outline-offset: 2px; }
.lu-option-icon {
  flex: none; display: grid; place-items: center;
  width: 38px; height: 38px; border-radius: 12px;
  background: var(--lu-solid);
  color: color-mix(in srgb, var(--lu-accent) 70%, #5a3d00);
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 0 0 .5px var(--lu-border);
}
.lu-option strong { display: block; font-weight: 590; }
.lu-option div > span { display: block; color: var(--lu-muted); font-size: 12.5px; }
.lu-option .lu-option-icon { display: grid; place-items: center; }
.lu-option .lu-option-icon svg { display: block; }
.lu-option .lu-badge { margin-left: auto; }
.lu-chev-right { margin-left: auto; color: var(--lu-muted); opacity: .6; }

.lu-field { margin-top: 16px; }
.lu-field > label, .lu-label { display: block; font-weight: 590; font-size: 12.5px; margin-bottom: 6px; color: var(--lu-text); }
.lu-req { color: var(--lu-muted); margin-left: 2px; font-weight: 400; }
.lu-input, .lu-textarea, .lu-select {
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--lu-surface);
  color: var(--lu-text);
  font: inherit;
  transition: box-shadow .2s, background .2s;
}
.lu-textarea { min-height: 92px; resize: vertical; }
.lu-input::placeholder, .lu-textarea::placeholder { color: var(--lu-muted); opacity: .8; }
.lu-input:focus, .lu-textarea:focus, .lu-select:focus {
  outline: none;
  background: var(--lu-solid);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lu-accent) 45%, transparent), 0 0 0 .5px var(--lu-border);
}
.lu-field[data-invalid="true"] .lu-input, .lu-field[data-invalid="true"] .lu-textarea, .lu-field[data-invalid="true"] .lu-select { box-shadow: 0 0 0 2px color-mix(in srgb, var(--lu-danger) 55%, transparent); }
.lu-error-text { color: var(--lu-danger); font-size: 12px; margin-top: 5px; }
.lu-check { display: flex; gap: 8px; align-items: center; font-size: 13px; cursor: pointer; }
.lu-check input { accent-color: var(--lu-accent); width: 16px; height: 16px; }
.lu-mic-row { margin: 2px 4px 0; color: var(--lu-muted); font-size: 12.5px; }
.lu-mic { display: inline-grid; color: var(--lu-muted); }

/* Segmented control for short choice fields */
.lu-segmented { display: flex; padding: 2px; border-radius: 10px; background: var(--lu-surface); }
.lu-segment {
  flex: 1; padding: 6px 10px; border: 0; border-radius: 8px;
  background: transparent; color: var(--lu-text);
  font: inherit; font-size: 13px; cursor: pointer;
  transition: background .25s var(--lu-ease), box-shadow .25s;
}
.lu-segment[aria-checked="true"] { background: var(--lu-solid); font-weight: 590; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 0 0 .5px var(--lu-border); }

.lu-attachments { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
.lu-attachment {
  position: relative; overflow: hidden;
  aspect-ratio: 16 / 10;
  border-radius: 14px;
  background: var(--lu-surface);
  box-shadow: 0 0 0 .5px var(--lu-border);
}
.lu-attachment img, .lu-attachment video { width: 100%; height: 100%; object-fit: cover; display: block; }
.lu-attachment-bar { position: absolute; left: 6px; right: 6px; bottom: 6px; display: flex; gap: 4px; justify-content: flex-end; }
.lu-attachment-tag { position: absolute; left: 6px; top: 6px; }
.lu-attach-add {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  aspect-ratio: 16 / 10; border-radius: 14px;
  border: 1px dashed color-mix(in srgb, var(--lu-muted) 45%, transparent); background: transparent; color: var(--lu-muted);
  font: inherit; font-size: 12.5px; cursor: pointer;
  transition: background .2s, color .2s;
}
.lu-attach-add:hover { background: var(--lu-surface); color: var(--lu-text); }

.lu-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 999px;
  background: rgba(0,0,0,.55); color: #fff;
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font-size: 11.5px; font-weight: 600;
  border: 0; cursor: pointer; font-family: inherit;
}
.lu-badge { padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--lu-solid); color: var(--lu-muted); box-shadow: 0 0 0 .5px var(--lu-border); white-space: nowrap; }

.lu-steps { margin: 0; padding: 10px 12px 10px 30px; background: var(--lu-surface); border-radius: 12px; font-size: 12.5px; max-height: 140px; overflow: auto; }
.lu-steps li { margin: 3px 0; }
.lu-steps time { color: var(--lu-muted); font-variant-numeric: tabular-nums; margin-right: 6px; }

.lu-info { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 11px 12px; border-radius: 12px; background: var(--lu-surface); color: var(--lu-muted); font-size: 12px; line-height: 1.45; }
.lu-info svg { flex: none; margin-top: 1px; color: color-mix(in srgb, var(--lu-accent) 70%, #5a3d00); }
.lu-info strong { color: var(--lu-text); font-weight: 590; }

.lu-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 16px;
  border: 0; border-radius: 14px;
  font: inherit; font-weight: 600;
  cursor: pointer;
  transition: filter .2s, transform .2s var(--lu-ease), opacity .2s;
}
.lu-btn:active { transform: scale(.98); }
.lu-btn:disabled { opacity: .55; cursor: default; }
.lu-btn-primary {
  width: 100%; margin-top: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--lu-accent) 60%, #fffbe8), var(--lu-accent));
  color: var(--lu-on-accent);
  box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 8px 20px -8px color-mix(in srgb, var(--lu-accent) 85%, transparent);
}
.lu-btn-primary:hover:not(:disabled) { filter: brightness(1.03) saturate(1.05); }
.lu-btn-ghost { background: var(--lu-surface); color: var(--lu-text); padding: 8px 12px; font-size: 13px; border-radius: 10px; }
.lu-btn-small { padding: 7px 11px; font-size: 12.5px; border-radius: 10px; }
.lu-btn-plain { background: none; color: var(--lu-muted); font-weight: 500; padding: 8px; width: 100%; margin-top: 6px; }
.lu-btn-plain:hover { color: var(--lu-text); }
.lu-btn-danger { background: #ff3b30; color: #fff; }

.lu-notice { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--lu-danger) 10%, transparent); color: var(--lu-text); font-size: 13px; }

/* ---------- Sending & thank-you ---------- */
.lu-center { position: relative; text-align: center; padding: 8px 4px 2px; }
.lu-center h2 { margin: 14px 0 4px; font-size: 21px; font-weight: 650; letter-spacing: -.025em; }
.lu-center p { margin: 0 auto; color: var(--lu-muted); max-width: 270px; }
.lu-stage { position: relative; width: 132px; height: 132px; margin: 6px auto 0; }
.lu-stage .lu-big { position: absolute; inset: 0; }
.lu-sending .lu-big { animation: lu-sending 1.6s var(--lu-ease) infinite; }
.lu-sending .lu-nb-arms { animation-duration: 4s; }
@keyframes lu-sending { 0%, 100% { transform: scale(.82); opacity: .85; } 50% { transform: scale(.95); opacity: 1; } }

.lu-thanks .lu-big { animation: lu-bloom 1.4s var(--lu-ease) both; }
.lu-thanks .lu-nb-arms { animation: lu-nb-spin 28s linear infinite, lu-unfurl 1.6s var(--lu-ease) both; }
@keyframes lu-bloom { 0% { transform: scale(.35); opacity: 0; filter: blur(6px); } 55% { transform: scale(1.12); opacity: 1; filter: none; } 100% { transform: scale(1); } }
@keyframes lu-unfurl { from { opacity: .3; } to { opacity: 1; } }
.lu-wave { position: absolute; inset: 22%; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--lu-accent) 70%, #fff); opacity: 0; animation: lu-wave 1.8s var(--lu-ease) .25s; }
.lu-wave + .lu-wave { animation-delay: .55s; }
@keyframes lu-wave { 0% { opacity: .8; transform: scale(.6); } 100% { opacity: 0; transform: scale(2.1); } }
.lu-spark { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px; opacity: 0; color: var(--lu-accent); animation: lu-spark 1.5s var(--lu-ease) forwards; }
.lu-spark svg { width: 100%; height: 100%; display: block; }
@keyframes lu-spark {
  0% { opacity: 0; transform: translate(0, 0) scale(.3) rotate(0deg); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(var(--s)) rotate(140deg); }
}
.lu-thanks h2 { animation: lu-rise .6s var(--lu-ease) .35s both; }
.lu-thanks p, .lu-thanks .lu-ref { animation: lu-rise .6s var(--lu-ease) .5s both; }
.lu-ref { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; padding: 6px 12px; border-radius: 999px; background: var(--lu-surface); font-size: 12.5px; color: var(--lu-muted); }
.lu-ref b { color: var(--lu-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
.lu-progress { height: 2px; border-radius: 2px; background: var(--lu-surface); margin-top: 18px; overflow: hidden; }
.lu-progress > span { display: block; height: 100%; width: 100%; background: color-mix(in srgb, var(--lu-accent) 80%, transparent); transform-origin: left; animation: lu-countdown var(--lu-countdown, 5s) linear forwards; }
.lu-panel:hover .lu-progress > span { animation-play-state: paused; }
@keyframes lu-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
  .lu-launcher, .lu-orb, .lu-panel, .lu-big, .lu-spark, .lu-wave { animation: none !important; transition: none !important; }
}

/* ---------- Recording bar ---------- */
.lu-recbar {
  position: fixed; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px;
  padding: 7px 7px 7px 14px;
  border-radius: 999px;
  background: rgba(29, 29, 31, .86); color: #fff;
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  box-shadow: 0 14px 36px -10px rgba(0,0,0,.45);
  font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px;
  animation: lu-rise .4s var(--lu-ease);
}
.lu-recbar[hidden] { display: none; }
.lu-recdot { width: 9px; height: 9px; border-radius: 50%; background: #ff453a; animation: lu-blink 1.4s ease-in-out infinite; }
@keyframes lu-blink { 50% { opacity: .35; } }
.lu-recbar .lu-btn { padding: 7px 12px; border-radius: 999px; font-size: 12.5px; }
.lu-recbar .lu-btn-ghost { background: rgba(255,255,255,.14); color: #fff; }
.lu-recbar .lu-muted { color: #a1a1a6; font-weight: 500; }

/* ---------- Annotator ---------- */
.lu-annotator {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; flex-direction: column;
  background: rgba(16, 16, 18, .72);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  animation: lu-fade .25s ease;
}
@keyframes lu-fade { from { opacity: 0; } }
.lu-annotator-toolbar {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  margin: 16px auto 0; padding: 5px;
  border-radius: 16px; background: var(--lu-bg);
  -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%);
  box-shadow: var(--lu-shadow);
}
.lu-tool {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 10px; border: 0; border-radius: 11px;
  background: transparent; color: var(--lu-text); font: inherit; font-size: 13px; cursor: pointer;
}
.lu-tool:hover { background: var(--lu-surface); }
.lu-tool[aria-pressed="true"] { background: var(--lu-surface-2); font-weight: 590; }
.lu-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--lu-solid); box-shadow: 0 0 0 .5px var(--lu-border); cursor: pointer; padding: 0; margin: 0 2px; }
.lu-swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--lu-text); }
.lu-sep { width: 1px; height: 20px; background: var(--lu-border); margin: 0 4px; }
.lu-annotator-stage { position: relative; flex: 1; display: grid; place-items: center; padding: 18px; min-height: 0; }
.lu-annot-text { position: absolute; transform: translateY(-50%); min-width: 160px; padding: 4px 8px; border: 1.5px dashed currentColor; border-radius: 8px; background: rgba(255,255,255,.92); font: 600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; outline: none; }
.lu-annotator-stage canvas { max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 30px 80px rgba(0,0,0,.5); cursor: crosshair; touch-action: none; background: #fff; }
.lu-annotator-hint { text-align: center; color: rgba(255,255,255,.75); font-size: 12.5px; padding: 0 16px 16px; }

.lu-flash { position: fixed; inset: 0; z-index: 2147483647; background: #fff; pointer-events: none; animation: lu-flash .45s ease-out forwards; }
@keyframes lu-flash { from { opacity: .6; } to { opacity: 0; } }
`;
