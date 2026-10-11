#!/usr/bin/env node
/* Render sections / practice questions to PNG for visual checking.
   node tools/preview.js --file maths_a.js --global CONTENT_MATHS_A --out /path/outdir [--ids a,b] [--dark]
   node tools/preview.js --file practice_maths_a.js --global PRACTICE_MATHS_A --practice --out /path/outdir [--ids seq-p01]
   Writes <out>/<id>.png and prints any figure/LaTeX errors.                                     */
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const args = process.argv.slice(2); const opt = {};
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { const k = args[i].slice(2); const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; opt[k] = v; } }
const ROOT = path.join(__dirname, '..');
const MJ = '/tmp/claude-0/-home-claude-adventuity-hub/5e26bb2f-2370-5bf4-8e73-f65a897a0f53/scratchpad/mathjax-dist/es5/tex-svg.js';
const file = path.resolve(ROOT, opt.file); const out = path.resolve(opt.out || path.join(ROOT, 'out', 'preview')); fs.mkdirSync(out, { recursive: true });
const head = fs.readFileSync(path.join(ROOT, 'app_head.html'), 'utf8').replace(/<link[^>]+>/g, '').replace(/<title[^>]*>.*?<\/title>/, '');
const css = fs.readFileSync(path.join(ROOT, 'fig.css'), 'utf8') + fs.readFileSync(path.join(ROOT, 'steps.css'), 'utf8');
const html = `<!doctype html><html${opt.dark ? ' data-theme="dark"' : ''}><head><meta charset="utf-8">${head}<style>${css}
body{padding:16px;max-width:900px} .item{margin:0 0 28px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)} .item h3{margin-bottom:8px}
.ex{border:1px solid var(--line);border-radius:10px;background:var(--surface-2);padding:12px;margin-top:10px}</style>
<script>window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']]},svg:{fontCache:'global',displayAlign:'left',displayIndent:'0.4em'},startup:{typeset:false}};</script>
<script src="file://${MJ}"></script>
<script src="file://${path.join(ROOT, 'figlib.js')}"></script>${opt.figs ? '<script src="file://' + path.resolve(ROOT, opt.figs) + '"></script>' : ''}<script src="file://${path.join(ROOT, 'steps.js')}"></script>
<script>window=window;</script><script src="file://${file}"></script></head><body><div id="root"></div>
<script>
const G = window[${JSON.stringify(opt.global)}]; const ids = ${JSON.stringify(opt.ids ? String(opt.ids).split(',') : null)};
const S = ADV_STEPS; const FG = ${JSON.stringify(opt.figsglobal || '')} ? (window[${JSON.stringify(opt.figsglobal || '')}] || {}) : {}; const F = (f) => (Array.isArray(f) ? f : [f]).map((x) => '<figure class="fg-fig">' + window.renderFig(x) + (x.caption ? '<figcaption>' + S.esc(x.caption) + '</figcaption>' : '') + '</figure>').join(''); const errs = [];
let html = '';
if (${!!opt.practice}) {
  Object.keys(G).forEach((tid) => G[tid].forEach((q) => { if (ids && !ids.includes(q.id) && !ids.includes(tid)) return;
    html += '<div class="item" id="' + q.id + '"><h3>' + q.id + ' · ' + S.esc(q.type) + ' (' + q.marks + ')</h3>' + (FG[q.id] ? F(FG[q.id]) : (q.fig ? F(q.fig) : '')) + S.renderQuestion(q.q) + '<div class="ex"><b>Memo</b>' + S.renderMemo(q.memo) + '<p><b>Answer:</b> ' + S.T(q.answer) + '</p></div></div>'; }));
} else {
  G.forEach((t) => t.sections.forEach((s) => { if (ids && !ids.includes(s.id) && !ids.includes(t.id)) return;
    html += '<div class="item" id="' + s.id + '"><h3>' + s.id + ' · ' + S.esc(s.title) + (s.est ? ' · ' + s.est + ' min' : '') + '</h3>' + (FG['sec:' + s.id] ? F(FG['sec:' + s.id]) : '') +
      '<div class="ex"><p><b>Example.</b> ' + S.T(s.example.q) + '</p>' + (s.example.fig ? F(s.example.fig) : '') + S.renderSteps(s.example.steps, F) + '<p><b>Answer:</b> ' + S.T(s.example.answer) + '</p></div></div>'; }));
}
document.getElementById('root').innerHTML = html;
document.querySelectorAll('.fg-fig p').forEach((e) => errs.push(e.closest('.item').id + ': ' + e.textContent));
window.__errs = errs;
MathJax.startup.promise.then(() => MathJax.typesetPromise()).then(() => { document.querySelectorAll('mjx-merror, [data-mjx-error]').forEach((e) => errs.push((e.closest('.item') || {}).id + ' LaTeX: ' + (e.getAttribute('data-mjx-error') || e.textContent))); window.__done = true; });
</script></body></html>`;
const tmp = path.join(out, '_preview.html'); fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrs = []; p.on('pageerror', (e) => pageErrs.push(e.message));
  await p.goto('file://' + tmp); await p.waitForFunction(() => window.__done === true, null, { timeout: 120000 }).catch(() => pageErrs.push('MathJax timeout'));
  const items = await p.$$('.item'); for (const it of items) { const id = await it.getAttribute('id'); await it.screenshot({ path: path.join(out, id + '.png') }); }
  const errs = await p.evaluate(() => window.__errs || []);
  console.log('rendered', items.length, 'items to', out); [...pageErrs, ...errs].forEach((e) => console.log('ERROR', e));
  await b.close();
})();
