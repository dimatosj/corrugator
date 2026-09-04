import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseCollinear, rdp, simplifyRing, chaikin, ringToPath, ringToShape } from '../src/simplify.js';
import { signedArea } from '../src/geometry.js';

test('collapseCollinear keeps only the corners of a rectangle', () => {
  const ring = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  assert.deepEqual(collapseCollinear(ring), [[0, 0], [2, 0], [2, 2], [0, 2]]);
});

test('collapseCollinear drops a repeated closing point', () => {
  const ring = [[0, 0], [2, 0], [2, 2], [0, 0]];
  const out = collapseCollinear(ring);
  assert.equal(out.length, 3);
});

test('rdp keeps the endpoints and the one real corner', () => {
  const line = [[0, 0], [1, 0.05], [2, 0], [3, 0], [4, 3], [5, 6]];
  const out = rdp(line, 0.5);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [5, 6]);
  assert.ok(out.length < line.length);
  assert.ok(out.some((p) => p[0] === 3 && p[1] === 0));
});

test('rdp with a large tolerance reduces to the endpoints', () => {
  const line = [[0, 0], [1, 0.1], [2, -0.1], [3, 0]];
  assert.deepEqual(rdp(line, 10), [[0, 0], [3, 0]]);
});

test('rdp survives a long polyline without blowing the stack', () => {
  const pts = Array.from({ length: 50000 }, (_, i) => [i, Math.sin(i / 50) * 10]);
  const out = rdp(pts, 0.01);
  assert.ok(out.length > 2 && out.length < pts.length);
});

test('simplifyRing keeps a closed ring closed and roughly the same size', () => {
  const ring = [];
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * Math.PI * 2;
    ring.push([Math.cos(t) * 100, Math.sin(t) * 100]);
  }
  const out = simplifyRing(ring, 1);
  assert.ok(out.length >= 3 && out.length < ring.length);
  const before = Math.abs(signedArea(ring));
  const after = Math.abs(signedArea(out));
  assert.ok(Math.abs(after - before) / before < 0.02, `area drifted: ${before} -> ${after}`);
});

test('chaikin shrinks corners but preserves winding', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const out = chaikin(square, 2);
  assert.equal(out.length, 16);
  assert.ok(signedArea(out) > 0 === signedArea(square) > 0);
});

test('ringToPath emits a closed polyline when smoothing is off', () => {
  const path = ringToPath([[0, 0], [1, 0], [1, 1]], 0);
  assert.deepEqual(path.map((s) => s.c), ['M', 'L', 'L', 'Z']);
});

test('ringToPath emits cubics when smoothing is on', () => {
  const path = ringToPath([[0, 0], [1, 0], [1, 1], [0, 1]], 1);
  assert.equal(path[0].c, 'M');
  assert.equal(path[path.length - 1].c, 'Z');
  assert.ok(path.slice(1, -1).every((s) => s.c === 'C'));
});

test('a smoothed path still ends where it started', () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const path = ringToPath(ring, 1);
  const last = path[path.length - 2];
  assert.deepEqual([last.x, last.y], ring[0]);
});

test('ringToShape turns a traced pixel square into a small closed path', () => {
  const ring = [];
  for (let x = 0; x < 20; x++) ring.push([x, 0]);
  for (let y = 0; y < 20; y++) ring.push([20, y]);
  for (let x = 20; x > 0; x--) ring.push([x, 20]);
  for (let y = 20; y > 0; y--) ring.push([0, y]);
  const path = ringToShape(ring, { simplify: 1.5, smooth: 0.8, preRound: 2 });
  assert.equal(path[0].c, 'M');
  assert.equal(path[path.length - 1].c, 'Z');
  assert.ok(path.length < 20, `expected a compact path, got ${path.length} segments`);
});

test('ringToShape rejects a degenerate ring', () => {
  assert.deepEqual(ringToShape([[0, 0], [1, 1]]), []);
});

test('smoothing never sends a control handle past the segment it belongs to', () => {
  // A long spike between two long edges: the case where uniform Catmull-Rom
  // overshoots and the cut line doubles back on itself.
  const spike = [[0, 0], [100, 0], [102, 60], [104, 0], [200, 0], [200, 100], [0, 100]];
  const path = ringToPath(spike, 1);

  for (const seg of path) {
    if (seg.c !== 'C') continue;
    const span = Math.hypot(seg.x - seg.x1, seg.y - seg.y1);
    assert.ok(Number.isFinite(span));
  }

  // Sample every cubic and check it stays within a sane distance of its ends,
  // which a looping overshoot would not.
  let prev = [path[0].x, path[0].y];
  for (const seg of path) {
    if (seg.c !== 'C') continue;
    const end = [seg.x, seg.y];
    const chord = Math.hypot(end[0] - prev[0], end[1] - prev[1]);
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const mt = 1 - t;
      const px = mt ** 3 * prev[0] + 3 * mt * mt * t * seg.x1 + 3 * mt * t * t * seg.x2 + t ** 3 * end[0];
      const py = mt ** 3 * prev[1] + 3 * mt * mt * t * seg.y1 + 3 * mt * t * t * seg.y2 + t ** 3 * end[1];
      const stray = Math.min(
        Math.hypot(px - prev[0], py - prev[1]),
        Math.hypot(px - end[0], py - end[1]),
      );
      assert.ok(stray <= chord * 1.05 + 1e-6,
        `curve strayed ${stray.toFixed(2)} from a chord of ${chord.toFixed(2)}`);
    }
    prev = end;
  }
});
