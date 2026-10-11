# Figure specification (diagrams and graphs rendered by the hub)

A figure is a small JSON object. The site renders it as an SVG (light and dark theme aware). Two kinds.

## 1. Function graphs — `kind: "plot"`
```js
{ kind: "plot",
  x: [-4, 4], y: [-8, 8],                 // axis ranges (numbers). Choose so everything interesting is visible.
  fns: [ { f: "x^3 - 3*x^2 + 2", label: "f" }, { f: "2*x - 1", label: "g", dashed: true } ],
  points: [ { x: 1, y: 0, label: "A(1 ; 0)" }, { x: 2, y: -2, label: "B" } ],   // marked points
  vlines: [1], hlines: [0],                // optional dashed guide lines (e.g. asymptotes x = 1)
  deg: true,                               // trig functions take DEGREES (use for NSC trig graphs); omit for radians
  xstep: 90, ystep: 1,                     // optional tick spacing (xstep 90 for trig graphs over [-180,360])
  shade: { from: "f", to: "g", x: [0, 2] } // optional: shade the region between two fns over an x-range
}
```
Expression syntax for `f`: variable `x`; operators `+ - * / ^`; parentheses; functions `sin cos tan asin acos atan sqrt abs exp ln log` (`log` = base 10); constants `pi`, `e`; multiplication must be explicit (`3*x`, not `3x`). Examples: `"-(x+1)^2 + 4"`, `"2^x - 1"`, `"log(x)/log(2)"` (log base 2), `"6/(x+2) - 1"`, `"2*sin(x)"`, `"cos(x - 30)"`, `"sqrt(x+4)"`.

## 2. Geometry / physics figures — `kind: "geo"`
Coordinates are in abstract units; the renderer keeps the aspect ratio. Letters refer to named points.
```js
{ kind: "geo",
  view: [-1, 11, -1, 8],                   // xmin, xmax, ymin, ymax of the drawing window
  axes: false,                             // true for analytical geometry (draws x and y axes through the origin)
  points: { A: [0,0], B: [10,0], C: [6,6], O: [5,3] },
  segments: [["A","B"], ["B","C"], ["C","A"]],       // solid lines between points
  dashed: [["O","C"]],                                 // dashed segments
  lines: [["A","C"]],                                  // lines extended across the whole view (tangents, axes of symmetry)
  arrows: [["A","B"]],                                 // vectors / forces (arrowhead at the second point)
  circles: [{ c: "O", r: 3.2 }, { c: [2,2], r: 1 }],
  arcs: [{ c: "O", r: 3, from: 20, to: 110 }],         // part of a circle, angles in degrees anticlockwise from +x
  labels: { A: "sw", B: "se", C: "n", O: "e" },        // where to put each point's name (n ne e se s sw w nw); default auto
  text: [ { at: [5, -0.6], s: "10 cm" }, { at: [8.3, 3.2], s: "h" } ],   // free text (lengths, names, values)
  angles: [ { at: "B", from: "A", to: "C", label: "θ" }, { at: "A", from: "B", to: "C", label: "40°", r: 1.2 } ],  // angle arcs
  right: [ { at: "B", from: "A", to: "C" } ],         // right-angle marks
  ticks: [ ["A","B"], ["B","C"] ],                     // equal-length tick marks on segments (one tick each)
  shade: [ ["A","B","C"] ],                            // lightly shaded polygon(s)
  hide: ["O"]                                          // points that exist for construction but are not drawn/labelled
}
```
Optional geometry extras (backwards compatible; added for the Euclidean-geometry figures):
- `ticks: [["A","B",2]]` – an optional 3rd element gives the number of tick marks (1–3), e.g. single ticks for AD = DB and double ticks for AE = EC.
- `parallel: [["D","E"], ["B","C"], ["E","F",2], ["A","B",2]]` – arrowhead (chevron) marks for parallel lines, drawn at the midpoint of the pair and pointing from the first point to the second; the optional 3rd element (1–3) is the number of chevrons, so each family of parallel lines gets its own count. To move a mark off a crossing, mark a sub-segment using a hidden point.
- `angles[].lr` – distance of the angle label from the vertex (default `r + 0.45`); use a larger value for narrow angles.
- `labels: { A: "none" }` – draw the point's dot without its name (place a `text` instead when the name would collide with lines or axes).
Conventions: keep figures simple and uncluttered (what the NSC diagram would show); for 3D problems draw the standard oblique view (vertical line for the pole, horizontal plane as a slanted quadrilateral); for free-body diagrams draw the object as a small shaded rectangle with arrows and labels (N, w, f, T, F); for v–t / position–time graphs use `kind: "plot"` with straight-line pieces written as separate `fns` over limited domains using `dom: [t1, t2]` on each fn, e.g. `{ f: "9.8*x", dom: [0, 2] }`.
Use `dom` on any plot fn to restrict its x-domain. Use decimal POINTS inside expressions and coordinates (they are numbers), but decimal COMMAS inside labels/text (they are shown to learners).

## Tips learned from test renders
- Every named point gets a dot and its label. For arrow TIPS (forces, vectors) put the tip point names in `hide` and label with `text` instead, so no dot sits on the arrowhead.
- Keep the `view` tight around the figure (small margins) so it fills the frame; for `axes: true` include the origin in the view.
- For a Venn diagram use `geo` with two/three overlapping `circles` and `text` for the region values; for a box-and-whisker use `geo` segments on a horizontal number line (add tick `text`); for a scatter plot use `plot` with `points` and an optional regression `fns` line; for Maxwell–Boltzmann or potential-energy diagrams use `plot` with suitable expressions (e.g. `"x*exp(-x/2)"`) and `text`-free labels via `fns[].label`.
- Validate: `node -e "global.window={};require('/home/claude/prep/figlib.js');require('/home/claude/prep/<yourfile>.js');const F=window.FIGS_X;let bad=0;for(const k in F){const s=window.renderFig(F[k]);if(!s.startsWith('<svg')){bad++;console.log(k,s)}}console.log(Object.keys(F).length,'figs, bad',bad)"`.
- To look at a figure: write an HTML file with the SVG string inside the style block used in /home/claude/prep/out/figtest.html (copy its <style>), screenshot with playwright (see /home/claude/prep/shot.js for the pattern) and open the PNG with the Read tool.
