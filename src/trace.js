/**
 * Crack-following contour tracer.
 *
 * Walks the boundaries between foreground and background pixels along the
 * pixel lattice, always keeping foreground on the left. Every boundary loop in
 * the image is emitted exactly once. Because the walk follows pixel cracks
 * rather than pixel centres, loops are always closed and never self-touch, so
 * the result drops straight into a fill rule.
 *
 * Loop points are lattice coordinates: (0,0) is the top-left corner of pixel
 * (0,0), so a 1x1 foreground blob traces the unit square.
 */

import { signedArea, pointInPolygon, bboxOfPoints } from './geometry.js';

// Direction indices, ordered clockwise on screen (y grows downwards).
const R = 0, D = 1, L = 2, U = 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Trace every boundary loop in a binary mask.
 *
 * @param {Uint8Array} mask  w*h, non-zero = foreground
 * @param {number} w
 * @param {number} h
 * @returns {{pts:[number,number][], area:number, outer:boolean}[]}
 *   `area` is the enclosed pixel area (always positive); `outer` is true for
 *   the outside of a blob and false for the boundary of a hole.
 */
export function traceContours(mask, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x] ? 1 : 0);

  const LW = w + 1;
  const visited = new Uint8Array(LW * (h + 1) * 4);

  // Which directions may we leave lattice point (x,y) in, keeping foreground
  // on our left? Bit i is set for direction i.
  const validDirs = (x, y) => {
    const nw = at(x - 1, y - 1);
    const ne = at(x, y - 1);
    const sw = at(x - 1, y);
    const se = at(x, y);
    let bits = 0;
    if (ne && !se) bits |= 1 << R;
    if (se && !sw) bits |= 1 << D;
    if (sw && !nw) bits |= 1 << L;
    if (nw && !ne) bits |= 1 << U;
    return bits;
  };

  // At a saddle (two diagonal foreground pixels) two exits are legal. Taking
  // the right turn hugs across the diagonal, keeping diagonally touching
  // pixels in one blob -- which is how a pencil stroke reads. Every other
  // configuration offers exactly one exit, so the order only matters here.
  const nextDir = (bits, incoming) => {
    for (const turn of [1, 0, 3, 2]) {
      const d = (incoming + turn) % 4;
      if (bits & (1 << d)) return d;
    }
    return -1;
  };

  const loops = [];

  for (let sy = 0; sy <= h; sy++) {
    for (let sx = 0; sx <= w; sx++) {
      const startBits = validDirs(sx, sy);
      if (!startBits) continue;

      for (let sd = 0; sd < 4; sd++) {
        if (!(startBits & (1 << sd))) continue;
        if (visited[(sy * LW + sx) * 4 + sd]) continue;

        const pts = [];
        let x = sx, y = sy, d = sd;
        do {
          pts.push([x, y]);
          visited[(y * LW + x) * 4 + d] = 1;
          x += DX[d];
          y += DY[d];
          d = nextDir(validDirs(x, y), d);
          if (d < 0) break; // unreachable for a well-formed mask, but never spin
        } while (!(x === sx && y === sy && d === sd));

        if (pts.length < 4) continue;
        const a = signedArea(pts);
        loops.push({ pts, area: Math.abs(a), outer: a < 0 });
      }
    }
  }

  return loops;
}

/**
 * Group traced loops into parts, matching each hole to the tightest blob that
 * encloses it.
 *
 * @param {{pts:[number,number][], area:number, outer:boolean}[]} loops
 * @param {{minArea?:number, minHoleArea?:number}} [opts]
 * @returns {{outer:[number,number][], holes:[number,number][][], area:number}[]}
 *   Sorted largest part first.
 */
export function buildParts(loops, opts = {}) {
  const minArea = opts.minArea ?? 0;
  const minHoleArea = opts.minHoleArea ?? minArea;

  const outers = loops.filter((l) => l.outer && l.area >= minArea);
  const holes = loops.filter((l) => !l.outer && l.area >= minHoleArea);

  const parts = outers.map((l) => ({
    outer: l.pts,
    holes: [],
    area: l.area,
    bbox: bboxOfPoints(l.pts),
  }));

  for (const hole of holes) {
    const probe = hole.pts[0];
    let best = null;
    for (const part of parts) {
      const { minX, minY, maxX, maxY } = part.bbox;
      if (probe[0] < minX || probe[0] > maxX || probe[1] < minY || probe[1] > maxY) continue;
      if (part.area <= hole.area) continue;
      if (!pointInPolygon(probe, part.outer)) continue;
      if (!best || part.area < best.area) best = part;
    }
    if (best) best.holes.push(hole.pts);
  }

  parts.sort((a, b) => b.area - a.area);
  return parts.map(({ outer, holes: hs, area }) => ({ outer, holes: hs, area }));
}
