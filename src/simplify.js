/**
 * Turning a raw traced contour into something a kid can actually cut.
 *
 * The pipeline is: drop the staircase from pixel tracing, round off the
 * corners, throw away points that do not carry shape, then optionally fit
 * curves. Each stage is exposed on its own so the UI can dial them
 * independently.
 */

/** Drop consecutive duplicate and exactly-collinear points from a closed ring. */
export function collapseCollinear(pts, eps = 1e-9) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < eps && Math.abs(last[1] - p[1]) < eps) continue;
    out.push(p);
  }
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps) out.pop();
    else break;
  }

  const keep = [];
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const prev = out[(i - 1 + n) % n];
    const cur = out[i];
    const next = out[(i + 1) % n];
    const cross = (cur[0] - prev[0]) * (next[1] - prev[1]) - (cur[1] - prev[1]) * (next[0] - prev[0]);
    if (Math.abs(cross) > eps) keep.push(cur);
  }
  return keep.length >= 3 ? keep : out;
}

/**
 * Ramer-Douglas-Peucker on a closed ring.
 *
 * The ring is cut at its two most distant points so each half is an open
 * polyline with well-separated endpoints, which is what RDP needs.
 */
export function simplifyRing(pts, epsilon) {
  if (epsilon <= 0 || pts.length < 4) return pts.slice();

  let farIdx = 0;
  let farDist = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > farDist) {
      farDist = d;
      farIdx = i;
    }
  }

  const first = pts.slice(0, farIdx + 1);
  const second = pts.slice(farIdx).concat([pts[0]]);
  const a = rdp(first, epsilon);
  const b = rdp(second, epsilon);
  const merged = a.concat(b.slice(1, -1));
  return merged.length >= 3 ? merged : pts.slice();
}

/** Ramer-Douglas-Peucker on an open polyline. Iterative, so deep rings are safe. */
export function rdp(points, epsilon) {
  const n = points.length;
  if (n < 3) return points.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack = [[0, n - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    if (end - start < 2) continue;

    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);

    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i];
      const dist = len === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** One round of Chaikin corner cutting on a closed ring. */
export function chaikin(pts, iterations = 1) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next = [];
    for (let i = 0, n = cur.length; i < n; i++) {
      const [x1, y1] = cur[i];
      const [x2, y2] = cur[(i + 1) % n];
      next.push([x1 + 0.25 * (x2 - x1), y1 + 0.25 * (y2 - y1)]);
      next.push([x1 + 0.75 * (x2 - x1), y1 + 0.75 * (y2 - y1)]);
    }
    cur = next;
  }
  return cur;
}

/**
 * Build a closed Path from a ring.
 *
 * With `smooth` at 0 the result is straight segments through every point; at 1
 * it is a uniform Catmull-Rom spline converted to cubic Beziers. Values in
 * between scale the tangents, so the curve stays interpolating either way.
 */
export function ringToPath(pts, smooth = 0) {
  const n = pts.length;
  if (n < 2) return [];

  const path = [{ c: 'M', x: pts[0][0], y: pts[0][1] }];

  if (smooth <= 0 || n < 3) {
    for (let i = 1; i < n; i++) path.push({ c: 'L', x: pts[i][0], y: pts[i][1] });
    path.push({ c: 'Z' });
    return path;
  }

  const k = smooth / 6;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const span = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const t1 = clampTangent([(p2[0] - p0[0]) * k, (p2[1] - p0[1]) * k], span);
    const t2 = clampTangent([(p3[0] - p1[0]) * k, (p3[1] - p1[1]) * k], span);

    path.push({
      c: 'C',
      x1: p1[0] + t1[0],
      y1: p1[1] + t1[1],
      x2: p2[0] - t2[0],
      y2: p2[1] - t2[1],
      x: p2[0],
      y: p2[1],
    });
  }
  path.push({ c: 'Z' });
  return path;
}

/**
 * Keep a control handle inside a third of the segment it belongs to.
 *
 * Uniform Catmull-Rom derives its tangents from the neighbours either side, so
 * at a sharp corner between two long edges the handle can reach past the far
 * end of a short segment and the curve loops back on itself. On a pattern that
 * loop is a cut line that doubles back, so clamp rather than allow it.
 */
function clampTangent(t, span) {
  const len = Math.hypot(t[0], t[1]);
  const max = span / 3;
  if (len <= max || len === 0) return t;
  const s = max / len;
  return [t[0] * s, t[1] * s];
}

/**
 * The whole ring -> Path pipeline.
 *
 * @param {[number,number][]} ring  traced lattice points
 * @param {{simplify?:number, smooth?:number, preRound?:number}} opts
 *   `simplify` is the RDP tolerance in the ring's own units (pixels).
 *   `smooth` is 0..1. `preRound` is Chaikin rounds applied first, which takes
 *   the pixel staircase off before RDP decides what matters.
 */
export function ringToShape(ring, opts = {}) {
  const { simplify = 1.2, smooth = 0.8, preRound = 2 } = opts;
  let pts = collapseCollinear(ring);
  if (pts.length < 3) return [];
  if (preRound > 0) pts = chaikin(pts, preRound);
  pts = simplifyRing(pts, simplify);
  pts = collapseCollinear(pts);
  if (pts.length < 3) return [];
  return ringToPath(pts, smooth);
}
