/**
 * A very small PDF 1.4 writer, enough for vector patterns.
 *
 * Patterns have to print at true size or the cut parts will not fit together,
 * which rules out anything that goes through a raster step. Writing the file
 * directly keeps the app dependency-free and keeps every path a real vector.
 *
 * PDF puts the origin at the bottom-left with y upwards; pattern space is
 * top-left with y downwards. The flip happens in PdfPage and nowhere else.
 */

import { rgb } from '../legend.js';
import {
  patternPrimitives, legendPrimitives, legendHeight, usedMarkTypes,
} from './draw.js';
import { patternBox } from '../pattern.js';

export const MM_TO_PT = 72 / 25.4;

/** Named page sizes, in millimetres. */
export const PAGE_SIZES = {
  letter: { label: 'US Letter', widthMm: 215.9, heightMm: 279.4 },
  a4: { label: 'A4', widthMm: 210, heightMm: 297 },
  legal: { label: 'US Legal', widthMm: 215.9, heightMm: 355.6 },
  a3: { label: 'A3', widthMm: 297, heightMm: 420 },
};

const KAPPA = 0.5522847498307936;
const num = (v) => (Math.round(v * 1000) / 1000).toString();

/** One page's content stream, written in millimetres and flipped on the way out. */
class PdfPage {
  constructor(widthMm, heightMm) {
    this.widthMm = widthMm;
    this.heightMm = heightMm;
    this.ops = [];
  }

  /** Millimetres from the top -> PDF points from the bottom. */
  ty(mm) {
    return (this.heightMm - mm) * MM_TO_PT;
  }

  tx(mm) {
    return mm * MM_TO_PT;
  }

  push(op) {
    this.ops.push(op);
    return this;
  }

  save() { return this.push('q'); }

  restore() { return this.push('Q'); }

  strokeColor(hex) {
    const [r, g, b] = rgb(hex);
    return this.push(`${num(r)} ${num(g)} ${num(b)} RG`);
  }

  fillColor(hex) {
    const [r, g, b] = rgb(hex);
    return this.push(`${num(r)} ${num(g)} ${num(b)} rg`);
  }

  lineWidth(mm) {
    return this.push(`${num(Math.max(mm, 0.05) * MM_TO_PT)} w`);
  }

  dash(pattern) {
    if (!pattern || !pattern.length) return this.push('[] 0 d');
    return this.push(`[${pattern.map((v) => num(v * MM_TO_PT)).join(' ')}] 0 d`);
  }

  moveTo(x, y) { return this.push(`${num(this.tx(x))} ${num(this.ty(y))} m`); }

  lineTo(x, y) { return this.push(`${num(this.tx(x))} ${num(this.ty(y))} l`); }

  curveTo(x1, y1, x2, y2, x, y) {
    return this.push(
      `${num(this.tx(x1))} ${num(this.ty(y1))} ${num(this.tx(x2))} ${num(this.ty(y2))} ` +
      `${num(this.tx(x))} ${num(this.ty(y))} c`,
    );
  }

  closePath() { return this.push('h'); }

  rect(x, y, w, h) {
    // The rectangle operator takes a corner and a size; in flipped space the
    // corner that stays put is the bottom-left, which is (x, y + h) up top.
    return this.push(
      `${num(this.tx(x))} ${num(this.ty(y + h))} ${num(w * MM_TO_PT)} ${num(h * MM_TO_PT)} re`,
    );
  }

  circle(cx, cy, r) {
    const k = r * KAPPA;
    this.moveTo(cx + r, cy);
    this.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
    this.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
    this.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
    this.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
    return this.closePath();
  }

  path(segments) {
    for (const seg of segments) {
      if (seg.c === 'M') this.moveTo(seg.x, seg.y);
      else if (seg.c === 'L') this.lineTo(seg.x, seg.y);
      else if (seg.c === 'C') this.curveTo(seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y);
      else this.closePath();
    }
    return this;
  }

  stroke() { return this.push('S'); }

  fill() { return this.push('f'); }

  /** Restrict everything until the matching restore() to a rectangle. */
  clipRect(x, y, w, h) {
    this.rect(x, y, w, h);
    return this.push('W n');
  }

  text(x, y, sizeMm, str, hex = '#111111', bold = false) {
    this.fillColor(hex);
    return this.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(sizeMm * MM_TO_PT)} Tf ` +
      `${num(this.tx(x))} ${num(this.ty(y))} Td (${escapeText(str)}) Tj ET`,
    );
  }

  toString() {
    return this.ops.join('\n');
  }
}

/** PDF string literals escape backslash and both parens; drop anything non-ASCII. */
function escapeText(str) {
  return String(str)
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Draw a list of primitives onto a page. */
export function drawPrimitives(page, prims) {
  for (const p of prims) {
    if (p.kind === 'path') {
      page.save().strokeColor(p.stroke).lineWidth(p.width).dash(p.dash);
      page.path(p.path).stroke().restore();
    } else if (p.kind === 'line') {
      page.save().strokeColor(p.stroke).lineWidth(p.width).dash(p.dash);
      page.moveTo(p.a[0], p.a[1]).lineTo(p.b[0], p.b[1]).stroke().restore();
    } else if (p.kind === 'circle') {
      page.save().strokeColor(p.stroke).lineWidth(p.width).dash(null);
      page.circle(p.x, p.y, p.r).stroke().restore();
    } else if (p.kind === 'rect') {
      page.save().strokeColor(p.stroke).lineWidth(p.width).dash(p.dash);
      page.rect(p.x, p.y, p.w, p.h).stroke().restore();
    } else if (p.kind === 'checker') {
      drawChecker(page, p);
    } else if (p.kind === 'text') {
      page.save().text(p.x, p.y, p.size, p.text, p.color, p.bold).restore();
    }
  }
}

/**
 * Fill a rectangle with a checkerboard by emitting the filled squares, each
 * clipped to the rectangle by arithmetic. A PDF tiling pattern would be
 * tidier but needs a resource dictionary per colour.
 */
function drawChecker(page, p) {
  page.save().fillColor(p.color);
  const cols = Math.ceil(p.w / p.size);
  const rows = Math.ceil(p.h / p.size);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((row + col) % 2 !== 0) continue;
      const x = p.x + col * p.size;
      const y = p.y + row * p.size;
      const w = Math.min(p.size, p.x + p.w - x);
      const h = Math.min(p.size, p.y + p.h - y);
      if (w <= 0 || h <= 0) continue;
      page.rect(x, y, w, h);
    }
  }
  page.fill().restore();
}

/**
 * Assemble pages into PDF bytes.
 *
 * Object numbers are fixed up front -- catalog, page tree, two fonts, then a
 * content stream and a page object per sheet -- so nothing needs renumbering.
 */
export function buildPdf(pages, meta = {}) {
  const CATALOG = 1;
  const PAGES = 2;
  const FONT = 3;
  const FONT_BOLD = 4;
  const FIRST = 5;
  const contentId = (i) => FIRST + i * 2;
  const pageId = (i) => FIRST + i * 2 + 1;

  const bodies = [];
  bodies[CATALOG] = `<< /Type /Catalog /Pages ${PAGES} 0 R >>`;
  bodies[PAGES] =
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] ` +
    `/Count ${pages.length} >>`;
  bodies[FONT] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  bodies[FONT_BOLD] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  pages.forEach((page, i) => {
    const stream = page.toString();
    bodies[contentId(i)] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    bodies[pageId(i)] =
      `<< /Type /Page /Parent ${PAGES} 0 R ` +
      `/MediaBox [0 0 ${num(page.widthMm * MM_TO_PT)} ${num(page.heightMm * MM_TO_PT)}] ` +
      `/Resources << /Font << /F1 ${FONT} 0 R /F2 ${FONT_BOLD} 0 R >> >> ` +
      `/Contents ${contentId(i)} 0 R >>`;
  });

  const count = bodies.length - 1;
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  for (let id = 1; id <= count; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${bodies[id]}\nendobj\n`;
  }

  const xrefStart = out.length;
  out += `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id++) {
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  const title = meta.title ? `/Title (${escapeText(meta.title)}) ` : '';
  out += `trailer\n<< /Size ${count + 1} /Root ${CATALOG} 0 R ` +
    `/Info << ${title}/Producer (Corrugator) >> >>\n`;
  out += `startxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Lay a pattern out across pages at true size.
 *
 * @param {import('../pattern.js').Pattern} pattern
 * @param {object} opts
 * @param {keyof PAGE_SIZES} [opts.pageSize]
 * @param {number} [opts.marginMm]   Printer margin.
 * @param {number} [opts.overlapMm]  How much neighbouring sheets share, for taping.
 * @param {boolean} [opts.landscape]
 * @param {string} [opts.title]
 * @returns {Uint8Array}
 */
export function patternToPdf(pattern, opts = {}) {
  const {
    pageSize = 'letter',
    marginMm = 12,
    overlapMm = 12,
    landscape = false,
    title = 'ChompShop pattern',
  } = opts;

  const size = PAGE_SIZES[pageSize] ?? PAGE_SIZES.letter;
  const pageW = landscape ? size.heightMm : size.widthMm;
  const pageH = landscape ? size.widthMm : size.heightMm;
  const printW = pageW - marginMm * 2;
  const printH = pageH - marginMm * 2;

  const box = patternBox(pattern);
  const patW = Math.max(box.maxX - box.minX, 0.1);
  const patH = Math.max(box.maxY - box.minY, 0.1);
  const prims = patternPrimitives(pattern, { offsetX: -box.minX, offsetY: -box.minY });
  const used = usedMarkTypes(pattern);
  const keyHeight = legendHeight([...used]);

  const pages = [];
  const fitsOnOne = patW <= printW && patH <= printH - keyHeight - 6;

  if (fitsOnOne) {
    const page = new PdfPage(pageW, pageH);
    const offsetX = marginMm + (printW - patW) / 2;
    const offsetY = marginMm;
    page.save().push(`1 0 0 1 ${num(offsetX * MM_TO_PT)} ${num(-offsetY * MM_TO_PT)} cm`);
    drawPrimitives(page, prims);
    page.restore();
    drawFooter(page, pageH, marginMm, patW, patH);
    drawPrimitives(page, legendPrimitives(marginMm, pageH - marginMm - keyHeight, printW, used));
    pages.push(page);
    return buildPdf(pages, { title });
  }

  const step = Math.max(printW - overlapMm, printW * 0.25);
  const stepY = Math.max(printH - overlapMm, printH * 0.25);
  const cols = Math.max(1, Math.ceil((patW - overlapMm) / step));
  const rows = Math.max(1, Math.ceil((patH - overlapMm) / stepY));

  pages.push(overviewPage(pageW, pageH, marginMm, prims, patW, patH, cols, rows, step, stepY, printW, printH, used, keyHeight));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const page = new PdfPage(pageW, pageH);
      page.save();
      page.clipRect(marginMm, marginMm, printW, printH);
      const tx = marginMm - col * step;
      const ty = marginMm - row * stepY;
      page.push(`1 0 0 1 ${num(tx * MM_TO_PT)} ${num(-ty * MM_TO_PT)} cm`);
      drawPrimitives(page, prims);
      page.restore();

      drawTileGuides(page, pageW, pageH, marginMm, printW, printH, col, row, cols, rows, overlapMm);
      pages.push(page);
    }
  }

  return buildPdf(pages, { title });
}

/** A shrunken map of the whole pattern with the tile grid over it. */
function overviewPage(pageW, pageH, margin, prims, patW, patH, cols, rows, step, stepY, tileW, tileH, used, keyHeight) {
  const page = new PdfPage(pageW, pageH);
  const printW = pageW - margin * 2;

  page.text(margin, margin + 6, 6, 'Your ChompShop pattern', '#111111', true);
  page.text(margin, margin + 13, 3.4,
    `Print every sheet at 100% (no "fit to page"), then tape them together: ${cols} across, ${rows} down.`);
  page.text(margin, margin + 18.5, 3.4,
    'Sheets overlap. Line the grey guides up, tape, then glue the whole thing onto cardboard.');

  const mapTop = margin + 26;
  const mapMaxH = pageH - margin - keyHeight - mapTop - 10;
  const scale = Math.min(printW / patW, mapMaxH / patH, 1);
  const mapW = patW * scale;
  const mapH = patH * scale;
  const mapX = margin + (printW - mapW) / 2;

  // The primitives are written for a full-size page, so they already carry
  // this page's y-flip. Scaling about the page's top-left therefore needs
  // f = K * (H - mapTop - scale * H); deriving it once here beats trying to
  // pre-transform every coordinate.
  const K = MM_TO_PT;
  const scaled = new PdfPage(pageW, pageH);
  drawPrimitives(scaled, prims);
  page.save();
  page.push(
    `${num(scale)} 0 0 ${num(scale)} ${num(mapX * K)} ${num(K * (pageH - mapTop - scale * pageH))} cm`,
  );
  page.ops.push(...scaled.ops);
  page.restore();

  page.save().strokeColor('#999999').lineWidth(0.3).dash([2, 2]);
  for (let c = 1; c < cols; c++) {
    const x = mapX + Math.min(c * step, patW) * scale;
    page.moveTo(x, mapTop).lineTo(x, mapTop + mapH);
  }
  for (let r = 1; r < rows; r++) {
    const y = mapTop + Math.min(r * stepY, patH) * scale;
    page.moveTo(mapX, y).lineTo(mapX + mapW, y);
  }
  page.stroke().restore();

  page.save().strokeColor('#cccccc').lineWidth(0.3).dash(null);
  page.rect(mapX, mapTop, mapW, mapH).stroke().restore();

  // Centre each label on the part of the pattern that sheet actually carries.
  // The last row and column are usually only partly covered, so splitting the
  // full tile would shove their labels off the edge of the map.
  const midpoint = (index, tileStep, tileSize, extent) => {
    const lo = index * tileStep;
    return (lo + Math.min(lo + tileSize, extent)) / 2;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = mapX + midpoint(c, step, tileW, patW) * scale;
      const y = mapTop + midpoint(r, stepY, tileH, patH) * scale;
      page.text(x - 4, y, 3.2, `${r + 1}-${String.fromCharCode(65 + c)}`, '#999999', true);
    }
  }

  page.text(margin, mapTop + mapH + 7, 3.2,
    `Finished size: ${patW.toFixed(0)} x ${patH.toFixed(0)} mm ` +
    `(${(patW / 25.4).toFixed(1)} x ${(patH / 25.4).toFixed(1)} in)`,
    '#444444');

  drawPrimitives(page, legendPrimitives(margin, pageH - margin - keyHeight, printW, used));
  return page;
}

function drawTileGuides(page, pageW, pageH, margin, printW, printH, col, row, cols, rows, overlap) {
  page.save().strokeColor('#bbbbbb').lineWidth(0.25).dash([2, 2]);
  page.rect(margin, margin, printW, printH).stroke().restore();

  // Solid marks on the edges that butt against another sheet.
  page.save().strokeColor('#888888').lineWidth(0.4).dash(null);
  if (col < cols - 1) {
    const x = margin + printW - overlap;
    page.moveTo(x, margin).lineTo(x, margin + printH);
  }
  if (row < rows - 1) {
    const y = margin + printH - overlap;
    page.moveTo(margin, y).lineTo(margin + printW, y);
  }
  page.stroke().restore();

  const label = `${row + 1}-${String.fromCharCode(65 + col)}`;
  page.text(margin, margin - 3, 3.4, `Sheet ${label}   (row ${row + 1} of ${rows}, column ${col + 1} of ${cols})`, '#666666', true);
  page.text(margin, pageH - margin + 5, 3, 'Print at 100%. Overlap the grey line with the next sheet and tape.', '#888888');
}

function drawFooter(page, pageH, margin, patW, patH) {
  page.text(margin, margin - 3, 3.2,
    `Print at 100% - no "fit to page". Finished size ${patW.toFixed(0)} x ${patH.toFixed(0)} mm (${(patW / 25.4).toFixed(1)} x ${(patH / 25.4).toFixed(1)} in).`,
    '#666666');
}
