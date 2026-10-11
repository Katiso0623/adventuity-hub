#!/usr/bin/env node
/* Builds the public marketing / SEO pages for Adventuity into ../public/ (re-runnable).
     node tools/build_public.js [--out DIR] [--no-og]
   Writes index.html, maths.html, physical-sciences.html, 404.html, sitemap.xml, robots.txt and og.png.
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

const BASE = 'https://katiso0623.github.io/adventuity-hub/';
const TODAY = '2026-10-11';
const BRAND = 'Adventuity';
const LEGAL = 'Adventuity (Pty) Ltd';
const SLOGAN = 'Transforming ideas into reality.';
const FONTS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap';
const FEES = { maths: 250, phys: 250, chem: 250, group: 100 }; // defaults; live values replace them in the browser
const DURATIONS = [60, 90, 120];
const MIN_PER_MARK = 1.2; // 150 marks in 180 minutes
const QUIZ_MIN = 10;
const PORTAL = 'portal.html';
const SIGNUP = 'portal.html#signup';

/* ---------- content (public fields only) ---------- */
function load(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window;
}
const W = {};
const BUNDLE = argVal('--bundle');   // decrypted study bundle (when the plain source files are not on disk)
if (BUNDLE) {
  const b = JSON.parse(fs.readFileSync(path.resolve(BUNDLE), 'utf8'));
  Object.assign(W, { CONTENT_MATHS_A: b.topics.maths, CONTENT_MATHS_B: [], CONTENT_MATHS_C: [], CONTENT_MATHS_D: [], CONTENT_PHYSICS: b.topics.phys, CONTENT_CHEM: b.topics.chem, PRACTICE_MATHS_A: b.practice });
} else ['maths_a', 'maths_b', 'maths_c', 'maths_d', 'physics', 'chem',
  'practice_maths_a', 'practice_maths_b', 'practice_maths_c', 'practice_maths_d', 'practice_physics', 'practice_chem']
  .forEach((f) => Object.assign(W, load(f + '.js')));
const BANK = Object.assign({}, W.PRACTICE_MATHS_A, W.PRACTICE_MATHS_B, W.PRACTICE_MATHS_C, W.PRACTICE_MATHS_D, W.PRACTICE_PHYSICS, W.PRACTICE_CHEM);
const round5 = (x) => Math.round(x / 5) * 5;

function pub(t) { // the ONLY place content is read – whitelist of public fields
  const qs = BANK[t.id] || [];
  const sections = (t.sections || []).map((s) => ({ title: String(s.title), est: Number(s.est) || 0 }));
  const notes = sections.reduce((a, s) => a + s.est, 0);
  const marks = qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);
  const exam = round5(marks * MIN_PER_MARK);
  return { id: String(t.id), title: String(t.title), paper: String(t.paper), weight: String(t.weight || ''), sections, nQ: qs.length, marks, notes, exam, quiz: QUIZ_MIN, total: notes + exam + QUIZ_MIN };
}
const MATHS = [...W.CONTENT_MATHS_A, ...W.CONTENT_MATHS_B, ...W.CONTENT_MATHS_C, ...W.CONTENT_MATHS_D].map(pub);
const PHYS = W.CONTENT_PHYSICS.map(pub);
const CHEM = W.CONTENT_CHEM.map(pub);
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
function day(iso) { const [y, m, d] = iso.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return { wd: WD[w], wdl: WDL[w], d, mon: MON[m - 1], y }; }
const EXAMS = {
  mp1: { short: 'Maths P1', name: 'Mathematics Paper 1', date: '2026-10-23', subj: 'maths' },
  mp2: { short: 'Maths P2', name: 'Mathematics Paper 2', date: '2026-10-26', subj: 'maths' },
  pp1: { short: 'Physics P1', name: 'Physical Sciences Paper 1 (Physics)', date: '2026-10-30', subj: 'phys' },
  pp2: { short: 'Chemistry P2', name: 'Physical Sciences Paper 2 (Chemistry)', date: '2026-11-02', subj: 'chem' },
};
for (const e of Object.values(EXAMS)) { const x = day(e.date); e.at = e.date + 'T09:00:00+02:00'; e.dm = x.d + ' ' + x.mon; e.full = x.wd + ' ' + x.d + ' ' + x.mon + ' ' + x.y; e.wd = x.wd; e.wdl = x.wdl; }

const SUBJECTS = {
  maths: {
    file: 'maths.html', name: 'Mathematics', cls: 'maths',
    papers: [
      { key: 'p1', label: 'Paper 1', theme: 'algebra, functions, finance, calculus and probability', exam: EXAMS.mp1, topics: mathsPaper('P1'), cls: 'maths' },
      { key: 'p2', label: 'Paper 2', theme: 'statistics, analytical geometry, trigonometry and Euclidean geometry', exam: EXAMS.mp2, topics: mathsPaper('P2'), cls: 'maths' },
    ],
  },
  sci: {
    file: 'physical-sciences.html', name: 'Physical Sciences', cls: 'phys',
    papers: [
      { key: 'p1', label: 'Paper 1', theme: 'Physics', exam: EXAMS.pp1, topics: PHYS, cls: 'phys' },
      { key: 'p2', label: 'Paper 2', theme: 'Chemistry', exam: EXAMS.pp2, topics: CHEM, cls: 'chem' },
    ],
  },
};
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
for (const s of Object.values(SUBJECTS)) {
  for (const p of s.papers) { p.total = sum(p.topics, (t) => t.total); p.nSec = sum(p.topics, (t) => t.sections.length); p.nQ = sum(p.topics, (t) => t.nQ); p.marks = sum(p.topics, (t) => t.marks); }
  s.total = sum(s.papers, (p) => p.total); s.nTopics = sum(s.papers, (p) => p.topics.length); s.nSec = sum(s.papers, (p) => p.nSec); s.nQ = sum(s.papers, (p) => p.nQ);
}
const ALL = [...MATHS, ...PHYS, ...CHEM];
const N = { topics: ALL.length, sections: sum(ALL, (t) => t.sections.length), q: sum(ALL, (t) => t.nQ), qM: sum(MATHS, (t) => t.nQ), qP: sum(PHYS, (t) => t.nQ), qC: sum(CHEM, (t) => t.nQ) };

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
:root{--focus:var(--accent);--cols:minmax(0,1fr) 76px 140px 230px 20px;--mark-img:${MARK_URL}}
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
.top-cta{display:flex;gap:8px;flex:none}
@media (max-width:899px){.nav{display:none}.top-cta{margin-left:auto}}
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
@media (min-width:760px){.countdown{grid-template-columns:repeat(4,minmax(0,1fr))}}
.cd{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface);display:grid;gap:4px;min-width:0}
.cd .subj{display:flex;align-items:center;gap:7px;font-weight:600;font-size:.88rem}
.dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--ink-2)}
.dot.maths{background:var(--maths)}.dot.phys{background:var(--phys)}.dot.chem{background:var(--chem)}
.cd .big{font-family:var(--mono);font-size:1.6rem;font-weight:500;line-height:1.1;font-variant-numeric:tabular-nums}
.cd .big small{font-size:.8rem;color:var(--ink-2);font-family:var(--body);margin-left:5px}
.cd.next{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.cd.past{opacity:.6}
@media (max-width:420px){.cd{padding:11px 12px}.cd .when{font-size:.8rem}}
.feat{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))}
.feat .card{display:grid;gap:8px;align-content:start}
.ic{width:42px;height:42px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:4px}
.ic svg{width:22px;height:22px}
.feat p,.steps p,.fee p{color:var(--ink-2);font-size:.94rem}
.steps{list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(196px,100%),1fr));counter-reset:st}
.steps li{counter-increment:st;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px;display:grid;gap:6px;align-content:start}
.steps li::before{content:counter(st);width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-family:var(--mono);font-weight:600;font-size:.9rem;margin-bottom:4px}
.note{display:flex;gap:12px;align-items:flex-start;border-left:3px solid var(--accent);background:var(--accent-soft);padding:12px 16px;border-radius:0 var(--r-sm) var(--r-sm) 0;margin-top:14px}
.note svg{width:22px;height:22px;flex:none;color:var(--accent);margin-top:1px}
.note p{color:var(--ink)}
.fees{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))}
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
.subj-card{display:grid;gap:12px;align-content:start}
.papers{display:grid;gap:8px}
.papers div{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;padding:10px 12px;border-radius:var(--r-sm);background:var(--surface-2)}
.papers dt{font-weight:600}
.papers dd{font-family:var(--mono);font-size:.9rem;font-variant-numeric:tabular-nums}
.topics-inline{font-size:.88rem;color:var(--ink-2)}
.where{display:flex;gap:14px;align-items:flex-start}
.where>svg{width:28px;height:28px;flex:none;color:var(--accent);margin-top:2px}
.where p{max-width:80ch}
.faq{display:grid;gap:10px;max-width:880px}
.faq details{border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.faq summary{display:flex;align-items:center;gap:12px;padding:14px 16px;min-height:54px}
.faq summary h3{font-size:1rem;font-weight:600;flex:1;min-width:0}
.faq .ans{padding:0 16px 16px;max-width:75ch}
.faq .ans p+p{margin-top:8px}
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
.topic>summary{padding:14px 16px;display:grid;grid-template-columns:minmax(0,1fr) 20px;gap:10px 12px;align-items:start;border-radius:var(--r)}
.t-main{display:grid;gap:4px;min-width:0}
.t-title{font-family:var(--display);font-weight:700;font-size:1.05rem;line-height:1.25}
.t-weight{font-size:.85rem;color:var(--ink-2)}
.t-nums{grid-column:1/-1;grid-row:2;display:flex;flex-wrap:wrap;gap:6px 8px}
.t-n{display:inline-block;background:var(--surface-2);border-radius:10px;padding:4px 10px;font-size:.84rem;font-variant-numeric:tabular-nums}
.t-n .lbl{color:var(--ink-2)}
.t-n b{font-weight:600}
.t-split{display:block;font-size:.78rem;color:var(--ink-2);margin-top:1px}
.topic>summary .chev{grid-column:2;grid-row:1;margin-top:2px}
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
  .topic>summary{grid-template-columns:var(--cols);gap:12px;align-items:center}
  .t-nums{display:contents}
  .t-n{background:none;padding:0;font-size:.95rem;border-radius:0}
  .t-n .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
  .topic>summary .chev{grid-column:auto;grid-row:auto;margin-top:0}
}
.how{display:grid;gap:10px}
.how ul{padding-left:20px;display:grid;gap:6px;color:var(--ink-2)}
.how li b{color:var(--ink)}
.other{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
`;

/* ---------- shared page parts ---------- */
function head(o) {
  const pre = o.abs ? BASE : '';
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
<meta property="og:image:alt" content="Adventuity – Grade 12 Maths and Physical Sciences tutoring online">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.ogTitle || o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${BASE}og.png">
<meta name="twitter:image:alt" content="Adventuity – Grade 12 Maths and Physical Sciences tutoring online">
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
  const pre = o.abs ? BASE : '';
  const home = o.abs ? BASE : './';
  const anchor = (h) => (o.current === 'index' ? h : home + h);
  const cur = (k) => (o.current === k ? ' aria-current="page"' : '');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="topbar"><div class="wrap">
<a class="brand" href="${home}"${o.current === 'index' ? ' aria-current="page"' : ''}><span class="mark" aria-hidden="true"></span><span><b>${BRAND}</b><small>Grade 12 tutoring online</small></span></a>
<nav class="nav" aria-label="Main"><a href="${pre}maths.html"${cur('maths')}>Mathematics</a><a href="${pre}physical-sciences.html"${cur('sci')}>Physical Sciences</a><a href="${anchor('#fees')}">Fees</a><a href="${anchor('#faq')}">FAQ</a></nav>
<div class="top-cta"><a class="btn ghost signin" href="${pre}${PORTAL}">Sign in</a><a class="btn primary" href="${pre}${SIGNUP}">Book a lesson</a></div>
</div></header>`;
}

function footer(o) {
  const pre = o.abs ? BASE : '';
  const home = o.abs ? BASE : './';
  const anchor = (h) => (o.current === 'index' ? h : home + h);
  return `<footer class="foot"><div class="wrap">
<div class="foot-grid">
<div><a class="brand" href="${home}"><span class="mark" aria-hidden="true"></span><span><b>${BRAND}</b><small>${LEGAL}</small></span></a>
<p class="slogan">${SLOGAN}</p>
<p class="small muted" style="margin-top:6px">Online Grade 12 Mathematics and Physical Sciences tutoring for matric learners across South Africa.</p></div>
<nav aria-label="Learner links"><p class="eyebrow">Learners</p><ul>
<li><a href="${pre}${SIGNUP}">Create a free account</a></li>
<li><a href="${pre}${PORTAL}">Sign in to the learner portal</a></li>
${o.live ? '<li><a href="#" data-wa hidden target="_blank" rel="noopener">WhatsApp the tutor</a></li>' : ''}
</ul></nav>
<nav aria-label="Subject links"><p class="eyebrow">Subjects</p><ul>
<li><a href="${pre}maths.html">Grade 12 Mathematics topics</a></li>
<li><a href="${pre}physical-sciences.html">Grade 12 Physical Sciences topics</a></li>
<li><a href="${anchor('#fees')}">Lesson fees</a></li>
<li><a href="${anchor('#faq')}">Questions and answers</a></li>
</ul></nav>
</div>
<p class="foot-base small muted">© 2026 ${LEGAL} · ${SLOGAN}</p>
</div></footer>`;
}

// live fees + WhatsApp from Supabase public_settings (fails silently)
const LIVE_JS = `<script src="config.js"></script>
<script>(function(){var C=window.ADV_CONFIG||{};if(!C.supabaseUrl||!C.supabaseKey||!window.fetch)return;
function R(n){n=Math.round(Number(n)*100)/100;var p=n.toFixed(n%1?2:0).split('.');return'R'+p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,'\\u00a0')+(p[1]?','+p[1]:'')}
fetch(String(C.supabaseUrl).replace(/\\/+$/,'')+'/rest/v1/public_settings?select=key,value&key=in.(fees,site)',{headers:{apikey:C.supabaseKey}}).then(function(r){return r.ok?r.json():[]}).then(function(rows){
var s={};(Array.isArray(rows)?rows:[]).forEach(function(x){s[x.key]=x.value});var f=s.fees;
if(f&&typeof f==='object'){var rate=function(k){var v=Number(k==='group'?f.group:(f[k]!=null?f[k]:f['default']));return v>0?v:null};
[].forEach.call(document.querySelectorAll('[data-fee]'),function(el){var k=el.getAttribute('data-fee'),v=rate(k);if(v==null)return;el.textContent=R(k==='group'?v:v*Number(el.getAttribute('data-min')||60)/60)});
var lo=['maths','phys','chem'].map(rate).filter(function(v){return v!=null});if(lo.length)[].forEach.call(document.querySelectorAll('[data-fee-from]'),function(el){el.textContent=R(Math.min.apply(null,lo))})}
var w=s.site&&s.site.whatsapp;if(w){var d=String(w).replace(/\\D/g,'');if(d.charAt(0)==='0')d='27'+d.slice(1);if(d.length>=11)[].forEach.call(document.querySelectorAll('[data-wa]'),function(el){el.href='https://wa.me/'+d+'?text='+encodeURIComponent('Hi, I would like to book a Grade 12 lesson.');el.hidden=false})}
}).catch(function(){})})();</script>`;

const COUNTDOWN_JS = `<script>(function(){var now=Date.now(),D=864e5,O=72e5,first=true;
[].forEach.call(document.querySelectorAll('.cd[data-at]'),function(el){var t=Date.parse(el.getAttribute('data-at'));if(isNaN(t))return;
var big=el.querySelector('.big'),when=el.querySelector('.when'),days=Math.floor((t+O)/D)-Math.floor((now+O)/D);
if(when)when.textContent=el.getAttribute('data-when');
if(now>t+108e5){el.classList.add('past');big.textContent='Written';return}
if(now>=t)big.textContent='Writing now';else if(days<=0)big.textContent='Today';else big.innerHTML=days+'<small>'+(days===1?'day':'days')+'</small>';
if(first){el.classList.add('next');first=false}})})();</script>`;

/* ---------- index.html ---------- */
function buildIndex() {
  const url = BASE;
  const calc = MATHS.find((t) => t.id === 'calculus');
  const mp1 = SUBJECTS.maths.papers[0];
  const exList = Object.values(EXAMS);
  const firstExam = exList[0];

  const FAQ = [
    ['Is it aligned to CAPS and the NSC exams?',
      `<p>Yes. Every topic follows the CAPS Grade 12 curriculum and is grouped the way it is examined in the NSC papers: Mathematics Paper 1 and Paper 2, and Physical Sciences Paper 1 (Physics) and Paper 2 (Chemistry). Each topic shows its typical share of the 150 marks.</p>`],
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

  const desc = `Online Grade 12 Maths and Physical Sciences lessons for matric learners anywhere in South Africa. CAPS-aligned, with notes and ${N.q} exam-style questions.`;
  const org = {
    '@type': 'EducationalOrganization', '@id': BASE + '#org', name: BRAND, legalName: LEGAL, url: BASE,
    logo: BASE + 'icons/icon-512.png', image: BASE + 'og.png', slogan: SLOGAN,
    description: 'Online Grade 12 Mathematics and Physical Sciences tutoring (CAPS, NSC) for matric learners anywhere in South Africa.',
    areaServed: { '@type': 'Country', name: 'South Africa', identifier: 'ZA' },
    knowsAbout: ['Grade 12 Mathematics', 'Grade 12 Physical Sciences', 'Physics', 'Chemistry', 'CAPS', 'National Senior Certificate'],
  };
  const service = {
    '@type': 'Service', '@id': BASE + '#tutoring', name: 'Online one-on-one Grade 12 tutoring', serviceType: 'Tutoring',
    description: 'Live one-on-one online lessons for Grade 12 Mathematics, Physics and Chemistry (CAPS / NSC). Lessons are 60, 90 or 120 minutes; pay by EFT after the tutor confirms the booking.',
    provider: { '@id': BASE + '#org' }, areaServed: { '@type': 'Country', name: 'South Africa', identifier: 'ZA' },
    audience: { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: 'Grade 12 (matric) learners' },
    availableChannel: { '@type': 'ServiceChannel', name: 'Online lessons', serviceUrl: BASE + PORTAL },
    offers: [
      { '@type': 'Offer', name: 'One-on-one lesson', price: FEES.maths, priceCurrency: 'ZAR', url: BASE + SIGNUP, availability: 'https://schema.org/InStock',
        areaServed: { '@type': 'Country', name: 'South Africa', identifier: 'ZA' },
        priceSpecification: { '@type': 'UnitPriceSpecification', price: FEES.maths, priceCurrency: 'ZAR', unitText: 'per hour', unitCode: 'HUR' } },
      { '@type': 'Offer', name: 'Group class seat', priceCurrency: 'ZAR', url: BASE + SIGNUP,
        priceSpecification: { '@type': 'PriceSpecification', minPrice: FEES.group, priceCurrency: 'ZAR', unitText: 'per seat' } },
    ],
  };
  const website = { '@type': 'WebSite', '@id': BASE + '#website', url: BASE, name: BRAND, inLanguage: 'en-ZA', publisher: { '@id': BASE + '#org' } };
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) };

  const feat = [
    [IC.video, 'Live online lessons', 'One-on-one or group lessons in a private online classroom with video, screen share, a whiteboard and chat.'],
    [IC.book, 'Study notes for every topic', `Clear notes for all ${N.topics} Grade 12 topics, split into ${N.sections} short sections and grouped by exam paper.`],
    [IC.graph, 'Worked examples with diagrams', 'Graphs, sketches and labelled diagrams drawn right into the worked examples, so you can see what the question describes.'],
    [IC.stairs, '<span class="nw">Step-by-step</span> calculations', 'Every worked example is solved one line at a time – formula, substitution, answer and units – the way markers want to see it.'],
    [IC.clip, `${N.q} <span class="nw">exam-style</span> questions`, `Past-paper-style questions with full marking memos: ${N.qM} for Mathematics, ${N.qP} for Physics and ${N.qC} for Chemistry.`],
    [IC.timer, 'Quizzes and mock papers', 'A quick quiz at the end of each topic and mock papers to practise under real exam time.'],
    [IC.cal, 'A study plan to exam day', 'A day-by-day plan that counts down to your NSC exam dates, so every topic is covered in time.'],
    [IC.phone, 'Works on your phone', 'Use it on any phone, tablet or computer, or install it as an app – no app store needed.'],
  ];
  const steps = [
    ['Create a free account', 'Sign up in the portal with your name, e-mail and WhatsApp number. It takes a minute and costs nothing.'],
    ['Request a lesson', 'Ask for a one-on-one time (60, 90 or 120 minutes) or a seat in a group class, and pick the topics you want to cover.'],
    ['The tutor confirms', 'The tutor accepts your request or suggests another time. You get a notification and a confirmation in the portal, with the payment details.'],
    ['Join the lesson', 'At lesson time tap “Join the lesson”. A private online classroom opens with video, screen share, a whiteboard and chat – in the browser, or the free Jitsi Meet app on a phone.'],
    ['Keep practising', `Between lessons, approved learners read the notes, worked examples with diagrams and step-by-step calculations, ${N.q} exam-style questions with memos, quizzes, mock papers and a study plan.`],
  ];
  const feeCard = (k, subj, label, paper) => `<article class="card fee">
<span class="pill ${k}">${paper}</span>
<h3>${label} lesson</h3>
<p class="price"><b id="fee-${k}" data-fee="${k}">${rand(FEES[k])}</b><span>per hour, one-on-one</span></p>
<ul class="durs" aria-label="${label} lesson cost by length">${DURATIONS.map((m) => `<li><span>${m} minutes</span><span data-fee="${k}" data-min="${m}">${rand(FEES[k] * m / 60)}</span></li>`).join('')}</ul>
</article>`;
  const paperRow = (p) => `<div><dt>${p.label}${p.theme.length < 12 ? ' · ' + p.theme : ''} <span class="muted">· ${p.exam.wd} ${p.exam.dm}</span></dt><dd>${p.topics.length} topics · ≈${NB}${dur(p.total)}</dd></div>`;
  const subjCard = (s, title, link, linkText) => `<article class="card subj-card">
<div class="row" style="display:flex;gap:6px;flex-wrap:wrap">${s.papers.map((p) => `<span class="pill ${p.cls}">${p.label === 'Paper 1' && s.cls === 'phys' ? 'Physics' : p.label === 'Paper 2' && s.cls === 'phys' ? 'Chemistry' : 'Mathematics ' + p.label.replace('Paper ', 'P')}</span>`).join('')}</div>
<h3>${title}</h3>
<dl class="papers">${s.papers.map(paperRow).join('')}</dl>
<p class="topics-inline">${s.papers.map((p) => `<b>${p.label}:</b> ${p.topics.map((t) => esc(t.title)).join(' · ')}`).join('<br>')}</p>
<p><a class="btn long" href="${link}">${linkText} ${svg(IC.arrow)}</a></p>
</article>`;

  const body = `<body>
${topbar({ current: 'index' })}
<main id="main" class="wrap page">
<section class="hero" aria-labelledby="h1">
<div class="hero-grid">
<div>
<p class="eyebrow">CAPS · NSC finals 2026 · Live online lessons</p>
<h1 id="h1" style="margin-top:10px">Grade 12 Maths &amp; Physical Sciences tutoring online&nbsp;– anywhere in South Africa</h1>
<p class="lead">Book a live one-on-one lesson for the matric topics you find hard, then keep practising between lessons with study notes, step-by-step worked examples and ${N.q} exam-style questions with memos.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="${PORTAL}">Sign in</a><a class="btn wa lg" href="#" data-wa hidden target="_blank" rel="noopener">${svg(IC.chat)}WhatsApp us</a></div>
<ul class="facts" aria-label="At a glance">
<li><b data-fee-from>${rand(Math.min(FEES.maths, FEES.phys, FEES.chem))}</b> per hour, one-on-one</li>
<li>Group classes from <b data-fee="group">${rand(FEES.group)}</b></li>
<li>60, 90 or 120 minutes</li>
<li>Maths, Physics and Chemistry</li>
</ul>
</div>
<div class="hero-side" aria-hidden="true"><div class="logo-full"></div><p class="slogan">${SLOGAN}</p></div>
</div>
<div class="cd-wrap">
<h2 class="eyebrow" style="font-family:var(--mono);font-size:.74rem;letter-spacing:.12em">Exam countdown · NSC October–November 2026</h2>
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
<div class="sec-head"><p class="eyebrow">Fees</p><h2 id="fees-h">Simple hourly fees, paid after your booking is confirmed</h2><p>One-on-one lessons are priced per hour and run for 60, 90 or 120 minutes.</p></div>
<div class="fees">
${feeCard('maths', 'maths', 'Mathematics', 'Paper 1 and 2')}
${feeCard('phys', 'phys', 'Physics', 'Physical Sciences P1')}
${feeCard('chem', 'chem', 'Chemistry', 'Physical Sciences P2')}
<article class="card fee"><span class="pill accent">Group class</span><h3>Group class seat</h3><p class="price"><span>from</span><b id="fee-group" data-fee="group">${rand(FEES.group)}</b><span>per seat</span></p><p>Online group classes on set topics, scheduled by the tutor. Seats are limited and the price is shown on each class.</p></article>
</div>
<div class="note">${svg(IC.lock)}<p><b>How payment works.</b> Request a lesson first – you pay nothing yet. Once the tutor accepts, pay by EFT using the banking details and payment reference shown with your booking in the portal, then upload your proof of payment there.</p></div>
</section>

<section class="sec" aria-labelledby="subjects">
<div class="sec-head"><p class="eyebrow">Subjects and study time</p><h2 id="subjects">Every Grade 12 topic, by exam paper</h2><p>Estimated study time per topic = notes and worked examples + every exam-style question at exam pace (1,2 minutes per mark) + a <span class="nw">10-minute</span> quiz.</p></div>
<div class="subjects">
${subjCard(SUBJECTS.maths, 'Grade 12 Mathematics', 'maths.html', 'Mathematics topics, weighting and study time')}
${subjCard(SUBJECTS.sci, 'Grade 12 Physical Sciences', 'physical-sciences.html', 'Physical Sciences topics, weighting and study time')}
</div>
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
<h2 id="cta">Get help with the topics that worry you – before the NSC finals</h2>
<p>${firstExam.name} is written on ${firstExam.wdl} ${firstExam.dm} ${firstExam.date.slice(0, 4)}. Create a free account, request a lesson time and pick your topics. You only pay once the tutor confirms.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="${PORTAL}">Sign in to the portal</a></div>
</section>
</main>
${footer({ current: 'index', live: true })}
${COUNTDOWN_JS}
${LIVE_JS}
</body>
</html>
`;
  return head({ file: 'index.html', url, title: 'Grade 12 Maths & Physical Sciences Tutor Online | Adventuity', desc, css: CSS_BASE + CSS_INDEX,
    ld: [{ '@context': 'https://schema.org', '@graph': [org, website, service] }, faqLd] }) + '\n' + body;
}

/* ---------- subject pages ---------- */
function topicRow(t) {
  return `<details class="topic" id="${esc(t.id)}">
<summary><span class="t-main"><span class="t-title">${esc(t.title)}</span><span class="t-weight">${esc(t.weight)}</span></span><span class="t-nums"><span class="t-n"><span class="lbl">Sections </span><b>${t.sections.length}</b></span><span class="t-n"><span class="lbl">Exam questions </span><b>${t.nQ}</b> <span class="muted">(${t.marks}${NB}marks)</span></span><span class="t-n"><span class="lbl">Study time </span><b>≈${NB}${dur(t.total)}</b><span class="t-split"><span class="nw">notes ${durShort(t.notes)} ·</span> <span class="nw">exam questions ${durShort(t.exam)}</span></span></span></span>${svg(IC.chev, 'chev')}</summary>
<div class="t-body"><ol class="sec-list">${t.sections.map((s) => `<li><span>${esc(s.title)}</span><span class="mono">${s.est}${NB}min</span></li>`).join('')}</ol>
<p class="split">Notes and worked examples ${dur(t.notes)} · ${t.nQ} exam-style questions (${t.marks} marks) at exam pace ${dur(t.exam)} · quiz ${QUIZ_MIN}${NB}min</p></div>
</details>`;
}

function buildSubject(key) {
  const s = SUBJECTS[key];
  const url = BASE + s.file;
  const isM = key === 'maths';
  const h1 = isM ? 'Grade 12 Mathematics (CAPS) – topics, exam weighting and study time' : 'Grade 12 Physical Sciences (CAPS) – topics, exam weighting and study time';
  const title = isM ? 'Grade 12 Maths Topics & Study Time (CAPS) | Adventuity' : 'Grade 12 Physical Sciences Topics & Study Time | Adventuity';
  const desc = isM
    ? 'All Grade 12 Mathematics (CAPS) topics for NSC Paper 1 and Paper 2, with exam weighting, sections, exam-style questions and study time per topic.'
    : 'Grade 12 Physical Sciences (CAPS) topics for Physics Paper 1 and Chemistry Paper 2: exam weighting, sections, exam-style questions and study hours.';
  const lead = isM
    ? `All ${s.nTopics} topics of matric Mathematics, grouped by NSC exam paper, with the typical mark weighting, the study sections in each topic, the number of exam-style questions and how long each topic takes to study.`
    : `All ${s.nTopics} topics of matric Physical Sciences – Physics for Paper 1 and Chemistry for Paper 2 – with the typical mark weighting, the study sections in each topic, the number of exam-style questions and how long each topic takes to study.`;
  const other = isM ? { file: 'physical-sciences.html', text: 'Grade 12 Physical Sciences topics and study time' } : { file: 'maths.html', text: 'Grade 12 Mathematics topics and study time' };
  const feeKeys = isM ? ['maths'] : ['phys', 'chem'];

  const course = {
    '@context': 'https://schema.org', '@type': 'Course', '@id': url + '#course',
    name: isM ? 'Grade 12 Mathematics (CAPS)' : 'Grade 12 Physical Sciences (CAPS)',
    description: lead, url,
    provider: { '@type': 'EducationalOrganization', name: BRAND, legalName: LEGAL, url: BASE, logo: BASE + 'icons/icon-512.png' },
    educationalLevel: 'Grade 12', inLanguage: 'en-ZA',
    teaches: s.papers.flatMap((p) => p.topics.map((t) => t.title)),
    hasCourseInstance: [{ '@type': 'CourseInstance', courseMode: 'online', inLanguage: 'en-ZA', courseWorkload: iso(s.total), location: { '@type': 'VirtualLocation', url: BASE + PORTAL } }],
    offers: [{ '@type': 'Offer', category: 'Paid', price: FEES[feeKeys[0]], priceCurrency: 'ZAR', url: BASE + SIGNUP,
      priceSpecification: { '@type': 'UnitPriceSpecification', price: FEES[feeKeys[0]], priceCurrency: 'ZAR', unitText: 'per hour', unitCode: 'HUR' } }],
  };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
    { '@type': 'ListItem', position: 2, name: isM ? 'Grade 12 Mathematics' : 'Grade 12 Physical Sciences', item: url }] };

  const paperSec = (p) => {
    const id = key + '-' + p.key;
    const heading = isM ? `${p.label}: ${p.theme}` : `${p.label}: ${p.theme}`;
    return `<section class="sec" aria-labelledby="${id}">
<div class="paper-head"><p class="eyebrow">${isM ? 'Mathematics' : 'Physical Sciences'} · ${p.label}</p><h2 id="${id}">${esc(heading[0].toUpperCase() + heading.slice(1))}</h2>
<div class="meta"><span class="pill ${p.cls}">${p.exam.full} · 09:00</span><span class="pill">3 hours · 150 marks</span><span class="pill">${p.topics.length} topics · ≈${NB}${dur(p.total)}</span></div></div>
<div class="tt-head" aria-hidden="true"><span>Topic and exam weighting</span><span>Sections</span><span>Exam questions</span><span>Study time</span><span></span></div>
${p.topics.map(topicRow).join('\n')}
<p class="paper-total"><span>${p.label} total</span><span class="mono">${p.topics.length} topics · ${p.nSec} sections · ${p.nQ} questions · ≈${NB}${dur(p.total)}</span></p>
</section>`;
  };

  const body = `<body>
${topbar({ current: key })}
<main id="main" class="wrap page">
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="./">Home</a></li><li><span aria-current="page">${isM ? 'Grade 12 Mathematics' : 'Grade 12 Physical Sciences'}</span></li></ol></nav>
<section class="hero" aria-labelledby="h1">
<p class="eyebrow">Grade 12 · CAPS · NSC 2026</p>
<h1 id="h1" style="margin-top:10px">${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
<dl class="stats">
<div><dt>Topics</dt><dd>${s.nTopics}</dd></div>
<div><dt>Study sections</dt><dd>${s.nSec}</dd></div>
<div><dt>Exam-style questions</dt><dd>${s.nQ}</dd></div>
<div><dt>Total study time</dt><dd>≈${NB}${dur(s.total)}</dd></div>
</dl>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a ${isM ? 'Maths' : 'Physical Sciences'} lesson</a><a class="btn lg" href="${PORTAL}">Sign in</a></div>
</section>
${s.papers.map(paperSec).join('\n')}
<section class="sec card how" aria-labelledby="est">
<h2 id="est">How the study time is estimated</h2>
<ul>
<li><b>Notes and worked examples:</b> the estimate for each section, listed when you open a topic.</li>
<li><b>Exam-style questions:</b> every question in the topic's practice bank at exam pace – 1,2 minutes per mark, the pace of 150 marks in 3 hours.</li>
<li><b>Quiz:</b> 10 minutes per topic.</li>
</ul>
<p class="small muted">It is a guide for planning. Your tutor will help you adjust it to what you already know. Notes, examples, questions and memos open in the portal once the tutor approves your account.</p>
</section>
<section class="sec band" aria-labelledby="cta">
<h2 id="cta">Stuck on a topic? Book a one-on-one ${isM ? 'Maths' : 'Physics or Chemistry'} lesson.</h2>
<p>${feeKeys.map((k) => `<span data-fee="${k}">${rand(FEES[k])}</span> per hour${isM ? '' : k === 'phys' ? ' for Physics' : ' for Chemistry'}`).join(', ')} – 60, 90 or 120 minutes, online from anywhere in South Africa. You pay by EFT only after the tutor confirms your booking.</p>
<div class="cta-row"><a class="btn primary lg" href="${SIGNUP}">Book a lesson</a><a class="btn lg" href="./#fees">See all fees</a></div>
</section>
<section class="sec other"><p>Also preparing for the other subject?</p><a class="btn long" href="${other.file}">${other.text} ${svg(IC.arrow)}</a></section>
</main>
${footer({ current: key, live: true })}
${LIVE_JS}
</body>
</html>
`;
  return head({ file: s.file, url, title, desc, css: CSS_BASE + CSS_SUBJECT, ld: [course, crumbs] }) + '\n' + body;
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
<li><a href="${BASE}#fees">Lesson fees</a></li>
<li><a href="${BASE}${SIGNUP}">Create a free account and book a lesson</a></li>
</ul>
</section>
</main>
${footer({ current: '404', abs: true })}
</body>
</html>
`;
  return head({ file: '404.html', url: BASE + '404.html', title: 'Page not found | Adventuity', desc: 'This page does not exist. Go to Adventuity for online Grade 12 Maths and Physical Sciences tutoring in South Africa.', css: CSS_BASE, abs: true, noindex: true }) + '\n' + body;
}

/* ---------- sitemap / robots ---------- */
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[['', '1.0'], ['maths.html', '0.8'], ['physical-sciences.html', '0.8'], [PORTAL, '0.6']].map(([p, pr]) => `  <url><loc>${BASE}${p}</loc><lastmod>${TODAY}</lastmod><changefreq>weekly</changefreq><priority>${pr}</priority></url>`).join('\n')}
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
.eb{margin-top:52px;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#a9c3dc;font-weight:500}
h1{font-size:64px;line-height:1.06;margin:14px 0 0;max-width:860px;font-weight:700;letter-spacing:-.01em}
.sub{margin-top:22px;font-size:26px;line-height:1.35;color:#d6e2ed;max-width:820px;font-weight:500}
.chips{margin-top:auto;display:flex;gap:12px;align-items:center}
.chip{border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 20px;font-size:21px;font-weight:600}
.chip.s{background:#fff;color:#1c3246;border-color:#fff}
</style></head><body><div class="grid"></div><div class="ghost"></div>
<div class="c">
<div class="brand"><i></i><div><b>ADVENTUITY</b><span>${SLOGAN}</span></div></div>
<p class="eb">CAPS · NSC · Online · South Africa</p>
<h1>Grade 12 Maths &amp; Physical Sciences tutoring online</h1>
<p class="sub">Live one-on-one lessons, study notes, step-by-step worked examples and ${N.q} exam-style questions with memos.</p>
<div class="chips"><span class="chip s">Book a lesson</span><span class="chip">Mathematics P1 &amp; P2</span><span class="chip">Physics</span><span class="chip">Chemistry</span></div>
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
    '404.html': build404(),
    'sitemap.xml': sitemap(),
    'robots.txt': robots(),
  };
  for (const [f, c] of Object.entries(files)) { fs.writeFileSync(path.join(OUT, f), c); console.log('wrote', f, (c.length / 1024).toFixed(1) + ' KB'); }
  if (!SKIP_OG && await renderOg(path.join(OUT, 'og.png'))) console.log('wrote og.png');
  console.log('\nStudy time per paper:');
  for (const s of Object.values(SUBJECTS)) for (const p of s.papers) console.log(`  ${s.name} ${p.label} (${p.theme.length < 12 ? p.theme : p.topics.length + ' topics'}): ${p.topics.length} topics, ${p.nSec} sections, ${p.nQ} questions / ${p.marks} marks, ≈ ${dur(p.total).replace(/ /g, ' ')}`);
  console.log(`  Totals: ${N.topics} topics, ${N.sections} sections, ${N.q} exam-style questions`);
})().catch((e) => { console.error(e); process.exit(1); });
