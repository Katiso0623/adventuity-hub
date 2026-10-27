/* Adventuity figure renderer: turns a small JSON spec (see FIG_SPEC.md) into an SVG string. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v));

  /* ---------- expression compiler: "x^3 - 3*x" -> function(x) */
  function compile(src, deg) {
    const s = String(src).replace(/\s+/g, '').replace(/−/g, '-');
    const toks = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; toks.push({ t: 'n', v: parseFloat(s.slice(i, j)) }); i = j; }
      else if (/[a-z]/i.test(c)) { let j = i; while (j < s.length && /[a-z0-9]/i.test(s[j])) j++; toks.push({ t: 'id', v: s.slice(i, j).toLowerCase() }); i = j; }
      else if ('+-*/^(),'.includes(c)) { toks.push({ t: c }); i++; }
      else throw new Error('Unexpected character ' + c);
    }
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const D = deg ? Math.PI / 180 : 1;
    const F = { sin: (a) => Math.sin(a * D), cos: (a) => Math.cos(a * D), tan: (a) => Math.tan(a * D), asin: (a) => Math.asin(a) / D, acos: (a) => Math.acos(a) / D, atan: (a) => Math.atan(a) / D, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor };
    const C = { pi: Math.PI, e: Math.E };
    function expr() { let left = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; const right = term(); const l = left; left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x); } return left; }
    function term() { let left = unary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = next().t; const right = unary(); const l = left; left = op === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x); } return left; }
    function unary() { if (peek() && peek().t === '-') { next(); const u = unary(); return (x) => -u(x); } if (peek() && peek().t === '+') { next(); return unary(); } return power(); }
    function power() { const base = atom(); if (peek() && peek().t === '^') { next(); const ex = unary(); return (x) => Math.pow(base(x), ex(x)); } return base; }
    function atom() {
      const tk = next(); if (!tk) throw new Error('Unexpected end');
      if (tk.t === 'n') return () => tk.v;
      if (tk.t === '(') { const e = expr(); if (!peek() || next().t !== ')') throw new Error('Missing )'); return e; }
      if (tk.t === 'id') {
        if (tk.v === 'x' || tk.v === 't') return (x) => x;
        if (C[tk.v] != null) return () => C[tk.v];
        if (F[tk.v]) { if (!peek() || next().t !== '(') throw new Error('Expected ( after ' + tk.v); const arg = expr(); if (!peek() || next().t !== ')') throw new Error('Missing )'); const fn = F[tk.v]; return (x) => fn(arg(x)); }
        throw new Error('Unknown name ' + tk.v);
      }
      throw new Error('Unexpected token');
    }
    const fn = expr(); if (p < toks.length) throw new Error('Trailing input');
    return fn;
  }

  function niceStep(range, target) { const raw = range / target; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / mag; const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10; return step * mag; }
  const fmtTick = (v) => { const r = Math.round(v * 1000) / 1000; return String(r).replace('.', ','); };

  /* ---------- plot */
  function plot(spec) {
    const W = 560, H = 360, m = { l: 40, r: 16, t: 14, b: 30 };
    const x0 = num(spec.x[0]), x1 = num(spec.x[1]), y0 = num(spec.y[0]), y1 = num(spec.y[1]);
    const sx = (x) => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r), sy = (y) => H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b);
    const xs = spec.xstep || niceStep(x1 - x0, 8), ys = spec.ystep || niceStep(y1 - y0, 6);
    let out = '<svg class="fig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Graph"><defs><clipPath id="cp"><rect x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '"/></clipPath></defs>';
    // grid + ticks
    for (let x = Math.ceil(x0 / xs) * xs; x <= x1 + 1e-9; x += xs) { const X = sx(x); out += '<line x1="' + X + '" y1="' + m.t + '" x2="' + X + '" y2="' + (H - m.b) + '" class="grid"/>'; if (Math.abs(x) > 1e-9) out += '<text x="' + X + '" y="' + (sy(Math.max(y0, Math.min(y1, 0))) + 14) + '" class="tick" text-anchor="middle">' + fmtTick(x) + '</text>'; }
    for (let y = Math.ceil(y0 / ys) * ys; y <= y1 + 1e-9; y += ys) { const Y = sy(y); out += '<line x1="' + m.l + '" y1="' + Y + '" x2="' + (W - m.r) + '" y2="' + Y + '" class="grid"/>'; if (Math.abs(y) > 1e-9) out += '<text x="' + (sx(Math.max(x0, Math.min(x1, 0))) - 6) + '" y="' + (Y + 4) + '" class="tick" text-anchor="end">' + fmtTick(y) + '</text>'; }
    // axes
    const ax = sy(Math.max(y0, Math.min(y1, 0))), ay = sx(Math.max(x0, Math.min(x1, 0)));
    out += '<line x1="' + m.l + '" y1="' + ax + '" x2="' + (W - m.r) + '" y2="' + ax + '" class="axis"/><line x1="' + ay + '" y1="' + m.t + '" x2="' + ay + '" y2="' + (H - m.b) + '" class="axis"/>';
    out += '<text x="' + (W - m.r - 2) + '" y="' + (ax - 6) + '" class="lbl" text-anchor="end">x</text><text x="' + (ay + 6) + '" y="' + (m.t + 10) + '" class="lbl">y</text>';
    // guide lines
    (spec.vlines || []).forEach((v) => { out += '<line x1="' + sx(v) + '" y1="' + m.t + '" x2="' + sx(v) + '" y2="' + (H - m.b) + '" class="guide"/>'; });
    (spec.hlines || []).forEach((v) => { out += '<line x1="' + m.l + '" y1="' + sy(v) + '" x2="' + (W - m.r) + '" y2="' + sy(v) + '" class="guide"/>'; });
    // curves
    const curves = (spec.fns || []).map((fspec, k) => {
      let fn; try { fn = compile(fspec.f, !!spec.deg); } catch (e) { return null; }
      const a = fspec.dom ? Math.max(x0, num(fspec.dom[0])) : x0, b = fspec.dom ? Math.min(x1, num(fspec.dom[1])) : x1;
      const N = 480; const pts = []; let d = '', pen = false, last = null;
      for (let i = 0; i <= N; i++) { const x = a + (b - a) * i / N; let y; try { y = fn(x); } catch (e) { y = NaN; } const ok = isFinite(y) && Math.abs(y) < 1e6; const jump = last != null && ok && Math.abs(y - last) > (y1 - y0) * 1.5; if (!ok || jump) { pen = false; last = ok ? y : null; if (!ok) continue; } if (ok) { d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1); pen = true; last = y; pts.push([x, y]); } }
      return { d, pts, label: fspec.label, dashed: fspec.dashed, k };
    }).filter(Boolean);
    if (spec.shade && curves.length >= 2) {
      const A = curves.find((c) => c.label === spec.shade.from) || curves[0], B = curves.find((c) => c.label === spec.shade.to) || curves[1];
      const lo = spec.shade.x ? num(spec.shade.x[0]) : x0, hi = spec.shade.x ? num(spec.shade.x[1]) : x1;
      const pa = A.pts.filter((p) => p[0] >= lo && p[0] <= hi), pb = B.pts.filter((p) => p[0] >= lo && p[0] <= hi).reverse();
      if (pa.length && pb.length) out += '<polygon class="shade" clip-path="url(#cp)" points="' + pa.concat(pb).map((p) => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ') + '"/>';
    }
    curves.forEach((c) => {
      out += '<path d="' + c.d + '" class="curve c' + (c.k % 4) + (c.dashed ? ' dashed' : '') + '" clip-path="url(#cp)"/>';
    });
    /* curve labels: try several spots along each curve and both sides of it; keep the spot farthest from every curve, point and earlier label */
    const placed = [];
    const allPts = curves.flatMap((c) => c.pts.filter((p) => p[1] > y0 && p[1] < y1).map((p) => [sx(p[0]), sy(p[1])]));
    (spec.points || []).forEach((pt) => { const X = sx(num(pt.x)), Y = sy(num(pt.y)); allPts.push([X, Y]); if (pt.label) placed.push([X + 7, Y - 20, 8 * String(pt.label).length + 2]); });
    (spec.vlines || []).forEach((v) => { for (let yy = m.t; yy <= H - m.b; yy += 6) allPts.push([sx(v), yy]); });
    (spec.hlines || []).forEach((v) => { for (let xx = m.l; xx <= W - m.r; xx += 6) allPts.push([xx, sy(v)]); });
    if (y0 <= 0 && y1 >= 0) for (let xx = m.l; xx <= W - m.r; xx += 6) allPts.push([xx, sy(0)]);   // x-axis and its "x" label
    if (x0 <= 0 && x1 >= 0) for (let yy = m.t; yy <= H - m.b; yy += 6) allPts.push([sx(0), yy]);   // y-axis and its "y" label
    allPts.push([W - m.r - 4, sy(Math.min(Math.max(0, y0), y1)) - 10], [sx(Math.min(Math.max(0, x0), x1)) + 10, m.t + 6]);
    curves.forEach((c) => {
      if (!c.label) return;
      const inside = c.pts.filter((p) => p[1] > y0 && p[1] < y1); if (!inside.length) return;
      const tw = 8 * String(c.label).length + 4; let best = null;
      [0.88, 0.75, 0.62, 0.95, 0.4, 0.25, 0.12].forEach((f) => {
        const i = Math.min(inside.length - 1, Math.floor(inside.length * f)); const p = inside[i], q = inside[Math.min(inside.length - 1, i + 1)], o = inside[Math.max(0, i - 1)];
        const X = sx(p[0]), Y = sy(p[1]); let dx = sx(q[0]) - sx(o[0]), dy = sy(q[1]) - sy(o[1]); const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        [[-dy, dx], [dy, -dx]].forEach(([nx, ny]) => {
          const cx = X + nx * 16, cy = Y + ny * 16; const lx = cx - tw / 2, ly = cy - 7;
          if (lx < m.l + 2 || lx + tw > W - m.r - 2 || ly < m.t + 2 || ly + 14 > H - m.b - 2) return;
          let d = Infinity; allPts.forEach(([a, b]) => { const ex = Math.max(lx - a, 0, a - (lx + tw)), ey = Math.max(ly - b, 0, b - (ly + 14)); d = Math.min(d, Math.hypot(ex, ey)); });
          placed.forEach(([px, py, pw]) => { const ex = Math.max(lx - (px + pw), 0, px - (lx + tw)), ey = Math.max(ly - (py + 14), 0, py - (ly + 14)); d = Math.min(d, Math.hypot(ex, ey) - 4); });
          const score = Math.min(d, 24) - f * 0.01;
          if (!best || score > best.score) best = { score, lx, ly, cx, cy };
        });
      });
      if (!best) { const p = inside[Math.floor(inside.length * 0.85)]; best = { lx: sx(p[0]) + 6, ly: sy(p[1]) - 20, cx: sx(p[0]) + 6 + tw / 2, cy: sy(p[1]) - 13 }; }
      placed.push([best.lx, best.ly, tw]);
      out += '<text x="' + best.cx.toFixed(1) + '" y="' + (best.cy + 5).toFixed(1) + '" text-anchor="middle" class="lbl c' + (c.k % 4) + '">' + esc(c.label) + '</text>';
    });
    (spec.points || []).forEach((pt) => { const X = sx(num(pt.x)), Y = sy(num(pt.y)); out += '<circle cx="' + X + '" cy="' + Y + '" r="4" class="pt"/>'; if (pt.label) out += '<text x="' + (X + 7) + '" y="' + (Y - 7) + '" class="lbl">' + esc(pt.label) + '</text>'; });
    return out + '</svg>';
  }

  /* ---------- geometry */
  function geo(spec) {
    const W = 560, H = 380, pad = 22;
    const v = spec.view || [-1, 10, -1, 8]; const vx0 = num(v[0]), vx1 = num(v[1]), vy0 = num(v[2]), vy1 = num(v[3]);
    const scale = Math.min((W - 2 * pad) / (vx1 - vx0), (H - 2 * pad) / (vy1 - vy0));
    const ox = pad + ((W - 2 * pad) - (vx1 - vx0) * scale) / 2, oy = pad + ((H - 2 * pad) - (vy1 - vy0) * scale) / 2;
    const sx = (x) => ox + (x - vx0) * scale, sy = (y) => H - oy - (y - vy0) * scale;
    const P = {}; Object.keys(spec.points || {}).forEach((k) => { P[k] = [num(spec.points[k][0]), num(spec.points[k][1])]; });
    const pt = (ref) => Array.isArray(ref) ? [num(ref[0]), num(ref[1])] : P[ref];
    const hide = new Set(spec.hide || []);
    let out = '<svg class="fig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Diagram"><defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>';
    if (spec.axes) {
      out += '<line x1="' + sx(vx0) + '" y1="' + sy(0) + '" x2="' + sx(vx1) + '" y2="' + sy(0) + '" class="axis" marker-end="url(#arr)"/><line x1="' + sx(0) + '" y1="' + sy(vy0) + '" x2="' + sx(0) + '" y2="' + sy(vy1) + '" class="axis" marker-end="url(#arr)"/>';
      out += '<text x="' + (sx(vx1) - 10) + '" y="' + (sy(0) + 16) + '" class="lbl">x</text><text x="' + (sx(0) + 8) + '" y="' + (sy(vy1) + 12) + '" class="lbl">y</text><text x="' + (sx(0) - 6) + '" y="' + (sy(0) + 14) + '" class="tick" text-anchor="end">O</text>';
    }
    (spec.shade || []).forEach((poly) => { const ps = poly.map(pt).filter(Boolean); if (ps.length > 2) out += '<polygon class="shade" points="' + ps.map((p) => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ') + '"/>'; });
    (spec.circles || []).forEach((c) => { const ce = pt(c.c); if (ce) out += '<circle cx="' + sx(ce[0]) + '" cy="' + sy(ce[1]) + '" r="' + (num(c.r) * scale) + '" class="line"' + (c.dashed ? ' stroke-dasharray="6 5"' : '') + '/>'; });
    (spec.arcs || []).forEach((a) => { const ce = pt(a.c); if (!ce) return; const r = num(a.r); const f = num(a.from) * Math.PI / 180, t = num(a.to) * Math.PI / 180; const large = Math.abs(a.to - a.from) > 180 ? 1 : 0; out += '<path d="M' + sx(ce[0] + r * Math.cos(f)) + ' ' + sy(ce[1] + r * Math.sin(f)) + 'A' + (r * scale) + ' ' + (r * scale) + ' 0 ' + large + ' 0 ' + sx(ce[0] + r * Math.cos(t)) + ' ' + sy(ce[1] + r * Math.sin(t)) + '" class="line"/>'; });
    const seg = (a, b, cls, extra) => { const A = pt(a), B = pt(b); if (!A || !B) return ''; return '<line x1="' + sx(A[0]) + '" y1="' + sy(A[1]) + '" x2="' + sx(B[0]) + '" y2="' + sy(B[1]) + '" class="' + cls + '"' + (extra || '') + '/>'; };
    (spec.lines || []).forEach(([a, b]) => { const A = pt(a), B = pt(b); if (!A || !B) return; const dx = B[0] - A[0], dy = B[1] - A[1]; const ts = []; if (Math.abs(dx) > 1e-9) { ts.push((vx0 - A[0]) / dx, (vx1 - A[0]) / dx); } if (Math.abs(dy) > 1e-9) { ts.push((vy0 - A[1]) / dy, (vy1 - A[1]) / dy); } const inside = (t) => { const x = A[0] + t * dx, y = A[1] + t * dy; return x >= vx0 - 1e-6 && x <= vx1 + 1e-6 && y >= vy0 - 1e-6 && y <= vy1 + 1e-6; }; const ok = ts.filter(inside).sort((p, q) => p - q); if (ok.length >= 2) { const t0 = ok[0], t1 = ok[ok.length - 1]; out += seg([A[0] + t0 * dx, A[1] + t0 * dy], [A[0] + t1 * dx, A[1] + t1 * dy], 'line'); } });
    (spec.segments || []).forEach(([a, b]) => { out += seg(a, b, 'line'); });
    (spec.dashed || []).forEach(([a, b]) => { out += seg(a, b, 'line', ' stroke-dasharray="6 5"'); });
    (spec.arrows || []).forEach(([a, b]) => { out += seg(a, b, 'line arrow', ' marker-end="url(#arr)"'); });
    (spec.ticks || []).forEach((tk) => { const A = pt(tk[0]), B = pt(tk[1]); if (!A || !B) return; const n = Math.max(1, Math.min(3, Math.round(num(tk[2])) || 1)); const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L; const nx = -uy * 0.22, ny = ux * 0.22; for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 0.14; const mx = (A[0] + B[0]) / 2 + ux * o, my = (A[1] + B[1]) / 2 + uy * o; out += seg([mx + nx, my + ny], [mx - nx, my - ny], 'line'); } });
    (spec.parallel || []).forEach((pr) => { const A = pt(pr[0]), B = pt(pr[1]); if (!A || !B) return; const n = Math.max(1, Math.min(3, Math.round(num(pr[2])) || 1)); const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L; for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 0.22 + 0.1; const tx = (A[0] + B[0]) / 2 + ux * o, ty = (A[1] + B[1]) / 2 + uy * o; const w1 = [tx - ux * 0.2 - uy * 0.14, ty - uy * 0.2 + ux * 0.14], w2 = [tx - ux * 0.2 + uy * 0.14, ty - uy * 0.2 - ux * 0.14]; out += '<polyline points="' + [w1, [tx, ty], w2].map((p) => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ') + '" class="line"/>'; } });
    (spec.right || []).forEach((r) => { const A = pt(r.at), B = pt(r.from), C = pt(r.to); if (!A || !B || !C) return; const s = (r.size || 0.35); const u = [(B[0] - A[0]), (B[1] - A[1])], w = [(C[0] - A[0]), (C[1] - A[1])]; const lu = Math.hypot(u[0], u[1]) || 1, lw = Math.hypot(w[0], w[1]) || 1; const p1 = [A[0] + u[0] / lu * s, A[1] + u[1] / lu * s], p3 = [A[0] + w[0] / lw * s, A[1] + w[1] / lw * s], p2 = [p1[0] + w[0] / lw * s, p1[1] + w[1] / lw * s]; out += '<polyline points="' + [p1, p2, p3].map((p) => sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join(' ') + '" class="line thin"/>'; });
    (spec.angles || []).forEach((an) => { const A = pt(an.at), B = pt(an.from), C = pt(an.to); if (!A || !B || !C) return; const r = an.r || 0.8; let a1 = Math.atan2(B[1] - A[1], B[0] - A[0]), a2 = Math.atan2(C[1] - A[1], C[0] - A[0]); let d = a2 - a1; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI; const sweep = d > 0 ? 0 : 1; const p1 = [A[0] + r * Math.cos(a1), A[1] + r * Math.sin(a1)], p2 = [A[0] + r * Math.cos(a2), A[1] + r * Math.sin(a2)]; out += '<path d="M' + sx(p1[0]).toFixed(1) + ' ' + sy(p1[1]).toFixed(1) + 'A' + (r * scale).toFixed(1) + ' ' + (r * scale).toFixed(1) + ' 0 0 ' + sweep + ' ' + sx(p2[0]).toFixed(1) + ' ' + sy(p2[1]).toFixed(1) + '" class="line thin"/>'; if (an.label) { const mid = a1 + d / 2; const lr = an.lr != null ? num(an.lr) : r + 0.45; const lx = A[0] + lr * Math.cos(mid), ly = A[1] + lr * Math.sin(mid); out += '<text x="' + sx(lx) + '" y="' + (sy(ly) + 4) + '" class="lbl" text-anchor="middle">' + esc(an.label) + '</text>'; } });
    const OFF = { n: [0, 1], ne: [0.7, 0.7], e: [1, 0], se: [0.7, -0.7], s: [0, -1], sw: [-0.7, -0.7], w: [-1, 0], nw: [-0.7, 0.7] };
    Object.keys(P).forEach((k) => { if (hide.has(k)) return; const p = P[k]; out += '<circle cx="' + sx(p[0]) + '" cy="' + sy(p[1]) + '" r="3.2" class="pt"/>'; const dir = (spec.labels || {})[k] || 'ne'; if (dir === 'none') return; const o = OFF[dir] || OFF.ne; const px = sx(p[0]) + o[0] * 12, py = sy(p[1]) - o[1] * 12 + 4; out += '<text x="' + px + '" y="' + py + '" class="lbl" text-anchor="' + (o[0] > 0.1 ? 'start' : o[0] < -0.1 ? 'end' : 'middle') + '">' + esc(k) + '</text>'; });
    (spec.text || []).forEach((t) => { const p = pt(t.at); if (p) out += '<text x="' + sx(p[0]) + '" y="' + (sy(p[1]) + 4) + '" class="lbl" text-anchor="middle">' + esc(t.s) + '</text>'; });
    return out + '</svg>';
  }

  /* ---------- 3. data tables: { kind: "table", head: ["Temp (°C)", "Rate"], rows: [["10", "2"], ...], note: "..." } */
  function table(spec) {
    const cell = (v, tag) => '<' + tag + '>' + esc(v) + '</' + tag + '>';
    const head = (spec.head || []).length ? '<thead><tr>' + spec.head.map((h) => cell(h, 'th')).join('') + '</tr></thead>' : '';
    const body = '<tbody>' + (spec.rows || []).map((r) => '<tr>' + (Array.isArray(r) ? r : [r]).map((v, i) => cell(v, i === 0 && spec.rowHead ? 'th' : 'td')).join('') + '</tr>').join('') + '</tbody>';
    return '<div class="fig-table"><table>' + (spec.title ? '<caption>' + esc(spec.title) + '</caption>' : '') + head + body + '</table></div>';
  }

  /* ---------- 4. schematic drawings (biology, apparatus): a whitelisted element tree, no raw markup
     { kind: "svg", view: [0, 0, 400, 260], els: [ ["ellipse", { cx: 200, cy: 130, rx: 150, ry: 90, class: "fa" }],
       ["path", { d: "M10 10 C 40 0, 60 30, 90 20", class: "line" }], ["text", { x: 20, y: 30 }, "Nucleus"],
       ["g", { transform: "translate(10 0)" }, [ ...children ]] ] }                                                   */
  const SVG_TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text']);
  const SVG_ATTR = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'class',
    'stroke-dasharray', 'stroke-width', 'font-size', 'text-anchor', 'font-weight', 'font-style', 'opacity', 'fill-opacity', 'arrow', 'dominant-baseline']);
  const SVG_CLASSES = /^(line|thin|thick|dashed|lbl|lbl-s|lbl-i|fa|fb|fc|fd|fe|ff|ink|soft|none|dot|arrow|c0|c1|c2|c3|shade)( (line|thin|thick|dashed|lbl|lbl-s|lbl-i|fa|fb|fc|fd|fe|ff|ink|soft|none|dot|arrow|c0|c1|c2|c3|shade))*$/;
  function svgEl(el, depth) {
    if (!Array.isArray(el) || depth > 8) return '';
    const tag = String(el[0]); if (!SVG_TAGS.has(tag)) return '';
    const at = (el[1] && typeof el[1] === 'object' && !Array.isArray(el[1])) ? el[1] : {};
    let attrs = '';
    Object.keys(at).forEach((k) => {
      if (!SVG_ATTR.has(k)) return; let v = String(at[k]);
      if (k === 'class' && !SVG_CLASSES.test(v)) return;
      if (k === 'arrow') { if (v === 'end' || v === 'true') attrs += ' marker-end="url(#arr)"'; else if (v === 'both') attrs += ' marker-start="url(#arrs)" marker-end="url(#arr)"'; return; }
      if (k === 'd' || k === 'points' || k === 'transform') { if (!/^[-0-9.,\s a-zA-Z()]*$/.test(v) || /script|url|expression/i.test(v)) return; }
      else if (!/^[-0-9.a-zA-Z %#,]*$/.test(v)) return;
      attrs += ' ' + k + '="' + esc(v) + '"';
    });
    if (!at.class && tag !== 'g' && tag !== 'text') attrs += ' class="line"';
    if (tag === 'text') { if (!at.class) attrs += ' class="lbl"'; return '<text' + attrs + '>' + esc(el.slice(at === el[1] ? 2 : 1).filter((x) => typeof x === 'string' || typeof x === 'number').join('')) + '</text>'; }
    const kids = el.slice(at === el[1] ? 2 : 1).find((x) => Array.isArray(x) && Array.isArray(x[0]));
    if (tag === 'g') return '<g' + attrs + '>' + (kids || []).map((c) => svgEl(c, depth + 1)).join('') + '</g>';
    return '<' + tag + attrs + '/>';
  }
  function drawing(spec) {
    const v = (spec.view || [0, 0, 400, 260]).map(num); if (v.length !== 4 || v.some((x) => !isFinite(x))) throw new Error('bad view');
    return '<svg class="fig bio" viewBox="' + v.join(' ') + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(spec.alt || spec.caption || 'Diagram') + '">' +
      '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker><marker id="arrs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>' +
      (spec.els || []).map((e) => svgEl(e, 0)).join('') + '</svg>';
  }

  window.renderFig = function (spec) {
    try { if (!spec || typeof spec !== 'object') return ''; if (spec.kind === 'plot') return plot(spec); if (spec.kind === 'geo') return geo(spec); if (spec.kind === 'table') return table(spec); if (spec.kind === 'svg') return drawing(spec); return ''; }
    catch (e) { return '<p class="small muted">(figure could not be drawn: ' + esc(e.message) + ')</p>'; }
  };
  window.__figCompile = compile;
})();
