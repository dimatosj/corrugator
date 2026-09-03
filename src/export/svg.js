/**
 * SVG export.
 *
 * Written with real `mm` units on the root element so the file opens at true
 * size in Illustrator, Inkscape, Cricut Design Space and friends, and prints
 * at 100% straight from a browser.
 */

import { pathToD } from '../geometry.js';
import { LEGEND_ORDER, LEGEND, CHECKER_MM } from '../legend.js';
import { patternBox } from '../pattern.js';
import { patternPrimitives, legendPrimitives, legendHeight, usedMarkTypes } from './draw.js';

const num = (v) => String(Math.round(v * 1000) / 1000);
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Render one primitive as an SVG element string. */
export function primitiveToSvg(p) {
  const dash = (d) => (d && d.length ? ` stroke-dasharray="${d.map(num).join(' ')}"` : '');

  if (p.kind === 'path') {
    return `<path d="${pathToD(p.path)}" fill="none" stroke="${p.stroke}" ` +
      `stroke-width="${num(p.width)}" stroke-linejoin="round" stroke-linecap="round"${dash(p.dash)}/>`;
  }
  if (p.kind === 'line') {
    return `<line x1="${num(p.a[0])}" y1="${num(p.a[1])}" x2="${num(p.b[0])}" y2="${num(p.b[1])}" ` +
      `stroke="${p.stroke}" stroke-width="${num(p.width)}" stroke-linecap="round"${dash(p.dash)}/>`;
  }
  if (p.kind === 'circle') {
    return `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="${num(p.r)}" fill="none" ` +
      `stroke="${p.stroke}" stroke-width="${num(p.width)}"/>`;
  }
  if (p.kind === 'rect') {
    return `<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" ` +
      `fill="none" stroke="${p.stroke}" stroke-width="${num(p.width)}"${dash(p.dash)}/>`;
  }
  if (p.kind === 'checker') {
    const squares = [];
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
        squares.push(`M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`);
      }
    }
    return squares.length ? `<path d="${squares.join('')}" fill="${p.color}" fill-opacity="0.85"/>` : '';
  }
  if (p.kind === 'text') {
    return `<text x="${num(p.x)}" y="${num(p.y)}" font-size="${num(p.size)}" fill="${p.color}" ` +
      `font-family="Helvetica, Arial, sans-serif"${p.bold ? ' font-weight="700"' : ''}>${esc(p.text)}</text>`;
  }
  return '';
}

/**
 * @param {import('../pattern.js').Pattern} pattern
 * @param {{padMm?:number, includeLegend?:boolean, title?:string}} [opts]
 * @returns {string}
 */
export function patternToSvg(pattern, opts = {}) {
  const { padMm = 5, includeLegend = true, title = 'ChompShop pattern' } = opts;

  const box = patternBox(pattern);
  const patW = Math.max(box.maxX - box.minX, 0.1);
  const patH = Math.max(box.maxY - box.minY, 0.1);

  const used = usedMarkTypes(pattern);
  const keyH = includeLegend ? legendHeight([...used].filter((t) => LEGEND_ORDER.includes(t))) + 6 : 0;

  const totalW = patW + padMm * 2;
  const totalH = patH + padMm * 2 + keyH;

  const body = patternPrimitives(pattern, {
    offsetX: -box.minX + padMm,
    offsetY: -box.minY + padMm,
  }).map(primitiveToSvg);

  if (includeLegend) {
    body.push(...legendPrimitives(padMm, patH + padMm * 2, patW, used).map(primitiveToSvg));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
      `width="${num(totalW)}mm" height="${num(totalH)}mm" ` +
      `viewBox="0 0 ${num(totalW)} ${num(totalH)}">`,
    `<title>${esc(title)}</title>`,
    `<desc>Finished size ${patW.toFixed(1)} x ${patH.toFixed(1)} mm. Print at 100%.</desc>`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    ...body.filter(Boolean),
    '</svg>',
    '',
  ].join('\n');
}

/** The on-screen preview: the pattern only, no legend, no page padding. */
export function patternToPreviewSvg(pattern) {
  return patternToSvg(pattern, { padMm: 2, includeLegend: false });
}

export { CHECKER_MM, LEGEND };
