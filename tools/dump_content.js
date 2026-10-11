// Writes the full study bundle (private) and the public outline as JSON.  node tools/dump_content.js <outDir>
const path = require('path'), fs = require('fs');
const R = path.resolve(__dirname, '..'); global.window = {};
['maths_a', 'maths_b', 'maths_c', 'maths_d', 'physics', 'chem', 'practice_maths_a', 'practice_maths_b', 'practice_maths_c', 'practice_maths_d', 'practice_physics', 'practice_chem', 'figs_maths_a', 'figs_maths_b', 'figs_maths_c', 'figs_maths_d', 'figs_physics', 'figs_chem'].forEach((f) => require(path.join(R, f + '.js')));
const W = global.window;
const topics = { maths: [].concat(W.CONTENT_MATHS_A, W.CONTENT_MATHS_B, W.CONTENT_MATHS_C, W.CONTENT_MATHS_D), phys: W.CONTENT_PHYSICS, chem: W.CONTENT_CHEM };
const practice = Object.assign({}, W.PRACTICE_MATHS_A, W.PRACTICE_MATHS_B, W.PRACTICE_MATHS_C, W.PRACTICE_MATHS_D, W.PRACTICE_PHYSICS, W.PRACTICE_CHEM);
const figs = Object.assign({}, W.FIGS_MATHS_A, W.FIGS_MATHS_B, W.FIGS_MATHS_C, W.FIGS_MATHS_D, W.FIGS_PHYSICS, W.FIGS_CHEM);
const outline = [];
Object.keys(topics).forEach((sj) => topics[sj].forEach((t) => {
  const pq = (practice[t.id] || []).map((q) => [q.id, Number(q.marks) || 0]);
  outline.push({ id: t.id, subj: sj, title: t.title, paper: t.paper, weight: t.weight, grade: t.grade || '', book: t.book ? { chapter: t.book.chapter, pages: t.book.pages } : null,
    sections: t.sections.map((s) => ({ id: s.id, title: s.title, est: s.est || 20 })), pc: pq.length, pm: pq.reduce((n, q) => n + q[1], 0), pq, qc: (t.quiz || []).length });
}));
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'bundle.json'), JSON.stringify({ v: 1, topics, practice, figs }));
fs.writeFileSync(path.join(out, 'outline.json'), JSON.stringify(outline));
console.log('topics', outline.length, 'questions', outline.reduce((n, t) => n + t.pc, 0), 'figs', Object.keys(figs).length);
