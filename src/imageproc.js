/**
 * Photo -> clean binary mask.
 *
 * Phone photos of a drawing are lit unevenly, so a plain global threshold
 * eats the shadowed corner of the page. Dividing by a heavily blurred copy of
 * the image flattens the lighting first; after that Otsu picks a sensible
 * cut-off on its own.
 *
 * Everything here works on plain typed arrays, so it runs the same in a worker,
 * in a test, or on the page.
 */

/** Luma from RGBA bytes. Fully transparent pixels read as paper white. */
export function toGray(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    out[i] = lum * a + 255 * (1 - a);
  }
  return out;
}

/** Separable box blur with running sums. Radius is clamped to the image. */
export function boxBlur(src, w, h, radius) {
  const r = Math.max(0, Math.min(radius | 0, Math.max(w, h)));
  if (r === 0) return Float32Array.from(src);

  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) {
      sum += src[row + x];
      count++;
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / count;
      const add = x + r + 1;
      const drop = x - r;
      if (add < w) {
        sum += src[row + add];
        count++;
      }
      if (drop >= 0) {
        sum -= src[row + drop];
        count--;
      }
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) {
      sum += tmp[y * w + x];
      count++;
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / count;
      const add = y + r + 1;
      const drop = y - r;
      if (add < h) {
        sum += tmp[add * w + x];
        count++;
      }
      if (drop >= 0) {
        sum -= tmp[drop * w + x];
        count--;
      }
    }
  }

  return out;
}

/**
 * Flatten uneven lighting by dividing by a large-radius blur of the image.
 * The result is centred on mid-grey, so paper lands near 255 wherever it sits
 * in the original exposure.
 */
export function flattenLighting(gray, w, h, radius) {
  const bg = boxBlur(gray, w, h, radius ?? Math.max(8, Math.round(Math.max(w, h) / 12)));
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const base = Math.max(bg[i], 1);
    out[i] = Math.max(0, Math.min(255, (gray[i] / base) * 200));
  }
  return out;
}

/** Otsu's method over a 256-bin histogram. Returns a grey level in 0..255. */
export function otsuThreshold(gray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++;
  }

  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumBack = 0;
  let weightBack = 0;
  let bestVar = -1;
  let plateauSum = 0;
  let plateauCount = 0;

  for (let t = 0; t < 256; t++) {
    weightBack += hist[t];
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;

    sumBack += t * hist[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;

    // A bimodal image with a wide empty valley scores identically right across
    // that valley. Averaging the plateau puts the threshold in the middle of
    // the gap instead of hard against the darker peak.
    if (between > bestVar * (1 + 1e-12)) {
      bestVar = between;
      plateauSum = t;
      plateauCount = 1;
    } else if (bestVar > 0 && between >= bestVar * (1 - 1e-12)) {
      plateauSum += t;
      plateauCount++;
    }
  }

  return plateauCount ? Math.round(plateauSum / plateauCount) : 0;
}

/** Mark every pixel darker than `threshold` as foreground (ink). */
export function thresholdInk(gray, threshold) {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] < threshold ? 1 : 0;
  return out;
}

/**
 * Sliding-window min/max along one axis, using a monotonic deque so cost does
 * not grow with the radius.
 */
function slidingExtreme(src, dst, w, h, r, horizontal, isMax) {
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  const lineStep = horizontal ? w : 1;
  const deq = new Int32Array(n);

  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    let head = 0;
    let tail = 0;
    for (let i = 0; i < n + r; i++) {
      if (i < n) {
        const v = src[base + i * stride];
        while (tail > head) {
          const prev = src[base + deq[tail - 1] * stride];
          if (isMax ? prev <= v : prev >= v) tail--;
          else break;
        }
        deq[tail++] = i;
      }
      const o = i - r;
      if (o >= 0) {
        while (deq[head] < o - r) head++;
        dst[base + o * stride] = src[base + deq[head] * stride];
      }
    }
  }
}

/**
 * Run a separable morphological pass on a copy padded with background.
 *
 * The padding is what makes the operations behave: erosion sees real
 * background beyond the frame, so a shape butted against the edge of the photo
 * erodes there like anywhere else, and a dilate/erode pair is a true close
 * rather than something that smears outward along the border.
 */
function morph(mask, w, h, radius, isMax) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return Uint8Array.from(mask);

  const pw = w + 2 * r;
  const ph = h + 2 * r;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) padded[(y + r) * pw + (x + r)] = mask[y * w + x] ? 1 : 0;
  }

  const tmp = new Uint8Array(pw * ph);
  const wide = new Uint8Array(pw * ph);
  slidingExtreme(padded, tmp, pw, ph, r, true, isMax);
  slidingExtreme(tmp, wide, pw, ph, r, false, isMax);

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = wide[(y + r) * pw + (x + r)];
  }
  return out;
}

/** Grow the foreground by `radius` pixels (square structuring element). */
export function dilate(mask, w, h, radius) {
  return morph(mask, w, h, radius, true);
}

/** Shrink the foreground by `radius` pixels. */
export function erode(mask, w, h, radius) {
  return morph(mask, w, h, radius, false);
}

/** Close gaps up to `radius` wide: dilate, then erode back. */
export function close(mask, w, h, radius) {
  if (radius <= 0) return Uint8Array.from(mask);
  return erode(dilate(mask, w, h, radius), w, h, radius);
}

/** Remove specks up to `radius` wide: erode, then dilate back. */
export function open(mask, w, h, radius) {
  if (radius <= 0) return Uint8Array.from(mask);
  return dilate(erode(mask, w, h, radius), w, h, radius);
}

/**
 * Label connected runs of a given value.
 *
 * @returns {{labels:Int32Array, sizes:number[], touchesBorder:boolean[], count:number}}
 *   `labels` holds 0 for pixels that are not `value`, and 1..count otherwise.
 */
export function labelComponents(mask, w, h, value = 1, connectivity = 8) {
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const touchesBorder = [false];
  const stack = new Int32Array(w * h);
  let count = 0;

  const nx8 = [1, -1, 0, 0, 1, 1, -1, -1];
  const ny8 = [0, 0, 1, -1, 1, -1, 1, -1];
  const neighbours = connectivity === 8 ? 8 : 4;

  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== 0) continue;
    if ((mask[start] ? 1 : 0) !== value) continue;

    count++;
    let size = 0;
    let border = false;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = count;

    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx / w) | 0;
      size++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;

      for (let k = 0; k < neighbours; k++) {
        const ax = x + nx8[k];
        const ay = y + ny8[k];
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        const ai = ay * w + ax;
        if (labels[ai] !== 0) continue;
        if ((mask[ai] ? 1 : 0) !== value) continue;
        labels[ai] = count;
        stack[sp++] = ai;
      }
    }

    sizes.push(size);
    touchesBorder.push(border);
  }

  return { labels, sizes, touchesBorder, count };
}

/** Drop foreground blobs smaller than `minArea` pixels. */
export function removeSmallBlobs(mask, w, h, minArea) {
  if (minArea <= 1) return Uint8Array.from(mask);
  const { labels, sizes } = labelComponents(mask, w, h, 1, 8);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const l = labels[i];
    out[i] = l !== 0 && sizes[l] >= minArea ? 1 : 0;
  }
  return out;
}

/**
 * Fill enclosed background pockets.
 *
 * Pockets larger than `maxArea` are left open, which is how an interior window
 * survives into the pattern as a hole to cut. Background that reaches the
 * image border is never filled.
 */
export function fillHoles(mask, w, h, maxArea = Infinity) {
  const { labels, sizes, touchesBorder } = labelComponents(mask, w, h, 0, 4);
  const out = Uint8Array.from(mask);
  for (let i = 0; i < out.length; i++) {
    const l = labels[i];
    if (l === 0) continue;
    if (touchesBorder[l]) continue;
    if (sizes[l] > maxArea) continue;
    out[i] = 1;
  }
  return out;
}

/** Keep only the `n` largest foreground blobs. */
export function keepLargestBlobs(mask, w, h, n) {
  if (!Number.isFinite(n) || n <= 0) return Uint8Array.from(mask);
  const { labels, sizes, count } = labelComponents(mask, w, h, 1, 8);
  if (count <= n) return Uint8Array.from(mask);

  const ranked = Array.from({ length: count }, (_, i) => i + 1).sort((a, b) => sizes[b] - sizes[a]);
  const keep = new Uint8Array(count + 1);
  for (let i = 0; i < n; i++) keep[ranked[i]] = 1;

  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = labels[i] !== 0 && keep[labels[i]] ? 1 : 0;
  return out;
}

/**
 * The full photo -> mask pipeline.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @param {object} opts
 * @param {'cutout'|'windows'|'ink'} [opts.mode]
 *   `cutout` traces the drawing's silhouette; `windows` does the same but
 *   leaves big enclosed gaps open to cut out; `ink` traces the strokes
 *   themselves.
 * @param {number} [opts.sensitivity] -50..50 nudge on the automatic threshold.
 * @param {number} [opts.closeGaps]   Pixels of stroke gap to bridge.
 * @param {number} [opts.despeckle]   Blobs below this fraction of the image are dropped.
 * @param {number} [opts.grow]        Pixels of margin to add around the shape.
 * @param {number} [opts.maxParts]    Keep only the N biggest parts.
 * @returns {{mask:Uint8Array, w:number, h:number, threshold:number, inkFraction:number}}
 */
export function photoToMask(rgba, w, h, opts = {}) {
  const {
    mode = 'cutout',
    sensitivity = 0,
    closeGaps = Math.max(2, Math.round(Math.min(w, h) / 160)),
    despeckle = 0.0004,
    grow = 0,
    maxParts = 0,
  } = opts;

  const gray = flattenLighting(toGray(rgba, w, h), w, h);
  const threshold = Math.max(1, Math.min(254, otsuThreshold(gray) - sensitivity));

  let mask = thresholdInk(gray, threshold);
  const inkFraction = mask.reduce((a, v) => a + v, 0) / mask.length;

  const minArea = Math.max(1, Math.round(despeckle * w * h));
  mask = open(mask, w, h, 1);
  mask = removeSmallBlobs(mask, w, h, minArea);

  if (mode !== 'ink') {
    // Grow first, then fill, then shrink back. Filling while the strokes are
    // fat is what closes a drawing whose outline has a pen-lift in it: a
    // dilate/erode pair on its own re-opens any gap exactly twice the radius
    // wide, because the erode undoes the bridge it just built.
    const fat = dilate(mask, w, h, closeGaps);
    const filled = fillHoles(fat, w, h, mode === 'windows' ? minArea * 6 : Infinity);
    mask = erode(filled, w, h, closeGaps);
    mask = removeSmallBlobs(mask, w, h, minArea * 4);
  }

  if (grow > 0) mask = dilate(mask, w, h, grow);
  if (maxParts > 0) mask = keepLargestBlobs(mask, w, h, maxParts);

  return { mask, w, h, threshold, inkFraction };
}
