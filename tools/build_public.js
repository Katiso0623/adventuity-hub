#!/usr/bin/env node
/* Builds the public marketing / SEO pages for Adventuity into ../public/ (re-runnable).
     node tools/build_public.js [--out DIR] [--no-og]
   Writes index.html, maths.html, physical-sciences.html, life-sciences.html (the Grade 12 / NSC subject pages),
   grade-10.html, grade-11.html, matric-exam-timetable-2026.html, topics/<id>.html (one per topic, all grades),
   404.html, sitemap.xml, robots.txt and og.png.  --bundle <bundle.json> reads topics/practice from a decrypted bundle.
   Grades 10–11 and Life Sciences arrive in chunks; a chunk that is not written yet is skipped and its block says "coming soon".
   The study material is protected: only topic titles, section titles, paper, weighting string, counts,
   marks and estimated study time are taken from the content files (see pub()). Nothing else may be read
   into the pages – no overview, know, definitions, methods, examples, questions, memos or quiz text. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(argVal('--out') || path.join(ROOT, 'public'));
const SKIP_OG = args.includes('--no-og');

// the site address comes from cfg.json (siteUrl) so moving to an own domain is a one-line change
const BASE = (() => { try { const u = JSON.parse(fs.readFileSync(path.join(ROOT, 'cfg.json'), 'utf8')).siteUrl; if (u) return u.replace(/\/?$/, '/'); } catch (e) { /* default */ } return 'https://katiso0623.github.io/adventuity-hub/'; })();
const CFG = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'cfg.json'), 'utf8')); } catch (e) { return {}; } })();
const TODAY = '2026-10-27'; // sitemap lastmod / dateModified
const BRAND = 'Adventuity';
const LEGAL = 'Adventuity (Pty) Ltd';
const SLOGAN = 'Transforming ideas into reality.';
const FONTS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap';
const FEES = { maths: 250, phys: 250, chem: 250, life: 250, group: 100 }; // defaults; live values replace them in the browser
const FEE_KEYS = ['maths', 'phys', 'chem', 'life'];
const DURATIONS = [60, 90, 120];
const MIN_PER_MARK = 1.2; // 150 marks in 180 minutes
const QUIZ_MIN = 10;
const PORTAL = 'portal.html';
const SIGNUP = 'portal.html#signup';
const TT_FILE = 'matric-exam-timetable-2026.html';

/* ---------- content (public fields only) ---------- */
function load(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window;
}
// Grades 10–11 and Life Sciences come in chunks: <name>.js + practice_<name>.js + figs_<name>.js (CONTENT_/PRACTICE_<NAME>).
// The same list and the same rule as tools/dump_content.js: a chunk whose three files are not all there yet, or that does not load, is skipped.
const EXTRA = { maths: ['maths10_a', 'maths10_b', 'maths11_a', 'maths11_b'], phys: ['phys10', 'phys11'], chem: ['chem10', 'chem11'], life: ['life10_a', 'life10_b', 'life11_a', 'life11_b', 'life12_a', 'life12_b'] };
const SRC = { maths: [], phys: [], chem: [], life: [] };   // raw topic objects per subject – read only through pub()
let BANK = {};
const BUNDLE = argVal('--bundle');   // decrypted study bundle (when the plain source files are not on disk)
if (BUNDLE) {
  const b = JSON.parse(fs.readFileSync(path.resolve(BUNDLE), 'utf8'));
  const T = b.topics || {};
  for (const k of Object.keys(SRC)) SRC[k] = Array.isArray(T[k]) ? T[k] : [];   // an older bundle has no topics.life
  BANK = b.practice || {};
} else {
  const W = {};
  ['maths_a', 'maths_b', 'maths_c', 'maths_d', 'physics', 'chem',
    'practice_maths_a', 'practice_maths_b', 'practice_maths_c', 'practice_maths_d', 'practice_physics', 'practice_chem']
    .forEach((f) => Object.assign(W, load(f + '.js')));
  SRC.maths = [].concat(W.CONTENT_MATHS_A, W.CONTENT_MATHS_B, W.CONTENT_MATHS_C, W.CONTENT_MATHS_D);
  SRC.phys = W.CONTENT_PHYSICS; SRC.chem = W.CONTENT_CHEM;
  BANK = Object.assign({}, W.PRACTICE_MATHS_A, W.PRACTICE_MATHS_B, W.PRACTICE_MATHS_C, W.PRACTICE_MATHS_D, W.PRACTICE_PHYSICS, W.PRACTICE_CHEM);
  const only = process.env.ADV_ONLY ? process.env.ADV_ONLY.split(',') : null;
  for (const [sj, names] of Object.entries(EXTRA)) for (const name of names) {
    if (only && !only.includes(name)) continue;
    const files = [name, 'practice_' + name, 'figs_' + name].map((f) => f + '.js');
    if (!files.every((f) => fs.existsSync(path.join(ROOT, f)))) continue;   // not written yet
    const N = name.toUpperCase();
    try {
      const c = load(files[0])['CONTENT_' + N], p = load(files[1])['PRACTICE_' + N];
      if (!Array.isArray(c)) { console.warn('note: chunk', name, 'skipped (no CONTENT_' + N + ')'); continue; }
      SRC[sj] = SRC[sj].concat(c); Object.assign(BANK, p || {});
    } catch (e) { console.warn('note: chunk', name, 'skipped (does not load: ' + e.message + ')'); }
  }
}
const round5 = (x) => Math.round(x / 5) * 5;
const grOf = (t) => Number(t && t.gr) || 12;   // same rule as the portal: no grade = Grade 12

function pub(t, subj) { // the ONLY place content is read – whitelist of public fields
  const qs = BANK[t.id] || [];
  const sections = (t.sections || []).map((s) => ({ title: String(s.title), est: Number(s.est) || 0 }));
  const notes = sections.reduce((a, s) => a + s.est, 0);
  const marks = qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);
  const exam = round5(marks * MIN_PER_MARK);
  return { id: String(t.id), subj, gr: grOf(t), title: String(t.title), paper: String(t.paper), weight: String(t.weight || ''), sections, nQ: qs.length, marks, notes, exam, quiz: QUIZ_MIN, total: notes + exam + QUIZ_MIN };
}
// a topic gets a page only if it is complete enough: an id that is safe as a file name (and not used yet), a paper,
// sections, a title and Grade 10–12. Physical Sciences: Physics is Paper 1 and Chemistry Paper 2 (as in the portal).
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/i;
const TOPICS = [];   // every public topic, all grades (pub() fields only)
const seenIds = new Set();
for (const sj of Object.keys(SRC)) for (const t of SRC[sj]) {
  const id = String((t && t.id) || '');
  const why = !t || typeof t !== 'object' ? 'not a topic object' : !ID_RE.test(id) ? 'id cannot be a file name' : seenIds.has(id) ? 'duplicate id'
    : !t.title ? 'no title' : !/^P[12]$/.test(String(t.paper)) ? 'paper is not P1/P2' : (sj === 'phys' && t.paper !== 'P1') || (sj === 'chem' && t.paper !== 'P2') ? 'Physics must be P1, Chemistry P2'
      : !Array.isArray(t.sections) || !t.sections.length ? 'no sections' : ![10, 11, 12].includes(grOf(t)) ? 'grade is not 10, 11 or 12' : '';
  if (why) { console.warn('note: topic skipped (' + why + '):', sj, id || '?'); continue; }
  seenIds.add(id); TOPICS.push(pub(t, sj));
}
const of = (subj, gr, paper) => TOPICS.filter((t) => t.subj === subj && t.gr === gr && (!paper || t.paper === paper));
const MATHS = of('maths', 12);
const PHYS = of('phys', 12);
const CHEM = of('chem', 12);
const LIFE = of('life', 12);
const ORDER = { P1: ['cubic', 'sequences', 'functions', 'finance', 'calculus', 'counting'], P2: ['stats', 'analytical', 'trig', 'trig3d', 'euclid'] };
function mathsPaper(p) {
  const list = ORDER[p].map((id) => { const t = MATHS.find((x) => x.id === id); if (!t) throw new Error('Missing maths topic ' + id); return t; });
  MATHS.filter((t) => t.paper === p && !ORDER[p].includes(t.id)).forEach((t) => { console.warn('note: maths topic not in order list, appended:', t.id); list.push(t); });
  return list;
}

/* ---------- exams ---------- */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function day(iso) { const [y, m, d] = iso.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return { wd: WD[w], wdl: WDL[w], d, mon: MON[m - 1], monl: MONL[m - 1], y }; }
const EXAMS = {
  mp1: { short: 'Maths P1', name: 'Mathematics Paper 1', date: '2026-10-23', subj: 'maths' },
  mp2: { short: 'Maths P2', name: 'Mathematics Paper 2', date: '2026-10-26', subj: 'maths' },
  pp1: { short: 'Physics P1', name: 'Physical Sciences Paper 1 (Physics)', date: '2026-10-30', subj: 'phys' },
  pp2: { short: 'Chemistry P2', name: 'Physical Sciences Paper 2 (Chemistry)', date: '2026-11-02', subj: 'chem' },
  lp1: { short: 'Life Sciences P1', name: 'Life Sciences Paper 1', date: '2026-11-13', subj: 'life', hours: 2.5 },
  lp2: { short: 'Life Sciences P2', name: 'Life Sciences Paper 2', date: '2026-11-16', subj: 'life', hours: 2.5 },
};
for (const e of Object.values(EXAMS)) {
  const x = day(e.date); e.at = e.date + 'T09:00:00+02:00'; e.dm = x.d + ' ' + x.mon; e.full = x.wd + ' ' + x.d + ' ' + x.mon + ' ' + x.y; e.wd = x.wd; e.wdl = x.wdl; e.long = x.wdl + ' ' + x.d + ' ' + x.monl + ' ' + x.y;
  e.hours = e.hours || 3; e.len = (e.hours % 1 ? Math.floor(e.hours) + '½' : e.hours) + ' hours'; e.marks = 150;
}
for (const c of CFG.exams || []) { const e = EXAMS[c.id]; if (e && String(c.when || '').slice(0, 10) !== e.date) console.warn('note: exam', c.id, 'is', e.date, 'here but', c.when, 'in cfg.json'); }

// subjects and their papers – the same for every grade; Grade 12 papers also have an NSC exam
const SUBJ_META = {
  maths: { key: 'maths', name: 'Mathematics', short: 'Maths', cls: 'maths', fees: ['maths'], file: 'maths.html',
    papers: [{ key: 'p1', label: 'Paper 1', sub: '', short: 'Maths P1', subj: 'maths', paper: 'P1', cls: 'maths', exam: 'mp1', theme: 'algebra, functions, finance, calculus and probability' },
      { key: 'p2', label: 'Paper 2', sub: '', short: 'Maths P2', subj: 'maths', paper: 'P2', cls: 'maths', exam: 'mp2', theme: 'statistics, analytical geometry, trigonometry and Euclidean geometry' }] },
  sci: { key: 'sci', name: 'Physical Sciences', short: 'Physical Sciences', cls: 'phys', fees: ['phys', 'chem'], file: 'physical-sciences.html',
    papers: [{ key: 'p1', label: 'Paper 1', sub: 'Physics', short: 'Physics P1', subj: 'phys', paper: 'P1', cls: 'phys', exam: 'pp1', theme: 'Physics' },
      { key: 'p2', label: 'Paper 2', sub: 'Chemistry', short: 'Chemistry P2', subj: 'chem', paper: 'P2', cls: 'chem', exam: 'pp2', theme: 'Chemistry' }] },
  life: { key: 'life', name: 'Life Sciences', short: 'Life Sciences', cls: 'life', fees: ['life'], file: 'life-sciences.html',
    papers: [{ key: 'p1', label: 'Paper 1', sub: '', short: 'Life Sciences P1', subj: 'life', paper: 'P1', cls: 'life', exam: 'lp1', theme: '' },
      { key: 'p2', label: 'Paper 2', sub: '', short: 'Life Sciences P2', subj: 'life', paper: 'P2', cls: 'life', exam: 'lp2', theme: '' }] },
};
const SUBJ_ORDER = ['maths', 'sci', 'life'];
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
function addTotals(s) {
  for (const p of s.papers) { p.total = sum(p.topics, (t) => t.total); p.nSec = sum(p.topics, (t) => t.sections.length); p.nQ = sum(p.topics, (t) => t.nQ); p.marks = sum(p.topics, (t) => t.marks); }
  s.total = sum(s.papers, (p) => p.total); s.nTopics = sum(s.papers, (p) => p.topics.length); s.nSec = sum(s.papers, (p) => p.nSec); s.nQ = sum(s.papers, (p) => p.nQ);
  return s;
}
function subjectFor(key, gr) {   // a subject with its papers and topics in one grade
  const m = SUBJ_META[key];
  const papers = m.papers.map((pm) => Object.assign({}, pm, gr === 12 ? { exam: EXAMS[pm.exam] } : { exam: null, theme: '' },
    { topics: key === 'maths' && gr === 12 ? mathsPaper(pm.paper) : of(pm.subj, gr, pm.paper) }));
  return addTotals(Object.assign({}, m, { gr, papers }));
}
// Grade 12: one page per subject (NSC). Grades 10–11: one page per grade with all three subjects.
const SUBJECTS = { maths: subjectFor('maths', 12), sci: subjectFor('sci', 12), life: subjectFor('life', 12) };
const GRADES = {};
for (const gr of [10, 11]) {
  const subjects = {}; SUBJ_ORDER.forEach((k) => { subjects[k] = subjectFor(k, gr); });
  const list = SUBJ_ORDER.map((k) => subjects[k]);
  GRADES[gr] = { gr, file: 'grade-' + gr + '.html', name: 'Grade ' + gr, subjects, list,
    nTopics: sum(list, (s) => s.nTopics), nSec: sum(list, (s) => s.nSec), nQ: sum(list, (s) => s.nQ), total: sum(list, (s) => s.total) };
}
const ALL = [...MATHS, ...PHYS, ...CHEM];   // the Grade 12 Maths / Physical Sciences topics (hand-written descriptions in INFO)
const N = { topics: TOPICS.length, sections: sum(TOPICS, (t) => t.sections.length), q: sum(TOPICS, (t) => t.nQ),
  qM: sum(TOPICS, (t) => (t.subj === 'maths' ? t.nQ : 0)), qS: sum(TOPICS, (t) => (t.subj === 'phys' || t.subj === 'chem' ? t.nQ : 0)), qL: sum(TOPICS, (t) => (t.subj === 'life' ? t.nQ : 0)) };
const GR_PRESENT = [10, 11, 12].filter((g) => TOPICS.some((t) => t.gr === g));
const GR_SPAN = GR_PRESENT.length > 1 ? 'Grades ' + GR_PRESENT[0] + '–' + GR_PRESENT[GR_PRESENT.length - 1] : 'Grade ' + (GR_PRESENT[0] || 12);
const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');   // 1 topic, 2 topics
const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

/* ---------- formatting ---------- */
const NB = ' ';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (m) => String(m).padStart(2, '0');
function dur(min) { const h = Math.floor(min / 60), m = min % 60; return h ? h + NB + 'h' + NB + pad(m) + NB + 'min' : m + NB + 'min'; } // 7 h 20 min
function durShort(min) { const h = Math.floor(min / 60), m = min % 60; return h ? h + NB + 'h' + NB + pad(m) : m + NB + 'min'; } // 4 h 05
const iso = (min) => 'PT' + Math.floor(min / 60) + 'H' + (min % 60 ? (min % 60) + 'M' : '');
function rand(n) { n = Math.round(Number(n) * 100) / 100; const [i, d] = n.toFixed(n % 1 ? 2 : 0).split('.'); return 'R' + i.replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (d ? ',' + d : ''); }
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const ld = (obj) => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';

/* ---------- icons (inline SVG, stroke = currentColor) ---------- */
const svg = (d, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
const IC = {
  video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10.5 6-3.5v10l-6-3.5"/>',
  book: '<path d="M12 6.5C10 5 7 4.6 4 5v13c3-.4 6 0 8 1.5 2-1.5 5-1.9 8-1.5V5c-3-.4-6 0-8 1.5z"/><path d="M12 6.5v13"/>',
  graph: '<path d="M4 4v16h16"/><path d="M7 16c2-6 4-9 6-9s3 3 6 3"/><circle cx="13" cy="7" r="1"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/>',
  timer: '<circle cx="12" cy="13" r="7"/><path d="M12 13V9.5M10 3h4M18.5 6.5 20 5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  chat: '<path d="M4 20l1.4-4A8 8 0 1 1 8.5 19z"/><path d="M9 10.5c.3 1.6 1.9 3.3 3.8 3.8"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};

/* ---------- CSS ---------- */
const appHead = fs.readFileSync(path.join(ROOT, 'app_head.html'), 'utf8');
const tokMatch = appHead.match(/<style id="theme"[^>]*>([\s\S]*?)\*\{box-sizing/);
if (!tokMatch) throw new Error('Could not find the theme tokens in app_head.html');
const TOKENS = tokMatch[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
const b64 = (f) => fs.readFileSync(path.join(ROOT, 'brand', f), 'utf8').trim().replace(/^data:[^,]+,/, '');
const MARK_URL = 'url(data:image/png;base64,' + b64('mark_mask.b64') + ')';
const LOGO_URL = 'url(data:image/png;base64,' + b64('logo_full_mask.b64') + ')';
const MARK = MARK_URL + ' center/contain no-repeat'; // og template only
// each data URL is written once per page as a custom property and reused by -webkit-mask and mask
const maskCss = (sel, v) => sel + '{-webkit-mask:var(' + v + ') center/contain no-repeat;mask:var(' + v + ') center/contain no-repeat}';

const CSS_BASE = `${TOKENS}
:root{--focus:var(--accent);--cols:minmax(0,1fr) 76px 140px 230px;--mark-img:${MARK_URL}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:84px}
body{margin:0;background-color:var(--bg);color:var(--ink);font-family:var(--body);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:28px 28px;background-attachment:fixed}
[hidden]{display:none!important}
a{color:var(--maths);text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
h1,h2,h3{font-family:var(--display);line-height:1.15;margin:0;text-wrap:balance;letter-spacing:-.01em}
h1{font-size:clamp(1.7rem,4.3vw,2.7rem);font-weight:700}
h2{font-size:clamp(1.35rem,2.6vw,1.8rem);font-weight:700}
h3{font-size:1.08rem;font-weight:700;text-wrap:pretty}
.nw{white-space:nowrap}
p,ul,ol,dl,dd{margin:0}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:8px}
.skip{position:absolute;left:16px;top:-80px;z-index:100;background:var(--surface);color:var(--ink);padding:10px 14px;border-radius:8px;border:1px solid var(--line);font-weight:600}
.skip:focus{top:8px}
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.eyebrow{font-family:var(--mono);font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2);font-weight:500}
.muted{color:var(--ink-2)}
.small{font-size:.875rem}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.wrap{max-width:1120px;margin:0 auto;padding-inline:16px}
@media (min-width:760px){.wrap{padding-inline:24px}}
.topbar{position:sticky;top:0;z-index:40;background:var(--surface);background:color-mix(in srgb,var(--surface) 90%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.topbar .wrap{display:flex;align-items:center;gap:12px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);min-width:0;border-radius:8px}
.brand .mark{width:36px;height:35px;flex:none;background:var(--ink)}
${maskCss('.brand .mark', '--mark-img')}
.brand b{display:block;font-family:var(--display);font-weight:700;font-size:1.08rem;letter-spacing:-.01em;line-height:1.15}
.brand small{display:block;font-size:.74rem;color:var(--ink-2);white-space:nowrap;line-height:1.2}
.nav{display:flex;gap:2px;margin-left:auto}
.nav a{color:var(--ink-2);text-decoration:none;font-weight:500;font-size:.93rem;padding:10px 12px;border-radius:999px;white-space:nowrap}
.nav a:hover{color:var(--ink);background:var(--surface-2)}
.nav a[aria-current="page"]{color:var(--ink);background:var(--surface-2);font-weight:600}
.nav .ns{display:none}
.top-cta{display:flex;gap:8px;flex:none}
@media (max-width:1119px){
  html{scroll-padding-top:116px}
  .topbar .wrap{flex-wrap:wrap;row-gap:2px;min-height:0;padding-top:8px}
  .top-cta{margin-left:auto}
  .nav{order:3;flex:1 0 100%;margin:0;padding:0 0 6px;overflow-x:auto;scrollbar-width:none}
  .nav::-webkit-scrollbar{display:none}
  .nav a{padding:8px 12px;font-size:.9rem}
}
@media (max-width:699px){
  .nav{justify-content:space-between;gap:0;margin-inline:-8px}
  .nav .nl{display:none}.nav .ns{display:inline}
  .nav a{padding:8px 8px;font-size:.88rem}
}
@media (max-width:400px){.top-cta .signin{display:none}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:10px 18px;font-weight:600;font-size:.95rem;font-family:var(--body);text-decoration:none;line-height:1.2;white-space:nowrap;cursor:pointer}
.btn:hover{border-color:var(--ink-2)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.1)}
.btn.ghost{background:transparent}
.btn.lg{min-height:50px;padding:12px 24px;font-size:1rem}
.btn.wa{border-color:var(--good);color:var(--good);background:var(--surface)}
.btn svg{width:18px;height:18px;flex:none}
.btn.long{white-space:normal;text-align:center}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 11px;font-size:.78rem;font-weight:600;background:var(--surface-2);color:var(--ink-2);white-space:nowrap}
.pill.maths{background:var(--maths-soft);color:var(--maths)}
.pill.phys{background:var(--phys-soft);color:var(--phys)}
.pill.chem{background:var(--chem-soft);color:var(--chem)}
.pill.life{background:var(--life-soft);color:var(--life)}
.pill.accent{background:var(--accent-soft);color:var(--accent)}
.card>.pill{justify-self:start}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px;min-width:0}
.page{padding-block:20px 56px}
.sec{margin-top:clamp(40px,7vw,72px)}
.sec-head{display:grid;gap:8px;margin-bottom:20px;max-width:72ch}
.sec-head p{color:var(--ink-2)}
.hero{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:clamp(20px,4vw,40px)}
.hero::before{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;-webkit-mask-image:linear-gradient(90deg,transparent 30%,#000 100%);mask-image:linear-gradient(90deg,transparent 30%,#000 100%);pointer-events:none}
.hero>*{position:relative}
.lead{font-size:1.08rem;color:var(--ink-2);max-width:64ch;margin-top:14px}
.cta-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
@media (max-width:520px){.cta-row .btn{flex:1 1 auto}}
.chev{width:20px;height:20px;flex:none;color:var(--ink-2);transition:transform .2s}
details[open]>summary .chev{transform:rotate(180deg)}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.band{position:relative;overflow:hidden;border-radius:var(--r);background:#1c3246;color:#fff;padding:clamp(22px,4vw,40px);border:1px solid #2c4a66;--focus:#fff;display:grid;gap:14px}
.band::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:24px 24px;pointer-events:none}
.band>*{position:relative}
.band h2{color:#fff}
.band p{color:#d6e2ed;max-width:62ch}
.band .btn{background:transparent;color:#fff;border-color:rgba(255,255,255,.55)}
.band .btn.primary{background:#fff;color:#1c3246;border-color:#fff}
.band .cta-row{margin-top:4px}
.foot{margin-top:64px;border-top:1px solid var(--line);background:var(--surface);padding-block:32px 24px}
.foot-grid{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))}
.foot ul{list-style:none;padding:0;display:grid;gap:2px;margin-top:8px}
.foot ul a{display:inline-flex;align-items:center;min-height:40px;color:var(--ink);text-decoration:none}
.foot ul a:hover{text-decoration:underline}
.slogan{font-family:var(--display);font-weight:500;color:var(--ink-2);margin-top:10px}
.foot-base{margin-top:24px;padding-top:16px;border-top:1px solid var(--line)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const CSS_INDEX = `
.hero-grid{display:grid;gap:24px;grid-template-columns:minmax(0,1fr)}
.hero-side{display:none}
@media (min-width:960px){.hero-grid{grid-template-columns:minmax(0,1fr) 250px;align-items:start}.hero-side{display:grid;justify-items:center;gap:12px;padding-top:8px;text-align:center}}
.hero-side{--logo-img:${LOGO_URL}}
.hero-side .slogan{white-space:nowrap;font-size:.95rem}
.logo-full{width:190px;aspect-ratio:525/351;background:var(--ink)}
${maskCss('.logo-full', '--logo-img')}
.facts{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.facts li{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:.86rem;background:var(--surface);color:var(--ink)}
.facts li b{font-weight:600}
.cd-wrap{margin-top:26px;padding-top:18px;border-top:1px dashed var(--line)}
.countdown{list-style:none;padding:0;margin:10px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media (min-width:760px){.countdown{grid-template-columns:repeat(3,minmax(0,1fr))}}
.cd{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface);display:grid;gap:4px;min-width:0}
.cd .subj{display:flex;align-items:center;gap:7px;font-weight:600;font-size:.88rem}
.cd .big{font-family:var(--mono);font-size:1.6rem;font-weight:500;line-height:1.1;font-variant-numeric:tabular-nums}
.cd .big small{font-size:.8rem;color:var(--ink-2);font-family:var(--body);margin-left:5px}
.cd.next{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.cd.past{opacity:.6}
@media (max-width:420px){.cd{padding:11px 12px}.cd .when{font-size:.8rem}.cd .subj{font-size:.8rem;gap:6px}}
.feat{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))}
.feat .card{display:grid;gap:8px;align-content:start}
.ic{width:42px;height:42px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:4px}
.ic svg{width:22px;height:22px}
.feat p,.steps p,.fee p{color:var(--ink-2);font-size:.94rem}
.steps{list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(196px,100%),1fr));counter-reset:st}
.steps li{counter-increment:st;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px;align-content:start}
.steps li::before{content:counter(st);width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-family:var(--mono);font-weight:600;font-size:.9rem;margin-bottom:4px}
.fees{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(196px,100%),1fr))}
.fee{display:grid;gap:6px;align-content:start}
.fee h3{margin-top:6px}
.price{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;margin-top:6px}
.fee .price b{color:var(--ink)}
.price b{font-family:var(--display);font-size:2.2rem;font-weight:700;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.price span{color:var(--ink-2);font-size:.92rem}
.durs{list-style:none;padding:0;margin-top:10px;border-top:1px solid var(--line)}
.durs li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:.92rem}
.durs li span:last-child{font-family:var(--mono);font-variant-numeric:tabular-nums}
.subjects{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}
.subjects+.subjects{margin-top:12px}
.papers dd.soon-t{font-family:var(--body);color:var(--ink-2)}
.subj-card{display:grid;gap:12px;align-content:start}
.papers{display:grid;gap:8px}
.papers div{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;padding:10px 12px;border-radius:var(--r-sm);background:var(--surface-2)}
.papers dt{font-weight:600}
.papers dd{font-family:var(--mono);font-size:.9rem;font-variant-numeric:tabular-nums}
.topics-inline{font-size:.88rem;color:var(--ink-2)}
.where{display:flex;gap:14px;align-items:flex-start}
.where>svg{width:28px;height:28px;flex:none;color:var(--accent);margin-top:2px}
.where p{max-width:80ch}
`;

const CSS_SHARED = `
.dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--ink-2)}
.dot.maths{background:var(--maths)}.dot.phys{background:var(--phys)}.dot.chem{background:var(--chem)}.dot.life{background:var(--life)}
.soon{border-style:dashed;background:var(--surface);color:var(--ink-2);margin-top:10px}
.soon b{color:var(--ink)}
.note{display:flex;gap:12px;align-items:flex-start;border-left:3px solid var(--accent);background:var(--accent-soft);padding:12px 16px;border-radius:0 var(--r-sm) var(--r-sm) 0;margin-top:14px}
.note svg{width:22px;height:22px;flex:none;color:var(--accent);margin-top:1px}
.note p{color:var(--ink)}
.faq{display:grid;gap:10px;max-width:880px}
.faq details{border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.faq summary{display:flex;align-items:center;gap:12px;padding:14px 16px;min-height:54px}
.faq summary h3{font-size:1rem;font-weight:600;flex:1;min-width:0}
.faq .ans{padding:0 16px 16px;max-width:75ch}
.faq .ans p+p{margin-top:8px}
.rel{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));list-style:none;padding:0}
.rel a{display:grid;gap:4px;align-content:start;height:100%;padding:14px 16px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);text-decoration:none;color:var(--ink)}
.rel a:hover{border-color:var(--ink-2)}
.rel b{font-family:var(--display);font-weight:700;line-height:1.25}
.rel .meta{font-size:.85rem;color:var(--ink-2)}
.rel .pill{justify-self:start;margin-bottom:2px}
`;

const CSS_SUBJECT = `
.crumbs{font-size:.875rem;color:var(--ink-2);margin-bottom:14px}
.crumbs ol{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.crumbs li+li::before{content:"›";margin-right:6px}
.crumbs a{color:var(--ink-2)}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:22px}
@media (min-width:760px){.stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
.stats div{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface);min-width:0}
.stats dt{font-size:.82rem;color:var(--ink-2)}
.stats dd{font-family:var(--display);font-weight:700;font-size:clamp(1.1rem,4vw,1.3rem);margin-top:2px;font-variant-numeric:tabular-nums}
.paper-head{display:grid;gap:8px;margin-bottom:14px}
.paper-head .meta{display:flex;flex-wrap:wrap;gap:8px}
.tt-head{display:none}
.topic{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);margin-top:10px}
.t-row{padding:14px 16px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px 12px;align-items:start}
.t-main{display:grid;gap:4px;min-width:0}
.t-title{font-family:var(--display);font-weight:700;font-size:1.05rem;line-height:1.25}
.t-title a{color:var(--ink);text-decoration-color:var(--line);text-decoration-thickness:2px}
.t-title a:hover{color:var(--maths);text-decoration-color:currentColor}
.t-weight{font-size:.85rem;color:var(--ink-2)}
.t-nums{display:flex;flex-wrap:wrap;gap:6px 8px}
.t-n{display:inline-block;background:var(--surface-2);border-radius:10px;padding:4px 10px;font-size:.84rem;font-variant-numeric:tabular-nums}
.t-n .lbl{color:var(--ink-2)}
.t-n b{font-weight:600}
.t-split{display:block;font-size:.78rem;color:var(--ink-2);margin-top:1px}
.t-more>summary{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 16px;border-top:1px solid var(--line);font-size:.88rem;font-weight:500;color:var(--ink-2)}
.t-more>summary:hover{color:var(--ink)}
.t-more>summary .chev{margin-left:auto}
.t-link{margin-top:10px;font-weight:600}
.t-body{padding:6px 16px 16px;border-top:1px solid var(--line)}
.sec-list{list-style:none;padding:0;margin-top:6px;counter-reset:sl}
.sec-list li{counter-increment:sl;display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:10px;padding:9px 0;border-bottom:1px dashed var(--line);align-items:baseline}
.sec-list li:last-child{border-bottom:0}
.sec-list li::before{content:counter(sl);font-family:var(--mono);font-size:.8rem;color:var(--ink-2)}
.sec-list .mono{font-size:.85rem;color:var(--ink-2);white-space:nowrap}
.t-body .split{margin-top:10px;font-size:.88rem;color:var(--ink-2)}
.paper-total{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;margin-top:10px;padding:12px 16px;border-radius:var(--r);background:var(--accent-soft);font-weight:600}
.paper-total .mono{font-weight:500}
@media (min-width:760px){
  .tt-head{display:grid;grid-template-columns:var(--cols);gap:12px;padding:0 16px 2px;font-family:var(--mono);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}
  .t-row{grid-template-columns:var(--cols);gap:12px;align-items:center}
  .t-nums{display:contents}
  .t-n{background:none;padding:0;font-size:.95rem;border-radius:0}
  .t-n .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
}
.how{display:grid;gap:10px}
.how ul{padding-left:20px;display:grid;gap:6px;color:var(--ink-2)}
.how li b{color:var(--ink)}
.other{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
`;

const CSS_GRADE = `
.gswitch{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.gswitch a{display:inline-flex;align-items:center;min-height:40px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none;font-weight:600;font-size:.92rem}
.gswitch a:hover{border-color:var(--ink-2)}
.gswitch a[aria-current="page"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;list-style:none;padding:0}
.jump a{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--ink);text-decoration:none;font-weight:500;font-size:.9rem}
.jump a:hover{border-color:var(--ink-2)}
.jump .mono{color:var(--ink-2);font-size:.82rem}
.paper-sub{margin-top:22px}
h4.t-title{margin:0}
.ph{display:flex;align-items:center;gap:9px;font-size:1.12rem;margin-bottom:4px}
.ph .muted{font-family:var(--body);font-weight:500;font-size:.92rem}
`;

/* ---------- shared page parts ---------- */
const OG_ALT = 'Adventuity – Grade 10 to 12 Maths, Physical Sciences and Life Sciences tutoring online';
function head(o) {
  const pre = o.abs ? BASE : (o.pre || '');
  if (o.title.length > 60) throw new Error(o.file + ': title is ' + o.title.length + ' chars (max 60): ' + o.title);
  if (o.desc.length > 155) throw new Error(o.file + ': description is ' + o.desc.length + ' chars (max 155): ' + o.desc);
  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
${o.noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">\n<link rel="canonical" href="' + o.url + '">'}
<meta name="theme-color" content="#1c3246">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:locale" content="en_ZA">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${o.url}">
<meta property="og:image" content="${BASE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.ogTitle || o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${BASE}og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">
<link rel="icon" type="image/png" sizes="32x32" href="${pre}icons/favicon-32.png">
<link rel="apple-touch-icon" href="${pre}icons/apple-touch-icon.png">
<link rel="manifest" href="${pre}manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${o.css}</style>
${(o.ld || []).map(ld).join('\n')}
</head>`;
}

function topbar(o) {
  const pre = o.abs ? BASE : (o.pre || '');
  const home = o.abs ? BASE : (o.pre || './');
  const cur = (k) => (o.current === k ? ' aria-current="page"' : '');
  // long labels on wide screens, short ones in the second row on phones (only one of the two is displayed, so only one is read)
  const item = (href, k, long, short) => `<a href="${pre}${href}"${cur(k)}><span class="nl">${long}</span><span class="ns">${short}</span></a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="topbar"><div class="wrap">
<a class="brand" href="${home}"${o.current === 'index' ? ' aria-current="page"' : ''}><span class="mark" aria-hidden="true"></span><span><b>${BRAND}</b><small>Grades 10–12 tutoring online</small></span></a>
<nav class="nav" aria-label="Main">${item('maths.html', 'maths', 'Mathematics', 'Maths')}${item('physical-sciences.html', 'sci', 'Physical Sciences', 'Phys Sci')}${item('life-sciences.html', 'life', 'Life Sciences', 'Life Sci')}${item(GRADES[10].file, 'grades', 'Grades 10–11', 'Gr 10–11')}${item(TT_FILE, 'timetable', 'Exam dates', 'Exams')}</nav>
<div class="top-cta"><a class="btn ghost signin" href="${pre}${PORTAL}">Sign in</a><a class="btn primary" href="${pre}${SIGNUP}">Book a lesson</a></div>
</div></header>`;
}

function footer(o) {
  const pre = o.abs ? BASE : (o.pre || '');
  const home = o.abs ? BASE : (o.pre || './');
  const anchor = (h) => (o.current === 'index' ? h : home + h);
  return `<footer class="foot"><div class="wrap">
<div class="foot-grid">
<div><a class="brand" href="${home}"><span class="mark" aria-hidden="true"></span><span><b>${BRAND}</b><small>${LEGAL}</small></span></a>
<p class="slogan">${SLOGAN}</p>
<p class="small muted" style="margin-top:6px">Online Mathematics, Physical Sciences and Life Sciences tutoring for Grades 10–12 across South Africa, with a focus on the matric (NSC) exams.</p></div>
<nav aria-label="Learner links"><p class="eyebrow">Learners</p><ul>
<li><a href="${pre}${SIGNUP}">Create a free account</a></li>
<li><a href="${pre}${PORTAL}">Sign in to the learner portal</a></li>
${o.live ? '<li><a href="#" data-wa hidden target="_blank" rel="noopener">WhatsApp the tutor</a></li>' : ''}
<li><a href="${anchor('#fees')}">Lesson fees</a></li>
<li><a href="${anchor('#faq')}">Questions and answers</a></li>
</ul></nav>
<nav aria-label="Subject links"><p class="eyebrow">Subjects</p><ul>
<li><a href="${pre}maths.html">Grade 12 Mathematics topics</a></li>
<li><a href="${pre}physical-sciences.html">Grade 12 Physical Sciences topics</a></li>
<li><a href="${pre}life-sciences.html">Grade 12 Life Sciences topics</a></li>
<li><a href="${pre}${GRADES[10].file}">Grade 10 topics</a></li>
<li><a href="${pre}${GRADES[11].file}">Grade 11 topics</a></li>
<li><a href="${pre}${TT_FILE}">Matric exam timetable 2026</a></li>
</ul></nav>
<nav aria-label="Tutor links"><p class="eyebrow">Tutors</p><ul>
<li><a href="${pre}tutor-apply.html">Teach with us – tutor jobs</a></li>
</ul></nav>
</div>
<p class="foot-base small muted">© 2026 ${LEGAL} · ${SLOGAN}</p>
</div></footer>`;
}

// live fees + WhatsApp from Supabase public_settings (fails silently)
const liveJs = (pre) => `<script src="${pre}config.js"></script>
<script>(function(){var C=window.ADV_CONFIG||{};if(!C.supabaseUrl||!C.supabaseKey||!window.fetch)return;
function R(n){n=Math.round(Number(n)*100)/100;var p=n.toFixed(n%1?2:0).split('.');return'R'+p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,'\\u00a0')+(p[1]?','+p[1]:'')}
fetch(String(C.supabaseUrl).replace(/\\/+$/,'')+'/rest/v1/public_settings?select=key,value&key=in.(fees,site)',{headers:{apikey:C.supabaseKey}}).then(function(r){return r.ok?r.json():[]}).then(function(rows){
var s={};(Array.isArray(rows)?rows:[]).forEach(function(x){s[x.key]=x.value});var f=s.fees;
if(f&&typeof f==='object'){var rate=function(k){var v=Number(k==='group'?f.group:(f[k]!=null?f[k]:f['default']));return v>0?v:null};
[].forEach.call(document.querySelectorAll('[data-fee]'),function(el){var k=el.getAttribute('data-fee'),v=rate(k);if(v==null)return;el.textContent=R(k==='group'?v:v*Number(el.getAttribute('data-min')||60)/60)});
var lo=${JSON.stringify(FEE_KEYS).replace(/"/g, "'")}.map(rate).filter(function(v){return v!=null});if(lo.length)[].forEach.call(document.querySelectorAll('[data-fee-from]'),function(el){el.textContent=R(Math.min.apply(null,lo))})}
var w=s.site&&s.site.whatsapp;if(w){var d=String(w).replace(/\\D/g,'');if(d.charAt(0)==='0')d='27'+d.slice(1);if(d.length>=11)[].forEach.call(document.querySelectorAll('[data-wa]'),function(el){el.href='https://wa.me/'+d+'?text='+encodeURIComponent('Hi, I would like to book a lesson.');el.hidden=false})}
}).catch(function(){})})();</script>`;

const COUNTDOWN_JS = `<script>(function(){var now=Date.now(),D=864e5,O=72e5,first=true;
[].forEach.call(document.querySelectorAll('.cd[data-at]'),function(el){var t=Date.parse(el.getAttribute('data-at'));if(isNaN(t))return;
var big=el.querySelector('.big'),when=el.querySelector('.when'),days=Math.floor((t+O)/D)-Math.floor((now+O)/D);
if(when)when.textContent=el.getAttribute('data-when');
if(now>t+108e5){el.classList.add('past');big.textContent='Written';return}
if(now>=t)big.textContent='Writing now';else if(days<=0)big.textContent='Today';else big.innerHTML=days+'<small>'+(days===1?'day':'days')+'</small>';
if(first){el.classList.add('next');first=false}})})();</script>`;

/* ---------- index.html ---------- */
const POPULAR = ['calculus', 'trig', 'euclid', 'analytical', 'functions', 'newton', 'circuits', 'organic-reactions'];
const minFee = () => Math.min(...FEE_KEYS.map((k) => FEES[k]));
function buildIndex() {
  const url = BASE;
  const calc = MATHS.find((t) => t.id === 'calculus');
  const mp1 = SUBJECTS.maths.papers[0];
  const exList = Object.values(EXAMS);
  const lastExam = exList.reduce((a, e) => (e.date > a.date ? e : a));
  const g1011 = [GRADES[10], GRADES[11]];
  const anyLower = g1011.some((g) => g.nTopics);
  const allLower = g1011.every((g) => g.list.every((s) => s.nTopics));

  const FAQ = [
    ['Is it aligned to CAPS and the NSC exams?',
      `<p>Yes. Every topic follows the CAPS curriculum for its grade. Grade 12 topics are grouped the way they are examined in the NSC papers – Mathematics Paper 1 and Paper 2, Physical Sciences Paper 1 (Physics) and Paper 2 (Chemistry), and Life Sciences Paper 1 and Paper 2 – and each topic shows its typical share of the 150 marks. Grade 10 and 11 topics are grouped by the papers of the school and provincial exams.</p>`],
    ['Do you also help Grade 10 and 11 learners?',
      `<p>Yes. You can book lessons for Grade 10 and Grade 11 Mathematics, Physical Sciences and Life Sciences. ${anyLower ? `The <a href="${GRADES[10].file}">Grade 10</a> and <a href="${GRADES[11].file}">Grade 11</a> pages list the topics that have notes and exam-style questions in the portal, and how long each one takes to study${allLower ? '' : '; more topics are being added'}.` : 'Notes and exam-style questions for Grades 10 and 11 are being added to the portal.'} Grade 10 and 11 exams are set by your school or province and are written in June and November.</p>`],
    ['How do I pay for a lesson?',
      `<p>You pay only after the tutor has confirmed your booking, by EFT. The banking details and your payment reference are shown in the portal once your booking is accepted, and you upload your proof of payment there. The current fees are listed under Fees on this page and in the portal before you request a lesson.</p>`],
    ['What do I need for an online lesson?',
      `<p>A phone, tablet or computer with a camera and microphone (earphones help), a stable internet or mobile-data connection, and your calculator, textbook and paper. The classroom runs in the browser; on a phone you may be asked to install the free Jitsi Meet app the first time.</p>`],
    ['Can I book on my phone?',
      `<p>Yes. The portal works on any smartphone, and you can install it like an app: on Android open it in Chrome and choose Install app; on iPhone open it in Safari, tap Share and then Add to Home Screen.</p>`],
    ['How long should I study each chapter?',
      `<p>Each subject page shows an estimate for every topic. For example, ${esc(calc.title)} takes about ${dur(calc.total)}: ${dur(calc.notes)} of notes and worked examples, ${dur(calc.exam)} of exam-style questions at exam pace and a 10-minute quiz. All of Mathematics Paper 1 adds up to about ${dur(mp1.total)}, so spread the work over the weeks before the exam.</p>`],
    ['What if I need to cancel or move a lesson?',
      `<p>You can cancel a request in the portal any time before the lesson, and a confirmed lesson up to 24 hours before it starts. After that, message the tutor in the portal to move it. If you have already paid, the tutor arranges a new time with you.</p>`],
    ['Is the study material available without a lesson?',
      `<p>Study notes open once the tutor approves your account – usually with your first confirmed lesson. Before that you can already see every topic and how long it takes to study, here and in the portal.</p>`],
    ['Can I join a group class instead of a one-on-one lesson?',
      `<p>Yes. When the tutor schedules a group class on a topic, you can request a seat in the portal. A seat costs less than a one-on-one lesson; the price per seat is shown on each class.</p>`],
  ];

  const desc = firstFit([`Online Maths, Physical Sciences and Life Sciences lessons for Grades 10–12 across South Africa – matric (NSC) focus, CAPS notes and ${N.q} exam questions.`,
    'Online Maths, Physical Sciences and Life Sciences lessons for Grades 10–12 across South Africa – matric (NSC) focus, CAPS-aligned notes and questions.'], 155, 'index description');
  const org = {
    '@type': 'EducationalOrganization', '@id': BASE + '#org', name: BRAND, legalName: LEGAL, url: BASE,
    logo: BASE + 'icons/icon-512.png', image: BASE + 'og.png', slogan: SLOGAN,
    description: 'Online Mathematics, Physical Sciences and Life Sciences tutoring (CAPS) for Grade 10–12 learners anywhere in South Africa, with a focus on the Grade 12 NSC exams.',
    areaServed: { '@type': 'Country', name: 'South Africa', identifier: 'ZA' },
    knowsAbout: ['Grade 12 Mathematics', 'Grade 12 Physical Sciences', 'Grade 12 Life Sciences', 'Grade 10 and 11 Mathematics', 'Grade 10 and 11 Physical Sciences', 'Grade 10 and 11 Life Sciences', 'Physics', 'Chemistry', 'Biology', 'CAPS', 'National Senior Certificate'],
  };
  const service = {
    '@type': 'Service', '@id': BASE + '#tutoring', name: 'Online one-on-one tutoring for Grades 10–12', serviceType: 'Tutoring',
    description: 'Live one-on-one online lessons for Grade 10–12 Mathematics, Physical Sciences (Physics and Chemistry) and Life Sciences (CAPS), with a focus on the Grade 12 NSC exams. Lessons are 60, 90 or 120 minutes; pay by EFT after the tutor confirms the booking.',
    provider: { '@id': BASE + '#org' }, areaServed: { '@type': 'Country', name: 'South Africa', identifier: 'ZA' },
    audience: { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: 'Grade 10, 11 and 12 learners (matric focus)' },
    availableChannel: { '@type': 'ServiceChannel', name: 'Online lessons', serviceUrl: BASE + PORTAL },
    offers: [
      { '@type': 'Offer', name: 'One-on-one lesson', price: minFee(), priceCurrency: 'ZAR', url: BASE + SIGNUP, availability: 'https://schema.org/InStock',
        areaServed: { '@type': 'Country', name: 'South Africa', identifier: 'ZA' },
        priceSpecification: { '@type': 'UnitPriceSpecification', price: minFee(), priceCurrency: 'ZAR', unitText: 'per hour', unitCode: 'HUR' } },
      { '@type': 'Offer', name: 'Group class seat', priceCurrency: 'ZAR', url: BASE + SIGNUP,
        priceSpecification: { '@type': 'PriceSpecification', minPrice: FEES.group, priceCurrency: 'ZAR', unitText: 'per seat' } },
    ],
  };
  const website = { '@type': 'WebSite', '@id': BASE + '#website', url: BASE, name: BRAND, inLanguage: 'en-ZA', publisher: { '@id': BASE + '#org' } };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) };

  const qParts = [[N.qM, 'Mathematics'], [N.qS, 'Physical Sciences'], [N.qL, 'Life Sciences']].filter(([n]) => n).map(([n, s]) => n + ' for ' + s);
  const feat = [
    [IC.video, 'Live online lessons', 'One-on-one or group lessons in a private online classroom with video, screen share, a whiteboard and chat.'],
    [IC.book, 'Study notes for every topic', `Clear notes for ${GR_PRESENT.length > 1 ? `${N.topics} topics across ${GR_SPAN}` : `all ${N.topics} Grade 12 topics`}, split into ${N.sections} short sections and grouped by exam paper.`],
    [IC.graph, 'Worked examples with diagrams', 'Graphs, sketches and labelled diagrams drawn right into the worked examples, so you can see what the question describes.'],
    [IC.stairs, '<span class="nw">Step-by-step</span> answers', 'Every worked example is answered one line at a time – formula, numbers substituted, answer with its unit; in Life Sciences each answer point – the way markers want to see it.'],
    [IC.clip, `${N.q} <span class="nw">exam-style</span> questions`, `Past-paper-style questions with full marking memos: ${andList(qParts)}.`],
    [IC.timer, 'Quizzes and mock papers', 'A quick quiz at the end of each topic and mock papers to practise under real exam time.'],
    [IC.cal, 'A study plan to exam day', 'A day-by-day plan that counts down to your NSC exam dates, so every topic is covered in time.'],
    [IC.phone, 'Works on your phone', 'Use it on any phone, tablet or computer, or install it as an app – no app store needed.'],
  ];
  const steps = [
    ['Create a free account', 'Sign up in the portal with your name, e-mail and WhatsApp number. It takes a minute and costs nothing.'],
    ['Request a lesson', 'Ask for a one-on-one time (60, 90 or 120 minutes) or a seat in a group class, and pick the topics you want to cover.'],
    ['The tutor confirms', 'The tutor accepts your request or suggests another time. You get a notification and a confirmation in the portal, with the payment details.'],
    ['Join the lesson', 'At lesson time tap “Join the lesson”. A private online classroom opens with video, screen share, a whiteboard and chat – in the browser, or the free Jitsi Meet app on a phone.'],
    ['Keep practising', `Between lessons, approved learners read the notes, worked examples with diagrams and step-by-step answers, ${N.q} exam-style questions with memos, quizzes, mock papers and a study plan.`],
  ];
  const feeCard = (k, label, paper) => `<article class="card fee">
<span class="pill ${k}">${paper}</span>
<h3>${label} lesson</h3>
<p class="price"><b id="fee-${k}" data-fee="${k}">${rand(FEES[k])}</b><span>per hour, one-on-one</span></p>
<ul class="durs" aria-label="${label} lesson cost by length">${DURATIONS.map((m) => `<li><span>${m} minutes</span><span data-fee="${k}" data-min="${m}">${rand(FEES[k] * m / 60)}</span></li>`).join('')}</ul>
</article>`;
  const paperRow = (p) => `<div><dt>${p.label}${p.sub ? ' · ' + p.sub : ''} <span class="muted">· ${p.exam.wd} ${p.exam.dm}</span></dt>${p.topics.length ? `<dd>${pl(p.topics.length, 'topic')} · ≈${NB}${dur(p.total)}</dd>` : '<dd class="soon-t">topics coming soon</dd>'}</div>`;
  const pillTxt = (s, p) => (p.sub ? p.sub : s.name + ' ' + p.label.replace('Paper ', 'P'));
  const subjCard = (s, linkText) => `<article class="card subj-card">
<div class="row" style="display:flex;gap:6px;flex-wrap:wrap">${s.papers.map((p) => `<span class="pill ${p.cls}">${pillTxt(s, p)}</span>`).join('')}</div>
<h3>Grade 12 ${s.name}</h3>
<dl class="papers">${s.papers.map(paperRow).join('')}</dl>
<p class="topics-inline">${s.nTopics ? s.papers.filter((p) => p.topics.length).map((p) => `<b>${p.label}:</b> ${p.topics.map((t) => esc(t.title)).join(' · ')}`).join('<br>') : `The Grade 12 ${s.name} notes and exam-style questions are being added – you can already book a lesson.`}</p>
<p><a class="btn long" href="${s.file}">${linkText} ${svg(IC.arrow)}</a></p>
</article>`;
  const gradeCard = (g) => `<article class="card subj-card">
<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill accent">${g.name}</span><span class="pill">School and provincial exams</span></div>
<h3>${g.name} Mathematics, Physical Sciences and Life Sciences</h3>
<dl class="papers">${g.list.map((s) => `<div><dt>${s.name}</dt>${s.nTopics ? `<dd>${pl(s.nTopics, 'topic')} · ≈${NB}${dur(s.total)}</dd>` : '<dd class="soon-t">coming soon</dd>'}</div>`).join('')}</dl>
<p><a class="btn long" href="${g.file}">${g.name} topics and study time ${svg(IC.arrow)}</a></p>
</article>`;

  const body = `<body>
${topbar({ current: 'index' })}
<main id="main" class="wrap page">
<section class="hero" aria-labelledby="h1">
<div class="hero-grid">
<div>
<p class="eyebrow">CAPS · Grades 10–12 · NSC finals 2026 · Live online lessons</p>
<h1 id="h1" style="margin-top:10px">Grade 12 Maths, Physical Sciences &amp; Life Sciences tutoring online</h1>
<p class="lead">Live one-on-one lessons for matric learners anywhere in South Africa – and for Grades 10 and 11 too. Between lessons, keep practising with study notes, step-by-step worked examples and ${N.q} exam-style questions with memos.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="${PORTAL}">Sign in</a><a class="btn wa lg" href="#" data-wa hidden target="_blank" rel="noopener">${svg(IC.chat)}WhatsApp us</a></div>
<ul class="facts" aria-label="At a glance">
<li><b data-fee-from>${rand(minFee())}</b> per hour, one-on-one</li>
<li>Group classes from <b data-fee="group">${rand(FEES.group)}</b></li>
<li>60, 90 or 120 minutes</li>
<li>Grades 10, 11 and 12</li>
<li>Maths, Physical Sciences and Life Sciences</li>
</ul>
</div>
<div class="hero-side" aria-hidden="true"><div class="logo-full"></div><p class="slogan">${SLOGAN}</p></div>
</div>
<div class="cd-wrap">
<h2 class="eyebrow" style="font-family:var(--mono);font-size:.74rem;letter-spacing:.12em">Exam countdown · NSC October–November 2026</h2>
<p class="small" style="margin-top:4px"><a href="${TT_FILE}">Full matric exam timetable 2026 and study hours per paper</a></p>
<ul class="countdown">${exList.map((e) => `<li class="cd" data-at="${e.at}" data-when="${e.full.replace(/ 2026$/, '')} · 09:00"><span class="subj"><span class="dot ${e.subj}"></span>${e.short}</span><span class="big">${e.dm}</span><span class="when small muted">${e.wdl} · 09:00</span></li>`).join('')}</ul>
</div>
</section>

<section class="sec" aria-labelledby="get">
<div class="sec-head"><p class="eyebrow">What you get</p><h2 id="get">Lessons plus everything you need between them</h2><p>Live help from a tutor when you are stuck, and structured material to practise on your own until the exam.</p></div>
<div class="feat">${feat.map(([i, h, p]) => `<article class="card"><span class="ic">${svg(i)}</span><h3>${h}</h3><p>${p}</p></article>`).join('')}</div>
</section>

<section class="sec" aria-labelledby="how">
<div class="sec-head"><p class="eyebrow">How booking works</p><h2 id="how">From sign-up to your first lesson in five steps</h2></div>
<ol class="steps">${steps.map(([h, p]) => `<li><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol>
<div class="note">${svg(IC.phone)}<p><b>Install it as an app.</b> On Android open the portal in Chrome and choose <b>Install app</b>; on iPhone open it in Safari, tap <b>Share</b> and then <b>Add to Home Screen</b>.</p></div>
</section>

<section class="sec" id="fees" aria-labelledby="fees-h">
<div class="sec-head"><p class="eyebrow">Fees</p><h2 id="fees-h">Simple hourly fees, paid after your booking is confirmed</h2><p>One-on-one lessons are priced per hour and run for 60, 90 or 120 minutes. The fee depends on the subject, not the grade – the same for Grades 10, 11 and 12.</p></div>
<div class="fees">
${feeCard('maths', 'Mathematics', 'Paper 1 and 2')}
${feeCard('phys', 'Physics', 'Physical Sciences P1')}
${feeCard('chem', 'Chemistry', 'Physical Sciences P2')}
${feeCard('life', 'Life Sciences', 'Paper 1 and 2')}
<article class="card fee"><span class="pill accent">Group class</span><h3>Group class seat</h3><p class="price"><span>from</span><b id="fee-group" data-fee="group">${rand(FEES.group)}</b><span>per seat</span></p><p>Online group classes on set topics, scheduled by the tutor. Seats are limited and the price is shown on each class.</p></article>
</div>
<div class="note">${svg(IC.lock)}<p><b>How payment works.</b> Request a lesson first – you pay nothing yet. Once the tutor accepts, pay by EFT using the banking details and payment reference shown with your booking in the portal, then upload your proof of payment there.</p></div>
</section>

<section class="sec" aria-labelledby="subjects">
<div class="sec-head"><p class="eyebrow">Subjects and study time</p><h2 id="subjects">Every Grade 12 topic, by exam paper</h2><p>Estimated study time per topic = notes and worked examples + every exam-style question at exam pace (1,2 minutes per mark) + a <span class="nw">10-minute</span> quiz.</p></div>
<div class="subjects">
${subjCard(SUBJECTS.maths, 'Mathematics topics, weighting and study time')}
${subjCard(SUBJECTS.sci, 'Physical Sciences topics, weighting and study time')}
${subjCard(SUBJECTS.life, 'Life Sciences topics, weighting and study time')}
</div>
</section>

<section class="sec" id="grades" aria-labelledby="grades-h">
<div class="sec-head"><p class="eyebrow">Grades 10 and 11</p><h2 id="grades-h">Building up to matric? Grade 10 and 11 lessons too</h2><p>The same online lessons for Grade 10 and 11 Mathematics, Physical Sciences and Life Sciences${anyLower ? ', with notes, worked examples and exam-style questions for each topic' : ' – notes and exam-style questions are being added'}. Grade 10 and 11 exams are set by your school or province and are written in June and November.</p></div>
<div class="subjects">${g1011.map(gradeCard).join('\n')}</div>
</section>

<section class="sec" aria-labelledby="popular">
<div class="sec-head"><p class="eyebrow">Popular topics</p><h2 id="popular">High-mark topics to start with</h2><p>These topics carry many of the marks in the NSC papers. Each guide shows what the topic covers, how it is examined and how long it takes to study.</p></div>
<ul class="rel">${POPULAR.map((id) => { const t = ALL.find((x) => x.id === id); const c = CTX[id]; return `<li><a href="topics/${id}.html"><span class="pill ${c.p.cls}">${c.p.exam.short}</span><b>${esc(t.title)}</b><span class="meta">${INFO[id].full ? 'Inside Questions 5–9' : 'Typically ' + INFO[id].q.replace(/^one of /, 'one of ')} · ≈${NB}${dur(t.total)}</span></a></li>`; }).join('')}</ul>
<p style="margin-top:14px"><a href="${TT_FILE}">Matric exam timetable 2026 – dates, countdown and study hours per paper</a></p>
</section>

<section class="sec" aria-labelledby="where">
<div class="sec-head"><p class="eyebrow">Where we teach</p><h2 id="where">Online, so anywhere in South Africa</h2></div>
<div class="card where">${svg(IC.pin)}<p>Lessons happen online, so you can join from any of the nine provinces – Gauteng, KwaZulu-Natal, the Western Cape, Eastern Cape, Limpopo, Mpumalanga, North West, the Free State and the Northern Cape. Learners in Johannesburg, Pretoria, Durban, Cape Town, Gqeberha, Bloemfontein, Polokwane, Mbombela, East London, Kimberley and Rustenburg – or in a small town with a mobile signal – get the same lessons and the same study material.</p></div>
</section>

<section class="sec" id="faq" aria-labelledby="faq-h">
<div class="sec-head"><p class="eyebrow">FAQ</p><h2 id="faq-h">Questions learners and parents ask</h2></div>
<div class="faq">${FAQ.map(([q, a]) => `<details><summary><h3>${esc(q)}</h3>${svg(IC.chev, 'chev')}</summary><div class="ans">${a}</div></details>`).join('\n')}</div>
</section>

<section class="sec band" aria-labelledby="cta">
<h2 id="cta">Get help with the topics that worry you – before your exams</h2>
<p>The NSC papers listed here run until ${lastExam.wdl} ${lastExam.dm} ${lastExam.date.slice(0, 4)} (${lastExam.name}); Grade 10 and 11 learners write their November exams at school. Create a free account, request a lesson time and pick your topics. You only pay once the tutor confirms.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="${PORTAL}">Sign in to the portal</a></div>
</section>
</main>
${footer({ current: 'index', live: true })}
${COUNTDOWN_JS}
${liveJs('')}
</body>
</html>
`;
  return head({ file: 'index.html', url, title: 'Grade 12 Maths, Physical & Life Sciences Tutor | Adventuity', desc, css: CSS_BASE + CSS_SHARED + CSS_INDEX,
    ld: [{ '@context': 'https://schema.org', '@graph': [org, website, service] }, faqLd] }) + '\n' + body;
}

/* ---------- subject pages (Grade 12) and grade pages (Grades 10–11) ---------- */
function topicRow(t, h = 'h3') {
  const href = 'topics/' + t.id + '.html';
  return `<article class="topic" id="${esc(t.id)}">
<div class="t-row"><div class="t-main"><${h} class="t-title"><a href="${href}">${esc(t.title)}</a></${h}><span class="t-weight">${esc(t.weight)}</span></div><div class="t-nums"><span class="t-n"><span class="lbl">Sections </span><b>${t.sections.length}</b></span><span class="t-n"><span class="lbl">Exam questions </span><b>${t.nQ}</b> <span class="muted">(${t.marks}${NB}marks)</span></span><span class="t-n"><span class="lbl">Study time </span><b>≈${NB}${dur(t.total)}</b><span class="t-split"><span class="nw">notes ${durShort(t.notes)} ·</span> <span class="nw">exam questions ${durShort(t.exam)}</span></span></span></div></div>
<details class="t-more"><summary><span>Show the ${t.sections.length} sections</span>${svg(IC.chev, 'chev')}</summary>
<div class="t-body"><ol class="sec-list">${t.sections.map((s) => `<li><span>${esc(s.title)}</span><span class="mono">${s.est}${NB}min</span></li>`).join('')}</ol>
<p class="split">Notes and worked examples ${dur(t.notes)} · ${t.nQ} exam-style questions (${t.marks} marks) at exam pace ${dur(t.exam)} · quiz ${QUIZ_MIN}${NB}min</p>
<p class="t-link"><a href="${href}">${esc(t.title)}: what it covers, how it is examined and study time</a></p></div>
</details>
</article>`;
}
const TT_HEAD = '<div class="tt-head" aria-hidden="true"><span>Topic and exam weighting</span><span>Sections</span><span>Exam questions</span><span>Study time</span></div>';
const paperTotal = (p) => `<p class="paper-total"><span>${p.label} total</span><span class="mono">${pl(p.topics.length, 'topic')} · ${pl(p.nSec, 'section')} · ${pl(p.nQ, 'question')} · ≈${NB}${dur(p.total)}</span></p>`;
const capFirst = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const provider = () => ({ '@type': 'EducationalOrganization', name: BRAND, legalName: LEGAL, url: BASE, logo: BASE + 'icons/icon-512.png' });
const hourOffer = (k) => [{ '@type': 'Offer', category: 'Paid', price: FEES[k], priceCurrency: 'ZAR', url: BASE + SIGNUP,
  priceSpecification: { '@type': 'UnitPriceSpecification', price: FEES[k], priceCurrency: 'ZAR', unitText: 'per hour', unitCode: 'HUR' } }];
const courseInstance = (min) => [Object.assign({ '@type': 'CourseInstance', courseMode: 'online', inLanguage: 'en-ZA', location: { '@type': 'VirtualLocation', url: BASE + PORTAL } }, min ? { courseWorkload: iso(min) } : {})];
const FEE_FOR = { maths: ' for Maths', phys: ' for Physics', chem: ' for Chemistry', life: ' for Life Sciences' };
const feeLine = (keys) => keys.map((k) => `<span data-fee="${k}">${rand(FEES[k])}</span> per hour${keys.length > 1 ? FEE_FOR[k] || '' : ''}`).join(', ');
const estSec = (pace) => `<section class="sec card how" aria-labelledby="est">
<h2 id="est">How the study time is estimated</h2>
<ul>
<li><b>Notes and worked examples:</b> the estimate for each section, listed when you open a topic.</li>
<li><b>Exam-style questions:</b> every question in the topic's practice bank ${pace}</li>
<li><b>Quiz:</b> 10 minutes per topic.</li>
</ul>
<p class="small muted">It is a guide for planning. Your tutor will help you adjust it to what you already know. Notes, examples, questions and memos open in the portal once the tutor approves your account.</p>
</section>`;
const PACE_NSC = 'at exam pace – 1,2 minutes per mark, the pace of 150 marks in 3 hours.';
const PACE_LIFE = 'at 1,2 minutes per mark. The Life Sciences papers allow 1 minute per mark (150 marks in 2½ hours) – the extra time is for checking your answers against the memo.';
const PACE_GRADES = 'at 1,2 minutes per mark – the pace of a 150-mark paper in 3 hours (Life Sciences papers allow a little less, so the extra time is for checking your answers against the memo).';

const SUBJ_PAGE = {
  maths: { title: 'Grade 12 Maths Topics & Study Time (CAPS) | Adventuity', book: 'Maths', cta: 'Maths',
    desc: 'All Grade 12 Mathematics (CAPS) topics for NSC Paper 1 and Paper 2, with exam weighting, sections, exam-style questions and study time per topic.',
    lead: (s) => `All ${s.nTopics} topics of matric Mathematics, grouped by NSC exam paper, with the typical mark weighting, the study sections in each topic, the number of exam-style questions and how long each topic takes to study.` },
  sci: { title: 'Grade 12 Physical Sciences Topics & Study Time | Adventuity', book: 'Physical Sciences', cta: 'Physics or Chemistry',
    desc: 'Grade 12 Physical Sciences (CAPS) topics for Physics Paper 1 and Chemistry Paper 2: exam weighting, sections, exam-style questions and study hours.',
    lead: (s) => `All ${s.nTopics} topics of matric Physical Sciences – Physics for Paper 1 and Chemistry for Paper 2 – with the typical mark weighting, the study sections in each topic, the number of exam-style questions and how long each topic takes to study.` },
  life: { title: 'Grade 12 Life Sciences Topics & Study Time | Adventuity', book: 'Life Sciences', cta: 'Life Sciences',
    desc: 'Grade 12 Life Sciences (CAPS) topics for NSC Paper 1 and Paper 2, with exam weighting, sections, exam-style questions and study time per topic.',
    lead: (s) => (s.nTopics
      ? `The ${s.nTopics} matric Life Sciences topics in the portal, grouped by NSC exam paper, with the typical mark weighting, the study sections in each topic, the number of exam-style questions and how long each topic takes to study.`
      : 'The matric Life Sciences notes and exam-style questions are being added to the portal. Here are the 2026 NSC exam dates for both papers; the topic lists, with weighting and study time, appear as the notes are published.') },
};

function buildSubject(key) {
  const s = SUBJECTS[key];
  const T = SUBJ_PAGE[key];
  const url = BASE + s.file;
  const h1 = `Grade 12 ${s.name} (CAPS) – topics, exam weighting and study time`;
  const lead = T.lead(s);
  const others = SUBJ_ORDER.filter((k) => k !== key).map((k) => SUBJECTS[k]);

  const course = Object.assign({
    '@context': 'https://schema.org', '@type': 'Course', '@id': url + '#course',
    name: `Grade 12 ${s.name} (CAPS)`, description: lead, url, provider: provider(), educationalLevel: 'Grade 12', inLanguage: 'en-ZA' },
  s.nTopics ? { teaches: s.papers.flatMap((p) => p.topics.map((t) => t.title)) } : {},
  { hasCourseInstance: courseInstance(s.total), offers: hourOffer(s.fees[0]) });
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
    { '@type': 'ListItem', position: 2, name: 'Grade 12 ' + s.name, item: url }] };

  const paperSec = (p) => {
    const id = key + '-' + p.key;
    const heading = p.theme ? `${p.label}: ${p.theme}` : `${p.label} topics`;
    return `<section class="sec" aria-labelledby="${id}">
<div class="paper-head"><p class="eyebrow">${s.name} · ${p.label}</p><h2 id="${id}">${esc(capFirst(heading))}</h2>
<div class="meta"><span class="pill ${p.cls}">${p.exam.full} · 09:00</span><span class="pill">${p.exam.len} · 150 marks</span>${p.topics.length ? `<span class="pill">${pl(p.topics.length, 'topic')} · ≈${NB}${dur(p.total)}</span>` : ''}</div></div>
${p.topics.length ? `${TT_HEAD}
${p.topics.map((t) => topicRow(t)).join('\n')}
${paperTotal(p)}` : `<p class="card soon"><b>${s.name} ${p.label} topics are coming soon.</b> The notes and exam-style questions are being written – you can already book a lesson on any ${p.label} topic.</p>`}
</section>`;
  };

  const body = `<body>
${topbar({ current: key })}
<main id="main" class="wrap page">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="./">Home</a></li><li><span aria-current="page">Grade 12 ${s.name}</span></li></ol></nav>
<section class="hero" aria-labelledby="h1">
<p class="eyebrow">Grade 12 · CAPS · NSC 2026</p>
<h1 id="h1" style="margin-top:10px">${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${s.nTopics ? `<dl class="stats">
<div><dt>Topics</dt><dd>${s.nTopics}</dd></div>
<div><dt>Study sections</dt><dd>${s.nSec}</dd></div>
<div><dt>Exam-style questions</dt><dd>${s.nQ}</dd></div>
<div><dt>Total study time</dt><dd>≈${NB}${dur(s.total)}</dd></div>
</dl>` : ''}
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a ${T.book} lesson</a><a class="btn lg" href="${PORTAL}">Sign in</a></div>
<p class="small" style="margin-top:14px">${s.nTopics ? 'Open a topic for what it covers, how it is examined and a daily study target. ' : ''}<a href="${TT_FILE}">See the matric exam timetable 2026</a>. In Grade 10 or 11? See the <a href="${GRADES[10].file}#${key}">Grade 10</a> and <a href="${GRADES[11].file}#${key}">Grade 11</a> ${s.name} topics.</p>
</section>
${s.papers.map(paperSec).join('\n')}
${estSec(key === 'life' ? PACE_LIFE : PACE_NSC)}
<section class="sec band" aria-labelledby="cta">
<h2 id="cta">Stuck on a topic? Book a one-on-one ${T.cta} lesson.</h2>
<p>${feeLine(s.fees)} – 60, 90 or 120 minutes, online from anywhere in South Africa. You pay by EFT only after the tutor confirms your booking.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="./#fees">See all fees</a></div>
</section>
<section class="sec other"><p>Also preparing for another subject?</p><div class="cta-row" style="margin-top:0">${others.map((o) => `<a class="btn long" href="${o.file}">Grade 12 ${o.name} topics ${svg(IC.arrow)}</a>`).join('')}</div></section>
</main>
${footer({ current: key, live: true })}
${liveJs('')}
</body>
</html>
`;
  return head({ file: s.file, url, title: T.title, desc: T.desc, css: CSS_BASE + CSS_SHARED + CSS_SUBJECT, ld: [course, crumbs] }) + '\n' + body;
}

function buildGrade(gr) {
  const g = GRADES[gr];
  const url = BASE + g.file;
  const other = GRADES[gr === 10 ? 11 : 10];
  const title = `Grade ${gr} Maths, Physical & Life Sciences Topics | Adventuity`;
  const desc = `Grade ${gr} Mathematics, Physical Sciences and Life Sciences (CAPS) topics by exam paper, with sections, exam-style questions and study time. Online tutors.`;
  const h1 = `Grade ${gr} Mathematics, Physical Sciences and Life Sciences – topics and study time`;
  const lead = g.nTopics
    ? `The Grade ${gr} topics in the Adventuity portal, grouped by subject and exam paper, with the study sections in each topic, the number of exam-style questions and how long each topic takes to study.`
    : `Grade ${gr} notes and exam-style questions are being added to the Adventuity portal. You can already book online lessons for Grade ${gr} Mathematics, Physical Sciences and Life Sciences.`;

  const courses = g.list.filter((s) => s.nTopics).map((s) => ({
    '@type': 'Course', '@id': url + '#' + s.key + '-course', name: `Grade ${gr} ${s.name} (CAPS)`,
    description: `Grade ${gr} ${s.name} topics by exam paper, with study sections, exam-style questions, study time and live online lessons.`,
    url: url + '#' + s.key, provider: provider(), educationalLevel: 'Grade ' + gr, inLanguage: 'en-ZA',
    teaches: s.papers.flatMap((p) => p.topics.map((t) => t.title)), hasCourseInstance: courseInstance(s.total), offers: hourOffer(s.fees[0]) }));
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
    { '@type': 'ListItem', position: 2, name: 'Grade ' + gr, item: url }] };

  const subjSec = (s) => {
    const id = s.key;
    const papers = s.nTopics ? s.papers.map((p) => `<div class="paper-sub">
<h3 class="ph" id="${id}-${p.key}"><span class="dot ${p.cls}"></span>${p.label}${p.sub ? ` <span class="muted">· ${p.sub}</span>` : ''}</h3>
${p.topics.length ? `${TT_HEAD}
${p.topics.map((t) => topicRow(t, 'h4')).join('\n')}
${paperTotal(p)}` : `<p class="card soon"><b>Grade ${gr} ${s.name} ${p.label} topics are coming soon.</b> You can already book a lesson on them.</p>`}
</div>`).join('\n')
      : `<p class="card soon"><b>Grade ${gr} ${s.name} topics are coming soon.</b> The notes and exam-style questions are being written – you can already book a Grade ${gr} ${s.name} lesson.</p>`;
    return `<section class="sec" id="${id}" aria-labelledby="${id}-h">
<div class="paper-head"><p class="eyebrow">Grade ${gr} · ${s.name}</p><h2 id="${id}-h">Grade ${gr} ${s.name}</h2>
${s.nTopics ? `<div class="meta">${s.papers.map((p) => `<span class="pill ${p.cls}">${p.sub || p.label}: ${p.topics.length} ${p.topics.length === 1 ? 'topic' : 'topics'}</span>`).join('')}<span class="pill">≈${NB}${dur(s.total)} of study</span></div>` : ''}</div>
${papers}
</section>`;
  };

  const body = `<body>
${topbar({ current: 'grades' })}
<main id="main" class="wrap page">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="./">Home</a></li><li><span aria-current="page">Grade ${gr}</span></li></ol></nav>
<nav class="gswitch" aria-label="Grades">${[10, 11].map((x) => `<a href="${GRADES[x].file}"${x === gr ? ' aria-current="page"' : ''}>Grade ${x}</a>`).join('')}<a href="./#subjects">Grade 12 (matric)</a></nav>
<section class="hero" aria-labelledby="h1">
<p class="eyebrow">Grade ${gr} · CAPS · School and provincial exams</p>
<h1 id="h1" style="margin-top:10px">${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${g.nTopics ? `<dl class="stats">
<div><dt>Topics</dt><dd>${g.nTopics}</dd></div>
<div><dt>Study sections</dt><dd>${g.nSec}</dd></div>
<div><dt>Exam-style questions</dt><dd>${g.nQ}</dd></div>
<div><dt>Total study time</dt><dd>≈${NB}${dur(g.total)}</dd></div>
</dl>` : ''}
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a Grade ${gr} lesson</a><a class="btn lg" href="${PORTAL}">Sign in</a></div>
<ul class="jump" aria-label="Subjects on this page">${g.list.map((s) => `<li><a href="#${s.key}"><span class="dot ${s.cls}"></span>${s.name} <span class="mono">${s.nTopics ? s.nTopics + (s.nTopics === 1 ? ' topic' : ' topics') : 'soon'}</span></a></li>`).join('')}</ul>
<div class="note">${svg(IC.cal)}<p><b>Your exams are set by your school or province.</b> Grade ${gr} learners write June and November exams${gr === 11 ? ' – the November papers are often common provincial papers' : ''}. There is no national Grade ${gr} timetable: your school gives you the dates and says which topics each paper covers.</p></div>
</section>
${g.list.map(subjSec).join('\n')}
${estSec(PACE_GRADES)}
<section class="sec band" aria-labelledby="cta">
<h2 id="cta">Stuck on a Grade ${gr} topic? Book a one-on-one lesson.</h2>
<p>From <span data-fee-from>${rand(minFee())}</span> per hour – 60, 90 or 120 minutes, online from anywhere in South Africa. You pay by EFT only after the tutor confirms your booking.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="./#fees">See all fees</a></div>
</section>
<section class="sec other"><p>Looking for another grade?</p><div class="cta-row" style="margin-top:0"><a class="btn long" href="${other.file}">${other.name} topics ${svg(IC.arrow)}</a><a class="btn long" href="./#subjects">Grade 12 (matric) subjects ${svg(IC.arrow)}</a></div></section>
</main>
${footer({ current: 'grades', live: true })}
${liveJs('')}
</body>
</html>
`;
  return head({ file: g.file, url, title, desc, css: CSS_BASE + CSS_SHARED + CSS_SUBJECT + CSS_GRADE, ld: [crumbs].concat(courses.length ? [{ '@context': 'https://schema.org', '@graph': courses }] : []) }) + '\n' + body;
}

/* ---------- topic pages ---------- */
// Hand-written, original public descriptions (general CAPS knowledge – NOT taken from the paid notes),
// short names for titles, and the question numbers where each topic is typically examined.
const INFO = {
  cubic: { s: 'Algebra & Cubic Polynomials', q: 'Question 1', extra: 'Cubic factorising turns up again when you sketch cubic graphs in calculus.',
    d: 'Paper 1 opens with algebra, and this topic gets you ready for it: quadratic equations solved by factorising or the formula, quadratic inequalities, the nature of roots, pairs of equations where a straight line meets a parabola, and equations with surds or exponents. The Grade 12 part is the cubic polynomial – using the factor theorem, and its partner the remainder theorem, to find a first factor, then dividing it out to factorise the cubic fully and solve cubic equations. You will use this algebra again in almost every other Paper 1 question, especially calculus.' },
  sequences: { s: 'Sequences and Series', q: 'Questions 2–3',
    d: 'Number patterns covers three kinds of sequence: quadratic patterns from Grade 11, whose second differences never change, arithmetic sequences that grow by adding the same amount, and geometric sequences that grow by multiplying by the same ratio. In Grade 12 you find general terms, write sums in sigma notation and add terms with the arithmetic and geometric series formulas – including the sum to infinity of a geometric series, which only exists when the ratio lies between −1 and 1. Exam questions often wrap these ideas in a word problem that asks which term, or how many terms, give a certain value.' },
  functions: { s: 'Functions & Inverses', q: 'Questions 4–5',
    d: 'This topic revises the Grade 11 graphs – straight lines, parabolas, hyperbolas and exponential graphs – which you sketch and then read for where they cut the axes, their highest or lowest points, their asymptotes and the values of x where one graph lies above another. The new Grade 12 idea is the inverse: finding the inverse of linear functions, of y = ax² on a restricted domain and of exponential functions, and recognising the logarithmic graph as the mirror image of the exponential graph in the line y = x. Domain and range, and deciding whether an inverse is itself a function, are regular exam items.' },
  finance: { s: 'Financial Maths', q: 'Question 6',
    d: 'Financial mathematics starts with growth and decay – simple and compound interest, and depreciation on a straight-line or a reducing-balance basis – and converting between nominal and effective interest rates. Grade 12 adds annuities: the future-value formula for savings plans and sinking funds, and the present-value formula for loans, home loans and regular withdrawals. You also work out outstanding balances, the size of a final payment and, with logarithms, how many payments a loan needs.' },
  calculus: { s: 'Differential Calculus', q: 'Questions 7–9',
    d: 'Calculus begins with limits and the derivative from first principles, then the shortcut rules of differentiation and the equation of a tangent to a curve. The centre of the topic is the cubic function: locating its turning points and where its concavity changes, deciding where the graph increases or decreases, sketching it, and reading information from the graph of its derivative. It finishes with rates of change and optimisation problems, where you find a maximum or minimum value in a real situation.' },
  counting: { s: 'Probability & Counting', q: 'Questions 10–11',
    d: 'This topic brings together Grade 11 probability – Venn diagrams, tree diagrams, contingency tables, and mutually exclusive, complementary and independent events – with the Grade 12 fundamental counting principle. You count arrangements of letters, digits or people when repeats are or are not allowed, using factorial notation and handling items that must stay together or apart, and then turn those counts into probabilities. Most of the difficulty lies in setting up the count, not in the arithmetic.' },
  stats: { s: 'Statistics & Regression', q: 'Questions 1–2',
    d: 'Statistics opens Paper 2 with data handling. For one set of data you work with the mean, the median and quartiles shown on a box plot, ogives, variance and standard deviation, and describe how the data is spread or skewed. For two variables you draw a scatter plot, let your calculator produce the line of best fit (by least squares) and the value of r, which measures how strong the link is, and judge how much you can trust a prediction read from the line.' },
  analytical: { s: 'Analytical Geometry', q: 'Questions 3–4',
    d: 'Analytical geometry puts shapes on the Cartesian plane and works with them through formulas: distance, midpoint, gradient, the inclination of a line, and parallel and perpendicular lines. The Grade 12 focus is the circle – its equation with the centre at the origin or anywhere else (completing the square to read off its centre and its radius), the tangent to a circle at a given point on it, and whether lines and circles intersect, touch or miss each other.' },
  trig: { s: 'Trigonometry', q: 'Questions 5–7',
    d: 'General trigonometry is the foundation of the Paper 2 trig questions: reduction formulae, negative angles, special angles worked out by hand, and proving identities. Grade 12 adds the formulae for sin, cos and tan of sums and doubles of angles, which you use to simplify expressions, find exact values and solve equations, as well as the general solution of trigonometric equations. Graphs of sine, cosine and tangent with a changed amplitude, period or horizontal shift round off the topic.' },
  trig3d: { s: '2D & 3D Trigonometry', q: 'one of Questions 5–7 (usually the last trigonometry question)',
    d: 'This topic applies the sine rule, cosine rule and area rule to triangles in two and three dimensions. A typical problem shows a sketch – a vertical tower seen from two points on the ground, or a figure with angles measured up or down from the horizontal – and asks for a length, height or angle. Many questions first ask you to prove a formula in terms of letters before you substitute numbers, so choosing the right triangle to start with is the key skill.' },
  euclid: { s: 'Euclidean Geometry', q: 'Questions 8–10',
    d: 'Euclidean geometry is the proof-based part of Paper 2. It revises the circle theorems from Grade 11 – angles at the centre and on the circumference, cyclic quadrilaterals and tangents – and adds the Grade 12 work on proportion and similarity: what happens when a line parallel to a side cuts across a triangle, areas of triangles with equal heights, similar triangles and Pythagoras proved by similarity. A proof only earns marks when each statement is backed by a valid reason, so writing clear proofs matters as much as knowing the theorems.' },
  newton: { s: "Newton's Laws", q: 'Question 2', mcq: true,
    d: "Newton's laws explains how forces change motion. You draw free-body diagrams, work with static and kinetic friction, and apply the first, second and third laws to objects on flat surfaces and slopes, to blocks joined by strings, to pulleys and to lifts. The topic also covers Newton's law of universal gravitation, which gives the attractive force between two masses and how it weakens with distance." },
  momentum: { s: 'Momentum & Impulse', q: 'Question 4', mcq: true,
    d: 'Momentum is mass times velocity, and this topic is about how it changes. You use the momentum form of the second law, calculate impulse as force multiplied by the time it acts, and explain safety features such as airbags and crumple zones by the longer contact time they create. Collisions and explosions are solved with the idea that total momentum stays the same when no outside force acts, and you decide if a collision was elastic by checking the kinetic energy before and after.' },
  projectiles: { s: 'Vertical Projectile Motion', q: 'Question 3', mcq: true,
    d: 'Vertical projectile motion deals with objects that move straight up or down under gravity alone – dropped, thrown upwards, thrown from a building or bouncing off the ground. You choose a sign convention, use the equations of motion with g = 9,8 m·s⁻² to find heights, speeds and times, and draw or interpret position-time, velocity-time and acceleration-time graphs of the whole motion. Problems where one ball is dropped and another is thrown a moment later test whether you can link the two motions.' },
  wep: { s: 'Work, Energy & Power', q: 'Question 5', mcq: true,
    d: 'This topic connects forces to energy. You find the work a single force does and the net work, use the net work to find how much an object’s kinetic energy, and so its speed, changes, and apply conservation of mechanical energy when only gravity does work – or the extended version when friction or an applied force is involved. It ends with power: the rate of doing work, average power, the power needed to keep an object moving at constant velocity, and efficiency.' },
  doppler: { s: 'Doppler Effect', q: 'Question 6', mcq: true,
    d: 'The Doppler effect explains why a siren sounds higher as it approaches and lower as it moves away. You use the Doppler equation for a moving source or a moving listener, explain the change in frequency with wavefront diagrams, and work backwards to find an unknown speed. The topic also covers uses in medicine, such as ultrasound measurement of blood flow, and the red shift of light from distant galaxies, which tells us the universe is getting bigger.' },
  electrostatics: { s: 'Electrostatics', q: 'Questions 7–8', mcq: true,
    d: "Electrostatics is about charges at rest. You apply the conservation and quantisation of charge when charged spheres touch and separate, use Coulomb's law for the force between point charges, and add the forces from several charges that lie in a straight line or form a right angle. The topic ends with electric fields: drawing field patterns and calculating how strong the field is at a chosen point due to one or more charges." },
  circuits: { s: 'Electric Circuits', q: 'Question 8 or 9', mcq: true,
    d: "Electric circuits builds on Ohm's law and the series and parallel combinations from Grade 11. In Grade 12 the battery has internal resistance, so you tell the emf apart from the voltage across the terminals and account for the volts lost inside the battery when a bigger current flows. Calculations of power, energy and the cost of running appliances are included, and a common exam question asks how meter readings change when a switch is opened or closed." },
  electrodynamics: { s: 'Electrodynamics', q: 'Question 9 or 10', mcq: true,
    d: 'Electrodynamics explains how generators and motors work. You use electromagnetic induction to explain how a coil rotating in a magnetic field produces an emf, compare AC and DC generators by how the coil connects to the outside circuit, and describe how a motor uses a current in a magnetic field to make a coil turn. Alternating current is handled with rms values for voltage and current and the average power delivered.' },
  photoelectric: { s: 'Photoelectric Effect', q: 'the last question (Question 10 or 11)', mcq: true,
    d: 'This topic shows why light must sometimes be treated as a stream of particles. In the photoelectric effect light energy arrives in photons with energy E = hf: you use the work function, threshold frequency and photoelectric equation to find how fast the ejected electrons can move, and explain why brighter light releases more electrons but not faster ones. It also covers line spectra – bright lines given off by hot gases and dark lines where light is absorbed – which come from electrons jumping between energy levels.' },
  'organic-structure': { s: 'Organic Molecules & Naming', q: 'Question 2', mcq: true,
    d: 'Organic chemistry starts with how carbon compounds are represented and named. You learn to spot the functional group that defines each homologous series in the syllabus – the hydrocarbons, the compounds that contain a halogen, and the oxygen-containing families such as the alcohols, the esters and the acids – draw the different kinds of formulae, and give IUPAC names to straight and branched molecules. Isomers – the same atoms joined in a different arrangement – complete the topic.' },
  'organic-props': { s: 'Organic Physical Properties', q: 'Question 3', mcq: true,
    d: 'This topic explains why organic compounds have different boiling points, melting points and vapour pressures. You link these properties to how strongly the molecules attract one another – London forces, dipole-dipole attraction or hydrogen bonding – and compare molecules by chain length, branching and functional group. Questions usually come from an experiment, with a table or graph of results to interpret and variables to identify.' },
  'organic-reactions': { s: 'Organic Reactions', q: 'Question 4', mcq: true,
    d: 'Organic reactions is about turning one type of organic compound into another. You classify and write equations for substitution, addition and elimination reactions – for example adding hydrogen, water or a hydrogen halide across a double bond, swapping a halogen for an –OH group, or removing water from an alcohol – and state the conditions each needs. Combustion, esterification and the cracking of long-chain alkanes are also covered, often in a flow diagram that links several reactions.' },
  rate: { s: 'Rates of Reaction', q: 'Question 5', mcq: true,
    d: 'Rate of reaction measures how quickly reactants are used up or products formed. You explain how the amount of reactant per volume, the temperature, the surface area and a catalyst each change the rate. Collision theory, Maxwell–Boltzmann energy distribution curves and potential energy diagrams with activation energy supply the reasons. Experimental questions ask you to read rates from graphs of volume or mass against time, and often include a stoichiometry calculation.' },
  equilibrium: { s: 'Chemical Equilibrium', q: 'Question 6', mcq: true,
    d: 'Chemical equilibrium deals with reversible reactions in a closed container, where both directions keep going at the same rate. You predict which way the system shifts when you add or remove a substance, change the pressure or heat it, interpret graphs that show how rates and concentrations change over time, and work out Kc from a table of starting and equilibrium amounts. The Haber process shows why factories settle for compromise conditions.' },
  acids: { s: 'Acids and Bases', q: 'Question 7', mcq: true,
    d: 'Acids and bases uses the Arrhenius and Lowry–Brønsted models, conjugate pairs and ampholytes (which can behave both ways), and the difference between strong and weak and between concentrated and dilute solutions. You calculate pH using Kw, predict through hydrolysis whether a dissolved salt gives an acidic or a basic solution, choose a suitable indicator for a titration, and do titration calculations such as finding a concentration or the purity of a sample.' },
  galvanic: { s: 'Galvanic Cells', q: 'Question 8', mcq: true,
    d: "This topic starts with redox – electron transfer, oxidation numbers and half-reactions – and then the galvanic cell, which uses a spontaneous reaction to produce a current. You label the anode, cathode and salt bridge, write the cell notation, and read the reduction potential table to decide whether a reaction will happen on its own and to work out the cell's emf at 25 °C with 1 mol·dm⁻³ solutions." },
  electrolytic: { s: 'Electrolytic Cells', q: 'Question 9', mcq: true,
    d: 'Electrolytic cells use an external power source to drive a reaction that would not happen on its own. You predict the products at each electrode and apply the ideas to industry: electroplating, refining impure copper, the chlor-alkali process that makes chlorine and sodium hydroxide, and how aluminium is won from its ore. Comparing electrolytic and galvanic cells is a regular part of the question.' },
  stoich: { s: 'Stoichiometry', full: 'It does not get its own question: in a typical paper its calculations sit inside Questions 5–9 of Physical Sciences Paper 2 (Chemistry).',
    d: 'Stoichiometry has no question of its own, but you need it for the calculations in the rate, equilibrium, acid-base and electrochemistry work. This revision topic sharpens the mole calculations those questions depend on: moles from mass, gas volume and concentration, limiting reagents, percentage yield and purity, and empirical formulae, so that the calculation steps in the rest of Paper 2 go smoothly.' },
};
const CTX = {}; // topic id -> { gr, key, s (subject in that grade), p (paper), g (grade page, Grades 10–11), list (file listing the topic) }
for (const s of Object.values(SUBJECTS)) for (const p of s.papers) for (const t of p.topics) CTX[t.id] = { gr: 12, key: s.key, s, p, g: null, list: s.file };
for (const g of Object.values(GRADES)) for (const s of g.list) for (const p of s.papers) for (const t of p.topics) CTX[t.id] = { gr: g.gr, key: s.key, s, p, g, list: g.file + '#' + s.key };
const PAGES = TOPICS.filter((t) => CTX[t.id]);   // every topic gets a page
for (const t of ALL) if (!INFO[t.id]) console.warn('note: no hand-written description for Grade 12 topic ' + t.id + ' (missing gr?) – using the generated one; add it to INFO');
for (const t of PAGES) {
  const i = INFO[t.id]; if (!i) continue;   // INFO is required for the Grade 12 Maths / Physical Sciences topics, optional for the others
  const n = i.d.split(/(?<=[.!?])\s+/).length; if (n < 2 || n > 4) throw new Error('INFO.' + t.id + ': description must be 2–4 sentences (has ' + n + ')');
}
// public description of a topic: hand-written in INFO, otherwise built from public fields only (title, grade, subject, paper, section titles)
function topicInfo(t) {
  if (INFO[t.id]) return INFO[t.id];
  const c = CTX[t.id], secs = t.sections.map((x) => x.title.replace(/[.;:]+$/, ''));
  const where = c.gr === 12 ? `${c.p.exam.name} of the NSC exams` : `${c.s.name} ${c.p.label}${c.p.sub ? ' (' + c.p.sub + ')' : ''} of the Grade ${c.gr} school and provincial exams`;
  return { s: t.title, auto: true,
    d: `${t.title} is a Grade ${c.gr} ${c.s.name} topic in the CAPS curriculum, examined in ${where}. You study it in ${secs.length} ${secs.length === 1 ? 'section' : 'sections'}: ${secs.join('; ')}.` };
}
const feeKey = (t) => t.subj;   // maths | phys | chem | life
const plainDur = (min) => dur(min).replace(/\u00a0/g, ' ');
function examinedIn(t) {
  const i = INFO[t.id], e = CTX[t.id].p.exam;
  if (!i || !e) return '';
  if (i.full) return i.full;
  return `In a typical paper you will find it in ${i.q} of ${e.name}${i.mcq ? ', with multiple-choice items in Question 1 as well' : ''}.` + (i.extra ? ' ' + i.extra : '');
}
function firstFit(list, max, what) { const v = list.find((x) => x.length <= max); if (!v) throw new Error(what + ': no variant fits ' + max + ' chars: ' + list[list.length - 1]); return v; }
// for topics without hand-written INFO: the first variant that fits and is not used by another page; a long title is shortened as a last resort
const USED = { title: new Set(), desc: new Set() };
function pickUnique(kind, list, max, short) {
  let v = list.find((x) => x.length <= max && !USED[kind].has(x));
  for (let n = max; !v && n > 20; n -= 5) { const x = short(n); if (x.length <= max && !USED[kind].has(x)) v = x; }
  if (!v) throw new Error('no unique ' + kind + ' fits: ' + list[0]);
  USED[kind].add(v); return v;
}
const clip = (x, n) => (x.length <= n ? x : x.slice(0, Math.max(1, n - 1)).replace(/[\s,;:–-]+\S*$/, '').replace(/(\s+(and|the|of|in|on|for|to|a|an|with|from|by))+$/i, '').replace(/[\s,;:–-]+$/, '') + '…');
function topicTitle(t) {
  const c = CTX[t.id], B = ' | Adventuity';
  if (INFO[t.id] && c.gr === 12) {
    const S = INFO[t.id].s, P = c.p.exam.short;
    return firstFit([`Grade 12 ${S} – ${P} revision & online tutor${B}`, `Grade 12 ${S} – ${P} revision & tutor${B}`, `Grade 12 ${S}: ${P} revision & tutor${B}`,
      `Grade 12 ${S} – ${P} revision${B}`, `Grade 12 ${S}: ${P} revision${B}`, `Grade 12 ${S} revision & tutor${B}`,
      `Grade 12 ${S} revision${B}`, `${S}: ${P} revision${B}`], 60, t.id + ' title');
  }
  const S = topicInfo(t).s, P = c.p.short, gr = c.gr;
  const forms = (x) => (gr === 12
    ? [`Grade 12 ${x} – ${P} revision & tutor${B}`, `Grade 12 ${x} – ${P} revision${B}`, `Grade 12 ${x} – ${c.s.short} revision${B}`, `Grade 12 ${x} revision${B}`, `Gr 12 ${x} – ${P}${B}`, `Gr 12 ${x}${B}`]
    : [`Grade ${gr} ${x} (${P}) – online tutor${B}`, `Grade ${gr} ${x} – ${P} online tutor${B}`, `Grade ${gr} ${x} – ${P}${B}`, `Grade ${gr} ${x} – ${c.s.short}${B}`, `Grade ${gr} ${x}${B}`, `Gr ${gr} ${x}${B}`]);
  // a long title "Topic: what it includes" can go by the part before the colon, if no other topic of that grade and subject starts the same
  const lead = (x) => x.split(':')[0].trim();
  const H = lead(S), sameHead = c.s.papers.some((pp) => pp.topics.some((o) => o !== t && lead(topicInfo(o).s) === H));
  const list = forms(S).concat(H !== S && H.length >= 4 && !sameHead ? forms(H) : []);
  return pickUnique('title', list, 60, (n) => `Gr ${gr} ${clip(S, n - 21 - P.length)} – ${P}${B}`);
}
function topicDesc(t) {
  const c = CTX[t.id], n = t.sections.length, h = plainDur(t.total);
  if (INFO[t.id] && c.gr === 12) {
    const S = INFO[t.id].s, P = c.p.exam.short;
    return firstFit([`Matric ${S} (${P}): what it covers, typical marks and question numbers, ${n} study sections and about ${h} of study. Book an online tutor.`,
      `Matric ${S} (${P}): what it covers, marks and question numbers, ${n} sections and about ${h} of study. Book an online tutor.`,
      `Matric ${S} (${P}): what it covers, how it is examined, ${n} sections and about ${h} of study. Online lessons.`,
      `Matric ${S} (${P}): what it covers, how it is examined and about ${h} of study.`], 155, t.id + ' description');
  }
  const S = topicInfo(t).s, P = c.p.short, gr = c.gr, q = t.nQ ? `, ${t.nQ} exam-style questions` : '';
  const who = gr === 12 ? 'Matric' : 'Grade ' + gr;
  return pickUnique('desc', [`${who} ${S} (${P}): what it covers, typical weighting, ${n} study sections${q} and about ${h} of study. Book an online tutor.`,
    `${who} ${S} (${P}): what it covers, ${n} study sections${q} and about ${h} of study. Book an online tutor.`,
    `${who} ${S} (${P}): what it covers, ${n} sections and about ${h} of study. Online lessons.`,
    `${who} ${S} (${P}): what it covers and about ${h} of study.`], 155, (m) => `${who} ${clip(S, m - 60)} (${P}): what it covers and about ${h} of study.`);
}
function relatedOf(t) { const list = CTX[t.id].p.topics; const i = list.indexOf(t); const out = []; for (let k = 1; k < list.length && out.length < 4; k++) out.push(list[(i + k) % list.length]); return out; }
const relCard = (t, pre) => `<li><a href="${pre}${t.id}.html"><b>${esc(t.title)}</b><span class="meta">${t.sections.length} sections · ${t.nQ} exam questions · ≈${NB}${dur(t.total)}</span></a></li>`;
const DAILY_JS = `<script>(function(){var el=document.querySelector('.daily[data-at]');if(!el)return;var t=Date.parse(el.getAttribute('data-at')),min=Number(el.getAttribute('data-min')),p=el.getAttribute('data-paper'),now=Date.now(),D=864e5,O=72e5;if(isNaN(t)||!min)return;
var days=Math.floor((t+O)/D)-Math.floor((now+O)/D);if(now>t+108e5){el.textContent=p+' was written on '+el.getAttribute('data-date')+'.';return}
if(days<=0){el.textContent=p+' is today at 09:00 – good luck!';return}
var m=Math.ceil(min/days/5)*5,x=m>=60?Math.floor(m/60)+'\\u00a0h\\u00a0'+('0'+m%60).slice(-2)+'\\u00a0min':m+'\\u00a0min';
el.textContent=days+(days===1?' day':' days')+' to '+p+' – about '+x+' a day for this topic.'})();</script>`;
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

const CSS_TOPIC = `
.two{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));margin-top:clamp(28px,5vw,44px)}
.two>.card{display:grid;gap:12px;align-content:start}
.card h2,.sec>h2{font-size:clamp(1.2rem,2.2vw,1.45rem)}
.sec>h2{margin-bottom:14px}
.covers p{font-size:1.02rem;max-width:70ch}
.kv div{display:grid;grid-template-columns:minmax(96px,30%) minmax(0,1fr);gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.kv div:last-child{border-bottom:0}
.kv dt{color:var(--ink-2);font-size:.9rem}
.st{width:100%;border-collapse:collapse;font-size:.95rem}
.st th,.st td{padding:9px 0;border-bottom:1px solid var(--line);text-align:left;font-weight:400;vertical-align:top}
.st td{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:12px}
.st tr.tot th,.st tr.tot td{font-weight:700;border-bottom:0;font-family:var(--display);font-size:1.05rem}
.st small{display:block;color:var(--ink-2);font-size:.82rem}
.daily{border-left:3px solid var(--accent);background:var(--accent-soft);padding:10px 14px;border-radius:0 var(--r-sm) var(--r-sm) 0;font-weight:500}
.ticks{list-style:none;padding:0;display:grid;gap:10px}
.ticks li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start}
.ticks svg{width:20px;height:20px;color:var(--good);margin-top:2px}
.portal-card{display:grid;gap:12px}
.portal-card .note{margin-top:0}
`;

function buildTopic(t) {
  const c = CTX[t.id];
  const { key, s, p, gr } = c;
  const nsc = gr === 12;   // Grade 12: NSC paper and date; Grades 10–11: school / provincial exams, no national date
  const i = topicInfo(t);
  const pre = '../';
  const file = 'topics/' + t.id + '.html';
  const url = BASE + file;
  const listUrl = BASE + c.list;
  const listName = `Grade ${gr} ${s.name}`;
  const e = p.exam;
  const fk = feeKey(t);
  const paperLong = p.sub ? `${p.sub}, ${p.label}` : p.label;
  const h1 = `${t.title} – ${listName} (${paperLong})`;
  const title = topicTitle(t), desc = topicDesc(t);
  const examLine = examinedIn(t);
  const rel = relatedOf(t);
  const weight = t.weight.replace(/[.\s]+$/, '');
  const pace = key === 'life' ? '1,2 minutes per mark' : 'exam pace of 1,2 minutes per mark';
  const studyAns = `<p>About ${dur(t.total)}: ${dur(t.notes)} for the notes and worked examples in its ${t.sections.length} sections, ${t.nQ ? `${dur(t.exam)} for the ${t.nQ} exam-style questions (${t.marks} marks) at ${pace}, ` : ''}and a ${QUIZ_MIN}-minute quiz.</p>`;
  const lessonAns = `<p>Yes. Create a free account in the Adventuity portal, request a one-on-one online lesson of 60, 90 or 120 minutes (or a seat in a group class) and choose ${esc(i.s)} as your topic. You pay by EFT only after the tutor confirms the booking.</p>`;
  const FAQ = nsc ? [
    [`How many marks is ${i.s} worth in the matric exam?`,
      `<p>In ${e.name} (${e.len}, 150 marks) the usual weighting is: ${esc(weight)}.${examLine ? ' ' + esc(examLine) : ''} The exact marks change a little from year to year.</p>`],
    [`How long does it take to study ${i.s}?`, studyAns],
    [`When is the ${e.name} exam in 2026?`,
      `<p>${e.name} is written on ${e.long} at 09:00 and lasts ${e.len} (150 marks), according to the DBE’s 2026 NSC timetable. Confirm the date with your school, because the DBE can amend the timetable.</p>`],
    [`Can I get online lessons for ${i.s}?`, lessonAns],
  ] : [
    [`How is ${i.s} examined in Grade ${gr}?`,
      `<p>Grade ${gr} learners write ${s.name} exams set by their school or province, in June and November. ${esc(i.s)} is part of ${s.name} ${paperLong}${weight ? `; the usual weighting is: ${esc(weight)}` : ''}. Your school’s exam guideline confirms which topics each exam covers.</p>`],
    [`How long does it take to study ${i.s}?`, studyAns],
    [`Can I get online lessons for Grade ${gr} ${i.s}?`, lessonAns],
  ];
  const course = {
    '@context': 'https://schema.org', '@type': 'Course', '@id': url + '#course',
    name: `${t.title} (${listName})`, description: i.d, url, provider: provider(),
    educationalLevel: 'Grade ' + gr, inLanguage: 'en-ZA', timeRequired: iso(t.total),
    teaches: t.sections.map((x) => x.title),
    isPartOf: { '@type': 'Course', '@id': nsc ? listUrl + '#course' : BASE + c.g.file + '#' + key + '-course', name: listName + ' (CAPS)', url: listUrl },
    hasCourseInstance: courseInstance(t.total), offers: hourOffer(fk),
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
    { '@type': 'ListItem', position: 2, name: listName, item: listUrl },
    { '@type': 'ListItem', position: 3, name: t.title, item: url }] };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) };

  const examCard = nsc ? `<dl class="kv">
<div><dt>Paper</dt><dd>${e.name} – <a href="${pre}${TT_FILE}">${e.long}, 09:00</a> (${e.len}, 150 marks)</dd></div>
<div><dt>Weighting</dt><dd>${esc(t.weight)}</dd></div>
${examLine ? `<div><dt>Questions</dt><dd>${esc(examLine)}</dd></div>\n` : ''}</dl>
<p class="small muted">${examLine ? 'Question numbers and mark splits are typical, not fixed' : 'Mark splits are typical, not fixed'} – they vary a little from year to year.</p>` : `<dl class="kv">
<div><dt>Paper</dt><dd>${listName} ${paperLong}</dd></div>
<div><dt>Exams</dt><dd>June and November school or provincial exams – your school sets the papers and the dates</dd></div>
${weight ? `<div><dt>Weighting</dt><dd>${esc(t.weight)}</dd></div>\n` : ''}</dl>
<p class="small muted">There is no national Grade ${gr} exam. Your school’s exam guideline says which topics each paper covers.</p>`;
  const ticks = [
    t.nQ ? `${t.nQ} exam-style questions on ${esc(i.s)} (${t.marks} marks in total), each with a full marking memo` : '',
    key === 'life' ? `Worked exam-style answers, point by point, with labelled diagrams for each of the ${t.sections.length} sections` : `Worked examples with diagrams and step-by-step calculations for each of the ${t.sections.length} sections`,
    'Tutor notes added to sections and questions – for the whole class or just for you',
    nsc ? `A topic quiz, mock papers and a study plan that counts down to ${e.name}` : `A topic quiz and Grade ${gr} mock papers built from the exam-style questions`,
  ].filter(Boolean);

  const body = `<body>
${topbar({ current: 'topic', pre })}
<main id="main" class="wrap page">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="${pre}">Home</a></li><li><a href="${pre}${c.list}">${listName}</a></li><li><span aria-current="page">${esc(t.title)}</span></li></ol></nav>
<section class="hero" aria-labelledby="h1">
<p class="eyebrow">Grade ${gr} · ${s.name} · ${esc(paperLong)} · CAPS</p>
<h1 id="h1" style="margin-top:10px">${esc(h1)}</h1>
<p class="lead">What ${esc(i.s)} covers, how it is examined in ${nsc ? e.name : 'Grade ' + gr}, the ${t.sections.length} sections to study and how long it takes – plus live online lessons when you get stuck.</p>
<dl class="stats">
<div><dt>Study sections</dt><dd>${t.sections.length}</dd></div>
<div><dt>Exam-style questions</dt><dd>${t.nQ}</dd></div>
<div><dt>Marks of practice</dt><dd>${t.marks}</dd></div>
<div><dt>Study time</dt><dd>≈${NB}${dur(t.total)}</dd></div>
</dl>
<div class="cta-row"><a class="btn primary lg long" href="${pre}${SIGNUP}">Book a lesson on ${esc(i.s)}</a><a class="btn lg" href="${pre}${PORTAL}">Sign in</a></div>
</section>
<div class="two">
<section class="card covers" aria-labelledby="covers"><h2 id="covers">What it covers</h2><p>${esc(i.d)}</p></section>
<section class="card" aria-labelledby="exam"><h2 id="exam">How it is examined</h2>
${examCard}</section>
</div>
<div class="two">
<section class="card" aria-labelledby="sections"><h2 id="sections">Sections to study</h2>
<ol class="sec-list">${t.sections.map((x) => `<li><span>${esc(x.title)}</span><span class="mono">${x.est}${NB}min</span></li>`).join('')}</ol></section>
<section class="card" aria-labelledby="time"><h2 id="time">Study time</h2>
<table class="st"><tbody>
<tr><th scope="row">Notes and worked examples<small>${t.sections.length} sections</small></th><td>${dur(t.notes)}</td></tr>
${t.nQ ? `<tr><th scope="row">Exam-style questions<small>${t.nQ} questions · ${t.marks} marks × 1,2${NB}min per mark</small></th><td>${dur(t.exam)}</td></tr>\n` : ''}<tr><th scope="row">Topic quiz</th><td>${QUIZ_MIN}${NB}min</td></tr>
<tr class="tot"><th scope="row">Total</th><td>≈${NB}${dur(t.total)}</td></tr>
</tbody></table>
${nsc ? `<p class="daily" data-at="${e.at}" data-min="${t.total}" data-paper="${esc(e.name)}" data-date="${e.long}">${e.name} is written on ${e.long} at 09:00.</p>`
    : `<p class="daily">Grade ${gr} exams are set by your school or province – plan back from the date your school gives you.</p>`}</section>
</div>
<section class="sec card portal-card" aria-labelledby="portal"><h2 id="portal">What you get in the portal</h2>
<ul class="ticks">
${ticks.map((x) => `<li>${svg(CHECK)}<span>${x}</span></li>`).join('\n')}
</ul>
<div class="note">${svg(IC.lock)}<p>Notes, worked examples, questions and memos open once the tutor approves your account – usually with your first confirmed lesson.</p></div>
</section>
<section class="sec band" aria-labelledby="cta">
<h2 id="cta">Stuck on ${esc(i.s)}? Book a one-on-one lesson.</h2>
<p><span data-fee="${fk}">${rand(FEES[fk])}</span> per hour – 60, 90 or 120 minutes, online from anywhere in South Africa. Pick ${esc(i.s)} as your topic; you pay by EFT only after the tutor confirms.</p>
<div class="cta-row"><a class="btn primary lg long" href="${pre}${SIGNUP}">Book a lesson on ${esc(i.s)}</a><a class="btn lg" href="${pre}${PORTAL}">Sign in</a></div>
</section>
<section class="sec" aria-labelledby="related"><h2 id="related">${rel.length ? `Related ${nsc ? e.short : 'Grade ' + gr + ' ' + p.short} topics` : `More ${listName} topics`}</h2>
${rel.length ? `<ul class="rel">${rel.map((r) => relCard(r, '')).join('')}</ul>\n` : ''}<p style="margin-top:14px"><a href="${pre}${c.list}">All ${listName} topics, ${nsc ? 'weighting and study time' : 'with study time'}</a></p></section>
<section class="sec" aria-labelledby="faq-h"><h2 id="faq-h">Questions about ${esc(i.s)}</h2>
<div class="faq">${FAQ.map(([q, a]) => `<details><summary><h3>${esc(q)}</h3>${svg(IC.chev, 'chev')}</summary><div class="ans">${a}</div></details>`).join('\n')}</div></section>
</main>
${footer({ current: 'topic', pre, live: true })}
${nsc ? DAILY_JS + '\n' : ''}${liveJs(pre)}
</body>
</html>
`;
  return head({ file, url, pre, title, desc, css: CSS_BASE + CSS_SHARED + CSS_SUBJECT + CSS_TOPIC, ld: [crumbs, course, faqLd] }) + '\n' + body;
}

/* ---------- exam timetable page ---------- */
const TT = {
  start: 'Tuesday 13 October 2026', end: 'Thursday 26 November 2026',
  source: 'https://fundiconnect.co.za/2026-matric-exam-dates',
  dbe: 'https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations/NSCPastExaminationpapers.aspx',
};
const TT_JS = `<script>(function(){var now=Date.now(),D=864e5,O=72e5,cum=0,need=0,ok=false;
function H(h){return(Math.round(h*10)/10).toFixed(1).replace('.',',')+'\\u00a0h'}
[].forEach.call(document.querySelectorAll('.cdc[data-at]'),function(el){var t=Date.parse(el.getAttribute('data-at')),min=Number(el.getAttribute('data-min'));if(isNaN(t))return;
var days=Math.floor((t+O)/D)-Math.floor((now+O)/D),big=el.querySelector('.big'),per=el.querySelector('.per');
if(now>t+108e5){el.classList.add('past');big.textContent='Written';per.textContent='This paper has been written.';return}
if(days<=0){big.textContent='Today';per.textContent='Good luck – read every question carefully.';return}
big.innerHTML=days+'<small>'+(days===1?'day to go':'days to go')+'</small>';
if(!ok)el.classList.add('next');ok=true;
if(!min){per.textContent='Study hours follow when the topics are published.';return}
per.textContent='About '+H(min/60/days)+' a day from today covers this paper.';
cum+=min;need=Math.max(need,cum/60/days)});
var all=document.getElementById('all-papers');if(all&&need>0)all.textContent='Writing all of these papers? About '+H(need)+' a day, starting today, gets every remaining paper covered in time.'})();</script>`;

const CSS_TT = `
.tt-wrap{padding:0;overflow:hidden}
.tt{width:100%;border-collapse:collapse;font-size:.95rem}
.tt th,.tt td{padding:12px 16px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.tt thead th{font-family:var(--mono);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);font-weight:500;background:var(--surface-2)}
.tt tbody tr:last-child>*{border-bottom:0}
.tt tbody th{font-weight:600}
.tt small{display:block;color:var(--ink-2);font-size:.82rem;font-weight:400;margin-top:2px}
@media (max-width:520px){.tt th,.tt td{padding:10px 10px}.tt{font-size:.9rem}}
.src{font-size:.88rem;color:var(--ink-2);margin-top:12px;max-width:80ch}
.cdg{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));list-style:none;padding:0}
.cdc{display:grid;gap:6px;align-content:start}
.cdc .subj{display:flex;align-items:center;gap:7px;font-weight:600}
.cdc .big{font-family:var(--mono);font-size:1.9rem;font-weight:500;line-height:1.1;font-variant-numeric:tabular-nums}
.cdc .big small{font-size:.82rem;color:var(--ink-2);font-family:var(--body);margin-left:6px}
.cdc .per{font-size:.9rem;color:var(--ink-2)}
.cdc.next{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.cdc.past{opacity:.6}
.all{margin-top:14px;font-weight:600}
.tips{list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));counter-reset:tp}
.tips li{counter-increment:tp;display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;align-items:start}
.tips li::before{content:counter(tp);width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-family:var(--mono);font-weight:600;font-size:.88rem}
.tips h3{margin-bottom:4px}
.tips p{color:var(--ink-2);font-size:.94rem}
.paper-links{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))}
.paper-links ul{list-style:none;padding:0;display:grid;gap:2px;margin-top:8px}
.paper-links li a{display:inline-block;padding:7px 0;line-height:1.35}
`;

function buildTimetable() {
  const url = BASE + TT_FILE;
  const papers = SUBJ_ORDER.flatMap((k) => SUBJECTS[k].papers.map((p) => ({ p, s: SUBJECTS[k] }))).sort((a, b) => (a.p.exam.date < b.p.exam.date ? -1 : 1));
  const sameDay = { mp1: 'Same day: Mathematical Literacy Paper 1', mp2: 'Same day: Mathematical Literacy Paper 2' };
  const exKey = (e) => Object.keys(EXAMS).find((k) => EXAMS[k] === e);
  const title = 'Matric Exam Timetable 2026: Maths, Physical & Life Sciences';
  const h1 = 'Matric exam timetable 2026: Maths, Physical Sciences and Life Sciences';
  const desc = 'NSC 2026 exam dates for Mathematics, Physical Sciences and Life Sciences Paper 1 and 2, with a live countdown, study hours per paper and last-week tips.';
  const tips = [
    ['Write full papers under exam conditions', 'Sit a whole past paper in one go, with no notes and no phone: 150 marks in 3 hours for Mathematics and Physical Sciences, in 2½ hours for Life Sciences. That is 1,2 minutes per mark (1 minute in Life Sciences), so a 10-mark question deserves about 12 minutes – practise moving on when you go over.'],
    ['Mark yourself with the official memo', 'Mark strictly, the way an examiner would, and keep an error list. Two days later, redo every question where you lost marks without looking at the memo.'],
    ['Spend most time where the marks are', 'Trigonometry is worth roughly 50 marks out of 150 in Mathematics Paper 2, and mechanics roughly 65 in Physics. Revise the heavy topics first, but do not skip a whole question.'],
    ['Know your formula and data sheets', 'Learn exactly which formulae and constants are given in the exam and which you must remember, and what every symbol stands for, so you do not waste time searching.'],
    ['Show every step', 'Start with the formula, put in the values and give the answer with its unit – method marks add up even if the final answer is wrong. In Euclidean geometry, back each statement with a reason.'],
    ['Plan the paper on the day', 'Read the whole paper first, start with a question you are sure of, number your answers exactly as in the paper and never leave a blank – an attempt can still earn marks.'],
    ['Check your calculator', 'Use an approved non-programmable calculator with a fresh battery, and make sure it is set to degrees before any trigonometry.'],
    ['Answer Life Sciences the way it is marked', 'Use the exact biological terms, give as many points as the marks ask for, and draw graphs with a heading, labelled axes with units and an even scale. Write the essay in full sentences – tables, flow charts and diagrams earn no marks there.'],
    ['Make the day before a light one', 'Go over your summaries and error list instead of starting new work. Pack your admission letter, ID, pens, pencil, ruler and calculator, and get a full night’s sleep.'],
  ];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article', '@id': url + '#article', headline: h1, description: desc, url, mainEntityOfPage: url,
    image: BASE + 'og.png', inLanguage: 'en-ZA', datePublished: '2026-10-11', dateModified: TODAY,
    author: { '@type': 'Organization', name: BRAND, url: BASE },
    publisher: { '@type': 'Organization', name: BRAND, legalName: LEGAL, url: BASE, logo: { '@type': 'ImageObject', url: BASE + 'icons/icon-512.png' } },
    about: ['National Senior Certificate examinations 2026', 'Grade 12 Mathematics', 'Grade 12 Physical Sciences', 'Grade 12 Life Sciences'],
    citation: TT.source,
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE }, { '@type': 'ListItem', position: 2, name: 'Matric exam timetable 2026', item: url }] };

  const body = `<body>
${topbar({ current: 'timetable' })}
<main id="main" class="wrap page">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="./">Home</a></li><li><span aria-current="page">Matric exam timetable 2026</span></li></ol></nav>
<section class="hero" aria-labelledby="h1">
<p class="eyebrow">NSC · October–November 2026</p>
<h1 id="h1" style="margin-top:10px">${h1}</h1>
<p class="lead">The 2026 NSC exams run from ${TT.start} to ${TT.end}. These are the Mathematics, Physical Sciences and Life Sciences papers – each starts at 09:00 and lasts 3 hours (Life Sciences 2½ hours) – with a live countdown and the study time each paper needs.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="#countdown">Countdown and study hours</a></div>
</section>

<section class="sec" aria-labelledby="dates"><h2 id="dates" style="margin-bottom:14px">Exam dates</h2>
<div class="card tt-wrap"><table class="tt">
<thead><tr><th scope="col">Paper</th><th scope="col">Date and time</th></tr></thead>
<tbody>${papers.map(({ p }) => { const e = p.exam; const k = exKey(e); return `<tr><th scope="row">${e.name}${sameDay[k] ? `<small>${sameDay[k]}</small>` : ''}</th><td>${e.long}<small>09:00 · ${e.len} · 150 marks</small></td></tr>`; }).join('')}</tbody>
</table></div>
<p class="src">Dates from the DBE’s 2026 NSC timetable – confirm with your school, the DBE can amend it. Source: <a href="${TT.source}" rel="noopener">FundiConnect – 2026 matric exam dates</a>.</p>
<p class="src">Grade 10 and 11 exams are set by schools and provinces, so they are not on this timetable – see the <a href="${GRADES[10].file}">Grade 10</a> and <a href="${GRADES[11].file}">Grade 11</a> topics and study time.</p>
</section>

<section class="sec" id="countdown" aria-labelledby="cd-h"><h2 id="cd-h" style="margin-bottom:6px">Countdown and study hours per paper</h2>
<p class="muted" style="margin-bottom:16px;max-width:75ch">Study time is the total for every topic in the paper: notes and worked examples, every exam-style question at exam pace (1,2 minutes per mark) and a 10-minute quiz per topic.</p>
<ul class="cdg">${papers.map(({ p }) => { const e = p.exam; return `<li class="card cdc" data-at="${e.at}" data-min="${p.total}"><span class="subj"><span class="dot ${e.subj}"></span>${e.short}</span><span class="big">${e.dm}</span><span class="small muted">${e.wd} ${e.dm} · 09:00</span>${p.topics.length ? `<span><b>≈${NB}${dur(p.total)}</b> of study · ${pl(p.topics.length, 'topic')}</span><span class="per">${p.nQ} exam-style questions (${p.marks} marks) in the portal.</span>` : '<span>Topics coming soon</span><span class="per">Study hours follow when the topics are published.</span>'}</li>`; }).join('')}</ul>
<p class="all" id="all-papers">All ${papers.length} papers together: ≈${NB}${dur(sum(papers, (x) => x.p.total))} of study.</p>
<p class="small muted" style="margin-top:6px;max-width:75ch">These figures assume you start every topic from scratch. If you have already covered some topics, you need less – a tutor can help you choose what to focus on.</p>
</section>

<section class="sec" aria-labelledby="tips-h"><h2 id="tips-h" style="margin-bottom:16px">What to do in the last two weeks</h2>
<ol class="tips">${tips.map(([h, p]) => `<li class="card"><div><h3>${h}</h3><p>${p}</p></div></li>`).join('')}</ol>
<div class="note">${svg(IC.book)}<p><b>Past papers.</b> Download previous NSC question papers and memos from the <a href="${TT.dbe}" rel="noopener">Department of Basic Education past papers page</a>.</p></div>
</section>

<section class="sec" aria-labelledby="topics-h"><h2 id="topics-h" style="margin-bottom:16px">Topics in each paper</h2>
<div class="paper-links">${papers.map(({ p }) => `<div class="card"><p class="eyebrow">${p.exam.short} · ${p.exam.wd} ${p.exam.dm}</p>${p.topics.length ? `<ul>${p.topics.map((t) => `<li><a href="topics/${t.id}.html">${esc(t.title)}</a></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:8px">Topics coming soon.</p>'}</div>`).join('')}</div>
</section>

<section class="sec band" aria-labelledby="cta">
<h2 id="cta">Want help with the papers still ahead?</h2>
<p>Book a one-on-one online lesson on the topics that worry you – 60, 90 or 120 minutes, from <span data-fee-from>${rand(minFee())}</span> per hour. You pay by EFT only after the tutor confirms.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="maths.html">Maths topics</a><a class="btn lg" href="physical-sciences.html">Physical Sciences topics</a><a class="btn lg" href="life-sciences.html">Life Sciences topics</a></div>
</section>
</main>
${footer({ current: 'timetable', live: true })}
${TT_JS}
${liveJs('')}
</body>
</html>
`;
  return head({ file: TT_FILE, url, title, desc, css: CSS_BASE + CSS_SHARED + CSS_SUBJECT + CSS_TT, ld: [article, crumbs] }) + '\n' + body;
}

/* ---------- tutor-apply.html (Become a tutor) ---------- */
const TUTOR_FILE = 'tutor-apply.html';
const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
const TUTOR = {
  lead: 'Adventuity runs live online lessons for Grade 10–12 learners across South Africa, with a focus on matric. We are looking for tutors who can explain Mathematics, Physical Sciences or Life Sciences clearly, one-on-one or in small groups.',
  who: 'Tutors who know CAPS Mathematics, Physical Sciences (Physics, Chemistry) or Life Sciences well – for Grade 12 (NSC) and also for Grades 10 and 11. If you teach another subject, tell us in your application.',
  work: 'Lessons are online – video, screen share and a whiteboard – one-on-one or in small groups. Afternoons and Saturdays are when learners book most. We discuss rates and hours at the interview.',
  need: ['A qualification or studies in a related field', 'A laptop and a stable internet connection', 'Clear explanations that a learner can follow step by step'],
  steps: [['Apply with your CV', 'Fill in the form below and upload your CV.'],
    ['We review your application', 'Adventuity’s tutor reviews it, usually within a week.'],
    ['Interview and demo lesson', 'A short online interview and a 10-minute demo lesson.'],
    ['Start teaching', 'We agree on rates and hours, and you start teaching learners online.']],
  popia: 'We use your details and CV only to consider you as a tutor for Adventuity. Only Adventuity’s tutor can see them; they’re stored securely and deleted after 12 months, or sooner if you ask – reply to the confirmation e-mail.',
  consent: 'I agree that Adventuity may store and use my details and CV for this application.',
};
const SUBJECT_OPTS = [['maths', 'Mathematics'], ['phys', 'Physical Sciences – Physics'], ['chem', 'Physical Sciences – Chemistry'], ['lifesci', 'Life Sciences'], ['other', 'Other']];
const MODE_OPTS = [['online', 'Online'], ['in_person', 'In person'], ['both', 'Both']];

const CSS_FORM = `
.steps{list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));counter-reset:st}
.steps li{counter-increment:st;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px;align-content:start}
.steps li::before{content:counter(st);width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-family:var(--mono);font-weight:600;font-size:.9rem;margin-bottom:4px}
.steps p,.three p{color:var(--ink-2);font-size:.95rem}
.three{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}
.three>.card{display:grid;gap:10px;align-content:start}
.apply{max-width:860px}
.form{display:grid;gap:26px}
.form fieldset{border:0;padding:0;margin:0;display:grid;gap:14px;min-width:0}
.form legend{font-family:var(--display);font-weight:700;font-size:1.12rem;padding:0;margin-bottom:4px}
.fgrid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))}
.field{display:grid;gap:6px;min-width:0;align-content:start}
.field>label,.group>legend.lbl{font-weight:600;font-size:.93rem;font-family:var(--body)}
.group{border:0;padding:0;margin:0;display:grid;gap:8px;min-width:0}
.req{color:var(--bad);font-weight:700}
.opt{color:var(--ink-2);font-weight:400;font-size:.85rem}
.hint{font-size:.84rem;color:var(--ink-2)}
.form input[type=text],.form input[type=email],.form input[type=tel],.form input[type=number],.form select,.form textarea{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px;min-height:46px;width:100%;min-width:0}
.form textarea{min-height:160px;resize:vertical;line-height:1.5}
.form input:focus-visible,.form select:focus-visible,.form textarea:focus-visible{outline:3px solid var(--focus);outline-offset:1px;border-color:var(--accent)}
.form [aria-invalid="true"]{border-color:var(--bad)!important}
.form input[type=file]{font:inherit;color:var(--ink);width:100%;min-width:0;padding:12px;border:1px dashed var(--line);border-radius:var(--r-sm);background:var(--surface-2)}
.form input[type=file]::file-selector-button{font:inherit;font-weight:600;margin-right:12px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
.err{color:var(--bad);font-size:.86rem;font-weight:600}
.checks{display:flex;flex-wrap:wrap;gap:8px}
.check{display:inline-flex;align-items:center;gap:9px;min-height:44px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surface);cursor:pointer;font-size:.93rem}
.check input{width:18px;height:18px;margin:0;flex:none;accent-color:var(--accent)}
.check:has(input:checked){border-color:var(--accent);background:var(--accent-soft)}
.check:has(input:focus-visible){outline:3px solid var(--focus);outline-offset:2px}
.group[aria-invalid="true"] .check,.group.bad .check{border-color:var(--bad)}
.counter{font-size:.82rem;color:var(--ink-2);justify-self:end;font-variant-numeric:tabular-nums}
.counter.over{color:var(--bad);font-weight:600}
.popia{font-size:.92rem;padding:12px 14px;border-radius:var(--r-sm);background:var(--surface-2);border-left:3px solid var(--accent)}
.consent{display:flex;gap:12px;align-items:flex-start;min-height:44px;cursor:pointer;font-weight:500}
.consent input{width:22px;height:22px;margin:1px 0 0;flex:none;accent-color:var(--accent)}
.alert{padding:12px 14px;border-radius:var(--r-sm);background:var(--bad-soft);color:var(--bad);border:1px solid var(--bad);font-weight:600}
.alert.info{background:var(--warn-soft);color:var(--warn);border-color:var(--warn)}
.submit-row{display:grid;gap:12px}
.submit-row .btn{justify-self:start}
@media (max-width:520px){.submit-row .btn{justify-self:stretch}}
.btn:disabled{opacity:.6;cursor:not-allowed;filter:none}
.hp{position:absolute!important;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
.done{display:grid;gap:10px;border-color:var(--good);box-shadow:inset 4px 0 0 var(--good)}
.done:focus{outline:none}
`;

const TUTOR_JS = `<script>(function(){var f=document.getElementById('apply-form');if(!f)return;
var C=window.ADV_CONFIG||{},E=f.elements,btn=f.querySelector('button[type=submit]'),al=document.getElementById('form-alert'),MAX=5*1024*1024,EXT=/\\.(pdf|docx?)$/i,
TYPES=['','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],tried=false;
E.started_at.value=String(Date.now());
var ta=E.about,cnt=document.getElementById('about-count');function upd(){var n=ta.value.length;cnt.textContent=n+' / 1500';cnt.classList.toggle('over',n>1500)}ta.addEventListener('input',upd);upd();
var url=C.supabaseUrl?String(C.supabaseUrl).replace(/\\/+$/,'')+'/functions/v1/tutor-apply':'';
function say(t,info){al.textContent=t||'';al.className='alert'+(info?' info':'');al.hidden=!t}
if(!url||!C.supabaseKey){btn.disabled=true;say('Applications open soon – please try again later.',true);return}
function mark(n,msg){var e=document.getElementById('err-'+n);if(e){e.textContent=msg||'';e.hidden=!msg}var g=document.getElementById('g-'+n);
 if(g){g.classList.toggle('bad',!!msg)}else{[].forEach.call(f.querySelectorAll('[name="'+n+'"]'),function(el){if(msg)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid')})}}
function val(n){return String(E[n].value||'').trim()}
function check(){var bad=[];function need(n,ok,msg){mark(n,ok?'':msg);if(!ok)bad.push(n)}
 need('full_name',val('full_name').length>=2,'Enter your full name.');
 need('email',/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(val('email')),'Enter a valid e-mail address.');
 need('phone',val('phone').replace(/\\D/g,'').length>=9,'Enter your WhatsApp number.');
 need('subjects',f.querySelectorAll('input[name="subjects"]:checked').length>0,'Choose at least one subject.');
 need('qualification',val('qualification').length>=2,'Enter your qualification, or what you are studying.');
 var y=val('experience_years');need('experience_years',y===''||(/^\\d{1,2}$/.test(y)&&Number(y)<=50),'Enter a whole number from 0 to 50.');
 need('about',ta.value.length<=1500,'Keep this to 1500 characters or fewer.');
 var x=E.cv.files&&E.cv.files[0];
 need('cv',!!x&&EXT.test(x.name)&&TYPES.indexOf(x.type)>=0&&x.size>0&&x.size<=MAX,!x?'Attach your CV.':(!EXT.test(x.name)||TYPES.indexOf(x.type)<0)?'Your CV must be a PDF or Word file (.pdf, .doc or .docx).':x.size>MAX?'Your CV is larger than 5 MB – please attach a smaller file.':'This file is empty – please attach your CV again.');
 need('consent',E.consent.checked,'Tick the box to agree, so that we can process your application.');
 return bad}
function recheck(){if(tried){var b=check();if(!b.length&&/highlighted/.test(al.textContent))say('')}}
f.addEventListener('input',recheck);f.addEventListener('change',recheck);
function done(ref,email){var c=document.createElement('div');c.className='card done';c.setAttribute('role','status');c.tabIndex=-1;
 var h=document.createElement('h2');h.textContent='Thank you – application '+(ref||'')+' received.';
 var p=document.createElement('p');p.textContent='We’ll e-mail you within a week. A confirmation e-mail is on its way to '+email+' – if it does not arrive, check your spam folder.';
 c.appendChild(h);c.appendChild(p);var box=f.parentNode;box.parentNode.replaceChild(c,box);c.focus()}
f.addEventListener('submit',function(e){e.preventDefault();if(btn.disabled)return;tried=true;var bad=check();
 if(bad.length){say('Please check the highlighted fields.');var g=document.getElementById('g-'+bad[0]),el=g?g.querySelector('input'):f.querySelector('[name="'+bad[0]+'"]');if(el)el.focus();return}
 say('');btn.disabled=true;var label=btn.textContent;btn.textContent='Sending…';var email=val('email');
 fetch(url,{method:'POST',headers:{apikey:C.supabaseKey},body:new FormData(f)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){
  if(r.ok&&j&&j.ok){done(j.ref,email);return}
  throw new Error(j&&j.error?String(j.error):'Sorry, something went wrong (error '+r.status+'). Please try again.')})
 }).catch(function(err){say(err instanceof TypeError?'Could not send your application – check your internet connection and try again.':err.message);btn.disabled=false;btn.textContent=label})})})();</script>`;

function buildTutor() {
  const url = BASE + TUTOR_FILE;
  const title = 'Tutor jobs: Maths, Physical & Life Sciences | Adventuity';
  const desc = 'Tutor Grade 10–12 Maths, Physical Sciences or Life Sciences online with Adventuity: one-on-one and small-group lessons across South Africa. Apply now.';
  const h1 = 'Become a tutor: teach Maths, Physical Sciences or Life Sciences online';
  const REQ = ' <span class="req" aria-hidden="true">*</span>';
  const OPT = ' <span class="opt">(optional)</span>';
  const fld = (name, label, input, o = {}) => `<div class="field" id="f-${name}"><label for="in-${name}">${label}${o.req ? REQ : o.opt ? OPT : ''}</label>${o.hint ? `<p class="hint" id="hint-${name}">${o.hint}</p>` : ''}${input}<p class="err" id="err-${name}" hidden></p>${o.after || ''}</div>`;
  const desc2 = (name, o) => [o.hint ? 'hint-' + name : '', 'err-' + name].filter(Boolean).join(' ');
  const inp = (name, type, o = {}) => `<input id="in-${name}" name="${name}" type="${type}"${o.req ? ' required' : ''}${o.ac ? ` autocomplete="${o.ac}"` : ''}${o.max ? ` maxlength="${o.max}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.extra || ''} aria-describedby="${desc2(name, o)}">`;
  const group = (name, legend, type, opts, o = {}) => `<fieldset class="group" id="g-${name}" aria-describedby="err-${name}${o.hint ? ' hint-' + name : ''}"><legend class="lbl">${legend}${o.req ? REQ : ''}</legend>${o.hint ? `<p class="hint" id="hint-${name}">${o.hint}</p>` : ''}<div class="checks">${opts.map(([v, l], i) => `<label class="check"><input type="${type}" name="${name}" value="${v}"${o.checked === v ? ' checked' : ''}>${l}</label>`).join('')}</div><p class="err" id="err-${name}" hidden></p></fieldset>`;

  const descHtml = `<p>${esc(TUTOR.lead)}</p><p><b>Who we’re looking for:</b> ${esc(TUTOR.who)}</p><p><b>The work:</b> ${esc(TUTOR.work)}</p><p><b>What you need:</b></p><ul>${TUTOR.need.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p><b>How it works:</b></p><ol>${TUTOR.steps.map(([h, p]) => `<li>${esc(h)}: ${esc(p)}</li>`).join('')}</ol>`;
  const job = {
    '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Online Mathematics, Physical Sciences and Life Sciences Tutor (Grades 10–12)',
    description: descHtml, datePosted: '2026-10-12', validThrough: '2027-03-31T23:59:00+02:00', employmentType: ['PART_TIME', 'CONTRACTOR'],
    hiringOrganization: { '@type': 'Organization', name: BRAND, sameAs: BASE, logo: BASE + 'icons/icon-512.png' },
    jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'South Africa' }, directApply: true, url,
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE }, { '@type': 'ListItem', position: 2, name: 'Teach with us', item: url }] };

  const body = `<body>
${topbar({ current: 'tutor' })}
<main id="main" class="wrap page">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="./">Home</a></li><li><span aria-current="page">Teach with us</span></li></ol></nav>
<section class="hero" aria-labelledby="h1">
<p class="eyebrow">Tutor jobs · Online · South Africa</p>
<h1 id="h1" style="margin-top:10px">${h1}</h1>
<p class="lead">${esc(TUTOR.lead)}</p>
<div class="cta-row"><a class="btn primary lg" href="#apply">Apply now</a><a class="btn lg" href="#how">How it works</a></div>
</section>

<div class="three sec">
<section class="card" aria-labelledby="who"><h2 id="who">Who we’re looking for</h2><p>${esc(TUTOR.who)}</p></section>
<section class="card" aria-labelledby="work"><h2 id="work">The work</h2><p>${esc(TUTOR.work)}</p></section>
<section class="card" aria-labelledby="need"><h2 id="need">What you need</h2><ul class="ticks">${TUTOR.need.map((x) => `<li>${svg(CHECK)}<span>${esc(x)}</span></li>`).join('')}</ul></section>
</div>

<section class="sec" id="how" aria-labelledby="how-h"><h2 id="how-h" style="margin-bottom:16px">How it works</h2>
<ol class="steps">${TUTOR.steps.map(([h, p]) => `<li><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ol>
</section>

<section class="sec apply" id="apply" aria-labelledby="apply-h">
<h2 id="apply-h" style="margin-bottom:6px">Apply to tutor with Adventuity</h2>
<p class="muted" style="margin-bottom:18px">It takes about ten minutes. Fields marked <span class="req">*</span> are required.</p>
<div class="card">
<noscript><p class="alert info">Please switch on JavaScript in your browser to send an application.</p></noscript>
<form id="apply-form" class="form" action="#" method="post" enctype="multipart/form-data" novalidate>
<fieldset><legend>Your details</legend>
<div class="fgrid">
${fld('full_name', 'Full name', inp('full_name', 'text', { req: 1, ac: 'name', max: 120 }), { req: 1 })}
${fld('email', 'E-mail', inp('email', 'email', { req: 1, ac: 'email', max: 160, ph: 'you@example.com' }), { req: 1 })}
${fld('phone', 'WhatsApp number', inp('phone', 'tel', { req: 1, ac: 'tel', max: 20, ph: '082 123 4567', extra: ' inputmode="tel"' }), { req: 1 })}
${fld('province', 'Province', `<select id="in-province" name="province" aria-describedby="err-province"><option value="">Choose a province</option>${PROVINCES.map((p) => `<option>${p}</option>`).join('')}</select>`, { opt: 1 })}
${fld('town', 'Town or city', inp('town', 'text', { ac: 'address-level2', max: 80 }), { opt: 1 })}
</div>
</fieldset>
<fieldset><legend>What you teach</legend>
${group('subjects', 'Subjects you can teach', 'checkbox', SUBJECT_OPTS, { req: 1, hint: 'Choose at least one. For another subject, tell us more under “About you”.' })}
${group('grades', 'Grades', 'checkbox', [['10', 'Grade 10'], ['11', 'Grade 11'], ['12', 'Grade 12']])}
<div class="fgrid">
${fld('qualification', 'Qualification or current studies', inp('qualification', 'text', { req: 1, max: 160, ph: 'e.g. BSc Physics (2023) or BEd, 3rd year' }), { req: 1 })}
${fld('institution', 'University or college', inp('institution', 'text', { max: 160 }), { opt: 1 })}
${fld('experience_years', 'Years of tutoring or teaching', inp('experience_years', 'number', { extra: ' min="0" max="50" step="1" inputmode="numeric"' }), { opt: 1 })}
${fld('availability', 'When can you teach?', inp('availability', 'text', { max: 200, ph: 'e.g. Mon–Thu 16:00–20:00, Sat mornings' }), { opt: 1 })}
</div>
${group('mode', 'How would you like to teach?', 'radio', MODE_OPTS, { checked: 'online' })}
</fieldset>
<fieldset><legend>In your own words</legend>
${fld('about', 'About you', `<textarea id="in-about" name="about" maxlength="1500" aria-describedby="hint-about about-count err-about"></textarea>`, { opt: 1, hint: 'Why do you tutor? And how would you explain a topic that learners find hard?', after: '<p class="counter" id="about-count" aria-live="off">0 / 1500</p>' })}
${fld('referral', 'How did you hear about us?', inp('referral', 'text', { max: 160 }), { opt: 1 })}
</fieldset>
<fieldset><legend>Your CV</legend>
${fld('cv', 'Upload your CV', inp('cv', 'file', { req: 1, hint: 1, extra: ' accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"' }), { req: 1, hint: 'PDF or Word (.pdf, .doc or .docx), 5 MB or smaller.' })}
</fieldset>
<div class="field" id="f-consent">
<p class="popia" id="popia">${esc(TUTOR.popia)}</p>
<label class="consent"><input type="checkbox" id="in-consent" name="consent" value="yes" required aria-describedby="popia err-consent"><span>${esc(TUTOR.consent)}${REQ}</span></label>
<p class="err" id="err-consent" hidden></p>
</div>
<div class="hp" aria-hidden="true"><label for="in-website">Website</label><input id="in-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<input type="hidden" name="started_at" value="">
<div class="submit-row">
<div class="alert" id="form-alert" role="alert" aria-live="assertive" hidden></div>
<button class="btn primary lg" type="submit">Send application</button>
</div>
</form>
</div>
</section>
</main>
${footer({ current: 'tutor', live: true })}
${liveJs('')}
${TUTOR_JS}
</body>
</html>
`;
  return head({ file: TUTOR_FILE, url, title, desc, css: CSS_BASE + CSS_SHARED + CSS_SUBJECT + CSS_TOPIC + CSS_FORM, ld: [job, crumbs] }) + '\n' + body;
}

/* ---------- 404 ---------- */
function build404() {
  const body = `<body>
${topbar({ current: '404', abs: true })}
<main id="main" class="wrap page">
<section class="hero" aria-labelledby="h1" style="max-width:760px;margin:24px auto 0">
<p class="eyebrow">Error 404</p>
<h1 id="h1" style="margin-top:10px">We can’t find that page</h1>
<p class="lead">The link may be old or mistyped. Try one of these instead:</p>
<div class="cta-row"><a class="btn primary lg" href="${BASE}">Go to the home page</a><a class="btn lg" href="${BASE}${PORTAL}">Open the learner portal</a></div>
<ul style="margin-top:22px;padding-left:20px;display:grid;gap:8px">
<li><a href="${BASE}maths.html">Grade 12 Mathematics topics and study time</a></li>
<li><a href="${BASE}physical-sciences.html">Grade 12 Physical Sciences topics and study time</a></li>
<li><a href="${BASE}life-sciences.html">Grade 12 Life Sciences topics and study time</a></li>
<li><a href="${BASE}${GRADES[10].file}">Grade 10 topics</a> and <a href="${BASE}${GRADES[11].file}">Grade 11 topics</a></li>
<li><a href="${BASE}#fees">Lesson fees</a></li>
<li><a href="${BASE}${SIGNUP}">Create a free account and book a lesson</a></li>
</ul>
</section>
</main>
${footer({ current: '404', abs: true })}
</body>
</html>
`;
  return head({ file: '404.html', url: BASE + '404.html', title: 'Page not found | Adventuity', desc: 'This page does not exist. Go to Adventuity for online Grade 10–12 Maths, Physical Sciences and Life Sciences tutoring in South Africa.', css: CSS_BASE, abs: true, noindex: true }) + '\n' + body;
}

/* ---------- sitemap / robots ---------- */
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[['', '1.0'], ['maths.html', '0.9'], ['physical-sciences.html', '0.9'], ['life-sciences.html', '0.9'], [TT_FILE, '0.8'], [GRADES[10].file, '0.8'], [GRADES[11].file, '0.8'],
  ...PAGES.map((t) => ['topics/' + t.id + '.html', t.gr === 12 ? '0.7' : '0.6']), ['tutor-apply.html', '0.6']].map(([p, pr]) => `  <url><loc>${BASE}${p}</loc><lastmod>${TODAY}</lastmod><changefreq>weekly</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`;
const robots = () => `User-agent: *
Allow: /

Sitemap: ${BASE}sitemap.xml
`;

/* ---------- og.png ---------- */
function ogHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px}
body{background:#1c3246;color:#fff;font-family:Poppins,"IBM Plex Sans","Segoe UI",system-ui,sans-serif;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:36px 36px}
.ghost{position:absolute;right:-70px;top:70px;width:560px;height:548px;background:rgba(255,255,255,.07);-webkit-mask:${MARK};mask:${MARK}}
.c{position:absolute;left:72px;top:60px;right:72px;bottom:56px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:18px}
.brand i{display:block;width:72px;height:70px;background:#fff;-webkit-mask:${MARK};mask:${MARK}}
.brand b{font-size:34px;font-weight:700;letter-spacing:.08em}
.brand span{display:block;font-size:18px;font-weight:500;color:#a9c3dc;letter-spacing:.01em;margin-top:2px}
.eb{margin-top:38px;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#a9c3dc;font-weight:500}
h1{font-size:54px;line-height:1.06;margin:12px 0 0;max-width:900px;font-weight:700;letter-spacing:-.01em;text-wrap:balance}
.sub{margin-top:18px;font-size:24px;line-height:1.35;color:#d6e2ed;max-width:900px;font-weight:500}
.chips{margin-top:auto;display:flex;gap:12px;align-items:center}
.chip{border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 18px;font-size:20px;font-weight:600;white-space:nowrap}
.chip.s{background:#fff;color:#1c3246;border-color:#fff}
</style></head><body><div class="grid"></div><div class="ghost"></div>
<div class="c">
<div class="brand"><i></i><div><b>ADVENTUITY</b><span>${SLOGAN}</span></div></div>
<p class="eb">CAPS · NSC · Grades 10–12 · Online · South Africa</p>
<h1>Grade 12 Maths, Physical Sciences &amp; Life Sciences tutoring online</h1>
<p class="sub">Live one-on-one lessons for matric – and Grades 10 and 11 – with study notes, worked examples and ${N.q} exam-style questions with memos.</p>
<div class="chips"><span class="chip s">Book a lesson</span><span class="chip">Mathematics</span><span class="chip">Physical Sciences</span><span class="chip">Life Sciences</span><span class="chip">Grades 10–12</span></div>
</div></body></html>`;
}
async function renderOg(file) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.warn('playwright not available – og.png not rendered'); return false; }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.route(/^https?:\/\//, (r) => r.abort());
    await page.setContent(ogHtml(), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, type: 'png' });
  } finally { await browser.close(); }
  return true;
}

/* ---------- write ---------- */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const files = {
    'index.html': buildIndex(),
    'maths.html': buildSubject('maths'),
    'physical-sciences.html': buildSubject('sci'),
    'life-sciences.html': buildSubject('life'),
    [GRADES[10].file]: buildGrade(10),
    [GRADES[11].file]: buildGrade(11),
    [TT_FILE]: buildTimetable(),
    ...Object.fromEntries(PAGES.map((t) => ['topics/' + t.id + '.html', buildTopic(t)])),
    [TUTOR_FILE]: buildTutor(),
    '404.html': build404(),
    'sitemap.xml': sitemap(),
    'robots.txt': robots(),
  };
  fs.mkdirSync(path.join(OUT, 'topics'), { recursive: true });
  const seen = { title: new Map(), desc: new Map() };
  for (const [f, c] of Object.entries(files)) {
    if (f.endsWith('.html')) for (const [k, re] of [['title', /<title>([\s\S]*?)<\/title>/], ['desc', /<meta name="description" content="([^"]*)"/]]) {
      const v = (c.match(re) || [])[1]; if (seen[k].has(v)) throw new Error('duplicate ' + k + ' on ' + f + ' and ' + seen[k].get(v) + ': ' + v); seen[k].set(v, f);
    }
    fs.writeFileSync(path.join(OUT, f), c);
  }
  console.log('wrote', Object.keys(files).length, 'files:', Object.keys(files).filter((f) => !f.startsWith('topics/')).join(', '), '+', PAGES.length, 'topic pages');
  if (!SKIP_OG && await renderOg(path.join(OUT, 'og.png'))) console.log('wrote og.png');
  console.log('\nStudy time per paper:');
  const line = (gr, s, p) => console.log(`  Gr ${gr} ${s.name} ${p.label}${p.sub ? ' (' + p.sub + ')' : ''}: ` + (p.topics.length ? `${p.topics.length} topics, ${p.nSec} sections, ${p.nQ} questions / ${p.marks} marks, ≈ ${plainDur(p.total)}` : 'coming soon'));
  for (const s of Object.values(SUBJECTS)) for (const p of s.papers) line(12, s, p);
  for (const g of Object.values(GRADES)) for (const s of g.list) for (const p of s.papers) line(g.gr, s, p);
  console.log(`  Totals: ${N.topics} topics, ${N.sections} sections, ${N.q} exam-style questions`);
})().catch((e) => { console.error(e); process.exit(1); });
