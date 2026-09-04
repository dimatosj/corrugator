# Corrugator

**Turn a kid's drawing into a cardboard cutting pattern.**

Take a photo of a drawing. Corrugator traces the outline, lets you add fold
lines, holes and tape spots, and gives you a PDF to print at real size, glue
onto cardboard, and cut out with a ChompSaw.

**Try it: [corrugator.forklore.xyz](https://corrugator.forklore.xyz)** —
works on a phone, tablet or laptop, in the browser, nothing to install.

Everything runs on the device. **Photos are never uploaded anywhere.**

---

## Who this is for

Teachers, librarians, makerspace staff, camp counsellors, and parents running
cardboard construction with kids. It was built for classrooms that use the
[ChompSaw](https://chompshop.com), a kid-safe cardboard cutter, and it draws
its patterns using the same colour-and-line conventions as ChompShop's own
published patterns, so a child who has followed one of those already knows
how to read one of these.

The gap it fills: kids draw something they want to build, and the step from
drawing to a cuttable, printable, correctly-sized pattern is fiddly, slow, and
usually falls to the adult. Corrugator makes that step take a minute and puts
it back in the kid's hands.

## What you need

- A drawing on paper. Dark, bold lines on a light page work best: marker or
  crayon over pencil, and a closed outline over a sketch.
- A phone, tablet or computer with a camera or a photo of the drawing.
- A printer.
- Cardboard, glue stick or spray adhesive, and the cutting tool your class uses.

No account, no sign-up, no software to install.

## How a session goes

1. **Draw.** Have kids draw the thing they want to build. One clear outline
   works better than lots of interior detail, since the cutter follows the
   outside edge. Encourage them to draw *big* and to close their shapes.
2. **Photograph.** Open Corrugator, tap **Take a photo**, and shoot the whole
   page from straight above. See [getting a good photo](#getting-a-good-photo).
3. **Check the trace.** The outline appears on screen. If it grabbed a shadow
   or missed a faint line, drag **Ink sensitivity**. If a pen-lift left a gap
   in the outline, raise **Close gaps**.
4. **Choose a size.** Type how wide the finished piece should be. The app
   tells you how many sheets that will print on.
5. **Mark it up.** Use the tools along the top to add fold lines, holes, and
   tape zones. Kids can do this part themselves.
6. **Print at 100%.** Download the PDF and print with "fit to page" turned
   *off*. A pattern larger than one sheet comes with a guide page showing how
   the sheets tile and overlap.
7. **Build.** Glue the sheets to cardboard, cut along the black lines, fold on
   the dashed ones, punch the green circles, and tape where it's checkered.

## Getting a good photo

Most tracing problems are photo problems. The fixes are all at the camera:

- **Shoot from straight above.** An angle makes the shape lopsided.
- **Even light.** A window behind you or an overhead light is good. A lamp
  off to one side casts a gradient across the page; the app corrects for a lot
  of this, but it can't recover a drawing lost in deep shadow.
- **Fill the frame with the page**, and keep the page flat.
- **Plain background.** The app looks for "dark marks on a light page", so a
  wood-grain table or a patterned mat right around the page can confuse it.
  A sheet of white paper underneath solves it.
- **Bold lines.** Marker beats pencil. If a drawing is faint, have the child
  go over the outline with a marker first.

## Reading the pattern

Every mark on a Corrugator pattern means one thing:

| Mark | What to do |
| --- | --- |
| **Solid black line** | Cut along it. Stay on the line. |
| **Red dashed line** | Fold so the sides come up towards you (a valley). |
| **Blue dashed line** | Fold so the sides go down away from you (a mountain). |
| **Green circle** | Punch a hole here. |
| **Red box** | A space to draw your own design, or a guide for lining parts up. |
| **Yellow checkered patch** | Double-sided tape here, on the front. |
| **Purple checkered patch** | Double-sided tape here, on the back. |

The printed PDF includes a key listing only the marks that pattern uses, so
a child holding the sheet has the meanings right there.

These conventions match the ones ChompShop describes in its
[pattern guide](https://learn.chompshop.com/pattern-guide), which is a good
read for anyone new to cardboard construction. Corrugator uses the same
system so patterns from the two sources can be mixed in one classroom.

## Three ways to trace

**What to cut** offers three interpretations of a drawing:

| Setting | Result | Good for |
| --- | --- | --- |
| Cut around the whole drawing | One solid silhouette | Most things: animals, vehicles, characters, letters |
| Cut around it, and cut out the gaps | Silhouette with big enclosed spaces cut out | Windows, wheels, a face with open eyes |
| Cut out the lines themselves | The drawn strokes become the parts | Bold outlines drawn on purpose as thin shapes: a frame, a letter, a net |

Start with the first. It's the most forgiving of a messy drawing.

## Adding folds, holes and tape

The tools across the top of the pattern:

- **Select** moves a mark you've placed. Drag the background to pan, scroll or
  pinch to zoom.
- **Hole** places a punch circle where you click.
- **Fold up** / **Fold down** are dragged out as a line.
- **Draw box**, **Tape front**, **Tape back** are dragged out as a rectangle.

Undo and redo are in the top bar (or Ctrl/Cmd+Z). **Photo** shows the
original drawing faintly behind the pattern, which helps when deciding where
a fold should go. Changing the tracing sliders keeps the marks you've placed.

A few things kids figure out quickly:

- A fold line across the middle of a flat animal makes it stand up.
- Two holes plus a brass fastener make a moving joint.
- A tape zone on the back and a second cut-out make a stand.

## Printing and building

- **Print at 100%.** Printer dialogs love to shrink things to fit. Turn off
  "fit to page", "scale to fit", or "shrink oversized pages". The first page
  states the finished size in millimetres and inches so you can check with a
  ruler.
- **Big pieces tile.** A pattern wider than a sheet prints across several,
  each labelled (1-A, 1-B, 2-A…) with an overlap strip and a grey line to
  align on. Tape the sheets together first, then glue the whole thing down.
- **Paper sizes.** US Letter, A4, Legal and A3, portrait or landscape. Legal
  or A3 mean fewer sheets to tape for large pieces.
- **SVG too.** If your school has a vinyl cutter, laser cutter or plotter,
  the SVG download opens at true size in Cricut Design Space, Inkscape,
  Illustrator and most cutter software. Cut lines, fold lines and holes are
  different colours, so they're easy to assign to different operations.

The app warns you before printing if an inside cut-out is too small for a
saw to turn inside, so you can enlarge the pattern or drop that hole rather
than find out at the table.

## Privacy, networks and going offline

Schools rightly ask about this, so here's the whole story:

- **Nothing leaves the device.** The photo is processed in the browser and
  never sent to a server. There's no account, no upload, no analytics, and
  nothing is stored except your slider settings, which stay in the browser on
  that device.
- **It works on a locked-down network.** The page is a handful of static
  files with no external dependencies: no fonts, scripts, or images fetched
  from anywhere else. If your filter lets you load the page, everything on it
  works.
- **It works with no network at all.** Download this repository (the green
  **Code** button, then **Download ZIP**), unzip it, and open `index.html` in
  a browser. That's the whole app. Put it on a shared drive, a USB stick, or
  a classroom laptop and it runs the same way.

## Safety

Corrugator makes patterns. It doesn't change anything about how a cutting
tool should be used. Follow the safety guidance that came with whatever tool
your class uses, and supervise according to your own school's rules.

## Troubleshooting

**The outline is a blob, or the whole page came out black.** Ink sensitivity
is too high, or the photo is dark. Drag the slider left, or reshoot in better
light.

**It missed the drawing entirely.** Ink sensitivity is too low, or the lines
are faint. Drag right, or go over the drawing with a marker.

**There's a gap in the outline and it traced the inside as a separate part.**
Raise **Close gaps**. If the gap is wide, it's quicker to close it on paper
with a pen and reshoot.

**Little specks and dots appear as tiny parts.** Raise **Ignore specks**.

**The shape is lumpy.** Raise **Smooth corners**, or lower **Detail**. Less
detail is also easier for small hands to cut.

**The print came out the wrong size.** The printer scaled it. Print again at
100% and check the finished size on the first page against a ruler.

**The phone's camera button just opens the photo library.** The site has to
be loaded over HTTPS for the camera to open directly. The hosted version at
corrugator.forklore.xyz is; a copy opened from a USB stick will offer the
photo library instead, which still works.

## For developers

Corrugator is plain HTML, CSS and JavaScript: no framework, no build step, no
runtime dependencies. Open `index.html` or serve the folder. Tests use Node's
built-in runner.

```sh
npm start   # serve on :8080
npm test    # 54 tests
```

How a photo becomes a cut line, briefly: the image's lighting is flattened by
dividing it by a heavily blurred copy of itself, then thresholded (Otsu,
averaged across its plateau); the mask is grown, filled, and shrunk back so a
pen-lift in the outline closes; a crack-following tracer walks the ink/paper
boundary along the pixel lattice, so loops always close and their winding
tells an outline from a hole; and the result is rounded, simplified (RDP) and
fit with clamped Catmull-Rom curves so nothing overshoots at a corner. The
PDF is written directly, with no library, so paths stay vectors and print at
true size; large patterns tile with an overlap and a guide page.

```
index.html, styles.css     the page
src/legend.js              mark conventions, as data
src/imageproc.js           photo -> binary mask
src/trace.js               mask -> closed contours
src/simplify.js            contours -> smooth, cuttable paths
src/pattern.js             the document model, in millimetres
src/photo.js, preview.js,  camera/file input, live SVG, pointer handling
src/editor.js, main.js
src/export/                one primitives layer feeding the SVG and PDF writers
test/                      tracer, simplifier, mask pipeline, exporters
```

Contributions welcome, especially from people using it with actual kids.
Open an issue with a photo that traced badly and the settings you tried;
that's the most useful bug report there is.

## License

MIT. See [LICENSE](LICENSE). Use it, copy it, change it, put it on your
school's site.

## Trademarks and affiliation

ChompShop and ChompSaw are trademarks of their respective owner. They're named
here only to say what tool these patterns are meant for. **Corrugator is an
independent project, not affiliated with, sponsored by, or endorsed by
ChompShop.**

The colour-and-line conventions follow the system ChompShop documents
publicly, so patterns are readable by anyone already using it. This
repository contains no ChompShop artwork, logos, text, pattern files, or
other materials; every word and every drawing in it is original to this
project. If you're ChompShop and would like anything here changed, open an
issue and it'll be handled promptly.
