/**
 * Getting a photo into the pipeline.
 *
 * Two things happen here that matter downstream. The image is scaled down, so
 * tracing stays interactive on a phone; and a white margin is added around it,
 * so a drawing that runs right to the edge of the frame still has background on
 * every side. Without that margin the silhouette would be cut off flush by the
 * photo boundary and erosion would eat into it.
 */

/** @typedef {{imageData:ImageData, width:number, height:number, dataUrl:string}} Source */

const MAX_DIM = 1000;
const MARGIN_PX = 14;

/**
 * @param {Blob} file
 * @param {{maxDim?:number, marginPx?:number}} [opts]
 * @returns {Promise<Source>}
 */
export async function loadImageFile(file, opts = {}) {
  const bitmap = await decode(file);
  try {
    return drawToSource(bitmap, bitmap.width, bitmap.height, opts);
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}

/**
 * Decode to something drawable, honouring the EXIF orientation phones set.
 * `createImageBitmap` does that for us where it exists; the <img> fallback
 * gets it from the browser's own default handling.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari used to reject the options bag; fall through to the <img> path.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = url;
    });
    return img;
  } finally {
    // Revoking immediately is safe: the image has finished decoding by now.
    URL.revokeObjectURL(url);
  }
}

function drawToSource(drawable, srcW, srcH, opts = {}) {
  const maxDim = opts.maxDim ?? MAX_DIM;
  const margin = opts.marginPx ?? MARGIN_PX;

  if (!srcW || !srcH) throw new Error('That image has no size.');

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w + margin * 2;
  canvas.height = h + margin * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawable, margin, margin, w, h);

  return {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
  };
}

/**
 * A drawn-on-the-spot sample, so the app is usable without a photo and without
 * shipping a binary. It is deliberately wobbly and has a gap in one outline,
 * because that is what a real kid's drawing looks like to the tracer.
 */
export function exampleSource() {
  const w = 620;
  const h = 760;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#fdfcf7';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#22201c';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // A rocket: nose cone, body, two fins, a porthole and a flame.
  ctx.beginPath();
  ctx.moveTo(310, 90);
  ctx.bezierCurveTo(400, 210, 420, 330, 415, 470);
  ctx.lineTo(415, 560);
  ctx.lineTo(205, 560);
  ctx.lineTo(205, 470);
  ctx.bezierCurveTo(200, 330, 220, 210, 310, 90);
  ctx.stroke();

  ctx.beginPath();          // left fin, closing back onto the body
  ctx.moveTo(205, 470);
  ctx.lineTo(120, 615);
  ctx.lineTo(205, 558);
  ctx.stroke();

  // Right fin, drawn with a small pen-lift so the example exercises the
  // gap-closing step the way a real drawing does.
  ctx.beginPath();
  ctx.moveTo(415, 470);
  ctx.lineTo(500, 615);
  ctx.lineTo(430, 570);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(422, 564);
  ctx.lineTo(415, 558);
  ctx.stroke();

  ctx.beginPath();          // porthole
  ctx.arc(310, 300, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 7;
  ctx.beginPath();          // flame, springing from the body's bottom edge
  ctx.moveTo(250, 558);
  ctx.quadraticCurveTo(268, 660, 310, 700);
  ctx.quadraticCurveTo(352, 660, 370, 558);
  ctx.stroke();

  // A little uneven lighting, so the example exercises the same path a photo does.
  const shade = ctx.createLinearGradient(0, 0, w, h);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  return drawToSource(canvas, w, h, { maxDim: MAX_DIM, marginPx: MARGIN_PX });
}
