import test from 'node:test';
import assert from 'node:assert/strict';
import { traceContours, buildParts } from '../src/trace.js';

/** Build a mask from an ASCII picture: '#' is foreground. */
function mask(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      m[y * w + x] = ch === '#' ? 1 : 0;
    });
  });
  return { m, w, h };
}

test('a single pixel traces one unit square', () => {
  const { m, w, h } = mask(['...', '.#.', '...']);
  const loops = traceContours(m, w, h);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].outer, true);
  assert.equal(loops[0].area, 1);
  assert.equal(loops[0].pts.length, 4);
});

test('an empty mask traces nothing', () => {
  const { m, w, h } = mask(['..', '..']);
  assert.deepEqual(traceContours(m, w, h), []);
});

test('a ring traces an outer loop and a hole with opposite winding', () => {
  const { m, w, h } = mask([
    '.....',
    '.###.',
    '.#.#.',
    '.###.',
    '.....',
  ]);
  const loops = traceContours(m, w, h);
  assert.equal(loops.length, 2);
  const outer = loops.find((l) => l.outer);
  const hole = loops.find((l) => !l.outer);
  assert.ok(outer && hole);
  assert.equal(outer.area, 9);
  assert.equal(hole.area, 1);
});

test('blobs touching the image border are traced', () => {
  const { m, w, h } = mask(['##', '##']);
  const loops = traceContours(m, w, h);
  assert.equal(loops.length, 1);
  assert.equal(loops[0].area, 4);
});

test('diagonally touching pixels trace as one loop', () => {
  const { m, w, h } = mask([
    '....',
    '.#..',
    '..#.',
    '....',
  ]);
  const loops = traceContours(m, w, h);
  assert.equal(loops.length, 1, 'saddle rule should keep the diagonal connected');
  assert.equal(loops[0].area, 2);
});

test('separate blobs trace separately', () => {
  const { m, w, h } = mask([
    '.....',
    '.#.#.',
    '.....',
  ]);
  const loops = traceContours(m, w, h);
  assert.equal(loops.length, 2);
  assert.ok(loops.every((l) => l.outer));
});

test('buildParts nests a hole inside its own part', () => {
  const { m, w, h } = mask([
    '.........',
    '.#####.#.',
    '.#...#...',
    '.#####...',
    '.........',
  ]);
  const parts = buildParts(traceContours(m, w, h));
  assert.equal(parts.length, 2);
  assert.equal(parts[0].holes.length, 1, 'the ring keeps its hole');
  assert.equal(parts[1].holes.length, 0, 'the lone pixel gets none');
  assert.ok(parts[0].area > parts[1].area, 'parts are sorted largest first');
});

test('buildParts drops specks below minArea', () => {
  const { m, w, h } = mask([
    '.....',
    '.##..',
    '.##.#',
    '.....',
  ]);
  const parts = buildParts(traceContours(m, w, h), { minArea: 2 });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].area, 4);
});

test('a blob inside a hole becomes its own part', () => {
  const { m, w, h } = mask([
    '.......',
    '.#####.',
    '.#...#.',
    '.#.#.#.',
    '.#...#.',
    '.#####.',
    '.......',
  ]);
  const parts = buildParts(traceContours(m, w, h));
  assert.equal(parts.length, 2);
  assert.equal(parts[0].holes.length, 1);
  assert.equal(parts[1].area, 1);
});
