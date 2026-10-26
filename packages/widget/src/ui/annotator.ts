import { el } from '../util';
import type { Strings } from './i18n';
import { icons } from './icons';

type Tool = 'pen' | 'box' | 'hide' | 'text';
type Point = { x: number; y: number };
type Shape =
  | { tool: 'pen'; color: string; width: number; points: Point[] }
  | { tool: 'box' | 'hide'; color: string; width: number; from: Point; to: Point }
  | { tool: 'text'; color: string; width: number; at: Point; text: string; size: number };

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];

/**
 * Full-screen markup editor. Resolves with the annotated canvas, or null if cancelled.
 * "Hide" paints an opaque block so private data never leaves the browser.
 */
export function annotate(root: HTMLElement, source: HTMLCanvasElement, t: Strings): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    const shapes: Shape[] = [];
    let tool: Tool = 'box';
    let color = COLORS[0];
    let drawing: Shape | null = null;
    const lineWidth = Math.max(3, Math.round(source.width / 400));
    const fontSize = Math.max(18, Math.round(source.width / 55));
    let typing: HTMLInputElement | null = null;

    const draw = () => {
      ctx.drawImage(source, 0, 0);
      for (const shape of drawing ? [...shapes, drawing] : shapes) paint(ctx, shape);
    };

    const toolButton = (id: Tool, label: string, icon: string) => {
      const b = el('button', { class: 'lu-tool', type: 'button', 'aria-pressed': String(tool === id) });
      b.innerHTML = icon;
      b.append(label);
      b.addEventListener('click', () => {
        tool = id;
        toolbar.querySelectorAll<HTMLButtonElement>('.lu-tool[aria-pressed]').forEach((n) => n.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
      });
      return b;
    };

    const swatches = COLORS.map((c) => {
      const s = el('button', { class: 'lu-swatch', type: 'button', 'aria-label': c, 'aria-pressed': String(c === color) });
      s.style.background = c;
      s.addEventListener('click', () => {
        color = c;
        swatches.forEach((n) => n.setAttribute('aria-pressed', String(n === s)));
      });
      return s;
    });

    const undo = el('button', { class: 'lu-tool', type: 'button' });
    undo.innerHTML = icons.undo;
    undo.append(t.undo);
    undo.addEventListener('click', () => {
      shapes.pop();
      draw();
    });

    const cancel = el('button', { class: 'lu-btn lu-btn-ghost lu-btn-small', type: 'button', text: t.cancel });
    const save = el('button', { class: 'lu-btn lu-btn-small', type: 'button', text: t.save });
    save.style.background = 'var(--lu-accent)';
    save.style.color = 'var(--lu-on-accent)';

    const toolbar = el('div', { class: 'lu-annotator-toolbar', role: 'toolbar' }, [
      toolButton('box', t.box, icons.square),
      toolButton('pen', t.pen, icons.pencil.replace(/width="20" height="20"/, 'width="16" height="16"')),
      toolButton('text', t.text, icons.type),
      toolButton('hide', t.hide, icons.eyeOff),
      el('span', { class: 'lu-sep' }),
      ...swatches,
      el('span', { class: 'lu-sep' }),
      undo,
      cancel,
      save,
    ]);

    const overlay = el('div', { class: 'lu-annotator', role: 'dialog', 'aria-modal': 'true', 'aria-label': t.editScreenshot }, [
      toolbar,
      el('div', { class: 'lu-annotator-stage' }, [canvas]),
      el('div', { class: 'lu-annotator-hint', text: t.annotateHint }),
    ]);

    const point = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
    };

    // Text: a small input appears where the user clicked; Enter or clicking elsewhere places it.
    const commitText = () => {
      if (!typing) return;
      const input = typing;
      typing = null;
      const text = input.value.trim();
      if (text) shapes.push({ tool: 'text', color, width: lineWidth, at: JSON.parse(input.dataset.at!), text, size: fontSize });
      input.remove();
      draw();
    };
    const startText = (e: PointerEvent) => {
      commitText();
      const r = canvas.getBoundingClientRect();
      const stage = canvas.parentElement!.getBoundingClientRect();
      const input = el('input', { class: 'lu-annot-text', type: 'text', placeholder: t.textPlaceholder, 'aria-label': t.text }) as HTMLInputElement;
      input.dataset.at = JSON.stringify(point(e));
      input.style.left = `${e.clientX - stage.left}px`;
      input.style.top = `${e.clientY - stage.top}px`;
      input.style.color = color;
      input.style.fontSize = `${Math.max(14, fontSize * (r.width / canvas.width))}px`;
      input.addEventListener('keydown', (k) => {
        k.stopPropagation();
        if (k.key === 'Enter') commitText();
        if (k.key === 'Escape') { input.value = ''; commitText(); }
      });
      input.addEventListener('blur', commitText);
      canvas.parentElement!.append(input);
      typing = input;
      requestAnimationFrame(() => input.focus());
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (tool === 'text') {
        e.preventDefault();
        startText(e);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      const p = point(e);
      drawing = tool === 'pen' ? { tool, color, width: lineWidth, points: [p] } : { tool: tool as 'box' | 'hide', color, width: lineWidth, from: p, to: p };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = point(e);
      if (drawing.tool === 'pen') drawing.points.push(p);
      else if (drawing.tool !== 'text') drawing.to = p;
      draw();
    });
    const finish = () => {
      if (drawing) shapes.push(drawing);
      drawing = null;
      draw();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);

    const close = (result: HTMLCanvasElement | null) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        shapes.pop();
        draw();
      }
    };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => close(null));
    save.addEventListener('click', () => {
      commitText();
      close(canvas);
    });

    draw();
    root.append(overlay);
    save.focus();
  });
}

function paint(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = shape.width;
  ctx.strokeStyle = shape.color;
  if (shape.tool === 'text') {
    // A white halo keeps the words readable on any background.
    ctx.font = `600 ${shape.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, shape.size / 4);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.strokeText(shape.text, shape.at.x, shape.at.y);
    ctx.fillStyle = shape.color;
    ctx.fillText(shape.text, shape.at.x, shape.at.y);
  } else if (shape.tool === 'pen') {
    ctx.beginPath();
    shape.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  } else {
    const x = Math.min(shape.from.x, shape.to.x);
    const y = Math.min(shape.from.y, shape.to.y);
    const w = Math.abs(shape.to.x - shape.from.x);
    const h = Math.abs(shape.to.y - shape.from.y);
    if (shape.tool === 'hide') {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.fillStyle = `${shape.color}22`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }
  ctx.restore();
}
