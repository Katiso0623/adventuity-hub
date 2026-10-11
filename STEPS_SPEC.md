# Readable worked examples – restructuring spec

Goal: every worked example (`section.example.steps`) must be easy and attractive to follow on a phone and on a
screen share: one idea per step, one equation per line, no long chains crammed into one line.

## New step format
Each element of `example.steps` is either
- a short string (plain sentence with optional inline maths `\\( … \\)`) – only for a one-line remark, or
- an object `{ say: "…", calc: ["…", "…"], note: "…" }`
  - `say`  – what we are doing, in words (≤ 1 sentence; may contain inline `\\( \\)` maths). E.g. "Use the axis of symmetry", "Take east as positive", "Substitute into the formula".
  - `calc` – array of LaTeX lines WITHOUT `\\( \\)` delimiters, rendered as display maths, one per line.
             Use `&=` (or `&\\Rightarrow`) to align a chain:
             `["S_{30} &= \\dfrac{30}{2}\\left[2(-7) + 29(4)\\right]", "&= 15(102)", "&= 1\\,530"]`.
             Formula first, then substitution, then the result (physics: formula → substitution → answer with unit).
             Units: `\\text{ m·s}^{-1}`, `\\text{ N}`, `\\text{ J}`; directions in words in `note` or after the unit: `\\text{ N east}`.
             Decimal comma: write `9{,}8` or `9,8` (the renderer converts `9,8` to `9{,}8`).
  - `note` – optional small print (a reason, a check, "reject n = −25 because n ∈ ℕ").
- Typical step = 1 `say` + 1–4 `calc` lines. Split long steps. A long example may have 6–12 steps.
- Keep EVERY number, the method and the final answer exactly as they are now (this is a layout job, not a rewrite of the
  maths). You may fix a genuine error if you find one – recompute it and mention it in your report.
- Multi-part examples: start the `say` with the part label, e.g. "(b) Find the general term".
- Statements + reasons (Euclidean geometry): put each statement in `calc` as `\\hat{A}_1 = \\hat{C} &\\quad \\text{(tan-chord thm)}`
  or use `say` for the reason and `calc` for the statement – whichever reads more clearly.
- Escaping: inside the JS file every backslash is doubled (`"\\dfrac{a}{b}"`). Never include `</script`.

## Study-time estimate
Add `est` (integer minutes) to every section: realistic time for an average Grade 12 learner to study the section notes,
redo the worked example on paper and learn the definitions (typically 15–45 min; harder sections more).

## How to edit
Edit the file in place with a small node script: `global.window={}; require(file); const data = window.X;` → transform →
write back as `window.X = ` + JSON.stringify(data, null, 1) + `;\n`. Keep a backup copy in the scratchpad first.
Do not change ids, titles, know/definitions/method/pitfalls/examTips or quizzes.

## Check your work visually
node /home/claude/prep/tools/preview.js --file <file.js> --global <GLOBAL> --figs <figs file> --figsglobal <FIGS_GLOBAL> --ids <comma section ids or topic id> --out <scratchpad subfolder>
→ writes one PNG per section and prints LaTeX errors (`ERROR … LaTeX`). Open a few PNGs with the Read tool. Fix every LaTeX error.
Use a UNIQUE scratchpad subfolder for your own temp files (other agents share the scratchpad):
/tmp/claude-0/-home-claude-adventuity-hub/5e26bb2f-2370-5bf4-8e73-f65a897a0f53/scratchpad/<your-name>/
