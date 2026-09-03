/**
 * Turn a pattern into a flat list of drawing primitives.
 *
 * Both exporters consume this, so the ChompShop legend is applied in exactly
 * one place and an SVG and a PDF of the same pattern cannot drift apart.
 * Coordinates are millimetres in pattern space.
 */

import { LEGEND, LEGEND_ORDER, CHECKER_MM, CUT, HOLE, TAPE_FRONT, TAPE_BACK } from '../legend.js';
import { markBox } from '../pattern.js';

/**
 * @typedef {{kind:'path', path:Path, stroke:string, width:number, dash:number[]|null}
 *   | {kind:'line', a:[number,number], b:[number,number], stroke:string, width:number, dash:number[]|null}
 *   | {kind:'circle', x:number, y:number, r:number, stroke:string, width:number}
 *   | {kind:'rect', x:number, y:number, w:number, h:number, stroke:string, width:number, dash:number[]|null}
 *   | {kind:'checker', x:number, y:number, w:number, h:number, color:string, size:number}
 *   | {kind:'text', x:number, y:number, size:number, text:string, color:string, bold?:boolean}
 * } Primitive
 */

/**
 * @param {import('../pattern.js').Pattern} pattern
 * @param {{offsetX?:number, offsetY?:number}} [opts]
 * @returns {Primitive[]}
 */
export function patternPrimitives(pattern, opts = {}) {
  const dx = opts.offsetX ?? 0;
  const dy = opts.offsetY ?? 0;
  const out = [];

  // Tape zones sit under everything so the checker never hides a cut line.
  for (const mark of pattern.marks) {
    if (mark.type !== TAPE_FRONT && mark.type !== TAPE_BACK) continue;
    const style = LEGEND[mark.type];
    out.push({
      kind: 'checker',
      x: mark.x + dx, y: mark.y + dy, w: mark.w, h: mark.h,
      color: style.color, size: CHECKER_MM,
    });
    out.push({
      kind: 'rect',
      x: mark.x + dx, y: mark.y + dy, w: mark.w, h: mark.h,
      stroke: style.color, width: style.width, dash: style.dash,
    });
  }

  const cut = LEGEND[CUT];
  for (const part of pattern.parts) {
    for (const path of [part.outer, ...part.holes]) {
      out.push({
        kind: 'path',
        path: dx || dy ? shift(path, dx, dy) : path,
        stroke: cut.color,
        width: cut.width,
        dash: cut.dash,
      });
    }
  }

  for (const mark of pattern.marks) {
    const style = LEGEND[mark.type];
    if (mark.type === TAPE_FRONT || mark.type === TAPE_BACK) continue;

    if (mark.type === HOLE) {
      out.push({
        kind: 'circle',
        x: mark.x + dx, y: mark.y + dy, r: mark.d / 2,
        stroke: style.color, width: style.width,
      });
    } else if (mark.pts) {
      out.push({
        kind: 'line',
        a: [mark.pts[0][0] + dx, mark.pts[0][1] + dy],
        b: [mark.pts[1][0] + dx, mark.pts[1][1] + dy],
        stroke: style.color, width: style.width, dash: style.dash,
      });
    } else {
      out.push({
        kind: 'rect',
        x: mark.x + dx, y: mark.y + dy, w: mark.w, h: mark.h,
        stroke: style.color, width: style.width, dash: style.dash,
      });
    }
  }

  return out;
}

function shift(path, dx, dy) {
  return path.map((seg) => {
    if (seg.c === 'Z') return seg;
    if (seg.c === 'C') {
      return { c: 'C', x1: seg.x1 + dx, y1: seg.y1 + dy, x2: seg.x2 + dx, y2: seg.y2 + dy, x: seg.x + dx, y: seg.y + dy };
    }
    return { c: seg.c, x: seg.x + dx, y: seg.y + dy };
  });
}

/** Height a legend block will occupy, so callers can reserve room for it. */
export function legendHeight(types = LEGEND_ORDER) {
  return 6 + types.length * 7;
}

/**
 * A printed key to the pattern language, drawn at (x, y) with the given width.
 * Only the symbols actually used are listed, plus the cut line always.
 */
export function legendPrimitives(x, y, width, usedTypes) {
  const types = LEGEND_ORDER.filter((t) => t === CUT || usedTypes.has(t));
  const out = [{ kind: 'text', x, y: y + 4, size: 4.2, text: 'What the marks mean', color: '#111111', bold: true }];

  const sampleW = 14;
  let row = y + 11;
  for (const type of types) {
    const style = LEGEND[type];
    const cx = x + sampleW / 2;

    if (style.shape === 'circle') {
      out.push({ kind: 'circle', x: cx, y: row - 1.2, r: 2.2, stroke: style.color, width: style.width });
    } else if (style.fill === 'checker') {
      out.push({ kind: 'checker', x, y: row - 4, w: sampleW, h: 5.5, color: style.color, size: 2 });
      out.push({ kind: 'rect', x, y: row - 4, w: sampleW, h: 5.5, stroke: style.color, width: style.width, dash: null });
    } else if (style.shape === 'rect') {
      out.push({ kind: 'rect', x, y: row - 4, w: sampleW, h: 5.5, stroke: style.color, width: style.width, dash: style.dash });
    } else {
      out.push({
        kind: 'line',
        a: [x, row - 1.2], b: [x + sampleW, row - 1.2],
        stroke: style.color, width: Math.max(style.width, 0.7), dash: style.dash,
      });
    }

    out.push({ kind: 'text', x: x + sampleW + 4, y: row, size: 3.4, text: style.label, color: '#111111', bold: true });
    out.push({ kind: 'text', x: x + sampleW + 4 + 26, y: row, size: 3.2, text: style.meaning, color: '#444444' });
    row += 7;
  }

  return out;
}

/** Which legend entries a pattern actually uses. */
export function usedMarkTypes(pattern) {
  const used = new Set([CUT]);
  for (const mark of pattern.marks) used.add(mark.type);
  return used;
}

/** Bounding box of a primitive list, for laying out a page. */
export function primitivesBox(prims) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of prims) {
    if (p.kind === 'path') {
      for (const seg of p.path) {
        if (seg.c === 'Z') continue;
        if (seg.c === 'C') add(seg.x1, seg.y1), add(seg.x2, seg.y2);
        add(seg.x, seg.y);
      }
    } else if (p.kind === 'line') {
      add(...p.a);
      add(...p.b);
    } else if (p.kind === 'circle') {
      add(p.x - p.r, p.y - p.r);
      add(p.x + p.r, p.y + p.r);
    } else if (p.kind === 'rect' || p.kind === 'checker') {
      add(p.x, p.y);
      add(p.x + p.w, p.y + p.h);
    } else if (p.kind === 'text') {
      add(p.x, p.y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export { markBox };
