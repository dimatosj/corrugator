/**
 * The pattern document.
 *
 * Everything in here is in millimetres, in pattern space: origin at the
 * top-left of the pattern's bounding box, y downwards. That is the same
 * orientation as the screen and as the traced image, so nothing has to flip
 * until it reaches the PDF writer.
 */

import { bboxOfPath, unionBoxes, transformPath, roundPath } from './geometry.js';
import { ringToShape } from './simplify.js';
import { buildParts, traceContours } from './trace.js';
import { HOLE, HOLE_DIAMETER_MM, MIN_INTERIOR_CUT_MM, LEGEND } from './legend.js';

let nextId = 1;
const makeId = (prefix) => `${prefix}${nextId++}`;

/**
 * Build a pattern from a binary mask.
 *
 * @param {{mask:Uint8Array, w:number, h:number}} traced
 * @param {object} opts
 * @param {number} opts.targetWidthMm  Finished width of the whole pattern.
 * @param {number} [opts.simplify]     RDP tolerance, in source pixels.
 * @param {number} [opts.smooth]       0..1 curve fitting.
 * @param {number} [opts.minPartMm]    Drop parts narrower than this.
 * @param {number} [opts.minHoleMm]    Drop holes smaller than this.
 * @returns {Pattern}
 */
export function patternFromMask(traced, opts) {
  const { mask, w, h } = traced;
  const {
    targetWidthMm = 200,
    simplify = 1.2,
    smooth = 0.8,
    minPartMm = 8,
    minHoleMm = 8,
  } = opts ?? {};

  // Work in pixels first, then scale the finished paths once at the end.
  const loops = traceContours(mask, w, h);
  const parts = buildParts(loops, {
    minArea: 4,
    minHoleArea: 4,
  });

  const shaped = [];
  for (const part of parts) {
    const outer = ringToShape(part.outer, { simplify, smooth });
    if (!outer.length) continue;
    const holes = part.holes
      .map((ring) => ringToShape(ring, { simplify, smooth }))
      .filter((p) => p.length);
    shaped.push({ id: makeId('part'), outer, holes });
  }

  const box = unionBoxes(shaped.map((p) => bboxOfPath(p.outer)));
  if (!box) {
    return emptyPattern(targetWidthMm);
  }

  const pxWidth = box.maxX - box.minX;
  const scale = pxWidth > 0 ? targetWidthMm / pxWidth : 1;

  const placed = shaped.map((p) => ({
    id: p.id,
    outer: roundPath(transformPath(p.outer, scale, -box.minX * scale, -box.minY * scale)),
    holes: p.holes.map((hp) => roundPath(transformPath(hp, scale, -box.minX * scale, -box.minY * scale))),
  }));

  // Now that everything is in millimetres, drop anything too small to cut.
  const bigEnough = placed.filter((p) => {
    const b = bboxOfPath(p.outer);
    return b && Math.max(b.maxX - b.minX, b.maxY - b.minY) >= minPartMm;
  });
  for (const part of bigEnough) {
    part.holes = part.holes.filter((hp) => {
      const b = bboxOfPath(hp);
      return b && Math.max(b.maxX - b.minX, b.maxY - b.minY) >= minHoleMm;
    });
  }

  const finalBox = unionBoxes(bigEnough.map((p) => bboxOfPath(p.outer)));

  return {
    parts: bigEnough,
    marks: [],
    widthMm: finalBox ? finalBox.maxX : targetWidthMm,
    heightMm: finalBox ? finalBox.maxY : 0,
    sourcePxPerMm: scale > 0 ? 1 / scale : 1,
    // Where the whole source image lands in pattern space, so the preview can
    // show the photo lined up behind the traced lines.
    image: {
      x: -box.minX * scale,
      y: -box.minY * scale,
      w: w * scale,
      h: h * scale,
    },
  };
}

/** @returns {Pattern} */
export function emptyPattern(widthMm = 200) {
  return { parts: [], marks: [], widthMm, heightMm: 0, sourcePxPerMm: 1, image: null };
}

/**
 * @typedef {object} Pattern
 * @property {{id:string, outer:Path, holes:Path[]}[]} parts
 * @property {Mark[]} marks
 * @property {number} widthMm
 * @property {number} heightMm
 * @property {number} sourcePxPerMm
 */

/**
 * @typedef {object} Mark
 * @property {string} id
 * @property {import('./legend.js').MarkType} type
 * @property {number} [x] @property {number} [y]
 * @property {number} [w] @property {number} [h]
 * @property {number} [d]
 * @property {[number,number][]} [pts]
 */

/** A punched hole, centred on (x, y). */
export function holeMark(x, y, d = HOLE_DIAMETER_MM) {
  return { id: makeId('mark'), type: HOLE, x, y, d };
}

/** A fold line from a to b. `type` is FOLD_UP or FOLD_DOWN. */
export function foldMark(type, a, b) {
  return { id: makeId('mark'), type, pts: [a, b] };
}

/** A rectangular zone: a draw box or a tape patch. Normalised to non-negative w/h. */
export function rectMark(type, x, y, w, h) {
  return {
    id: makeId('mark'),
    type,
    x: Math.min(x, x + w),
    y: Math.min(y, y + h),
    w: Math.abs(w),
    h: Math.abs(h),
  };
}

/** Move a mark by (dx, dy), whatever its shape. */
export function moveMark(mark, dx, dy) {
  if (mark.pts) {
    return { ...mark, pts: mark.pts.map(([x, y]) => [x + dx, y + dy]) };
  }
  return { ...mark, x: mark.x + dx, y: mark.y + dy };
}

/** Bounding box of a mark, in millimetres. */
export function markBox(mark) {
  if (mark.type === HOLE) {
    const r = mark.d / 2;
    return { minX: mark.x - r, minY: mark.y - r, maxX: mark.x + r, maxY: mark.y + r };
  }
  if (mark.pts) {
    const xs = mark.pts.map((p) => p[0]);
    const ys = mark.pts.map((p) => p[1]);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  return { minX: mark.x, minY: mark.y, maxX: mark.x + mark.w, maxY: mark.y + mark.h };
}

/** Overall extent of the pattern including any marks that stick out past a part. */
export function patternBox(pattern) {
  const boxes = [];
  for (const part of pattern.parts) {
    boxes.push(bboxOfPath(part.outer));
  }
  for (const mark of pattern.marks) boxes.push(markBox(mark));
  return unionBoxes(boxes) ?? { minX: 0, minY: 0, maxX: pattern.widthMm, maxY: pattern.heightMm };
}

/** Rescale a whole pattern so its bounding box is `widthMm` wide. */
export function resizePattern(pattern, widthMm) {
  const box = patternBox(pattern);
  const current = box.maxX - box.minX;
  if (current <= 0) return pattern;
  const s = widthMm / current;
  if (Math.abs(s - 1) < 1e-9) return pattern;

  return {
    ...pattern,
    parts: pattern.parts.map((p) => ({
      id: p.id,
      outer: roundPath(transformPath(p.outer, s, 0, 0)),
      holes: p.holes.map((hp) => roundPath(transformPath(hp, s, 0, 0))),
    })),
    marks: pattern.marks.map((m) => {
      if (m.pts) return { ...m, pts: m.pts.map(([x, y]) => [x * s, y * s]) };
      if (m.type === HOLE) return { ...m, x: m.x * s, y: m.y * s };
      return { ...m, x: m.x * s, y: m.y * s, w: m.w * s, h: m.h * s };
    }),
    widthMm: pattern.widthMm * s,
    heightMm: pattern.heightMm * s,
    sourcePxPerMm: pattern.sourcePxPerMm / s,
    image: pattern.image
      ? { x: pattern.image.x * s, y: pattern.image.y * s, w: pattern.image.w * s, h: pattern.image.h * s }
      : null,
  };
}

/**
 * Things worth telling the maker before they print.
 * @returns {{level:'warn'|'info', text:string}[]}
 */
export function reviewPattern(pattern) {
  const notes = [];
  if (!pattern.parts.length) {
    notes.push({ level: 'warn', text: 'Nothing traced yet. Try raising the ink sensitivity.' });
    return notes;
  }

  if (pattern.parts.length > 1) {
    notes.push({
      level: 'info',
      text: `${pattern.parts.length} separate parts to cut out.`,
    });
  }

  let tightest = Infinity;
  for (const part of pattern.parts) {
    for (const hole of part.holes) {
      const b = bboxOfPath(hole);
      if (b) tightest = Math.min(tightest, Math.min(b.maxX - b.minX, b.maxY - b.minY));
    }
  }
  if (tightest < MIN_INTERIOR_CUT_MM) {
    notes.push({
      level: 'warn',
      text: `An inside cut is only ${tightest.toFixed(0)} mm across. The ChompSaw needs about ${MIN_INTERIOR_CUT_MM} mm to turn — make the pattern bigger or drop that hole.`,
    });
  }

  const counts = new Map();
  for (const mark of pattern.marks) counts.set(mark.type, (counts.get(mark.type) ?? 0) + 1);
  for (const [type, n] of counts) {
    notes.push({ level: 'info', text: `${n} x ${LEGEND[type].label.toLowerCase()}` });
  }

  return notes;
}
