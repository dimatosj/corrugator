/**
 * Pointer handling for the preview: pan, zoom, and placing marks.
 *
 * The SVG's viewBox is the camera and lives here. Screen coordinates are
 * converted through the element's own CTM, so the maths stays right whatever
 * the canvas is sized to and however the page is scrolled or zoomed.
 */

import { rubberBand, clearRubberBand } from './preview.js';
import { LEGEND, HOLE, FOLD_UP, FOLD_DOWN } from './legend.js';

/** Fold tools are dragged out as a line; the rest drag out a rectangle. */
const LINE_TOOLS = new Set([FOLD_UP, FOLD_DOWN]);

/** Below this drag distance in mm, a drag counts as a click. */
const CLICK_SLOP_MM = 1.2;

export class PatternEditor {
  /**
   * @param {SVGSVGElement} svg
   * @param {{
   *   onAdd:(type:string, a:[number,number], b:[number,number]) => void,
   *   onSelect:(id:string|null) => void,
   *   onMove:(id:string, dx:number, dy:number, commit:boolean) => void,
   * }} handlers
   */
  constructor(svg, handlers) {
    this.svg = svg;
    this.handlers = handlers;
    this.tool = 'select';
    this.view = { x: 0, y: 0, w: 100, h: 100 };
    this.drag = null;

    svg.addEventListener('pointerdown', (e) => this.onDown(e));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (e) => this.onUp(e));
    svg.addEventListener('pointercancel', () => this.cancel());
    svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    svg.addEventListener('dblclick', () => this.fitLast());
  }

  setTool(tool) {
    this.tool = tool;
    this.svg.classList.toggle('tool-select', tool === 'select');
    this.svg.classList.toggle('tool-draw', tool !== 'select');
  }

  /** Frame a box (in mm) with a little breathing room. */
  fit(box, padFraction = 0.06) {
    if (!box) return;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const pad = Math.max(w, h) * padFraction;
    this.lastBox = box;
    this.setView({ x: box.minX - pad, y: box.minY - pad, w: w + pad * 2, h: h + pad * 2 });
  }

  fitLast() {
    if (this.lastBox) this.fit(this.lastBox);
  }

  setView(view) {
    this.view = view;
    // Match the viewBox's aspect ratio to the element, so nothing is letterboxed
    // and a millimetre is the same length in both directions.
    const rect = this.svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const want = rect.width / rect.height;
      const have = view.w / view.h;
      if (have < want) {
        const w = view.h * want;
        view.x -= (w - view.w) / 2;
        view.w = w;
      } else {
        const h = view.w / want;
        view.y -= (h - view.h) / 2;
        view.h = h;
      }
    }
    this.svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  /** Screen event -> millimetres in pattern space. */
  toMm(evt) {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const point = typeof DOMPoint === 'function'
      ? new DOMPoint(evt.clientX, evt.clientY)
      : Object.assign(this.svg.createSVGPoint(), { x: evt.clientX, y: evt.clientY });
    const local = point.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  }

  onDown(evt) {
    if (evt.button !== 0 && evt.pointerType === 'mouse') return;
    const at = this.toMm(evt);
    this.svg.setPointerCapture(evt.pointerId);

    const markId = evt.target?.dataset?.markId ?? null;

    if (this.tool === 'select') {
      if (markId) {
        this.handlers.onSelect(markId);
        this.drag = { kind: 'move', id: markId, from: at, last: at, moved: false };
      } else {
        this.handlers.onSelect(null);
        this.drag = {
          kind: 'pan',
          startView: { ...this.view },
          clientX: evt.clientX,
          clientY: evt.clientY,
        };
        this.svg.classList.add('dragging');
      }
      return;
    }

    if (this.tool === HOLE) {
      this.handlers.onAdd(HOLE, at, at);
      this.drag = null;
      return;
    }

    this.drag = { kind: 'create', tool: this.tool, from: at, last: at };
  }

  onMove(evt) {
    if (!this.drag) return;
    const at = this.toMm(evt);

    if (this.drag.kind === 'pan') {
      // Measure against the view as it was at grab time. Using the live view
      // would feed the pan back into itself and the canvas would skate away.
      const view = this.drag.startView;
      const width = this.svg.getBoundingClientRect().width;
      if (!width) return;
      const perPixel = view.w / width;
      this.setView({
        x: view.x - (evt.clientX - this.drag.clientX) * perPixel,
        y: view.y - (evt.clientY - this.drag.clientY) * perPixel,
        w: view.w,
        h: view.h,
      });
      return;
    }

    if (this.drag.kind === 'move') {
      const dx = at[0] - this.drag.last[0];
      const dy = at[1] - this.drag.last[1];
      this.drag.last = at;
      if (Math.hypot(at[0] - this.drag.from[0], at[1] - this.drag.from[1]) > CLICK_SLOP_MM) {
        this.drag.moved = true;
      }
      this.handlers.onMove(this.drag.id, dx, dy, false);
      return;
    }

    if (this.drag.kind === 'create') {
      this.drag.last = at;
      const style = LEGEND[this.drag.tool];
      rubberBand(
        this.svg,
        LINE_TOOLS.has(this.drag.tool) ? 'line' : 'rect',
        this.drag.from,
        at,
        style?.color ?? '#666',
      );
    }
  }

  onUp(evt) {
    const drag = this.drag;
    this.drag = null;
    this.svg.classList.remove('dragging');
    clearRubberBand(this.svg);
    if (evt.pointerId != null && this.svg.hasPointerCapture?.(evt.pointerId)) {
      this.svg.releasePointerCapture(evt.pointerId);
    }
    if (!drag) return;

    if (drag.kind === 'move' && drag.moved) {
      this.handlers.onMove(drag.id, 0, 0, true);
      return;
    }

    if (drag.kind === 'create') {
      const at = this.toMm(evt);
      const spread = Math.hypot(at[0] - drag.from[0], at[1] - drag.from[1]);
      if (spread < CLICK_SLOP_MM) {
        // A click with a drag tool: drop a default-sized one so a tap still works.
        const size = LINE_TOOLS.has(drag.tool) ? 30 : 20;
        const to = LINE_TOOLS.has(drag.tool)
          ? [drag.from[0] + size, drag.from[1]]
          : [drag.from[0] + size, drag.from[1] + size * 0.6];
        this.handlers.onAdd(drag.tool, drag.from, to);
      } else {
        this.handlers.onAdd(drag.tool, drag.from, at);
      }
    }
  }

  cancel() {
    this.drag = null;
    this.svg.classList.remove('dragging');
    clearRubberBand(this.svg);
  }

  onWheel(evt) {
    evt.preventDefault();
    const at = this.toMm(evt);
    const factor = Math.exp((evt.deltaMode === 1 ? evt.deltaY * 16 : evt.deltaY) * 0.0016);
    const w = clamp(this.view.w * factor, 5, 20000);
    const scale = w / this.view.w;
    // Zoom about the cursor: the point under it must not move.
    this.setView({
      x: at[0] - (at[0] - this.view.x) * scale,
      y: at[1] - (at[1] - this.view.y) * scale,
      w,
      h: this.view.h * scale,
    });
  }

  /** Zoom by a fixed step about the centre, for the toolbar buttons. */
  zoomBy(factor) {
    const cx = this.view.x + this.view.w / 2;
    const cy = this.view.y + this.view.h / 2;
    const w = clamp(this.view.w / factor, 5, 20000);
    const h = this.view.h * (w / this.view.w);
    this.setView({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
