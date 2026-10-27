# Grades 10–11 and Life Sciences – content brief (addendum to CONTENT_SPEC.md and STEPS_SPEC.md)

The Adventuity portal already has complete Grade 12 Mathematics and Physical Sciences notes (files `maths_a…d.js`,
`physics.js`, `chem.js`, their `practice_*.js` banks and `figs_*.js` diagrams). We now add the **same kind of material** for

- Mathematics Grade 10 and Grade 11
- Physical Sciences Grade 10 and Grade 11 (Physics = Paper 1, Chemistry = Paper 2)
- Life Sciences Grade 10, Grade 11 and Grade 12 (new subject)

Read `/home/claude/prep/CONTENT_SPEC.md`, `/home/claude/prep/STEPS_SPEC.md` and `/home/claude/prep/FIG_SPEC.md` first and
follow them exactly (schema, quality rules, LaTeX escaping, SA conventions, step format with `say`/`calc`/`note`, `est`
minutes per section, practice-question format with ✓ marks). Then look at one existing Grade 12 topic for the level of
detail expected, e.g. `node -e "global.window={};require('/home/claude/prep/physics.js');console.log(JSON.stringify(window.CONTENT_PHYSICS[0],null,1))" | head -200`
and a practice question in `practice_physics.js`. Match that depth and polish.

## What changes for Grades 10–11 and Life Sciences
- **Audience**: South African learners in that grade (CAPS curriculum) and their tutors (screen-shared in Google Meet,
  also read on phones). Pitch the language and difficulty at that grade. Content must follow the **CAPS** document for the
  subject and grade, and – for Grade 12 Life Sciences – the DBE Life Sciences Examination Guidelines.
- **Exams**: Grades 10 and 11 write school / provincial June and November exams (Grade 11 November papers are often
  provincial common papers). There is no national paper history, so in `examTips` and in practice `seen` say how the
  topic is *typically* examined ("Typically a 15–20 mark question in Gr 11 November Paper 2") – never invent a specific
  paper reference. Grade 12 Life Sciences: NSC papers (November, May/June) – give your best knowledge, say "typically" if unsure.
- **New topic fields**: `gr` – the grade as a number (10, 11 or 12); `grade` – "Gr 10" / "Gr 11" / "Gr 12";
  `paper` – "P1" or "P2" (see your assignment). **No `book` field** (the tutor's textbook covers Grade 12 Maths only).
- **ids must be globally unique**: prefix every topic id with your prefix (e.g. `m10-exponents`), every section id with
  the same prefix (`m10-exp-laws`), and practice ids are `<topicId>-p01` … as in CONTENT_SPEC.
- **`ref`**: a real, working free resource for the topic. Siyavula has free online textbooks for Maths and Physical
  Sciences Grades 10–12 (`https://www.siyavula.com/read/za/mathematics/grade-10/...`,
  `https://www.siyavula.com/read/za/physical-sciences/grade-11/...`). Open the chapter list with WebFetch and use the real
  chapter URL. For Life Sciences use a real free source you have checked (e.g. a Siyavula / DBE / Mindset / provincial
  page). If you cannot verify a URL, leave `ref` out – never guess a URL.
- **Sizes**: every topic: overview, 3–5 sections (each with know, definitions, method, a fully worked example in the
  step format, pitfalls, examTips, est), a quiz of 5–8 MCQs, and a practice bank (Maths 8–12 questions per topic,
  Physical Sciences 6–10, Life Sciences 6–10) covering every recurring question type for that grade.

## Life Sciences specifics
- Definitions in the wording markers expect (CAPS / exam-guideline terms). Use correct SA terminology (e.g. "nucleotide",
  "spindle fibres", "Bowman's capsule", "renal tubule", "auxins").
- `method` = how to answer the question type (e.g. "Tabulate differences: table with headings, 1 mark per correct pair, 1 for the table").
- Cover the LS question styles: multiple choice, terminology (give the term), Column I/Column II matching, labelling and
  identifying structures on diagrams, structure–function, data/table/graph interpretation, drawing a graph from data
  (state the graph rubric: title, axes labels with units, scale, plotting, correct type of graph), investigations
  (aim, hypothesis, independent/dependent/controlled variables, control, reliability vs validity, conclusion), calculations
  (percentage, ratio, rate, magnification), genetic crosses (P1/F1 layout with gametes, meiosis, fertilisation; Punnett
  square), pedigree diagrams, and the essay question (Gr 12: 15 marks content + 2–3 marks synthesis – say how it is marked).
- The worked `example` for LS is an exam-style question answered step by step: use `say` for each answer point and
  `note` for why it earns the mark; `calc` only when there is a calculation (LaTeX lines as in STEPS_SPEC).
- Practice memos: one line per sub-question with ✓ per mark, alternatives with "/", "(any 2)" where the memo allows choice,
  and "Mark first ONE only" rules where they apply.

## Figures (diagrams, graphs, tables)
Diagrams matter a lot (especially in Life Sciences and Physics). Put figures in your figs file
`window.FIGS_<NAME> = { "sec:<sectionId>": fig-or-array, "<questionId>": fig-or-array }`.
A section fig is shown on the topic page under the notes; a question fig is shown with the practice question.
Figures may also go inside a step: `{ say, calc, fig }`. Kinds (see FIG_SPEC.md plus two new kinds):

1. `plot` and `geo` – as in FIG_SPEC.md (graphs, geometry, free-body diagrams, circuits as simple line drawings).
2. **`table`** – data tables: `{ kind: "table", title: "Table 1: …", head: ["Temperature (°C)", "Rate (bubbles/min)"], rows: [["10", "4"], ["20", "9"]], rowHead: false, caption: "optional text under it" }`.
   Use it for experimental data, comparisons, Punnett squares (rowHead: true, first cell of head blank), Column I/II.
3. **`svg`** – labelled schematic drawings built from a whitelisted element tree (no raw SVG strings):
   ```js
   { kind: "svg", view: [0, 0, 420, 260], caption: "Figure 1: An animal cell", alt: "Animal cell with labelled organelles",
     els: [
       ["ellipse", { cx: 210, cy: 130, rx: 180, ry: 105, class: "fa" }],            // cell membrane, filled soft blue
       ["circle",  { cx: 200, cy: 125, r: 38, class: "fd" }],                         // nucleus
       ["path",    { d: "M110 90 q 20 -14 40 0 t 40 0", class: "line" }],              // any path
       ["line",    { x1: 238, y1: 125, x2: 330, y2: 60, class: "line thin" }],         // label leader line
       ["text",    { x: 334, y: 58 }, "Nucleus"],                                      // label (class lbl by default)
       ["line",    { x1: 30, y1: 240, x2: 120, y2: 240, class: "arrow", arrow: "end" }], // arrow (arrow: "end" | "both")
       ["g", { transform: "translate(20 0)" }, [ ["rect", { x: 0, y: 0, width: 40, height: 20, class: "fb" }] ]]
     ] }
   ```
   Elements: g, path, circle, ellipse, rect, line, polyline, polygon, text. Attributes: geometry attributes, transform,
   class, stroke-dasharray, stroke-width, font-size, text-anchor, font-weight, font-style, opacity, fill-opacity, arrow.
   Classes (theme-aware, work in dark mode): `line` (ink outline, default), `thin`, `thick`, `dashed`, `fa` `fb` `fc`
   `fd` `fe` `ff` (six soft fills with matching outline: blue, orange, green, purple, red, yellow), `soft` (grey fill),
   `ink` / `dot` (solid ink), `none`, `arrow` (orange arrow line), `lbl` (13 px label, default for text), `lbl-s` (small
   grey), `lbl-i` (italic), `c0`–`c3` (coloured text). Do not set fill/stroke colours directly.
   Draw clear textbook-style schematics: smooth outlines with `path` curves, every structure the question needs labelled
   with a leader line, letters A, B, C … when the question asks learners to identify parts. Keep text ≥ 11 px at the
   view size, nothing overlapping, labels inside the view. A typical diagram is 30–90 elements.
   Life Sciences needs many: cell and organelles, mitosis/meiosis phases, leaf and root sections, xylem/phloem, skeleton
   and joint, heart and circulation, food web, nephron, alveolus, digestive system, flower, sperm/ovum, eye, ear, neuron,
   reflex arc, DNA/RNA, protein synthesis, pedigree charts (use `geo` squares/circles or `svg`), etc.
4. Graphs from data (enzyme activity, population growth, hormone levels, v–t graphs) use `plot` (straight pieces with
   `dom`, or `points` joined by fns) and label axes with the caption or `text`.

Check every figure visually (tools/preview.js renders sections and questions with their figures to PNG – pass
`--figs <your figs file> --figsglobal FIGS_<NAME>`), fix overlaps and anything that looks wrong.

## Your files and globals
Create in `/home/claude/prep/` (never edit any other content file):
- content: `<name>.js` → `window.CONTENT_<NAME> = [ …topics ];`
- practice: `practice_<name>.js` → `window.PRACTICE_<NAME> = { "<topicId>": [ …questions ] };`
- figures: `figs_<name>.js` → `window.FIGS_<NAME> = { … };`
(`<name>` and `<NAME>` are given in your assignment, e.g. `maths10_a` / `MATHS10_A`.)

Write large files in parts (one topic at a time) with a small node script that appends to a JSON array kept in your
scratchpad folder, then writes the final file – do not try to emit a whole 150 kB file in one tool call.

## Checks before you finish (all required)
1. `node -e "global.window={};require('/home/claude/prep/figlib.js');require('/home/claude/prep/<name>.js');require('/home/claude/prep/practice_<name>.js');require('/home/claude/prep/figs_<name>.js');const W=window,T=W.CONTENT_<NAME>,P=W.PRACTICE_<NAME>,F=W.FIGS_<NAME>;const ids=new Set();let bad=0;T.forEach(t=>{if(!t.gr||!t.paper||!t.sections||t.sections.length<3)console.log('topic incomplete',t.id);t.sections.forEach(s=>{if(ids.has(s.id))console.log('dup',s.id);ids.add(s.id);if(!s.est||!s.example)console.log('section incomplete',s.id)});if(!(P[t.id]||[]).length)console.log('no practice',t.id)});for(const k in F){for(const f of [].concat(F[k])){const s=W.renderFig(f);if(!/^<(svg|div)/.test(s)){bad++;console.log('bad fig',k,s)}}}console.log(T.length,'topics',Object.values(P).reduce((n,a)=>n+a.length,0),'questions',Object.keys(F).length,'figs, bad',bad)"`
2. Recompute every numeric answer with node (write a small script) – arithmetic errors are the worst defect.
3. Run tools/preview.js on every section and every practice question (in batches), look at a good sample of the PNGs
   (all the diagrams), fix every LaTeX error the tool prints and every ugly/overlapping figure.
4. No `</script`, no markdown, decimal commas in text, doubled backslashes inside the JS strings.

Report at the end: topics (id – title – paper), number of sections / practice questions / figures, anything you were
unsure about (curriculum placement, a weighting you could not confirm).
