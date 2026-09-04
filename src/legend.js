/**
 * The mark conventions this app draws with.
 *
 * They follow the colour-and-line system that ChompShop documents publicly in
 * its pattern guide (https://learn.chompshop.com/pattern-guide), so a pattern
 * from this app reads the same way as one a maker already knows. Everything in
 * this file is written in our own words; no ChompShop text, artwork, or
 * pattern files are included, and the hex values are our own choices for
 * print legibility. ChompShop and ChompSaw are trademarks of their owner; this
 * project is independent and not affiliated with or endorsed by them.
 */

/** @typedef {'cut'|'foldUp'|'foldDown'|'hole'|'drawBox'|'tapeFront'|'tapeBack'} MarkType */

export const CUT = 'cut';
export const FOLD_UP = 'foldUp';
export const FOLD_DOWN = 'foldDown';
export const HOLE = 'hole';
export const DRAW_BOX = 'drawBox';
export const TAPE_FRONT = 'tapeFront';
export const TAPE_BACK = 'tapeBack';

/**
 * @type {Record<MarkType, {
 *   id: MarkType, label: string, meaning: string, color: string,
 *   shape: 'path'|'line'|'circle'|'rect', dash: number[]|null,
 *   width: number, fill: 'none'|'checker', tool: string
 * }>}
 * `dash` and `width` are in millimetres, so they print at a fixed size no
 * matter how big the pattern is.
 */
export const LEGEND = {
  [CUT]: {
    id: CUT,
    label: 'Cut',
    meaning: 'Cut along this line to free the part. Stay on the line, not inside or outside it.',
    color: '#111111',
    shape: 'path',
    dash: null,
    width: 0.6,
    fill: 'none',
    tool: 'Cardboard saw',
  },
  [FOLD_UP]: {
    id: FOLD_UP,
    label: 'Fold up',
    meaning: 'Fold so the two sides come up towards you, making a valley.',
    color: '#E03131',
    shape: 'line',
    dash: [3, 2],
    width: 0.6,
    fill: 'none',
    tool: 'Scoring tool',
  },
  [FOLD_DOWN]: {
    id: FOLD_DOWN,
    label: 'Fold down',
    meaning: 'Fold so the two sides go down away from you, making a mountain.',
    color: '#1971C2',
    shape: 'line',
    dash: [3, 2],
    width: 0.6,
    fill: 'none',
    tool: 'Scoring tool',
  },
  [HOLE]: {
    id: HOLE,
    label: 'Punch a hole',
    meaning: 'Make a hole here with the hole punch.',
    color: '#2F9E44',
    shape: 'circle',
    dash: null,
    width: 0.5,
    fill: 'none',
    tool: 'Hole punch',
  },
  [DRAW_BOX]: {
    id: DRAW_BOX,
    label: 'Draw here',
    meaning: 'A space for your own drawing, or a guide for lining parts up.',
    color: '#E03131',
    shape: 'rect',
    dash: null,
    width: 0.5,
    fill: 'none',
    tool: 'Markers',
  },
  [TAPE_FRONT]: {
    id: TAPE_FRONT,
    label: 'Tape (front)',
    meaning: 'Stick double-sided tape here, on the front of the part.',
    color: '#F0B400',
    shape: 'rect',
    dash: null,
    width: 0.4,
    fill: 'checker',
    tool: 'Double-sided tape',
  },
  [TAPE_BACK]: {
    id: TAPE_BACK,
    label: 'Tape (back)',
    meaning: 'Stick double-sided tape here, on the back of the part.',
    color: '#8E44AD',
    shape: 'rect',
    dash: null,
    width: 0.4,
    fill: 'checker',
    tool: 'Double-sided tape',
  },
};

/** Order the legend is drawn and listed in. */
export const LEGEND_ORDER = [CUT, FOLD_UP, FOLD_DOWN, HOLE, DRAW_BOX, TAPE_FRONT, TAPE_BACK];

/** Size of one square in a checkered tape zone, in millimetres. */
export const CHECKER_MM = 3;

/** Default diameter of a Hole Punch hole, in millimetres. */
export const HOLE_DIAMETER_MM = 6;

/**
 * Smallest interior cut-out the ChompSaw can comfortably get into. Used only
 * to warn; it never changes the geometry.
 */
export const MIN_INTERIOR_CUT_MM = 12;

/** Parse `#rrggbb` into a 0..1 RGB triple for PDF output. */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
