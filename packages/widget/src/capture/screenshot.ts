import { toCanvas } from 'html-to-image';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface ScreenshotOptions {
  /** Return true for nodes that must not appear (the widget itself). */
  exclude: (node: Node) => boolean;
  redactSelectors: string[];
}

/**
 * Renders the visible part of the page from the DOM. No permission prompt, works on every
 * browser; cross-origin iframes and some exotic CSS can't be rendered.
 */
export async function captureDom(options: ScreenshotOptions): Promise<HTMLCanvasElement> {
  const root = document.documentElement;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const htmlBg = getComputedStyle(root).backgroundColor;
  const isTransparent = (c: string) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
  const backgroundColor = !isTransparent(bodyBg) ? bodyBg : !isTransparent(htmlBg) ? htmlBg : '#ffffff';

  const render = (skipFonts: boolean) =>
    toCanvas(root, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor,
      skipFonts,
      cacheBust: false,
      imagePlaceholder: TRANSPARENT_PIXEL,
      filter: (node) => !options.exclude(node),
      style: {
        transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
        transformOrigin: 'top left',
      },
    });

  const restore = mirrorFormState();
  let canvas: HTMLCanvasElement;
  try {
    canvas = await withTimeout(render(false), 8000);
  } catch {
    // Web font embedding is the usual culprit (CORS, slow CDNs) — retry without it.
    canvas = await withTimeout(render(true), 8000);
  } finally {
    restore();
  }
  redact(canvas, options.redactSelectors, canvas.width / width);
  return canvas;
}

/**
 * DOM cloning copies attributes, not live state: mirror the current <select> choice and
 * checkbox/radio state into attributes for the capture, then put the attributes back.
 */
function mirrorFormState(): () => void {
  const undo: (() => void)[] = [];
  const setAttr = (node: Element, name: string, on: boolean) => {
    const had = node.hasAttribute(name);
    if (had === on) return;
    if (on) node.setAttribute(name, '');
    else node.removeAttribute(name);
    undo.push(() => (had ? node.setAttribute(name, '') : node.removeAttribute(name)));
  };
  document.querySelectorAll('option').forEach((o) => setAttr(o, 'selected', o.selected));
  document.querySelectorAll<HTMLInputElement>('input[type=checkbox], input[type=radio]').forEach((i) => setAttr(i, 'checked', i.checked));
  return () => undo.forEach((fn) => fn());
}

/**
 * Pixel-perfect capture of the current tab through the browser's screen-share prompt.
 * Used as a fallback when the DOM can't be rendered, or when configured.
 */
export async function captureDisplay(redactSelectors: string[]): Promise<HTMLCanvasElement> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions);
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Give the browser a moment to hide its own "sharing" chrome and paint a fresh frame.
    await new Promise((r) => setTimeout(r, 350));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    redact(canvas, redactSelectors, canvas.width / window.innerWidth);
    return canvas;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Paints solid boxes over elements the site owner marked as private. */
function redact(canvas: HTMLCanvasElement, selectors: string[], scale: number): void {
  if (!selectors.length) return;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1f2937';
  for (const selector of selectors) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      continue;
    }
    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      if (r.width && r.height) ctx.fillRect(r.left * scale, r.top * scale, r.width * scale, r.height * scale);
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Screenshot timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), type, quality);
  });
}
