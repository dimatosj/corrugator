import test from 'node:test';
import assert from 'node:assert/strict';
import { patternFromMask, holeMark, foldMark, rectMark, resizePattern, patternBox, reviewPattern } from '../src/pattern.js';
import { patternToSvg } from '../src/export/svg.js';
import { patternToPdf, buildPdf, PAGE_SIZES, MM_TO_PT } from '../src/export/pdf.js';
import { FOLD_UP, FOLD_DOWN, TAPE_FRONT, TAPE_BACK, DRAW_BOX, LEGEND } from '../src/legend.js';

/** A filled rectangle with a round hole punched out of it. */
function ringMask(w = 200, h = 140) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x > 20 && x < 180 && y > 20 && y < 120;
      const inHole = Math.hypot(x - 100, y - 70) < 25;
      mask[y * w + x] = inside && !inHole ? 1 : 0;
    }
  }
  return { mask, w, h };
}

function samplePattern(widthMm = 160) {
  const pat = patternFromMask(ringMask(), { targetWidthMm: widthMm });
  pat.marks.push(
    holeMark(40, 40),
    foldMark(FOLD_UP, [30, 90], [130, 90]),
    foldMark(FOLD_DOWN, [30, 100], [130, 100]),
    rectMark(TAPE_FRONT, 20, 20, 30, 20),
    rectMark(TAPE_BACK, 60, 20, 30, 20),
    rectMark(DRAW_BOX, 100, 20, 30, 20),
  );
  return pat;
}

/**
 * Read a PDF back far enough to prove it is not quietly corrupt: the xref has
 * to land on the right objects and every stream length has to be honest, which
 * is exactly what a hand-rolled writer gets wrong.
 */
function inspectPdf(bytes) {
  let s = '';
  for (const b of bytes) {
    assert.ok(b <= 0xff, 'every value must fit in a byte');
    s += String.fromCharCode(b);
  }
  assert.ok(s.startsWith('%PDF-1.'), 'has a PDF header');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'has an EOF marker');

  const startxref = Number(/startxref\s+(\d+)/.exec(s)[1]);
  assert.equal(s.slice(startxref, startxref + 4), 'xref', 'startxref points at the table');

  const table = s.slice(startxref);
  const size = Number(/\/Size\s+(\d+)/.exec(table)[1]);
  const entries = [...table.matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
  assert.equal(entries.length, size, 'one xref entry per object');

  for (let id = 1; id < size; id++) {
    const offset = Number(entries[id][1]);
    assert.equal(
      s.slice(offset, offset + `${id} 0 obj`.length),
      `${id} 0 obj`,
      `xref entry ${id} points at object ${id}`,
    );
  }

  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const declared = Number(m[1]);
    const from = m.index + m[0].length;
    assert.equal(
      s.slice(from + declared, from + declared + 10),
      '\nendstream',
      `a stream declaring ${declared} bytes actually ends there`,
    );
  }

  // Anchored so a content-stream colour like "0.706 0 RG" is not read as a
  // reference to object 706.
  for (const m of s.matchAll(/(?<![\d.])(\d+) 0 R(?![A-Za-z])/g)) {
    assert.ok(Number(m[1]) < size, `reference ${m[1]} 0 R is in range`);
  }

  const kids = /\/Kids \[([^\]]*)\]/.exec(s)[1].trim();
  const count = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.equal(kids.split('R').filter((p) => p.trim()).length, count, '/Count matches /Kids');

  return { text: s, pageCount: count };
}

test('a pattern from a mask keeps its hole and lands at the requested width', () => {
  const pat = patternFromMask(ringMask(), { targetWidthMm: 160 });
  assert.equal(pat.parts.length, 1);
  assert.equal(pat.parts[0].holes.length, 1);
  const box = patternBox(pat);
  assert.ok(Math.abs((box.maxX - box.minX) - 160) < 0.5, `width ${box.maxX - box.minX}`);
  // The source is 160x100 px of ink, so the aspect ratio should carry over.
  assert.ok(Math.abs((box.maxY - box.minY) - 100) < 3, `height ${box.maxY - box.minY}`);
});

test('an empty mask yields an empty pattern rather than throwing', () => {
  const pat = patternFromMask({ mask: new Uint8Array(100), w: 10, h: 10 }, { targetWidthMm: 100 });
  assert.equal(pat.parts.length, 0);
  assert.deepEqual(reviewPattern(pat)[0].level, 'warn');
});

test('resizePattern scales geometry and marks together', () => {
  const pat = samplePattern(160);
  const big = resizePattern(pat, 320);
  const box = patternBox(big);
  assert.ok(Math.abs((box.maxX - box.minX) - 320) < 0.5);
  const hole = big.marks.find((m) => m.type === 'hole');
  assert.ok(Math.abs(hole.x - 80) < 0.1, 'the hole moved with the geometry');
});

test('reviewPattern warns when an inside cut is too tight to saw', () => {
  // At 30 mm wide the traced hole comes out under 10 mm across.
  const small = patternFromMask(ringMask(), { targetWidthMm: 30, minHoleMm: 1, minPartMm: 1 });
  const notes = reviewPattern(small);
  assert.ok(notes.some((n) => n.level === 'warn' && /ChompSaw needs/.test(n.text)));

  const big = patternFromMask(ringMask(), { targetWidthMm: 400 });
  assert.ok(!reviewPattern(big).some((n) => /ChompSaw needs/.test(n.text)));
});

test('SVG export is well-formed and carries real millimetre units', () => {
  const svg = patternToSvg(samplePattern());
  assert.ok(svg.startsWith('<?xml'));
  const root = /<svg[^>]*>/.exec(svg)[0];
  assert.match(root, /width="[\d.]+mm"/);
  assert.match(root, /height="[\d.]+mm"/);
  assert.match(root, /viewBox="0 0 [\d.]+ [\d.]+"/);

  const opened = [...svg.matchAll(/<([a-z]+)(?:\s[^>]*?)?(\/?)>/g)];
  const closed = [...svg.matchAll(/<\/([a-z]+)>/g)];
  const stack = [];
  for (const m of opened) {
    if (m[2] === '/') continue;
    stack.push(m[1]);
  }
  assert.equal(stack.length, closed.length, 'every open tag has a close tag');
});

test('SVG export uses the ChompShop colour for every mark it contains', () => {
  const svg = patternToSvg(samplePattern());
  for (const type of [FOLD_UP, FOLD_DOWN, TAPE_FRONT, TAPE_BACK, DRAW_BOX]) {
    assert.ok(svg.includes(LEGEND[type].color), `${type} uses ${LEGEND[type].color}`);
  }
  assert.ok(svg.includes(LEGEND.cut.color), 'cut lines are black');
  assert.match(svg, /stroke-dasharray="3 2"/, 'fold lines are dashed');
});

test('SVG export omits the legend when asked', () => {
  const withKey = patternToSvg(samplePattern());
  const without = patternToSvg(samplePattern(), { includeLegend: false });
  assert.ok(withKey.includes('What the marks mean'));
  assert.ok(!without.includes('What the marks mean'));
  assert.ok(without.length < withKey.length);
});

test('a small pattern makes one valid single-page PDF', () => {
  const pdf = patternToPdf(samplePattern(120), { pageSize: 'letter' });
  const { pageCount, text } = inspectPdf(pdf);
  assert.equal(pageCount, 1);
  assert.ok(text.includes('Print at 100%'));
});

test('the page box is the true size of the chosen paper', () => {
  for (const [name, size] of Object.entries(PAGE_SIZES)) {
    const pdf = patternToPdf(samplePattern(80), { pageSize: name });
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(String.fromCharCode(...pdf));
    assert.ok(Math.abs(Number(box[1]) - size.widthMm * MM_TO_PT) < 0.1, `${name} width`);
    assert.ok(Math.abs(Number(box[2]) - size.heightMm * MM_TO_PT) < 0.1, `${name} height`);
  }
});

test('landscape swaps the page box', () => {
  const pdf = patternToPdf(samplePattern(80), { pageSize: 'a4', landscape: true });
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(String.fromCharCode(...pdf));
  assert.ok(Number(box[1]) > Number(box[2]), 'wider than tall');
});

test('an oversized pattern tiles across sheets and adds a guide page', () => {
  const pdf = patternToPdf(samplePattern(700), { pageSize: 'letter', marginMm: 12, overlapMm: 12 });
  const { pageCount, text } = inspectPdf(pdf);
  // 700mm wide over ~180mm of usable width, minus overlap, is at least 4 across.
  assert.ok(pageCount >= 5, `expected a guide page plus tiles, got ${pageCount}`);
  assert.ok(text.includes('Your cardboard pattern'), 'the guide page is there');
  assert.ok(text.includes('Sheet 1-A'), 'tiles are labelled');
});

test('every tile clips to its own printable area', () => {
  const pdf = patternToPdf(samplePattern(700), { pageSize: 'letter' });
  const text = String.fromCharCode(...pdf);
  const clips = [...text.matchAll(/re\nW n/g)];
  assert.ok(clips.length >= 4, `expected a clip per tile, found ${clips.length}`);
});

test('buildPdf refuses to drift when a page has no content', () => {
  const pdf = buildPdf([]);
  const s = String.fromCharCode(...pdf);
  assert.ok(s.includes('/Count 0'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
});

test('text with parentheses and accents survives PDF escaping', () => {
  const pat = samplePattern(100);
  const pdf = patternToPdf(pat, { title: 'Zoé (age 6) \\ drawing' });
  const s = String.fromCharCode(...pdf);
  assert.ok(s.includes('\\(age 6\\)'), 'parens are escaped');
  assert.ok(s.includes('\\\\'), 'backslash is escaped');
  inspectPdf(pdf);
});
