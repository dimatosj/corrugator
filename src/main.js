/**
 * App wiring: source photo -> settings -> traced pattern -> marks -> files.
 *
 * Tracing runs on the main thread, debounced. A module worker would keep
 * slider drags perfectly smooth, but workers are blocked when the page is
 * opened straight off the filesystem, and being able to double-click
 * index.html is worth more here than the last few milliseconds.
 */

import { photoToMask } from './imageproc.js';
import {
  patternFromMask, emptyPattern, holeMark, foldMark, rectMark, moveMark,
  patternBox, resizePattern, reviewPattern,
} from './pattern.js';
import { loadImageFile, exampleSource } from './photo.js';
import { renderPreview } from './preview.js';
import { PatternEditor } from './editor.js';
import { patternToSvg } from './export/svg.js';
import { patternToPdf, PAGE_SIZES } from './export/pdf.js';
import {
  LEGEND, LEGEND_ORDER, HOLE, FOLD_UP, FOLD_DOWN, DRAW_BOX, TAPE_FRONT, TAPE_BACK,
} from './legend.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'currogator.settings.v1';

const DEFAULTS = {
  mode: 'cutout',
  sensitivity: 0,
  closeGaps: 5,
  smooth: 80,
  detail: 60,
  grow: 0,
  minPart: 8,
  widthValue: 200,
  units: 'mm',
  pageSize: 'letter',
  orientation: 'portrait',
};

const UNIT_TO_MM = { mm: 1, cm: 10, in: 25.4 };

const state = {
  source: null,
  pattern: emptyPattern(),
  marks: [],
  history: [],
  future: [],
  selectedId: null,
  tool: 'select',
  settings: { ...DEFAULTS, ...loadSettings() },
  tracing: false,
};

let editor;
let traceTimer = null;

// ── Settings persistence ─────────────────────────────────────────

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch {
    // Private browsing, or storage turned off. The app works fine without it.
  }
}

// ── Derived values ───────────────────────────────────────────────

const targetWidthMm = () =>
  Math.max(10, state.settings.widthValue * (UNIT_TO_MM[state.settings.units] ?? 1));

/** The Detail slider reads high-to-low, because more detail means less simplifying. */
const simplifyEpsilon = () => 0.25 + (100 - state.settings.detail) / 100 * 5;

// ── Tracing ──────────────────────────────────────────────────────

function scheduleTrace({ immediate = false } = {}) {
  if (!state.source) return;
  clearTimeout(traceTimer);
  setBusy(true);
  traceTimer = setTimeout(runTrace, immediate ? 0 : 130);
}

function runTrace() {
  if (!state.source) return;
  const { imageData, width, height } = state.source;
  const s = state.settings;

  try {
    const traced = photoToMask(imageData.data, width, height, {
      mode: s.mode,
      sensitivity: Number(s.sensitivity),
      closeGaps: Number(s.closeGaps),
      grow: Number(s.grow),
    });

    const widthMm = targetWidthMm();
    const pattern = patternFromMask(traced, {
      targetWidthMm: widthMm,
      simplify: simplifyEpsilon(),
      smooth: Number(s.smooth) / 100,
      // The slider reads in tenths of a percent of the finished width.
      minPartMm: (Number(s.minPart) / 1000) * widthMm,
      minHoleMm: (Number(s.minPart) / 1000) * widthMm,
    });

    pattern.marks = state.marks;
    const firstTrace = state.pattern.parts.length === 0;
    state.pattern = pattern;
    render();
    if (firstTrace) editor.fit(patternBox(pattern));
  } catch (err) {
    console.error(err);
    showNotes([{ level: 'warn', text: `Could not trace that: ${err.message}` }]);
  } finally {
    setBusy(false);
  }
}

// ── Rendering ────────────────────────────────────────────────────

function render() {
  state.pattern.marks = state.marks;
  renderPreview($('preview'), state.pattern, {
    photoUrl: state.source?.dataUrl ?? null,
    showPhoto: $('showPhoto').checked,
    selectedId: state.selectedId,
  });

  const hasPattern = state.pattern.parts.length > 0;
  $('stageEmpty').hidden = hasPattern || state.tracing;
  $('pdfBtn').disabled = !hasPattern;
  $('svgBtn').disabled = !hasPattern;
  $('deleteBtn').disabled = !state.selectedId;
  $('undoBtn').disabled = state.history.length === 0;
  $('redoBtn').disabled = state.future.length === 0;

  showNotes(reviewPattern(state.pattern));
  updateReadouts();
}

function showNotes(notes) {
  const list = $('notes');
  list.textContent = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'note-info';
    li.textContent = 'Looks good. Print at 100%.';
    list.append(li);
    return;
  }
  for (const note of notes) {
    const li = document.createElement('li');
    li.className = note.level === 'warn' ? 'note-warn' : 'note-info';
    li.textContent = note.text;
    list.append(li);
  }
}

function updateReadouts() {
  const s = state.settings;
  $('sensitivityOut').textContent = s.sensitivity > 0 ? `+${s.sensitivity}` : String(s.sensitivity);
  $('closeGapsOut').textContent = `${s.closeGaps} px`;
  $('smoothOut').textContent = `${s.smooth}%`;
  $('detailOut').textContent = `${s.detail}%`;
  $('growOut').textContent = `${s.grow} px`;
  $('minPartOut').textContent = `${(s.minPart / 10).toFixed(1)}% of width`;

  const box = patternBox(state.pattern);
  const wMm = box.maxX - box.minX;
  const hMm = box.maxY - box.minY;
  if (state.pattern.parts.length) {
    $('sizeReadout').textContent =
      `Finished pattern: ${wMm.toFixed(0)} × ${hMm.toFixed(0)} mm  (${(wMm / 25.4).toFixed(1)} × ${(hMm / 25.4).toFixed(1)} in)`;
    $('pagesReadout').textContent = describePages(wMm, hMm);
  } else {
    $('sizeReadout').textContent = '';
    $('pagesReadout').textContent = '';
  }
}

function describePages(wMm, hMm) {
  const size = PAGE_SIZES[state.settings.pageSize];
  const landscape = state.settings.orientation === 'landscape';
  const pageW = (landscape ? size.heightMm : size.widthMm) - 24;
  const pageH = (landscape ? size.widthMm : size.heightMm) - 24;
  if (wMm <= pageW && hMm <= pageH - 60) return 'Fits on one sheet.';
  const cols = Math.max(1, Math.ceil((wMm - 12) / Math.max(pageW - 12, 1)));
  const rows = Math.max(1, Math.ceil((hMm - 12) / Math.max(pageH - 12, 1)));
  return `About ${cols} × ${rows} sheets, plus a guide page.`;
}

function setBusy(busy) {
  state.tracing = busy;
  $('stageBusy').hidden = !busy;
  if (busy) $('stageEmpty').hidden = true;
}

// ── Marks and history ────────────────────────────────────────────

function pushHistory() {
  state.history.push(JSON.stringify(state.marks));
  if (state.history.length > 60) state.history.shift();
  state.future.length = 0;
}

function restore(json) {
  state.marks = JSON.parse(json);
  if (!state.marks.some((m) => m.id === state.selectedId)) state.selectedId = null;
  render();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(JSON.stringify(state.marks));
  restore(state.history.pop());
}

function redo() {
  if (!state.future.length) return;
  state.history.push(JSON.stringify(state.marks));
  restore(state.future.pop());
}

function addMark(type, a, b) {
  pushHistory();
  let mark;
  if (type === HOLE) mark = holeMark(a[0], a[1]);
  else if (type === FOLD_UP || type === FOLD_DOWN) mark = foldMark(type, a, b);
  else mark = rectMark(type, a[0], a[1], b[0] - a[0], b[1] - a[1]);

  state.marks = [...state.marks, mark];
  state.selectedId = mark.id;
  render();
}

function deleteSelected() {
  if (!state.selectedId) return;
  pushHistory();
  state.marks = state.marks.filter((m) => m.id !== state.selectedId);
  state.selectedId = null;
  render();
}

// ── Downloads ────────────────────────────────────────────────────

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

// ── Wiring ───────────────────────────────────────────────────────

function bindSlider(id, key, { retrace = true } = {}) {
  const input = $(id);
  input.value = state.settings[key];
  input.addEventListener('input', () => {
    state.settings[key] = Number(input.value);
    updateReadouts();
    saveSettings();
    if (retrace) scheduleTrace();
  });
}

function bindSelect(id, key, onChange) {
  const input = $(id);
  input.value = state.settings[key];
  input.addEventListener('change', () => {
    state.settings[key] = input.value;
    saveSettings();
    onChange?.();
  });
}

async function useFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showNotes([{ level: 'warn', text: 'That is not an image file.' }]);
    return;
  }
  setBusy(true);
  try {
    useSource(await loadImageFile(file));
  } catch (err) {
    console.error(err);
    setBusy(false);
    showNotes([{ level: 'warn', text: err.message }]);
  }
}

function useSource(source) {
  state.source = source;
  state.pattern = emptyPattern();

  const thumb = $('thumb');
  thumb.src = source.dataUrl;
  thumb.hidden = false;
  $('dropzone').classList.add('has-image');
  $('traceStep').hidden = false;
  $('sizeStep').hidden = false;

  scheduleTrace({ immediate: true });
}

function buildLegendList() {
  const list = $('legendList');
  for (const type of LEGEND_ORDER) {
    const style = LEGEND[type];
    const li = document.createElement('li');

    const sample = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sample.setAttribute('viewBox', '0 0 34 14');
    sample.setAttribute('aria-hidden', 'true');
    sample.innerHTML = swatchMarkup(style);

    const text = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = style.label;
    const meaning = document.createElement('span');
    meaning.textContent = style.meaning;
    text.append(name, meaning);

    li.append(sample, text);
    list.append(li);
  }
}

function swatchMarkup(style) {
  const dash = style.dash ? ` stroke-dasharray="4 3"` : '';
  if (style.shape === 'circle') {
    return `<circle cx="17" cy="7" r="5" fill="none" stroke="${style.color}" stroke-width="1.6"/>`;
  }
  if (style.fill === 'checker') {
    const squares = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 7; col++) {
        if ((row + col) % 2) continue;
        squares.push(`<rect x="${col * 5}" y="${row * 5 - 1}" width="5" height="5" fill="${style.color}" fill-opacity="0.85"/>`);
      }
    }
    return squares.join('');
  }
  if (style.shape === 'rect') {
    return `<rect x="1" y="1" width="32" height="12" fill="none" stroke="${style.color}" stroke-width="1.6"/>`;
  }
  return `<line x1="1" y1="7" x2="33" y2="7" stroke="${style.color}" stroke-width="2.4" stroke-linecap="round"${dash}/>`;
}

function selectTool(tool) {
  state.tool = tool;
  editor.setTool(tool);
  for (const btn of document.querySelectorAll('.tool')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool));
  }
  const help = {
    select: 'Drag a mark to move it · drag the background to pan · scroll to zoom',
    [HOLE]: 'Click where a hole should be punched',
    [FOLD_UP]: 'Drag along the line that folds up',
    [FOLD_DOWN]: 'Drag along the line that folds down',
    [DRAW_BOX]: 'Drag out a box to draw in',
    [TAPE_FRONT]: 'Drag out the area to tape on the front',
    [TAPE_BACK]: 'Drag out the area to tape on the back',
  };
  $('stageHelp').textContent = help[tool] ?? '';
}

function init() {
  buildLegendList();

  editor = new PatternEditor($('preview'), {
    onAdd: (type, a, b) => addMark(type, a, b),
    onSelect: (id) => {
      state.selectedId = id;
      render();
    },
    onMove: (id, dx, dy, commit) => {
      if (commit) {
        // The drag already moved the mark; this just closes the undo step so
        // the next drag starts a fresh one.
        state.movingFrom = null;
        render();
        return;
      }
      if (state.movingFrom !== id) {
        pushHistory();
        state.movingFrom = id;
      }
      state.marks = state.marks.map((m) => (m.id === id ? moveMark(m, dx, dy) : m));
      state.pattern.marks = state.marks;
      renderPreview($('preview'), state.pattern, {
        photoUrl: state.source?.dataUrl ?? null,
        showPhoto: $('showPhoto').checked,
        selectedId: state.selectedId,
      });
    },
  });
  selectTool('select');

  // Source
  $('fileInput').addEventListener('change', (e) => useFile(e.target.files[0]));
  $('cameraInput').addEventListener('change', (e) => useFile(e.target.files[0]));
  $('exampleBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    useSource(exampleSource());
  });

  const zone = $('dropzone');
  zone.addEventListener('click', (e) => {
    if (e.target.closest('label, button')) return;
    $('fileInput').click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $('fileInput').click();
    }
  });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove('dragging');
    });
  }
  zone.addEventListener('drop', (e) => useFile(e.dataTransfer?.files?.[0]));

  // Tracing controls
  bindSelect('mode', 'mode', () => scheduleTrace({ immediate: true }));
  bindSlider('sensitivity', 'sensitivity');
  bindSlider('closeGaps', 'closeGaps');
  bindSlider('smooth', 'smooth');
  bindSlider('detail', 'detail');
  bindSlider('grow', 'grow');
  bindSlider('minPart', 'minPart');

  $('resetTrace').addEventListener('click', () => {
    Object.assign(state.settings, {
      mode: DEFAULTS.mode,
      sensitivity: DEFAULTS.sensitivity,
      closeGaps: DEFAULTS.closeGaps,
      smooth: DEFAULTS.smooth,
      detail: DEFAULTS.detail,
      grow: DEFAULTS.grow,
      minPart: DEFAULTS.minPart,
    });
    for (const [id, key] of [
      ['mode', 'mode'], ['sensitivity', 'sensitivity'], ['closeGaps', 'closeGaps'],
      ['smooth', 'smooth'], ['detail', 'detail'], ['grow', 'grow'], ['minPart', 'minPart'],
    ]) {
      $(id).value = state.settings[key];
    }
    saveSettings();
    scheduleTrace({ immediate: true });
  });

  // Size: rescale in place so marks keep their position on the drawing.
  const widthInput = $('widthInput');
  widthInput.value = state.settings.widthValue;
  widthInput.addEventListener('change', () => {
    const value = Number(widthInput.value);
    if (!Number.isFinite(value) || value <= 0) {
      widthInput.value = state.settings.widthValue;
      return;
    }
    state.settings.widthValue = value;
    saveSettings();
    applyWidth();
  });
  bindSelect('units', 'units', () => {
    // Keep the physical size and restate it in the new unit.
    const box = patternBox(state.pattern);
    const wMm = box.maxX - box.minX;
    if (state.pattern.parts.length && wMm > 0) {
      state.settings.widthValue = Math.round((wMm / UNIT_TO_MM[state.settings.units]) * 10) / 10;
      widthInput.value = state.settings.widthValue;
      saveSettings();
    }
    updateReadouts();
  });

  // Tools
  for (const btn of document.querySelectorAll('.tool')) {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  }
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('deleteBtn').addEventListener('click', deleteSelected);
  $('fitBtn').addEventListener('click', () => editor.fit(patternBox(state.pattern)));
  $('showPhoto').addEventListener('change', render);

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (typing) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'Escape') {
      selectTool('select');
      state.selectedId = null;
      render();
    }
  });

  // Export
  bindSelect('pageSize', 'pageSize', updateReadouts);
  bindSelect('orientation', 'orientation', updateReadouts);

  $('svgBtn').addEventListener('click', () => {
    const svg = patternToSvg(state.pattern);
    download(new Blob([svg], { type: 'image/svg+xml' }), `chomp-pattern-${stamp()}.svg`);
  });

  $('pdfBtn').addEventListener('click', () => {
    const bytes = patternToPdf(state.pattern, {
      pageSize: state.settings.pageSize,
      landscape: state.settings.orientation === 'landscape',
    });
    download(new Blob([bytes], { type: 'application/pdf' }), `chomp-pattern-${stamp()}.pdf`);
  });

  window.addEventListener('resize', () => {
    if (state.pattern.parts.length) editor.setView({ ...editor.view });
  });

  updateReadouts();
}

function applyWidth() {
  if (!state.pattern.parts.length) return;
  state.pattern = resizePattern(state.pattern, targetWidthMm());
  state.marks = state.pattern.marks;
  render();
  editor.fit(patternBox(state.pattern));
}

init();
