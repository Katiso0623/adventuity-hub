/* Renders Adventuity share images (WhatsApp Status, square post) and a printable A4 flyer.
   node marketing/make.js <outDir> [siteUrl]   (QR code read from marketing/qr.svg) */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const D = __dirname, OUT = process.argv[2] || path.join(D, 'out');
const URL = (process.argv[3] || 'https://katiso0623.github.io/adventuity-hub/');
const SHORT = URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
fs.mkdirSync(OUT, { recursive: true });
const b64 = (f) => fs.readFileSync(f).toString('base64');
const LOGO_W = 'data:image/png;base64,' + b64(path.join(D, '..', 'brand', 'logo_full_white.png'));
const LOGO_N = 'data:image/png;base64,' + b64(path.join(D, '..', 'brand', 'logo_full_navy.png'));
const QR = fs.readFileSync(path.join(D, 'qr.svg'), 'utf8').replace(/^[\s\S]*?<svg/, '<svg').replace(/width="600" height="600"/, 'width="100%" height="100%" viewBox="0 0 600 600"');
const EXAMS = [['Mathematics Paper 1', 'Fri 23 Oct'], ['Mathematics Paper 2', 'Mon 26 Oct'], ['Physics · Paper 1', 'Fri 30 Oct'], ['Chemistry · Paper 2', 'Mon 2 Nov']];
const GETS = ['Live online lessons – video, screen share and whiteboard', 'Worked examples step by step, one line at a time', 'Exam-style questions with marking memos', 'A study plan with the hours for every paper'];
const base = `*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%}
body{font-family:Inter,system-ui,sans-serif;color:#fff;background:#1c3246;-webkit-font-smoothing:antialiased}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:54px 54px}
h1,h2,.disp{font-family:"Inter Display",Inter,sans-serif;letter-spacing:-.02em}
.eyebrow{font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#9cc6ea}
.card{background:#fff;color:#1c3246;border-radius:28px}
.qr{background:#fff;border-radius:22px;padding:18px}
.qr svg{display:block}`;
const exRows = (fs1, fs2, pad) => EXAMS.map(([p, d]) => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:${pad}px 0;border-bottom:2px solid #e3e8ee"><span style="font-size:${fs1}px;font-weight:600">${p}</span><span class="disp" style="font-size:${fs2}px;font-weight:700">${d}</span></div>`).join('');

const status = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
.wrap{position:relative;width:1080px;height:1920px;padding:96px 90px 84px;display:flex;flex-direction:column}
</style></head><body><div class="grid"></div><div class="wrap">
<div style="display:flex;align-items:center;justify-content:space-between"><img src="${LOGO_W}" style="width:270px"><span class="eyebrow" style="font-size:24px">NSC 2026</span></div>
<p class="eyebrow" style="font-size:30px;margin-top:84px">Grade 12 · Maths & Physical Sciences</p>
<h1 style="font-size:116px;line-height:1.02;font-weight:800;margin-top:18px">Matric finals<br>are close.</h1>
<p style="font-size:38px;line-height:1.35;margin-top:28px;color:#dbe7f2">Book online lessons – one-on-one or in a small group – and study with notes made for the NSC papers.</p>
<div class="card" style="margin-top:44px;padding:26px 44px">${exRows(33, 38, 16)}<p style="font-size:24px;color:#55687a;margin-top:16px">All papers start at 09:00 · confirm with your school</p></div>
<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:36px">${['From R250 per hour', 'Groups from R100', 'Pay after confirmation'].map((t) => `<span style="font-size:27px;font-weight:600;padding:12px 22px;border:2px solid rgba(255,255,255,.35);border-radius:999px">${t}</span>`).join('')}</div>
<div style="margin-top:auto;display:flex;align-items:center;gap:44px"><div class="qr" style="width:270px;height:270px;flex:none">${QR}</div>
<div><p class="disp" style="font-size:56px;font-weight:800;line-height:1.05">Book a lesson</p><p style="font-size:30px;margin-top:16px;color:#dbe7f2">Scan the code or visit</p><p style="font-size:30px;font-weight:600;margin-top:6px;word-break:break-all">${SHORT}</p></div></div>
<p style="font-size:24px;color:#9cc6ea;margin-top:30px">Adventuity · Transforming ideas into reality.</p>
</div></body></html>`;

const square = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
.wrap{position:relative;width:1080px;height:1080px;padding:72px 76px;display:flex;flex-direction:column}
</style></head><body><div class="grid"></div><div class="wrap">
<div style="display:flex;align-items:center;justify-content:space-between"><img src="${LOGO_W}" style="width:210px"><span class="eyebrow" style="font-size:22px">Grade 12 · NSC 2026</span></div>
<h1 style="font-size:84px;line-height:1.02;font-weight:800;margin-top:44px">Maths & Physical<br>Sciences lessons</h1>
<p style="font-size:32px;margin-top:20px;color:#dbe7f2">Online, one-on-one or in a group · from R250 per hour</p>
<div style="display:flex;gap:36px;margin-top:auto;align-items:flex-end">
<div class="card" style="flex:1;padding:26px 34px">${exRows(27, 31, 13)}</div>
<div style="width:250px;flex:none;text-align:center"><div class="qr" style="width:250px;height:250px">${QR}</div><p style="font-size:24px;font-weight:600;margin-top:14px">Scan to book</p></div></div>
</div></body></html>`;

const flyer = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
@page{size:A4;margin:0}
body{background:#fff;color:#1c3246}
.page{width:210mm;height:297mm;position:relative;display:flex;flex-direction:column}
.top{background:#1c3246;color:#fff;padding:14mm 16mm 11mm;position:relative;overflow:hidden}
.top .grid{background-size:9mm 9mm}
.sec{padding:0 16mm}
h2{font-size:17pt;font-weight:800;margin:0 0 3mm}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
ol{list-style:none;counter-reset:s}
ol li{counter-increment:s;display:grid;grid-template-columns:9mm 1fr;gap:3mm;font-size:11pt;line-height:1.4;margin-bottom:3mm}
ol li::before{content:counter(s);width:7mm;height:7mm;border-radius:50%;background:#1c3246;color:#fff;display:grid;place-items:center;font-weight:700;font-size:10pt}
ul{list-style:none}ul li{font-size:11pt;line-height:1.4;margin-bottom:2.4mm;padding-left:6mm;position:relative}ul li::before{content:"";position:absolute;left:0;top:2mm;width:2.6mm;height:2.6mm;border-radius:50%;background:#2b63a8}
table{width:100%;border-collapse:collapse;font-size:11pt}td{padding:2.2mm 0;border-bottom:.3mm solid #d2dae3}td:last-child{text-align:right;font-weight:700}
</style></head><body><div class="page">
<div class="top"><div class="grid"></div><div style="position:relative">
<div style="display:flex;justify-content:space-between;align-items:center"><img src="${LOGO_W}" style="width:48mm"><span class="eyebrow" style="font-size:9pt">NSC finals 2026</span></div>
<h1 style="font-size:32pt;line-height:1.03;font-weight:800;margin-top:7mm">Grade 12 Maths &<br>Physical Sciences lessons</h1>
<p style="font-size:13pt;margin-top:4mm;color:#dbe7f2">Online lessons, one-on-one or in a small group – anywhere in South Africa.</p></div></div>
<div class="sec" style="margin-top:9mm"><div class="cols">
<div><h2>How it works</h2><ol><li>Create a free account on the website.</li><li>Pick a lesson time and the topics you want to cover.</li><li>The tutor confirms – you get a notification.</li><li>Tap “Join the lesson” at lesson time. Pay after the tutor confirms.</li></ol></div>
<div><h2>What you get</h2><ul>${GETS.map((g) => `<li>${g}</li>`).join('')}</ul></div></div></div>
<div class="sec" style="margin-top:6mm"><div class="cols">
<div><h2>Fees</h2><table><tr><td>Maths, Physics or Chemistry, one-on-one</td><td>R250 / hour</td></tr><tr><td>Group class</td><td>from R100</td></tr><tr><td>Lesson length</td><td style="white-space:nowrap">60 · 90 · 120 min</td></tr></table></div>
<div><h2>Exam dates</h2><table>${EXAMS.map(([p, d]) => `<tr><td>${p}</td><td>${d}</td></tr>`).join('')}</table><p style="font-size:8.5pt;color:#55687a;margin-top:2mm">09:00 · confirm with your school</p></div></div></div>
<div class="sec" style="margin-top:auto;padding-top:7mm;margin-bottom:13mm"><div style="display:flex;gap:9mm;align-items:center;border:.5mm solid #1c3246;border-radius:6mm;padding:7mm">
<div style="width:42mm;height:42mm;flex:none">${QR}</div>
<div><p class="disp" style="font-size:22pt;font-weight:800">Book a lesson</p><p style="font-size:12pt;margin-top:2mm">Scan the code with your phone camera, or visit</p><p style="font-size:12pt;font-weight:700;margin-top:1mm">${SHORT}</p><p style="font-size:9pt;color:#55687a;margin-top:4mm">Adventuity (Pty) Ltd · Transforming ideas into reality.</p></div></div></div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const shot = async (html, name, w, h) => { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html, { waitUntil: 'load' }); await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) }); await p.close(); };
  await shot(status, 'adventuity-whatsapp-status.png', 1080, 1920);
  await shot(square, 'adventuity-post-square.png', 1080, 1080);
  const p = await b.newPage(); await p.setContent(flyer, { waitUntil: 'load' }); await p.waitForTimeout(300);
  await p.pdf({ path: path.join(OUT, 'adventuity-flyer-A4.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.setViewportSize({ width: 794, height: 1123 }); await p.screenshot({ path: path.join(OUT, 'flyer-preview.png') });
  await b.close(); console.log('written to', OUT);
})();
