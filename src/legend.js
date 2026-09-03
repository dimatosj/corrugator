/**
 * The ChompShop pattern language.
 *
 * Source: the ChompShop Learning Hub pattern guide
 * (https://learn.chompshop.com/pattern-guide). The meanings below are taken
 * verbatim from the guide; the hex values are close visual matches chosen for
 * print legibility, not sampled from ChompShop artwork.
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
    meaning: 'Cut out each part with your ChompSaw. Chomp right on the line.',
    color: '#111111',
    shape: 'path',
    dash: null,
    width: 0.6,
    fill: 'none',
    tool: 'ChompSaw',
  },
  [FOLD_UP]: {
    id: FOLD_UP,
    label: 'Fold up',
    meaning: 'Fold upwards to make a valley.',
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
    meaning: 'Fold downwards to make a mountain peak.',
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
    meaning: 'Twist your Hole Punch into the cardboard here, like a screwdriver.',
    color: '#2F9E44',
    shape: 'circle',
    dash: null,
    width: 0.5,
    fill: 'none',
    tool: 'Hole Punch',
  },
  [DRAW_BOX]: {
    id: DRAW_BOX,
    label: 'Draw here',
    meaning: 'Draw your own design here, or use the box to line parts up.',
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
    meaning: 'Put double-sided tape on the front of the part here.',
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
    meaning: 'Put double-sided tape on the back of the part here.',
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
