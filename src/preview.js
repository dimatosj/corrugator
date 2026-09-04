/**
 * The on-screen pattern, built as live SVG nodes rather than a string, so
 * marks can be hit-tested and dragged.
 *
 * Layout mirrors the exported file exactly -- same primitives, same legend
 * colours -- with three extras the export does not have: the photo underlay,
 * invisible hit targets, and the selection outline.
 */

import { patternPrimitives } from './export/draw.js';
import { pathToD } from './geometry.js';
import { markBox } from './pattern.js';
import { HOLE } from './legend.js';

const NS = 'http://www.w3.org/2000/svg';
const num = (v) => String(Math.round(v * 1000) / 1000);

const el = (name, attrs) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
};

/** Grab distance for hit targets, in millimetres. */
const GRAB_MM = 2.5;

/**
 * Redraw the preview.
 *
 * @param {SVGSVGElement} svg
 * @param {import('./pattern.js').Pattern} pattern
 * @param {{photoUrl?:string|null, showPhoto?:boolean, selectedId?:string|null}} opts
 */
export function renderPreview(svg, pattern, opts = {}) {
  const { photoUrl = null, showPhoto = false, selectedId = null } = opts;

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  if (showPhoto && photoUrl && pattern.image) {
    svg.append(el('image', {
      href: photoUrl,
      x: num(pattern.image.x),
      y: num(pattern.image.y),
      width: num(pattern.image.w),
      height: num(pattern.image.h),
      opacity: '0.28',
      preserveAspectRatio: 'none',
    }));
  }

  for (const p of patternPrimitives(pattern)) {
    const node = primitiveNode(p);
    if (node) svg.append(node);
  }

  const hits = el('g', { class: 'hits' });
  for (const mark of pattern.marks) {
    const node = hitNode(mark);
    if (!node) continue;
    node.setAttribute('class', 'mark-hit');
    node.dataset.markId = mark.id;
    hits.append(node);
  }
  svg.append(hits);

  const selected = pattern.marks.find((m) => m.id === selectedId);
  if (selected) {
    const b = markBox(selected);
    svg.append(el('rect', {
      class: 'sel-outline',
      x: num(b.minX - 1.5),
      y: num(b.minY - 1.5),
      width: num(b.maxX - b.minX + 3),
      height: num(b.maxY - b.minY + 3),
      rx: '1.5',
    }));
  }
}

function primitiveNode(p) {
  if (p.kind === 'path') {
    return el('path', {
      d: pathToD(p.path),
      fill: 'none',
      stroke: p.stroke,
      'stroke-width': num(p.width),
      'stroke-linejoin': 'round',
      'stroke-dasharray': p.dash ? p.dash.map(num).join(' ') : null,
    });
  }
  if (p.kind === 'line') {
    return el('line', {
      x1: num(p.a[0]), y1: num(p.a[1]), x2: num(p.b[0]), y2: num(p.b[1]),
      stroke: p.stroke,
      'stroke-width': num(p.width),
      'stroke-linecap': 'round',
      'stroke-dasharray': p.dash ? p.dash.map(num).join(' ') : null,
    });
  }
  if (p.kind === 'circle') {
    return el('circle', {
      cx: num(p.x), cy: num(p.y), r: num(p.r),
      fill: 'none', stroke: p.stroke, 'stroke-width': num(p.width),
    });
  }
  if (p.kind === 'rect') {
    return el('rect', {
      x: num(p.x), y: num(p.y), width: num(p.w), height: num(p.h),
      fill: 'none', stroke: p.stroke, 'stroke-width': num(p.width),
      'stroke-dasharray': p.dash ? p.dash.map(num).join(' ') : null,
    });
  }
  if (p.kind === 'checker') {
    const parts = [];
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
        parts.push(`M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`);
      }
    }
    return parts.length
      ? el('path', { d: parts.join(''), fill: p.color, 'fill-opacity': '0.8' })
      : null;
  }
  if (p.kind === 'text') {
    const node = el('text', {
      x: num(p.x), y: num(p.y),
      'font-size': num(p.size),
      fill: p.color,
      'font-family': 'system-ui, sans-serif',
      'font-weight': p.bold ? '700' : null,
    });
    node.textContent = p.text;
    return node;
  }
  return null;
}

/** A fat, invisible version of a mark, so small things stay grabbable. */
function hitNode(mark) {
  if (mark.type === HOLE) {
    return el('circle', { cx: num(mark.x), cy: num(mark.y), r: num(mark.d / 2 + GRAB_MM) });
  }
  if (mark.pts) {
    return el('line', {
      x1: num(mark.pts[0][0]), y1: num(mark.pts[0][1]),
      x2: num(mark.pts[1][0]), y2: num(mark.pts[1][1]),
      'stroke-width': num(GRAB_MM * 2),
      stroke: 'transparent',
    });
  }
  return el('rect', {
    x: num(mark.x), y: num(mark.y), width: num(mark.w), height: num(mark.h),
    fill: 'transparent',
  });
}

/** The dashed rubber band shown while dragging out a new mark. */
export function rubberBand(svg, kind, from, to, color) {
  let node = svg.querySelector('.rubber');
  if (!node) {
    node = el(kind === 'line' ? 'line' : 'rect', { class: 'rubber' });
    svg.append(node);
  } else if (node.tagName !== (kind === 'line' ? 'line' : 'rect')) {
    node.remove();
    return rubberBand(svg, kind, from, to, color);
  }

  node.setAttribute('stroke', color);
  node.setAttribute('stroke-width', '0.7');
  node.setAttribute('stroke-dasharray', '2 1.5');
  node.setAttribute('fill', 'none');
  node.setAttribute('pointer-events', 'none');

  if (kind === 'line') {
    node.setAttribute('x1', num(from[0]));
    node.setAttribute('y1', num(from[1]));
    node.setAttribute('x2', num(to[0]));
    node.setAttribute('y2', num(to[1]));
  } else {
    node.setAttribute('x', num(Math.min(from[0], to[0])));
    node.setAttribute('y', num(Math.min(from[1], to[1])));
    node.setAttribute('width', num(Math.abs(to[0] - from[0])));
    node.setAttribute('height', num(Math.abs(to[1] - from[1])));
  }
  return node;
}

export function clearRubberBand(svg) {
  svg.querySelector('.rubber')?.remove();
}
