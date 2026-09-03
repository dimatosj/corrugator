/**
 * Small geometry helpers plus the path representation shared by the SVG and
 * PDF exporters.
 *
 * A Path is a flat array of commands:
 *   {c:'M', x, y} | {c:'L', x, y} | {c:'C', x1,y1, x2,y2, x,y} | {c:'Z'}
 * Coordinates are always millimetres in pattern space (origin top-left, y down).
 */

/** Signed area of a closed polygon. Negative = counter-clockwise in y-down coords. */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Axis-aligned bounding box of a point list, as {minX,minY,maxX,maxY}. */
export function bboxOfPoints(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Union of boxes; returns null for an empty list. */
export function unionBoxes(boxes) {
  const real = boxes.filter(Boolean);
  if (!real.length) return null;
  return real.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(pt, poly) {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Total length of a polyline. */
export function polylineLength(pts, closed = false) {
  let len = 0;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}

/** Bounding box of a Path, sampling curves at their control points (a safe over-estimate). */
export function bboxOfPath(path) {
  const pts = [];
  for (const seg of path) {
    if (seg.c === 'C') pts.push([seg.x1, seg.y1], [seg.x2, seg.y2], [seg.x, seg.y]);
    else if (seg.c !== 'Z') pts.push([seg.x, seg.y]);
  }
  return pts.length ? bboxOfPoints(pts) : null;
}

/** Return a copy of `path` with every coordinate scaled by `s` then offset by (dx,dy). */
export function transformPath(path, s, dx, dy) {
  return path.map((seg) => {
    if (seg.c === 'Z') return { c: 'Z' };
    if (seg.c === 'C') {
      return {
        c: 'C',
        x1: seg.x1 * s + dx, y1: seg.y1 * s + dy,
        x2: seg.x2 * s + dx, y2: seg.y2 * s + dy,
        x: seg.x * s + dx, y: seg.y * s + dy,
      };
    }
    return { c: seg.c, x: seg.x * s + dx, y: seg.y * s + dy };
  });
}

/** Round every coordinate in a Path to `places` decimals, to keep exports small. */
export function roundPath(path, places = 3) {
  const f = 10 ** places;
  const r = (v) => Math.round(v * f) / f;
  return path.map((seg) => {
    if (seg.c === 'Z') return { c: 'Z' };
    if (seg.c === 'C') {
      return { c: 'C', x1: r(seg.x1), y1: r(seg.y1), x2: r(seg.x2), y2: r(seg.y2), x: r(seg.x), y: r(seg.y) };
    }
    return { c: seg.c, x: r(seg.x), y: r(seg.y) };
  });
}

/** Serialise a Path to SVG `d` syntax. */
export function pathToD(path) {
  const out = [];
  for (const seg of path) {
    if (seg.c === 'M') out.push(`M${seg.x} ${seg.y}`);
    else if (seg.c === 'L') out.push(`L${seg.x} ${seg.y}`);
    else if (seg.c === 'C') out.push(`C${seg.x1} ${seg.y1} ${seg.x2} ${seg.y2} ${seg.x} ${seg.y}`);
    else out.push('Z');
  }
  return out.join(' ');
}

/** Distance from point p to segment ab, and the closest point on that segment. */
export function distToSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * vx;
  const cy = a[1] + t * vy;
  return { dist: Math.hypot(p[0] - cx, p[1] - cy), point: [cx, cy], t };
}
