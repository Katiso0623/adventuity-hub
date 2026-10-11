# Content spec for the Matric Prep Room tool (CAPS Grade 12, South Africa, NSC Nov 2026)

Write content as a **JavaScript file** that assigns an array of topic objects to a global, e.g.
`window.CONTENT_PHYSICS = [ ... ];` (Physics) or `window.CONTENT_CHEM = [ ... ];` (Chemistry).
Use plain JS object literals (double-quoted strings). Validate with `node -e "require('./file.js')"` after
adding `window = {}` at top for the test, i.e. `node -e "global.window={};require('/abs/path.js');console.log(window.CONTENT_PHYSICS.length)"`.

## Audience and purpose
A tutor (engineer, not a teacher) uses this on screen (Google Meet screen share) to go through each
topic with Grade 12 learners 2–3 weeks before the NSC final exams. Learners also read it on phones.
Everything must be exam-focused: what the DBE Physical Sciences Examination Guidelines (2021, still the
basis for 2026) say is examinable, the exact definitions the marking guidelines expect (word-perfect
CAPS definitions earn marks), the formulae exactly as they appear on the official DBE data sheet,
the typical ways questions are asked, and the classic mistakes that lose marks.

## Quality rules (hard)
- Every fact, formula, definition and numeric answer must be correct. Work every example fully and check
  the arithmetic. Use g = 9,8 m·s⁻² and the data-sheet constants. Use SA notation: decimal COMMA
  (9,8 not 9.8), units with a dot or middle dot (m·s⁻¹), “Determine/Calculate” wording.
- Definitions: give the CAPS/exam-guideline wording (the one markers look for), e.g.
  "Impulse is the product of the net force acting on an object and the time the net force acts on the object."
- Formulas in LaTeX inside \( ... \) (inline) — the page renders with MathJax. Inside JS strings every
  backslash must be doubled: write "\\(F_{net} = ma\\)". Use \\text{} for units in LaTeX or write units
  as plain text outside the math. Do not use $...$ delimiters.
- Keep each string short enough to read on a phone. Bullets: one idea each.
- Original content only: do not copy sentences from any textbook or past paper. Write your own examples
  with your own numbers (realistic exam-style). You may describe past-paper question *styles*.
- No markdown inside strings except simple **bold** is NOT supported — use plain text. Line breaks are not
  needed; each bullet is one string.
- Unicode for sub/superscripts in plain text is fine (m·s⁻¹, 10⁻¹⁹, H₂O).

## Schema (one topic object)
```js
{
  id: "momentum",                 // short slug, unique
  title: "Momentum and Impulse",
  paper: "P1",                    // "P1" (Physics) or "P2" (Chemistry)
  weight: "Mechanics ≈ 65/150 (shared with Newton's laws, projectiles, work-energy)",
  grade: "Gr 12",                 // or "Gr 11 (examinable in Gr 12)"
  ref: { label: "Siyavula Gr 12 Ch 2", url: "https://www.siyavula.com/read/za/physical-sciences/grade-12/momentum-and-impulse" },
  overview: "2–3 sentences: what the topic is, how much it is worth, how it is usually examined (which question number range, typical marks).",
  sections: [
    {
      id: "mom-basics",
      title: "Momentum and Newton's second law",
      know: [                      // 4–10 bullets: the must-know facts/formulas
        "Momentum \\(p = mv\\): vector, unit kg·m·s⁻¹, same direction as velocity.",
        "..."
      ],
      definitions: [               // exam-wording definitions the markers expect (0–6)
        { term: "Momentum", def: "The product of an object's mass and its velocity." }
      ],
      method: [                    // step list for solving the standard problem type (3–7 steps)
        "Choose a positive direction and write it down.",
        "..."
      ],
      example: {                   // ONE fully worked original example in exam style
        q: "A 0,45 kg ball moving east at 12 m·s⁻¹ strikes a wall and rebounds at 8 m·s⁻¹. Contact lasts 0,05 s. Calculate the net force the wall exerts on the ball.",
        steps: [
          "Take east as positive. \\(\\Delta p = m(v_f - v_i) = 0,45(-8 - 12) = -9\\) kg·m·s⁻¹",
          "\\(F_{net} = \\dfrac{\\Delta p}{\\Delta t} = \\dfrac{-9}{0,05} = -180\\) N"
        ],
        answer: "180 N west (negative sign = west)."
      },
      pitfalls: [ "Forgetting the sign change on rebound: Δv is −20, not −4 m·s⁻¹.", "..." ],
      examTips: [ "Impulse-momentum questions are usually 8–12 marks; sign convention line earns a mark.", "..." ]
    }
  ],
  quiz: [                          // 5–8 multiple choice self-checks per topic, with correct index (0-based) and explanation
    { q: "...", options: ["...", "...", "...", "..."], answer: 1, why: "..." }
  ]
}
```

Every topic needs `overview`, 3–5 sections (each with know, definitions (may be empty []), method, example, pitfalls, examTips) and a quiz of 5–8 questions. Spread cognitive levels: recall, understanding, application, with at least one calculation-type MCQ (numbers small enough to do mentally or with a quick calculator step).

## Mathematics additions (for maths content files)
- Topic object gets `book: { chapter: "Chapter 1", pages: "1–37" }` and each section gets a `book` string with the
  textbook references, e.g. `book: "p. 3–9 · Examples 3–10 · Exercise 2 (p. 5) · Exercise 3 (p. 9)"`. Take these from
  /home/claude/prep/MATHS_BOOK_MAP.md (Mind Action Series Mathematics Gr 12 — the tutor's textbook).
- Gr 11 revision sections (not in the book) get `book: "Not in the Gr 12 textbook – Gr 11 work (examinable)"`.
- `paper` is "P1" or "P2"; `weight` is the exam-guideline weighting string, e.g. "Number patterns ≈ 25/150 in Paper 1".
- Use \\( \\) LaTeX for all maths. SA conventions: decimal comma, semicolon between terms of a sequence (3; 7; 11; …),
  "Determine/Calculate/Show that/Hence". Round to two decimals unless exact.
- Each section's `example` should mirror the way the NSC paper asks the question (sub-questions a, b, c are fine as
  separate steps) and the steps should show the working line by line the way a marker wants to see it.
- `examTips` should say how many marks this usually carries and the typical question number in recent NSC papers
  (Paper 1: Q1 algebra, Q2–3 patterns, Q4–5 functions, Q6 finance, Q7–9 calculus, Q10–11 probability;
  Paper 2: Q1–2 statistics, Q3–4 analytical geometry, Q5–7 trigonometry, Q8–10 Euclidean geometry — say "typically").
- Keep the number of sections per topic to what the brief asks (condensed), but mention all the book's sub-sections
  in the `book` strings so nothing in the chapter is skipped.

## Practice question banks (exam-style questions per topic)
A separate JS file per content chunk assigns `window.PRACTICE_<NAME> = { "<topicId>": [ ...questions ] }`.
Each question object:
```js
{
  id: "seq-p01",                    // topicId prefix + "-p" + 2-digit number
  type: "Quadratic pattern: general term and position of a term",   // the question TYPE this covers (one per recurring NSC question type)
  marks: 8,                         // total marks, realistic for the NSC
  level: 2,                         // cognitive level 1–4 (knowledge, routine, complex, problem solving)
  seen: "Asked in this form in Nov 2024 Q2, Nov 2022 Q2, May/June 2023 Q2",   // when this TYPE appeared (your best knowledge; say 'typically' if unsure)
  q: "Full question text in NSC wording, with numbered sub-questions and marks in brackets, e.g. '2.1 Determine the general term. (4)  2.2 Which term equals 497? (3)'",
  memo: [                            // marking-guideline style: one line per step with the tick marks
    "2.1  Second difference 2a = 4 ⇒ a = 2 ✓ ; 3a + b = 7 ⇒ b = 1 ✓ ; a + b + c = 5 ⇒ c = 2 ✓ ; \\(T_n = 2n^2 + n + 2\\) ✓",
    "2.2  \\(2n^2 + n + 2 = 497\\) ✓ ⇒ (2n + 45)(n − 11) = 0 ✓ ⇒ n = 11 ✓ (reject n = −22,5)"
  ],
  answer: "2.1 \\(T_n = 2n^2 + n + 2\\)  2.2 the 11th term"
}
```
Rules: original numbers and wording (never copy a real paper); every number verified by computation; SA conventions (decimal comma; semicolons in sequences; coordinates (x ; y)); LaTeX in \\( \\) with doubled backslashes inside JS strings; no `</script`; ticks shown as ✓ with the mark allocation matching the marks in the question. Cover EVERY recurring question type for the topic (aim 10–14 questions per Maths topic, 8–12 per Science topic), ordered from routine to problem-solving, and include the "prove/show that/explain" types and graph-interpretation types where the NSC uses them. For geometry/graph questions describe the figure precisely in words (coordinates, which points are on which line/circle, what is tangent to what).
