# Currogator

Turn a photo of a drawing into a printable [ChompShop](https://chompshop.com)
pattern — a true-scale cut line your ChompSaw can follow, with the fold, hole
and tape marks from the [pattern guide](https://learn.chompshop.com/pattern-guide)
laid on top.

Point a phone at a kid's drawing, and get back a PDF you can print, glue to
cardboard and cut out.

## Running it

No build step and no dependencies. Open `index.html` in a browser, or serve the
folder:

```sh
npm start          # python3 -m http.server 8080
npm test           # 54 tests, node's built-in runner
```

Everything happens in the browser. Photos are never uploaded anywhere.

## The pattern language

Straight from the ChompShop pattern guide:

| Mark | Means |
| --- | --- |
| Solid black line | Cut it out with your ChompSaw |
| Red dashed line | Fold up, making a valley |
| Blue dashed line | Fold down, making a mountain peak |
| Green circle | Twist your Hole Punch in here |
| Red box | Draw your own design here, or line parts up |
| Yellow checks | Double-sided tape on the front |
| Purple checks | Double-sided tape on the back |

The colours are close visual matches picked for print legibility, not sampled
from ChompShop artwork. They live in one place, `src/legend.js`.

## How a photo becomes a cut line

1. **Flatten the lighting** (`imageproc.js`). A phone photo of a page is lit
   unevenly, and a single global threshold eats the shadowed corner. Dividing
   the image by a heavily blurred copy of itself cancels the lighting, and Otsu
   then picks a threshold on its own. Otsu is averaged across the plateau of
   maximal between-class variance, so a wide empty valley between ink and paper
   does not pin the threshold against the darker peak.

2. **Clean up and fill** (`imageproc.js`). Despeckle, then dilate, fill enclosed
   pockets, and erode back. That order matters: a plain dilate/erode close
   re-opens any gap exactly twice the radius wide, because the erode undoes the
   bridge the dilate just built. Filling while the strokes are fat is what
   closes an outline drawn with a pen-lift in it.

3. **Trace** (`trace.js`). A crack-following tracer walks the boundaries between
   ink and paper along the pixel lattice, keeping ink on the left. Loops always
   close and never self-touch, and the winding direction says whether a loop is
   the outside of a shape or the edge of a hole. Holes are then nested into the
   tightest shape that contains them.

4. **Simplify** (`simplify.js`). Chaikin rounds off the pixel staircase, RDP
   drops the points that carry no shape, and a Catmull-Rom fit turns what is
   left into cubics. Tangents are clamped to a third of their segment, because
   an unclamped fit overshoots at a sharp corner and hands you a cut line that
   loops back on itself.

5. **Lay out and export** (`pattern.js`, `export/`). The pattern is scaled to
   the finished size you asked for. A pattern bigger than one sheet tiles across
   pages with a taping overlap, plus a guide page carrying an overview map and
   the legend.

### Three ways to trace

| Mode | What you get |
| --- | --- |
| Cut around the whole drawing | One solid silhouette |
| …and cut out the gaps | Silhouette, with big enclosed gaps left open as holes |
| Cut out the lines themselves | The strokes traced as their own parts |

## Notes on the output

- **PDF is written directly** (`export/pdf.js`), a small PDF 1.4 writer with no
  library behind it. Patterns have to print at true size or the cut parts will
  not fit together, which rules out any raster step. Print at 100% — turn off
  "fit to page".
- **SVG carries real `mm` units** on the root element, so it opens at true size
  in Illustrator, Inkscape and Design Space.
- The app **warns** when an interior cut-out is tighter than the saw can turn
  (about 12 mm), rather than silently handing you something uncuttable.

## Layout

```
index.html          markup
styles.css          styles
src/
  legend.js         the ChompShop pattern language, as data
  imageproc.js      photo -> clean binary mask
  trace.js          mask -> closed contours
  simplify.js       contours -> smooth, cuttable paths
  geometry.js       path representation and helpers
  pattern.js        the document model, in millimetres
  photo.js          file/camera -> ImageData, plus the built-in example
  preview.js        live SVG for the editor
  editor.js         pan, zoom, and placing marks
  main.js           app wiring
  export/
    draw.js         pattern -> drawing primitives (the one place legend is applied)
    svg.js          SVG file
    pdf.js          PDF file, tiled across sheets
test/               54 tests over the tracer, simplifier, mask pipeline and exporters
```

Tracing runs on the main thread, debounced. A module worker would keep slider
drags perfectly smooth, but workers are blocked when a page is opened straight
off the filesystem, and being able to double-click `index.html` is worth more
here.

## Not affiliated with ChompShop

This is an independent tool. ChompSaw and ChompShop are their trademarks.
