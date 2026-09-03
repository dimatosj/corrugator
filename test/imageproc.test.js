import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toGray, boxBlur, otsuThreshold, thresholdInk, dilate, erode, close, open,
  labelComponents, removeSmallBlobs, fillHoles, keepLargestBlobs, photoToMask,
  flattenLighting,
} from '../src/imageproc.js';

function mask(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { m[y * w + x] = ch === '#' ? 1 : 0; }));
  return { m, w, h };
}
const show = (m, w, h) => Array.from({ length: h }, (_, y) =>
  Array.from({ length: w }, (_, x) => (m[y * w + x] ? '#' : '.')).join(''));

test('toGray treats transparent pixels as paper white', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]);
  const g = toGray(rgba, 2, 1);
  assert.equal(Math.round(g[0]), 255);
  assert.equal(Math.round(g[1]), 0);
});

test('boxBlur preserves a flat field and averages a spike', () => {
  const flat = new Float32Array(25).fill(50);
  assert.ok(boxBlur(flat, 5, 5, 2).every((v) => Math.abs(v - 50) < 1e-4));

  const spike = new Float32Array(25);
  spike[12] = 100;
  const out = boxBlur(spike, 5, 5, 1);
  assert.ok(out[12] > 0 && out[12] < 100, 'the spike should spread out');
  assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 100) < 40, 'energy roughly conserved');
});

test('otsuThreshold separates two clear peaks', () => {
  const g = new Float32Array(200);
  g.fill(20, 0, 100);
  g.fill(230, 100, 200);
  const t = otsuThreshold(g);
  assert.ok(t > 20 && t < 230, `threshold ${t} should land between the peaks`);
  const inked = thresholdInk(g, t);
  assert.equal(inked.reduce((a, b) => a + b, 0), 100);
});

test('flattenLighting rescues ink hiding in a shadowed corner', () => {
  const w = 64, h = 64;
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Paper brightness falls off steeply to the right.
      gray[y * w + x] = 240 - (x / w) * 190;
    }
  }
  // Two ink marks of equal contrast, one in the bright half, one in the dark.
  const ink = (cx, cy) => {
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) gray[y * w + x] *= 0.35;
    }
  };
  ink(10, 32);
  ink(54, 32);

  const naive = thresholdInk(gray, otsuThreshold(gray));
  const flat = flattenLighting(gray, w, h);
  const fixed = thresholdInk(flat, otsuThreshold(flat));

  const inBox = (m, cx, cy) => {
    let n = 0;
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) n += m[y * w + x];
    return n;
  };
  const totalInk = (m) => m.reduce((a, b) => a + b, 0);
  const drawnPixels = 2 * 7 * 7;

  // A single global threshold cannot separate ink from paper here: the
  // shadowed paper on the right is darker than the lit ink on the left, so
  // whatever cut-off it picks, half the page comes back as ink.
  assert.ok(totalInk(naive) > drawnPixels * 10, `naive flooded the page: ${totalInk(naive)} px`);
  assert.ok(inBox(fixed, 10, 32) > 40 && inBox(fixed, 54, 32) > 40, 'flattening finds both marks');
  assert.ok(totalInk(fixed) < drawnPixels * 1.5, `flattening found just the marks: ${totalInk(fixed)} px`);
});

test('dilate and erode are inverse for an isolated square', () => {
  const { m, w, h } = mask([
    '.......',
    '.......',
    '..###..',
    '..###..',
    '..###..',
    '.......',
    '.......',
  ]);
  const grown = dilate(m, w, h, 1);
  assert.equal(grown.reduce((a, b) => a + b, 0), 25);
  const shrunk = erode(grown, w, h, 1);
  assert.deepEqual(show(shrunk, w, h), show(m, w, h));
});

test('erode removes a shape thinner than the radius', () => {
  const { m, w, h } = mask(['.....', '.###.', '.....']);
  assert.equal(erode(m, w, h, 1).reduce((a, b) => a + b, 0), 0);
});

test('close bridges a one pixel gap in a stroke', () => {
  const { m, w, h } = mask([
    '.......',
    '.##.##.',
    '.......',
  ]);
  const out = close(m, w, h, 1);
  assert.deepEqual(show(out, w, h)[1], '.#####.');
});

test('open deletes a lone speck but keeps a solid blob', () => {
  const { m, w, h } = mask([
    '........',
    '.###..#.',
    '.###....',
    '.###....',
    '........',
  ]);
  const out = open(m, w, h, 1);
  assert.equal(out.reduce((a, b) => a + b, 0), 9);
});

test('labelComponents separates blobs and flags border contact', () => {
  const { m, w, h } = mask([
    '#..##',
    '.....',
    '.##..',
  ]);
  const { count, sizes, touchesBorder } = labelComponents(m, w, h, 1, 8);
  assert.equal(count, 3);
  assert.deepEqual(sizes.slice(1).sort((a, b) => a - b), [1, 2, 2]);
  assert.ok(touchesBorder.slice(1).every(Boolean));
});

test('labelComponents with 4-connectivity splits a diagonal that 8 would join', () => {
  const { m, w, h } = mask(['#..', '.#.', '..#']);
  assert.equal(labelComponents(m, w, h, 1, 8).count, 1);
  assert.equal(labelComponents(m, w, h, 1, 4).count, 3);
});

test('removeSmallBlobs keeps only what meets minArea', () => {
  const { m, w, h } = mask([
    '.....',
    '.##.#',
    '.##..',
  ]);
  const out = removeSmallBlobs(m, w, h, 4);
  assert.equal(out.reduce((a, b) => a + b, 0), 4);
});

test('fillHoles fills an enclosed pocket but not the outside', () => {
  const { m, w, h } = mask([
    '.....',
    '.###.',
    '.#.#.',
    '.###.',
    '.....',
  ]);
  const out = fillHoles(m, w, h);
  assert.equal(out.reduce((a, b) => a + b, 0), 9);
  assert.equal(out[0], 0, 'the background outside stays background');
});

test('fillHoles leaves a pocket bigger than maxArea open', () => {
  const { m, w, h } = mask([
    '......',
    '.####.',
    '.#..#.',
    '.#..#.',
    '.####.',
    '......',
  ]);
  const filled = fillHoles(m, w, h);
  const kept = fillHoles(m, w, h, 3);
  assert.equal(filled.reduce((a, b) => a + b, 0), 16);
  assert.equal(kept.reduce((a, b) => a + b, 0), 12, 'a 4px pocket survives a 3px cap');
});

test('keepLargestBlobs keeps the biggest n', () => {
  const { m, w, h } = mask([
    '.........',
    '.###..#..',
    '.###.....',
    '.....##..',
    '.........',
  ]);
  const out = keepLargestBlobs(m, w, h, 2);
  assert.equal(out.reduce((a, b) => a + b, 0), 8, 'keeps the 6px and 2px blobs, drops the 1px');
});

test('photoToMask turns a lit photo of a drawn circle into one solid silhouette', () => {
  const w = 120, h = 120;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const paper = 250 - (x / w) * 120; // uneven lighting across the page
      const r = Math.hypot(x - 60, y - 60);
      // A hand-drawn ring: a 3px annulus with a gap at the top, like a pen lift.
      const onRing = Math.abs(r - 40) < 1.6 && !(y < 25 && Math.abs(x - 60) < 4);
      const v = onRing ? paper * 0.2 : paper;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }

  const { mask: out } = photoToMask(rgba, w, h, { mode: 'cutout', closeGaps: 4 });
  const area = out.reduce((a, b) => a + b, 0);
  const expected = Math.PI * 41 * 41;
  assert.ok(Math.abs(area - expected) / expected < 0.15, `filled area ${area} vs disc ${expected|0}`);
  assert.equal(out[60 * w + 60], 1, 'the middle of the ring is filled in');
  assert.equal(out[0], 0, 'the page corner stays empty');
});

test('photoToMask in windows mode leaves a big interior gap open', () => {
  const w = 120, h = 120;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const r = Math.hypot(x - 60, y - 60);
      const v = Math.abs(r - 40) < 2 ? 30 : 245;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }
  const cut = photoToMask(rgba, w, h, { mode: 'cutout' }).mask;
  const win = photoToMask(rgba, w, h, { mode: 'windows' }).mask;
  assert.equal(cut[60 * w + 60], 1);
  assert.equal(win[60 * w + 60], 0, 'the middle stays a hole to cut');
});

test('photoToMask in ink mode traces the strokes, not the silhouette', () => {
  const w = 80, h = 80;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const onBar = y > 30 && y < 50 && x > 10 && x < 70;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = onBar ? 20 : 240;
      rgba[p + 3] = 255;
    }
  }
  const { mask: out } = photoToMask(rgba, w, h, { mode: 'ink' });
  const area = out.reduce((a, b) => a + b, 0);
  assert.ok(area > 900 && area < 1400, `bar area ${area}`);
});

test('photoToMask grows the silhouette by the requested margin', () => {
  const w = 60, h = 60;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const inside = x > 20 && x < 40 && y > 20 && y < 40;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = inside ? 10 : 250;
      rgba[p + 3] = 255;
    }
  }
  const plain = photoToMask(rgba, w, h, { grow: 0 }).mask.reduce((a, b) => a + b, 0);
  const grown = photoToMask(rgba, w, h, { grow: 3 }).mask.reduce((a, b) => a + b, 0);
  assert.ok(grown > plain, `${grown} should exceed ${plain}`);
});
