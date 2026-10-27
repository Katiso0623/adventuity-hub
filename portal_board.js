/* Adventuity portal – lesson whiteboard for tutors and the admin: pen, highlighter, shapes, text, typed maths (LaTeX),
   pictures, pages and grid/lined/axes backgrounds. Shown to the learner by presenting this tab in Google Meet. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, esc, state, toast } = ADV;
  const W = 1600, H = 900;                               // logical board size: 16:9, what a Meet presentation shows
  const COLS = ['#1c2733', '#c2362e', '#2b63a8', '#1f7a4d', '#d9661e', '#7b3fa0'];
  const SIZE = { s: 3, m: 6, l: 12 }; const FONT = { s: 30, m: 42, l: 60 };
  const I = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const TOOLS = [
    ['move', 'Select and move (V)', I('<path d="M5 3l14 8-6 2-2 6z"/>'), 'v'],
    ['pen', 'Pen (P)', I('<path d="M4 20l4-1 11-11-3-3L5 16z"/>'), 'p'],
    ['hl', 'Highlighter (H)', I('<path d="M9 15l-4 5h6l2-3M9 15l8-11 4 3-8 11z"/>'), 'h'],
    ['line', 'Line (L)', I('<path d="M5 19L19 5"/>'), 'l'],
    ['arrow', 'Arrow (A)', I('<path d="M5 19L19 5M10 5h9v9"/>'), 'a'],
    ['rect', 'Rectangle (R)', I('<rect x="4" y="6" width="16" height="12" rx="1"/>'), 'r'],
    ['ellipse', 'Circle (O)', I('<ellipse cx="12" cy="12" rx="8" ry="7"/>'), 'o'],
    ['text', 'Text (T)', I('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), 't'],
    ['math', 'Maths – type LaTeX like \\frac{dy}{dx} (M)', I('<path d="M4 18l3 2 4-14h9M13 11l6 7M19 11l-6 7"/>'), 'm'],
    ['eraser', 'Eraser (E)', I('<path d="M8 20h12M5 15l9-10 6 6-8 9H8z"/>'), 'e']
  ];
  const BGS = [['plain', 'Plain'], ['grid', 'Squares'], ['lines', 'Lined'], ['axes', 'Axes'], ['dots', 'Dots']];
  const KEY = 'adv-board-v1';
  const B = ADV.board = { pages: [], cur: 0, tool: 'pen', colour: COLS[0], size: 'm', sel: -1 };
  const page = () => B.pages[B.cur];
  const blank = (bg) => ({ items: [], bg: bg || 'grid', undo: [], redo: [] });
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.pages) && saved.pages.length) { B.pages = saved.pages.map((p) => Object.assign(blank(p.bg), { items: p.items || [] })); B.cur = Math.min(saved.cur || 0, B.pages.length - 1); } } catch (e) { /* storage off */ }
  if (!B.pages.length) B.pages.push(blank('grid'));

  let saveT = null, warned = false, dirty = false;
  function flush() {
    clearTimeout(saveT); if (!dirty) return; dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify({ cur: B.cur, pages: B.pages.map((p) => ({ bg: p.bg, items: p.items })) })); } catch (e) { if (!warned) { warned = true; toast('The board is too big to keep after a refresh – save pages you need as pictures.', 5000); } }
  }
  function save() { dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 400); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  function change(fn) { const p = page(); p.undo.push(p.items.slice()); if (p.undo.length > 200) p.undo.shift(); p.redo = []; fn(p); B.sel = -1; bar(); draw(); save(); }

  /* ---------------------------------------------------------------- drawing */
  let cv = null, ctx = null, stage = null, view = { s: 1, ox: 0, oy: 0 }, cur = null, ro = null;
  const imgs = new Map();
  function imgOf(src) { let im = imgs.get(src); if (!im) { im = new Image(); im.onload = () => draw(); im.src = src; imgs.set(src, im); } return im; }
  function bgPaint(c, bg) {
    c.save(); bgDraw(c, bg); c.restore();
  }
  function bgDraw(c, bg) {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    const line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    if (bg === 'grid' || bg === 'axes') { c.strokeStyle = '#e1e7ee'; c.lineWidth = 1; for (let x = 0; x <= W; x += 40) line(x, 0, x, H); for (let y = 20; y <= H; y += 40) line(0, y, W, y); }
    if (bg === 'lines') { c.strokeStyle = '#d6e2ef'; c.lineWidth = 1.2; for (let y = 90; y < H; y += 54) line(0, y, W, y); c.strokeStyle = '#efc2c2'; line(110, 0, 110, H); }
    if (bg === 'dots') { c.fillStyle = '#c3ccd6'; for (let x = 40; x < W; x += 40) for (let y = 20; y < H; y += 40) { c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); } }
    if (bg === 'axes') {
      const ox = 800, oy = 460; c.strokeStyle = '#55687a'; c.lineWidth = 2; line(40, oy, W - 40, oy); line(ox, 20, ox, H - 20);
      c.fillStyle = '#55687a'; c.beginPath(); c.moveTo(W - 30, oy); c.lineTo(W - 46, oy - 7); c.lineTo(W - 46, oy + 7); c.fill(); c.beginPath(); c.moveTo(ox, 10); c.lineTo(ox - 7, 26); c.lineTo(ox + 7, 26); c.fill();
      c.font = '20px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 1.6;
      for (let k = -9; k <= 9; k++) { if (!k) continue; const x = ox + k * 80; if (x < 60 || x > W - 60) continue; line(x, oy - 6, x, oy + 6); c.fillText(String(k * 2), x, oy + 10); }
      c.textAlign = 'right'; c.textBaseline = 'middle';
      for (let k = -5; k <= 5; k++) { if (!k) continue; const y = oy - k * 80; if (y < 40 || y > H - 30) continue; line(ox - 6, y, ox + 6, y); c.fillText(String(k * 2), ox - 12, y); }
      c.font = 'italic 26px Georgia, serif'; c.textAlign = 'left'; c.fillText('x', W - 40, oy + 26); c.fillText('y', ox + 14, 26); c.textAlign = 'right'; c.font = '20px system-ui, sans-serif'; c.fillText('0', ox - 8, oy + 18);
    }
  }
  function arrowHead(c, x1, y1, x2, y2, w) { const a = Math.atan2(y2 - y1, x2 - x1), L = 16 + w * 2.2; c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)); c.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)); c.closePath(); c.fill(); }
  function paint(c, it) {
    c.save(); c.strokeStyle = c.fillStyle = it.c || '#1c2733'; c.lineWidth = it.w || 4; c.lineCap = 'round'; c.lineJoin = 'round';
    if (it.t === 'stroke') {
      if (it.hl) { c.globalAlpha = 0.32; c.lineCap = 'butt'; }
      const p = it.pts; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
      if (p.length < 3) { p.forEach((q) => c.lineTo(q[0], q[1])); if (p.length === 1) c.lineTo(p[0][0] + 0.1, p[0][1]); }
      else { for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; c.quadraticCurveTo(p[i][0], p[i][1], mx, my); } const l = p[p.length - 1]; c.lineTo(l[0], l[1]); }
      c.stroke();
    } else if (it.t === 'line' || it.t === 'arrow') { c.beginPath(); c.moveTo(it.x1, it.y1); c.lineTo(it.x2, it.y2); c.stroke(); if (it.t === 'arrow') arrowHead(c, it.x1, it.y1, it.x2, it.y2, it.w); }
    else if (it.t === 'rect') { c.strokeRect(Math.min(it.x1, it.x2), Math.min(it.y1, it.y2), Math.abs(it.x2 - it.x1), Math.abs(it.y2 - it.y1)); }
    else if (it.t === 'ellipse') { c.beginPath(); c.ellipse((it.x1 + it.x2) / 2, (it.y1 + it.y2) / 2, Math.abs(it.x2 - it.x1) / 2 || 0.5, Math.abs(it.y2 - it.y1) / 2 || 0.5, 0, 0, 7); c.stroke(); }
    else if (it.t === 'text') { c.font = it.size + 'px "IBM Plex Sans", system-ui, sans-serif'; c.textBaseline = 'top'; c.textAlign = 'left'; String(it.text).split('\n').forEach((ln, i) => c.fillText(ln, it.x, it.y + i * it.size * 1.25)); }
    else if (it.t === 'img') { const im = imgOf(it.src); if (im.complete && im.naturalWidth) c.drawImage(im, it.x, it.y, it.w, it.h); }
    c.restore();
  }
  function bbox(it) {
    const pad = (it.w || 4) / 2 + 4;
    if (it.t === 'stroke') { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; it.pts.forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }); return [a - pad, b - pad, c + pad, d + pad]; }
    if (it.t === 'text' || it.t === 'img') return [it.x - 4, it.y - 4, it.x + (it.bw || it.w || 0) + 4, it.y + (it.bh || it.h || 0) + 4];
    return [Math.min(it.x1, it.x2) - pad, Math.min(it.y1, it.y2) - pad, Math.max(it.x1, it.x2) + pad, Math.max(it.y1, it.y2) + pad];
  }
  const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy; let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); };
  function hit(it, x, y, r) {
    const b = bbox(it); if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
    const tol = (it.w || 4) / 2 + r;
    if (it.t === 'stroke') { const p = it.pts; if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) <= tol; for (let i = 1; i < p.length; i++) if (segDist(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= tol) return true; return false; }
    if (it.t === 'line' || it.t === 'arrow') return segDist(x, y, it.x1, it.y1, it.x2, it.y2) <= tol;
    return true;
  }
  function draw() {
    if (!ctx || !cv) return;
    const r = window.devicePixelRatio || 1; ctx.setTransform(r, 0, 0, r, 0, 0);
    const cw = cv.width / r, ch = cv.height / r; ctx.fillStyle = '#c9d1da'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(r * view.s, 0, 0, r * view.s, r * view.ox, r * view.oy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    bgPaint(ctx, page().bg); page().items.forEach((it) => paint(ctx, it)); if (cur) paint(ctx, cur);
    if (B.sel >= 0 && page().items[B.sel]) { const b = bbox(page().items[B.sel]); ctx.setLineDash([8, 6]); ctx.strokeStyle = '#2b63a8'; ctx.lineWidth = 2; ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.setLineDash([]); }
    ctx.restore();
    const pg = $('#wb-page'); if (pg) pg.textContent = (B.cur + 1) + ' / ' + B.pages.length;
  }
  function fit() {
    if (!cv || !stage) return; const r = window.devicePixelRatio || 1; const cw = stage.clientWidth, ch = stage.clientHeight; if (!cw || !ch) return;
    cv.width = Math.round(cw * r); cv.height = Math.round(ch * r); cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    const s = Math.min(cw / W, ch / H); view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 }; draw();
  }

  /* ---------------------------------------------------------------- pointer input */
  let lastPen = 0, drag = null, active = null;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left - view.ox) / view.s, (e.clientY - b.top - view.oy) / view.s]; };
  function snap(x1, y1, x2, y2, t, shift) {
    if (!shift) return [x2, y2];
    if (t === 'line' || t === 'arrow') { const a = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(x2 - x1, y2 - y1); return [x1 + L * Math.cos(a), y1 + L * Math.sin(a)]; }
    const d = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); return [x1 + Math.sign(x2 - x1 || 1) * d, y1 + Math.sign(y2 - y1 || 1) * d];
  }
  function down(e) {
    if (e.pointerType === 'pen') lastPen = Date.now(); else if (e.pointerType === 'touch' && Date.now() - lastPen < 1500) return;   // palm rejection
    if (active !== null || (e.button && e.button !== 0)) return;
    commitText();
    const [x, y] = at(e); const t = B.tool; e.preventDefault();
    if (t === 'text' || t === 'math') { openText(x, y, t); return; }
    active = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (x2) { /* ignore */ }
    if (t === 'move') {
      const items = page().items; let i = items.length - 1; for (; i >= 0; i--) if (hit(items[i], x, y, 6 / view.s)) break;
      B.sel = i; if (i >= 0) { const p = page(); p.undo.push(p.items.slice()); p.redo = []; const copy = JSON.parse(JSON.stringify(items[i])); items[i] = copy; drag = { x, y, it: copy, moved: false }; }
      bar(); draw(); return;
    }
    if (t === 'eraser') { drag = { erased: false }; eraseAt(x, y); return; }
    const w = SIZE[B.size] * (t === 'hl' ? 3.2 : 1) * (e.pointerType === 'pen' && e.pressure ? 0.55 + e.pressure * 0.9 : 1);
    cur = (t === 'pen' || t === 'hl') ? { t: 'stroke', c: t === 'hl' ? (B.colour === COLS[0] ? '#f0c419' : B.colour) : B.colour, w, hl: t === 'hl', pts: [[x, y]] } : { t, c: B.colour, w: SIZE[B.size], x1: x, y1: y, x2: x, y2: y };
    draw();
  }
  function move(e) {
    if (e.pointerId !== active) return; e.preventDefault(); const [x, y] = at(e);
    if (B.tool === 'move') { if (drag) { const dx = x - drag.x, dy = y - drag.y; drag.x = x; drag.y = y; drag.moved = true; const it = drag.it; if (it.pts) it.pts.forEach((p) => { p[0] += dx; p[1] += dy; }); else if ('x1' in it) { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; } else { it.x += dx; it.y += dy; } draw(); } return; }
    if (B.tool === 'eraser') { eraseAt(x, y); return; }
    if (!cur) return;
    if (cur.t === 'stroke') { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; evs.forEach((ev) => { const q = at(ev); const l = cur.pts[cur.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.8) cur.pts.push([Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]); }); }
    else { const [sx, sy] = snap(cur.x1, cur.y1, x, y, cur.t, e.shiftKey); cur.x2 = sx; cur.y2 = sy; }
    draw();
  }
  function up(e) {
    if (e.pointerId !== active) return; active = null;
    if (B.tool === 'move') { if (drag && !drag.moved) page().undo.pop(); drag = null; save(); bar(); draw(); return; }
    if (B.tool === 'eraser') { drag = null; save(); bar(); return; }
    if (cur) { const it = cur; cur = null; const tiny = it.t !== 'stroke' && Math.hypot(it.x2 - it.x1, it.y2 - it.y1) < 4; if (!tiny) change((p) => p.items.push(it)); else draw(); }
  }
  function eraseAt(x, y) {
    const p = page(); const r = 10 / view.s; const keep = p.items.filter((it) => !hit(it, x, y, r));
    if (keep.length !== p.items.length) { if (!drag.erased) { p.undo.push(p.items.slice()); p.redo = []; drag.erased = true; } p.items = keep; draw(); }
  }

  /* ---------------------------------------------------------------- text and typed maths */
  let ta = null;
  function openText(x, y, kind) {
    ta = document.createElement('textarea'); ta.className = 'wb-text' + (kind === 'math' ? ' math' : ''); ta.rows = 1; ta.dataset.kind = kind; ta.dataset.x = x; ta.dataset.y = y;
    ta.placeholder = kind === 'math' ? 'Type maths, e.g. \\frac{dy}{dx} = 3x^2 - 4  ·  Enter to place' : 'Type, Enter to place (Shift+Enter: new line)';
    ta.style.left = (view.ox + x * view.s) + 'px'; ta.style.top = (view.oy + y * view.s) + 'px'; ta.style.fontSize = Math.max(12, FONT[B.size] * view.s) + 'px'; ta.style.color = B.colour;
    stage.appendChild(ta); ta.focus(); setTimeout(() => { if (ta && document.activeElement !== ta) ta.focus(); }, 0);
    ta.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitText(); } if (ev.key === 'Escape') { ta.remove(); ta = null; } });
    const el = ta; ta.addEventListener('blur', () => setTimeout(() => { if (ta === el) commitText(); }, 0));
  }
  function commitText() {
    if (!ta) return; const el = ta; ta = null; const text = el.value.replace(/\s+$/, ''); const kind = el.dataset.kind, x = Number(el.dataset.x), y = Number(el.dataset.y); el.remove();
    if (!text.trim()) return;
    const size = FONT[B.size], c = B.colour;
    const asText = () => { const m = document.createElement('canvas').getContext('2d'); m.font = size + 'px "IBM Plex Sans", system-ui, sans-serif'; const lines = text.split('\n'); change((p) => p.items.push({ t: 'text', c, size, x, y, text, bw: Math.max(...lines.map((l) => m.measureText(l).width)), bh: lines.length * size * 1.25 })); };
    if (kind !== 'math') return asText();
    mathImage(text, c, size).then((r) => change((p) => p.items.push({ t: 'img', x, y, w: r.w, h: r.h, src: r.src, tex: text })))
      .catch((err) => { if (err && err.tex) { toast('Check the maths: ' + err.message, 5000); openText(x, y, 'math'); if (ta) ta.value = text; } else { toast((err && err.message) || 'Placed as plain text', 4000); asText(); } });
  }
  function mathImage(tex, colour, size) {
    return new Promise((resolve, reject) => {
      if (!window.MathJax || !MathJax.tex2svg) return reject(new Error('The maths engine is still loading – try again in a moment'));
      let node; try { node = MathJax.tex2svg(tex, { display: true }); } catch (e) { return reject(e); }
      const svg = node.querySelector('svg'); if (!svg) return reject(new Error('Could not draw that'));
      const errEl = svg.querySelector('[data-mjx-error]'); if (errEl) { const er = new Error(errEl.getAttribute('data-mjx-error') || 'not understood'); er.tex = true; return reject(er); }
      const fc = MathJax.startup && MathJax.startup.output && MathJax.startup.output.fontCache;
      if (svg.querySelector('use')) { const defs = (fc && fc.defs) || document.querySelector('#MJX-SVG-global-cache defs'); if (defs) svg.insertBefore(defs.cloneNode(true), svg.firstChild); }
      const ex = size * 0.5; const w = parseFloat(svg.getAttribute('width')) * ex, h = parseFloat(svg.getAttribute('height')) * ex;
      if (!(w > 0 && h > 0)) return reject(new Error('Could not draw that'));
      svg.setAttribute('width', w); svg.setAttribute('height', h); svg.removeAttribute('style');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg).replace(/currentColor/g, colour));
      const im = new Image();
      im.onload = () => { try { const c = document.createElement('canvas'); c.width = Math.ceil(w * 2); c.height = Math.ceil(h * 2); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); resolve({ src: c.toDataURL('image/png'), w, h }); } catch (e) { resolve({ src: url, w, h }); } };
      im.onerror = () => reject(new Error('Could not draw that')); im.src = url;
    });
  }

  /* ---------------------------------------------------------------- pictures */
  function addPicture(file) {
    if (!file || !/^image\//.test(file.type)) return;
    if (file.size > 12 * 1024 * 1024) return toast('Use a picture smaller than 12 MB');
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1400 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86);
        const f = Math.min(1, (W * 0.6) / c.width, (H * 0.7) / c.height); const w = c.width * f, h = c.height * f;
        change((p) => p.items.push({ t: 'img', x: (W - w) / 2, y: (H - h) / 2, w, h, src })); B.tool = 'move'; B.sel = page().items.length - 1; bar(); draw();
        toast('Picture added – drag it with the select tool', 3000);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  document.addEventListener('paste', (e) => { if (state.tab !== 'board' || ta) return; const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); addPicture(f); } });

  /* ---------------------------------------------------------------- toolbar and view */
  function barHtml() {
    const cur = ADV.currentLesson && ADV.currentLesson();
    return (cur ? '<div class="wb-group wb-timer">' + ADV.lessonTimer(cur) + '</div>' : '') + '<div class="wb-group" role="group" aria-label="Tools">' + TOOLS.map(([k, label, ic]) => '<button type="button" class="wb-btn' + (B.tool === k ? ' on' : '') + '" data-wb="tool" data-v="' + k + '" title="' + esc(label) + '" aria-label="' + esc(label) + '" aria-pressed="' + (B.tool === k) + '">' + ic + '</button>').join('') + '</div>' +
      '<div class="wb-group" role="group" aria-label="Colour">' + COLS.map((c) => '<button type="button" class="wb-col' + (B.colour === c ? ' on' : '') + '" data-wb="col" data-v="' + c + '" style="--c:' + c + '" aria-label="Colour ' + c + '"></button>').join('') + '</div>' +
      '<div class="wb-group" role="group" aria-label="Size">' + ['s', 'm', 'l'].map((z) => '<button type="button" class="wb-btn' + (B.size === z ? ' on' : '') + '" data-wb="size" data-v="' + z + '" aria-label="' + { s: 'Thin', m: 'Medium', l: 'Thick' }[z] + '"><i class="wb-dot" style="width:' + (SIZE[z] + 4) + 'px;height:' + (SIZE[z] + 4) + 'px"></i></button>').join('') + '</div>' +
      '<div class="wb-group"><label class="sr" for="wb-bg">Background</label><select id="wb-bg" data-wb="bg">' + BGS.map(([k, l]) => '<option value="' + k + '"' + (page().bg === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<div class="wb-group" role="group" aria-label="Pages"><button type="button" class="wb-btn" data-wb="prev" aria-label="Previous page"' + (B.cur ? '' : ' disabled') + '>‹</button><span id="wb-page" class="wb-page">' + (B.cur + 1) + ' / ' + B.pages.length + '</span><button type="button" class="wb-btn" data-wb="next" aria-label="Next page"' + (B.cur < B.pages.length - 1 ? '' : ' disabled') + '>›</button><button type="button" class="wb-btn wide" data-wb="add" title="New page">+ Page</button></div>' +
      '<div class="wb-group"><button type="button" class="wb-btn wide" data-wb="undo" title="Undo (Ctrl+Z)"' + (page().undo.length ? '' : ' disabled') + '>Undo</button><button type="button" class="wb-btn wide" data-wb="redo" title="Redo (Ctrl+Y)"' + (page().redo.length ? '' : ' disabled') + '>Redo</button>' + (B.sel >= 0 ? '<button type="button" class="wb-btn wide" data-wb="del">Delete</button>' : '') + '<button type="button" class="wb-btn wide" data-wb="clear">Clear</button></div>' +
      '<div class="wb-group"><label class="wb-btn wide file-btn" title="Insert a picture (or paste one with Ctrl+V)">Picture<input type="file" accept="image/*" data-wb="pic" hidden></label><button type="button" class="wb-btn wide" data-wb="png" title="Save this page as a picture">Save</button><button type="button" class="wb-btn wide" data-wb="full" title="Full screen">' + (document.fullscreenElement ? 'Exit full screen' : 'Full screen') + '</button></div>';
  }
  function bar() { const b = $('#wb-bar'); if (b) b.innerHTML = barHtml(); }
  ADV.views.board = function () {
    return '<div class="stack"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="eyebrow">Lesson board</span><h1>Board</h1></div><button class="btn sm ghost" data-wb="help">' + (state.wbHelp ? 'Hide how to share' : 'How to show it in Google Meet') + '</button></div>' +
      (state.wbHelp ? '<div class="callout small"><ol class="wb-help"><li>Start the lesson (<b>Join</b> on your lesson) and keep this portal open in another tab.</li><li>In Google Meet click <b>Present now</b> (the screen icon) → <b>A tab</b> → choose this <b>Adventuity</b> tab → <b>Share</b>. On a laptop without Chrome, choose <b>A window</b>.</li><li>Write with a mouse, touchscreen or stylus. Use <b>Full screen</b> for the biggest board; the learner sees everything live.</li><li><b>Maths</b> tool: type LaTeX such as <span class="mono">x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}</span>. Paste a screenshot of a question with Ctrl+V.</li><li>The board stays on this device until you clear it. <b>Save</b> a page to send it to the learner on WhatsApp.</li></ol></div>' : '') +
      '<div class="wb" id="wb"><div class="wb-bar" id="wb-bar">' + barHtml() + '</div><div class="wb-stage" id="wb-stage"><canvas id="wb-cv" aria-label="Whiteboard – draw here"></canvas></div></div></div>';
  };
  function attach() {
    const st = $('#wb-stage'); if (!st || st === stage) return;
    if (ro) ro.disconnect(); stage = st; cv = $('#wb-cv'); ctx = cv.getContext('2d'); cur = null; active = null; ta = null;
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(stage); } fit();
  }
  ADV.after.push(() => { if (state.tab === 'board' && !state.topic) attach(); else { stage = null; if (ro) { ro.disconnect(); ro = null; } } });
  window.addEventListener('resize', () => { if (stage && document.contains(stage)) fit(); });
  document.addEventListener('fullscreenchange', () => { bar(); setTimeout(fit, 60); });

  function go(i) { commitText(); B.cur = Math.max(0, Math.min(B.pages.length - 1, i)); B.sel = -1; bar(); draw(); save(); }
  function undo(dir) { const p = page(); const from = dir < 0 ? p.undo : p.redo, to = dir < 0 ? p.redo : p.undo; if (!from.length) return; to.push(p.items.slice()); p.items = from.pop(); B.sel = -1; bar(); draw(); save(); }
  function exportPng() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); bgPaint(x, page().bg); page().items.forEach((it) => paint(x, it));
    try { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'adventuity-board-page-' + (B.cur + 1) + '.png'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { toast('Could not save this page'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wb]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return; const k = b.dataset.wb, v = b.dataset.v;
    if (k === 'help') { state.wbHelp = !state.wbHelp; ADV.render(); return; }
    if (k === 'tool') { commitText(); B.tool = v; B.sel = -1; }
    if (k === 'col') { B.colour = v; const it = page().items[B.sel]; if (B.sel >= 0 && it && it.t !== 'img') change((p) => { p.items[B.sel] = Object.assign({}, it, { c: v }); }); }
    if (k === 'size') B.size = v;
    if (k === 'prev') return go(B.cur - 1);
    if (k === 'next') return go(B.cur + 1);
    if (k === 'add') { B.pages.splice(B.cur + 1, 0, blank(page().bg)); return go(B.cur + 1); }
    if (k === 'undo') return undo(-1);
    if (k === 'redo') return undo(1);
    if (k === 'del' && B.sel >= 0) { const i = B.sel; change((p) => p.items.splice(i, 1)); }
    if (k === 'clear') {
      if (!page().items.length && B.pages.length > 1) { if (confirm('Remove this empty page?')) { B.pages.splice(B.cur, 1); return go(Math.min(B.cur, B.pages.length - 1)); } return; }
      if (page().items.length && confirm('Clear everything on this page?')) change((p) => { p.items = []; });
    }
    if (k === 'png') return exportPng();
    if (k === 'full') { const el = $('#wb'); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else if (el && el.requestFullscreen) el.requestFullscreen().catch(() => toast('Full screen is not available in this browser')); else toast('Full screen is not available in this browser'); return; }
    bar(); draw();
  });
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset || !t.dataset.wb) return;
    if (t.dataset.wb === 'bg') { page().bg = t.value; draw(); save(); }
    if (t.dataset.wb === 'pic' && t.files && t.files[0]) { addPicture(t.files[0]); t.value = ''; }
  });
  document.addEventListener('keydown', (e) => {
    if (state.tab !== 'board' || state.topic || ta || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
    const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
    if (mod && k === 'y') { e.preventDefault(); undo(1); return; }
    if (mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && B.sel >= 0) { e.preventDefault(); const i = B.sel; change((p) => p.items.splice(i, 1)); bar(); return; }
    if (e.key === 'PageDown') { e.preventDefault(); go(B.cur + 1); return; }
    if (e.key === 'PageUp') { e.preventDefault(); go(B.cur - 1); return; }
    const t = TOOLS.find((x) => x[3] === k); if (t) { B.tool = t[0]; B.sel = -1; bar(); draw(); }
  });
})();
