// Writes the full study bundle (private) and the public outline as JSON.  node tools/dump_content.js <outDir>
const path = require('path'), fs = require('fs');
const R = path.resolve(__dirname, '..'); global.window = {};
['maths_a', 'maths_b', 'maths_c', 'maths_d', 'physics', 'chem', 'practice_maths_a', 'practice_maths_b', 'practice_maths_c', 'practice_maths_d', 'practice_physics', 'practice_chem', 'figs_maths_a', 'figs_maths_b', 'figs_maths_c', 'figs_maths_d', 'figs_physics', 'figs_chem'].forEach((f) => require(path.join(R, f + '.js')));
// Grades 10–11 and Life Sciences: each chunk is <name>.js + practice_<name>.js + figs_<name>.js (CONTENT_/PRACTICE_/FIGS_<NAME>)
const EXTRA = { maths: ['maths10_a', 'maths10_b', 'maths11_a', 'maths11_b'], phys: ['phys10', 'phys11'], chem: ['chem10', 'chem11'], life: ['life10_a', 'life10_b', 'life11_a', 'life11_b', 'life12_a', 'life12_b'] };
const W = global.window;
const topics = { maths: [].concat(W.CONTENT_MATHS_A, W.CONTENT_MATHS_B, W.CONTENT_MATHS_C, W.CONTENT_MATHS_D), phys: W.CONTENT_PHYSICS, chem: W.CONTENT_CHEM, life: [] };
const practice = Object.assign({}, W.PRACTICE_MATHS_A, W.PRACTICE_MATHS_B, W.PRACTICE_MATHS_C, W.PRACTICE_MATHS_D, W.PRACTICE_PHYSICS, W.PRACTICE_CHEM);
const figs = Object.assign({}, W.FIGS_MATHS_A, W.FIGS_MATHS_B, W.FIGS_MATHS_C, W.FIGS_MATHS_D, W.FIGS_PHYSICS, W.FIGS_CHEM);
const only = process.env.ADV_ONLY ? process.env.ADV_ONLY.split(',') : null;   // e.g. ADV_ONLY=phys10,life12_a to bundle just some new chunks
Object.keys(EXTRA).forEach((sj) => EXTRA[sj].forEach((name) => {
  if (only && !only.includes(name)) return;
  const files = [name, 'practice_' + name, 'figs_' + name].map((f) => path.join(R, f + '.js'));
  if (!files.every((f) => fs.existsSync(f))) { console.log('skip', name, '(not written yet)'); return; }
  try { files.forEach((f) => require(f)); } catch (e) { console.log('skip', name, '(does not load: ' + e.message + ')'); return; }
  const N = name.toUpperCase(); const T = W['CONTENT_' + N];
  if (!Array.isArray(T)) { console.log('skip', name, '(no CONTENT_' + N + ')'); return; }
  topics[sj] = topics[sj].concat(T); Object.assign(practice, W['PRACTICE_' + N] || {}); Object.assign(figs, W['FIGS_' + N] || {});
}));
const ids = new Set(); Object.values(topics).flat().forEach((t) => { [t.id].concat(t.sections.map((s) => s.id)).forEach((id) => { if (ids.has(id)) throw new Error('duplicate id ' + id); ids.add(id); }); });
const outline = [];
Object.keys(topics).forEach((sj) => topics[sj].forEach((t) => {
  const pq = (practice[t.id] || []).map((q) => [q.id, Number(q.marks) || 0]);
  outline.push({ id: t.id, subj: sj, gr: Number(t.gr) || 12, title: t.title, paper: t.paper, weight: t.weight, grade: t.grade || '', book: t.book ? { chapter: t.book.chapter, pages: t.book.pages } : null,
    sections: t.sections.map((s) => ({ id: s.id, title: s.title, est: s.est || 20 })), pc: pq.length, pm: pq.reduce((n, q) => n + q[1], 0), pq, qc: (t.quiz || []).length });
}));
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'bundle.json'), JSON.stringify({ v: 1, topics, practice, figs }));
fs.writeFileSync(path.join(out, 'outline.json'), JSON.stringify(outline));
console.log('topics', outline.length, 'questions', outline.reduce((n, t) => n + t.pc, 0), 'figs', Object.keys(figs).length);
