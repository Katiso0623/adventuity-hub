/* Adventuity tutor recruitment ads: Facebook/Instagram post (4:5), square post, story/status,
   link-preview landscape and a printable A4 poster.   node marketing/make_tutors.js [outDir] */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const D = __dirname, OUT = process.argv[2] || path.join(D, 'tutors', 'out');
fs.mkdirSync(OUT, { recursive: true });

const APPLY = 'https://katiso0623.github.io/adventuity-hub/tutor-apply.html';
const SHORT_HTML = ['katiso0623.github.io/', 'adventuity-hub/', 'tutor-apply.html'].map((x) => `<span style="white-space:nowrap">${x}</span>`).join('<wbr>');
const PHONE = '082 397 6521';
const EMAILS = ['kaytkayt5@gmail.com', 'nthastara@yahoo.com'];
const SUBJ = ['Mathematics', 'Physics', 'Chemistry'];
const NEED = ['A qualification or studies in a related field', 'Strong Grade 12 CAPS / NSC subject knowledge', 'A laptop and a stable internet connection', 'Clear, step-by-step explanations'];
const GET = ['Flexible hours – mostly afternoons and Saturdays', 'Teach from home with video, screen share and a whiteboard', 'We find the learners and handle bookings and payments', 'Notes, exam questions and memos to teach from'];
const STEPS = ['Apply online and upload your CV', 'We review it, usually within a week', 'Short online interview and a 10-minute demo lesson', 'Agree on rates and hours, then start teaching'];

const b64 = (f) => fs.readFileSync(f).toString('base64');
const LOGO_W = 'data:image/png;base64,' + b64(path.join(D, '..', 'brand', 'logo_full_white.png'));
const QR = fs.readFileSync(path.join(D, 'tutors', 'qr-apply.svg'), 'utf8').replace(/^[\s\S]*?<svg/, '<svg').replace(/width="600" height="600"/, 'width="100%" height="100%" viewBox="0 0 600 600"');

const ICONS = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  link: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const ic = (n, s, c = 'currentColor', sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${ICONS[n]}</svg>`;

const base = `*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%}
body{font-family:Inter,system-ui,sans-serif;color:#fff;background:#1c3246;-webkit-font-smoothing:antialiased}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:54px 54px}
.glow{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(156,198,234,.28),rgba(156,198,234,0) 70%)}
h1,h2,.disp{font-family:"Inter Display",Inter,sans-serif;letter-spacing:-.02em}
.eyebrow{font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#9cc6ea}
.pill{display:inline-flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;background:#fff;color:#1c3246;border-radius:999px}
.pill i{width:12px;height:12px;border-radius:50%;background:#e0483e;display:block}
.chip{font-weight:600;border:2px solid rgba(255,255,255,.4);border-radius:999px;white-space:nowrap}
.big3{font-family:"Inter Display",Inter,sans-serif;font-weight:800;color:#9cc6ea;line-height:.78;letter-spacing:-.04em}
.card{background:#fff;color:#1c3246;border-radius:28px}
.qr{background:#fff;border-radius:22px}
.qr svg{display:block}
.list{list-style:none;display:grid}
.list li{display:flex;align-items:flex-start}
.contact{display:flex;align-items:center}
.link{font-weight:600;overflow-wrap:anywhere}`;

const head = (logoW, pillFs) => `<div style="display:flex;align-items:center;justify-content:space-between"><img src="${LOGO_W}" style="width:${logoW}px"><span class="pill" style="font-size:${pillFs}px;padding:${Math.round(pillFs * 0.55)}px ${Math.round(pillFs * 1.05)}px"><i></i>We're hiring</span></div>`;
const title = (n, t, gap) => `<div style="display:flex;align-items:flex-end;gap:${gap}px"><span class="big3" style="font-size:${n}px">3</span><h1 style="font-size:${t}px;line-height:.95;font-weight:800;padding-bottom:${Math.round(n * 0.04)}px">Tutors<br>wanted</h1></div>`;
const chips = (fs, pad) => `<div style="display:flex;gap:12px;flex-wrap:wrap">${SUBJ.map((s) => `<span class="chip" style="font-size:${fs}px;padding:${pad}px ${pad * 2}px">${s}</span>`).join('')}</div>`;
const list = (items, fs, gap, col) => `<ul class="list" style="gap:${gap}px">${items.map((t) => `<li style="gap:12px;font-size:${fs}px;line-height:1.3">${ic('check', Math.round(fs * 1.1), col, 3)}<span>${t}</span></li>`).join('')}</ul>`;
const contacts = (fs, col, gap) => `<div style="display:grid;gap:${gap}px">
<div class="contact" style="gap:14px;font-size:${fs}px;font-weight:700">${ic('phone', Math.round(fs * 1.05), col)}<span>Call or WhatsApp ${PHONE}</span></div>
${EMAILS.map((e) => `<div class="contact" style="gap:14px;font-size:${fs}px">${ic('mail', Math.round(fs * 1.05), col)}<span>${e}</span></div>`).join('')}</div>`;
const page = (w, h, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${base}
.wrap{position:relative;width:${w}px;height:${h}px;display:flex;flex-direction:column}${extra}
</style></head><body><div class="grid"></div>${body}</body></html>`;

/* ---- Facebook / Instagram feed post, 4:5 (1080 x 1350) ---- */
const post45 = page(1080, 1350, `<div class="glow" style="width:900px;height:900px;left:-380px;top:120px"></div><div class="wrap" style="padding:64px 72px 52px">
${head(210, 22)}
<p class="eyebrow" style="font-size:24px;margin-top:52px">Online tutor jobs · South Africa</p>
<div style="margin-top:22px">${title(300, 112, 26)}</div>
<p style="font-size:31px;line-height:1.35;margin-top:30px;color:#dbe7f2">Teach <b style="color:#fff">Grade 12 Mathematics and Physical Sciences</b> in live online lessons – one-on-one or in small groups.</p>
<div style="margin-top:26px">${chips(24, 10)}</div>
<div class="card" style="margin-top:34px;padding:30px 34px;display:grid;grid-template-columns:1fr 1fr;gap:30px">
<div><p class="eyebrow" style="font-size:17px;color:#2b63a8;margin-bottom:14px">You need</p>${list(NEED.slice(0, 3), 21, 12, '#2b63a8')}</div>
<div><p class="eyebrow" style="font-size:17px;color:#2b63a8;margin-bottom:14px">You get</p>${list([GET[0], GET[2], GET[3]], 21, 12, '#2b63a8')}</div></div>
<div style="margin-top:auto;display:flex;gap:36px;align-items:center">
<div class="qr" style="width:226px;height:226px;padding:14px;flex:none">${QR}</div>
<div style="min-width:0"><p class="disp" style="font-size:44px;font-weight:800;line-height:1.05">Apply with your CV</p>
<p class="link" style="font-size:21px;color:#9cc6ea;margin-top:8px">${SHORT_HTML}</p>
<div style="margin-top:16px">${contacts(23, '#9cc6ea', 8)}</div></div></div>
</div>`);

/* ---- Square post (1080 x 1080) ---- */
const square = page(1080, 1080, `<div class="glow" style="width:820px;height:820px;left:-330px;top:40px"></div><div class="wrap" style="padding:60px 68px 56px">
${head(196, 21)}
<div style="margin-top:46px">${title(270, 100, 24)}</div>
<p style="font-size:31px;line-height:1.3;margin-top:26px;color:#dbe7f2">Grade 12 Maths & Physical Sciences · live online lessons</p>
<div style="margin-top:22px">${chips(23, 9)}</div>
<div style="margin-top:34px;display:grid;grid-template-columns:1fr 1fr;gap:14px 30px;padding:24px 28px;border-radius:22px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)">
${['Flexible hours', 'Teach from home', 'We find the learners', 'Notes and memos provided'].map((t) => `<div style="display:flex;gap:12px;align-items:center;font-size:24px;font-weight:600">${ic('check', 26, '#9cc6ea', 3)}<span>${t}</span></div>`).join('')}</div>
<div style="margin-top:auto;display:flex;gap:34px;align-items:flex-end">
<div style="flex:1;min-width:0"><p class="disp" style="font-size:42px;font-weight:800">Apply with your CV</p>
<p class="link" style="font-size:20px;color:#9cc6ea;margin:8px 0 16px">${SHORT_HTML}</p>${contacts(23, '#9cc6ea', 8)}</div>
<div style="text-align:center;flex:none"><div class="qr" style="width:236px;height:236px;padding:14px">${QR}</div><p style="font-size:21px;font-weight:600;margin-top:10px">Scan to apply</p></div></div>
</div>`);

/* ---- Story / WhatsApp Status (1080 x 1920) ---- */
const story = page(1080, 1920, `<div class="glow" style="width:1100px;height:1100px;left:-420px;top:160px"></div><div class="wrap" style="padding:96px 84px 84px">
${head(250, 25)}
<p class="eyebrow" style="font-size:28px;margin-top:64px">Online tutor jobs · South Africa</p>
<div style="margin-top:24px">${title(360, 134, 30)}</div>
<p style="font-size:37px;line-height:1.35;margin-top:36px;color:#dbe7f2">Teach <b style="color:#fff">Grade 12 Mathematics and Physical Sciences</b> in live online lessons – one-on-one or in small groups.</p>
<div style="margin-top:32px">${chips(28, 12)}</div>
<div class="card" style="margin-top:42px;padding:36px 42px;display:grid;gap:26px">
<div><p class="eyebrow" style="font-size:20px;color:#2b63a8;margin-bottom:16px">You need</p>${list(NEED, 27, 13, '#2b63a8')}</div>
<div style="border-top:2px solid #e3e8ee;padding-top:26px"><p class="eyebrow" style="font-size:20px;color:#2b63a8;margin-bottom:16px">You get</p>${list(GET, 27, 13, '#2b63a8')}</div></div>
<div style="margin-top:auto;display:flex;gap:40px;align-items:center">
<div class="qr" style="width:290px;height:290px;padding:16px;flex:none">${QR}</div>
<div style="min-width:0"><p class="disp" style="font-size:50px;font-weight:800;line-height:1.05">Apply with your CV</p>
<p class="link" style="font-size:23px;color:#9cc6ea;margin:10px 0 18px">${SHORT_HTML}</p>${contacts(26, '#9cc6ea', 9)}</div></div>
<p style="font-size:22px;color:#9cc6ea;margin-top:30px">Adventuity (Pty) Ltd · Transforming ideas into reality.</p>
</div>`);

/* ---- Landscape link / LinkedIn / X image (1200 x 630) ---- */
const wide = page(1200, 630, `<div class="glow" style="width:760px;height:760px;left:-260px;top:-80px"></div><div class="wrap" style="padding:44px 56px 44px;flex-direction:row;gap:44px;align-items:stretch">
<div style="flex:1;display:flex;flex-direction:column;min-width:0">
<div style="display:flex;align-items:flex-start;gap:22px"><img src="${LOGO_W}" style="width:150px"><span class="pill" style="font-size:16px;padding:9px 17px;margin-top:14px"><i></i>We're hiring</span></div>
<div style="margin-top:24px">${title(200, 78, 20)}</div>
<p style="font-size:24px;line-height:1.3;margin-top:18px;color:#dbe7f2">Grade 12 Maths & Physical Sciences · online</p>
<div style="margin-top:auto">${contacts(20, '#9cc6ea', 6)}</div></div>
<div style="width:300px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
<div class="qr" style="width:268px;height:268px;padding:16px">${QR}</div>
<p class="disp" style="font-size:30px;font-weight:800;margin-top:16px">Scan to apply</p><p style="font-size:17px;color:#9cc6ea;margin-top:6px">Upload your CV online</p></div>
</div>`);

/* ---- A4 poster (PDF) ---- */
const a4 = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
@page{size:A4;margin:0}
body{background:#fff;color:#1c3246}
.page{width:210mm;height:297mm;position:relative;display:flex;flex-direction:column}
.top{background:#1c3246;color:#fff;padding:13mm 16mm 11mm;position:relative;overflow:hidden}
.top .grid{background-size:9mm 9mm}
.sec{padding:0 16mm}
h2{font-size:15pt;font-weight:800;margin:0 0 3.5mm}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:9mm}
ol{list-style:none;counter-reset:s;display:grid;grid-template-columns:1fr 1fr;gap:3mm 9mm}
ol li{counter-increment:s;display:grid;grid-template-columns:8mm 1fr;gap:2.5mm;font-size:10.5pt;line-height:1.35;align-items:start}
ol li::before{content:counter(s);width:7mm;height:7mm;border-radius:50%;background:#1c3246;color:#fff;display:grid;place-items:center;font-weight:700;font-size:9.5pt}
</style></head><body><div class="page">
<div class="top"><div class="grid"></div><div class="glow" style="width:150mm;height:150mm;left:-60mm;top:-20mm"></div><div style="position:relative">
<div style="display:flex;justify-content:space-between;align-items:center"><img src="${LOGO_W}" style="width:36mm"><span class="pill" style="font-size:8.5pt;padding:2mm 4mm;gap:2mm"><i style="width:2.2mm;height:2.2mm"></i>We're hiring</span></div>
<p class="eyebrow" style="font-size:9pt;margin-top:6mm">Online tutor jobs · South Africa</p>
<div style="display:flex;align-items:flex-end;gap:5mm;margin-top:3mm"><span class="big3" style="font-size:96pt">3</span><h1 style="font-size:38pt;line-height:.95;font-weight:800;padding-bottom:1.5mm">Tutors<br>wanted</h1></div>
<p style="font-size:12.5pt;line-height:1.4;margin-top:5mm;color:#dbe7f2">Teach <b style="color:#fff">Grade 12 Mathematics and Physical Sciences</b> (Physics and Chemistry) in live online lessons – one-on-one or in small groups – to matric learners across South Africa.</p></div></div>
<div class="sec" style="margin-top:8mm"><div class="cols">
<div><h2>You need</h2>${list(NEED, 13.5, 9, '#2b63a8').replace(/font-size:13.5px/g, 'font-size:10.5pt').replace(/width="15" height="15"/g, 'width="13" height="13"')}</div>
<div><h2>You get</h2>${list(GET, 13.5, 9, '#2b63a8').replace(/font-size:13.5px/g, 'font-size:10.5pt').replace(/width="15" height="15"/g, 'width="13" height="13"')}</div></div>
<p style="font-size:9.5pt;color:#55687a;margin-top:4mm">Rates and hours are agreed at the interview.</p></div>
<div class="sec" style="margin-top:7mm"><h2>How to apply</h2><ol>${STEPS.map((s) => `<li>${s}</li>`).join('')}</ol></div>
<div class="sec" style="margin-top:auto;padding-top:7mm;margin-bottom:11mm"><div style="display:flex;gap:8mm;align-items:center;border:.5mm solid #1c3246;border-radius:6mm;padding:7mm">
<div style="width:44mm;height:44mm;flex:none">${QR}</div>
<div style="min-width:0"><p class="disp" style="font-size:21pt;font-weight:800">Apply online with your CV</p>
<p style="font-size:10.5pt;margin-top:1.5mm">Scan the code with your phone camera, or visit</p><p style="font-size:10.5pt;font-weight:700;margin-top:.5mm;overflow-wrap:anywhere">${APPLY.replace('https://', '')}</p>
<div style="margin-top:4mm;color:#1c3246">${contacts(13.5, '#2b63a8', 4).replace(/font-size:13.5px/g, 'font-size:10.5pt').replace(/width="14" height="14"/g, 'width="12" height="12"')}</div>
<p style="font-size:8.5pt;color:#55687a;margin-top:4mm">Adventuity (Pty) Ltd · Transforming ideas into reality.</p></div></div></div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const shot = async (html, name, w, h) => {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    const over = await p.evaluate(() => { const w = document.querySelector('.wrap'); return w ? w.scrollHeight - w.clientHeight : 0; });
    if (over > 0) console.warn('OVERFLOW', name, over + 'px');
    await p.screenshot({ path: path.join(OUT, name) }); await p.close();
  };
  await shot(post45, 'adventuity-tutors-wanted-facebook-1080x1350.png', 1080, 1350);
  await shot(square, 'adventuity-tutors-wanted-square-1080x1080.png', 1080, 1080);
  await shot(story, 'adventuity-tutors-wanted-story-1080x1920.png', 1080, 1920);
  await shot(wide, 'adventuity-tutors-wanted-link-1200x630.png', 1200, 630);
  const p = await b.newPage(); await p.setContent(a4, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.pdf({ path: path.join(OUT, 'adventuity-tutors-wanted-A4.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.setViewportSize({ width: 794, height: 1123 }); await p.screenshot({ path: path.join(OUT, 'a4-preview.png') });
  await b.close(); console.log('written to', OUT);
})();
