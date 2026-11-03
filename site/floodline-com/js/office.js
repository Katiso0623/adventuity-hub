/* Adventuity Floodline: clients, finances and analysis (administrators only).
   Clients: everyone who requested a quote or was added by hand, with their requests, invoices and payments.
   Finances: money received (paid invoices plus entries added here), expenses, what is still owed, per month.
   Analysis: requests, conversion, where clients come from, which services sell.
   Data: floodline_quotes and floodline_invoices (read), floodline_settings rows 'crm' and 'ledger' (read and write).
   Row-level security lets only administrators (public.is_admin()) read or write any of it. */
(function () {
  'use strict';
  const CFG = window.FL_CONFIG || {}, SB = CFG.supabase || {};
  const root = document.getElementById('adm'), tipEl = document.getElementById('tip');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sp = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const R = v => (v < 0 ? '−R ' : 'R ') + sp(Math.abs(Math.round(Number(v) || 0)));
  const R2 = v => 'R ' + (Number(v) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const day = d => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const iso = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const today = () => iso(new Date());
  const lc = s => String(s || '').trim().toLowerCase();
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const KINDS = [['individual', 'Private individual'], ['developer', 'Developer or property owner'], ['consultant', 'Consultant (planner, architect, surveyor, engineer)'], ['municipality', 'Municipality or government'], ['mining', 'Mining or industry'], ['agent', 'Estate agent'], ['lender', 'Bank, lender or insurer'], ['other', 'Other']];
  const STAGES = [['lead', 'Lead'], ['active', 'Active client'], ['past', 'Past client'], ['dormant', 'Dormant'], ['do-not-contact', 'Do not contact']];
  const EXP_CATS = ['Survey or LiDAR (subcontractor)', 'Engineer sign-off', 'Travel and site visits', 'Software and data', 'Advertising and marketing', 'Hosting, domain and e-mail', 'Bank and card fees', 'Printing and stationery', 'Professional fees and registration', 'Office and telephone', 'Tax', 'Other expense'];
  const INC_CATS = ['Flood line study', 'Bridge or culvert study', 'Flood risk letter', 'Site inspection', 'Consulting', 'Other income'];
  const PROV = [['Gauteng', /gauteng|johannesburg|pretoria|tshwane|ekurhuleni|midrand|sandton|centurion|soweto/], ['Free State', /free state|bloemfontein|welkom|bethlehem|kroonstad|sasolburg|mangaung/], ['KwaZulu-Natal', /kwazulu|natal|durban|pietermaritzburg|richards bay|ballito|umhlanga|ethekwini/], ['Western Cape', /western cape|cape town|stellenbosch|paarl|george|knysna|worcester|somerset west/], ['Eastern Cape', /eastern cape|gqeberha|port elizabeth|east london|mthatha|makhanda|grahamstown/], ['Limpopo', /limpopo|polokwane|tzaneen|mokopane|thohoyandou|lephalale/], ['Mpumalanga', /mpumalanga|mbombela|nelspruit|witbank|emalahleni|middelburg|secunda/], ['North West', /north west|rustenburg|mahikeng|mafikeng|potchefstroom|klerksdorp|brits/], ['Northern Cape', /northern cape|kimberley|upington|springbok|kuruman/]];
  let sb = null, user = null, Q = [], INV = [], CRM = { clients: {} }, LED = { entries: [] };
  let tab = 'clients', period = 'fy', clientKey = null, search = '', stageF = '';

  // ---------- data
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
  async function readSetting(key, fallback) {
    const rows = await q(sb.from('floodline_settings').select('value').eq('key', key));
    return rows && rows[0] ? rows[0].value : fallback;
  }
  async function writeSetting(key, value) {
    await q(sb.from('floodline_settings').upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'key' }));
  }
  // read-modify-write, so two open tabs do not wipe each other's changes
  async function changeCRM(fn) { const cur = await readSetting('crm', { clients: {} }); cur.clients = cur.clients || {}; fn(cur); await writeSetting('crm', cur); CRM = cur; }
  async function changeLedger(fn) { const cur = await readSetting('ledger', { entries: [] }); cur.entries = cur.entries || []; fn(cur); await writeSetting('ledger', cur); LED = cur; }
  async function loadAll() {
    const [qs, inv, crm, led] = await Promise.all([
      q(sb.from('floodline_quotes').select('id,ref,created_at,full_name,company,email,phone,address,lat,lon,purpose,size_ha,referral,page,status,admin_notes,auto_status,auto_quote,quoted_at,invoice_id,site_description').order('created_at', { ascending: false }).limit(5000)),
      q(sb.from('floodline_invoices').select('id,ref,quote_id,created_at,description,amount_cents,currency,client_name,client_email,token,status,mode,paid_at,paid_cents,method,eft_at').order('created_at', { ascending: false }).limit(5000)),
      readSetting('crm', { clients: {} }), readSetting('ledger', { entries: [] })]);
    Q = qs || []; INV = inv || []; CRM = crm || { clients: {} }; CRM.clients = CRM.clients || {}; LED = led || { entries: [] }; LED.entries = LED.entries || [];
  }

  // ---------- derived
  const quoteTotal = x => Number(x.auto_quote && x.auto_quote.total) || 0;
  const invAmt = i => (Number(i.amount_cents) || 0) / 100;
  const invPaid = i => i.status === 'paid' ? (Number(i.paid_cents || i.amount_cents) || 0) / 100 : 0;
  const isTest = i => i.mode === 'test';
  function service(x) { return (x.auto_quote && x.auto_quote.service && x.auto_quote.service.name) || x.purpose || 'Not stated'; }
  function source(x) {
    const p = lc(x.page), r = lc(x.referral);
    if (/gclid|gbraid|wbraid|utm_source=google|utm_medium=cpc/.test(p)) return 'Google Ads';
    if (/fbclid|utm_source=(facebook|fb|instagram|ig|meta)/.test(p)) return 'Facebook or Instagram';
    if (/ttclid|utm_source=tiktok/.test(p)) return 'TikTok';
    if (/li_fat_id|utm_source=linkedin/.test(p)) return 'LinkedIn';
    if (/utm_source=whatsapp|\/media\//.test(p)) return 'WhatsApp or shared post';
    if (/utm_source=(email|outreach|newsletter)|utm_medium=email/.test(p)) return 'E-mail outreach';
    if (/utm_source=bing|msclkid/.test(p)) return 'Microsoft Ads';
    if (r) {
      if (/google|search/.test(r)) return 'Google search';
      if (/facebook|instagram/.test(r)) return 'Facebook or Instagram';
      if (/linkedin/.test(r)) return 'LinkedIn';
      if (/tiktok/.test(r)) return 'TikTok';
      if (/whatsapp/.test(r)) return 'WhatsApp or shared post';
      if (/friend|referr|colleague|word|recommend/.test(r)) return 'Referral';
    }
    return 'Website (direct or search)';
  }
  function region(x) {
    const a = lc(x.address + ' ' + x.site_description);
    for (const [n, re] of PROV) if (re.test(a)) return n;
    const la = Number(x.lat), lo = Number(x.lon);
    if (isFinite(la) && isFinite(lo) && la !== 0) return (la < -22 && la > -35 && lo > 16 && lo < 33) ? 'South Africa (province not read)' : 'Outside South Africa';
    return 'Unknown';
  }
  function clients() {
    const map = new Map();
    const get = key => { if (!map.has(key)) map.set(key, { key, name: '', company: '', email: '', phone: '', requests: [], invoices: [], rec: null }); return map.get(key); };
    for (const x of Q) { const k = lc(x.email) || 'q:' + x.id, c = get(k); c.requests.push(x); c.email = c.email || x.email || ''; c.name = c.name || x.full_name || ''; c.company = c.company || x.company || ''; c.phone = c.phone || x.phone || ''; }
    const byQuote = new Map(Q.map(x => [x.id, lc(x.email) || 'q:' + x.id]));
    for (const i of INV) { if (isTest(i)) continue; const k = (i.quote_id && byQuote.get(i.quote_id)) || lc(i.client_email) || 'i:' + i.id, c = get(k); c.invoices.push(i); c.email = c.email || i.client_email || ''; c.name = c.name || i.client_name || ''; }
    for (const [k, rec] of Object.entries(CRM.clients)) { const c = get(k); c.rec = rec; }
    const now = Date.now();
    return [...map.values()].map(c => {
      const r = c.rec || {};
      const dates = [...c.requests.map(x => x.created_at), ...c.invoices.map(i => i.paid_at || i.created_at)].filter(Boolean).sort();
      c.first = dates[0] || r.created_at || ''; c.last = dates[dates.length - 1] || r.created_at || '';
      c.quoted = c.requests.reduce((s, x) => s + quoteTotal(x), 0);
      c.invoiced = c.invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + invAmt(i), 0);
      c.paid = c.invoices.reduce((s, i) => s + invPaid(i), 0) + LED.entries.filter(e => e.kind === 'income' && e.client && e.client === c.key).reduce((s, e) => s + e.amount, 0);
      c.owing = c.invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + invAmt(i), 0);
      const autoStage = c.paid > 0 ? ((now - new Date(c.last)) / 864e5 > 180 ? 'past' : 'active') : 'lead';
      Object.assign(c, { name: r.name || c.name, company: r.company || c.company, email: r.email || c.email, phone: r.phone || c.phone, kind: r.kind || 'other', stage: r.stage || autoStage, city: r.city || '', vat_no: r.vat_no || '', notes: r.notes || '', next_action: r.next_action || '', next_date: r.next_date || '' });
      c.due = !!(c.next_date && c.next_date <= today() && c.stage !== 'do-not-contact');
      return c;
    }).sort((a, b) => String(b.last).localeCompare(String(a.last)));
  }
  function range() {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth();
    const fyStart = m >= 2 ? new Date(y, 2, 1) : new Date(y - 1, 2, 1);
    switch (period) {
      case 'month': return [new Date(y, m, 1), null, 'This month'];
      case '3m': return [new Date(y, m - 2, 1), null, 'Last 3 months'];
      case '12m': return [new Date(y, m - 11, 1), null, 'Last 12 months'];
      case 'fy': return [fyStart, null, 'This tax year (from 1 March ' + fyStart.getFullYear() + ')'];
      case 'lfy': return [new Date(fyStart.getFullYear() - 1, 2, 1), fyStart, 'Last tax year (Mar ' + (fyStart.getFullYear() - 1) + ' – Feb ' + fyStart.getFullYear() + ')'];
      default: return [new Date(2000, 0, 1), null, 'All time'];
    }
  }
  const inR = (d, [a, b]) => { if (!d) return false; const t = new Date(d); return t >= a && (!b || t < b); };
  function months([a, b]) {
    const out = [], end = b ? new Date(b.getFullYear(), b.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    let s = new Date(a.getFullYear(), a.getMonth(), 1);
    if (period === 'all') { const ds = [...Q.map(x => x.created_at), ...INV.map(i => i.created_at), ...LED.entries.map(e => e.date)].filter(Boolean).sort(); if (ds[0]) { const f = new Date(ds[0]); s = new Date(f.getFullYear(), f.getMonth(), 1); } else s = new Date(end.getFullYear(), end.getMonth() - 1, 1); }
    for (let d = s; d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) });
    return out;
  }
  const mkey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
  // every money movement: paid invoices (automatic) and entries added by hand
  function ledger() {
    const rows = INV.filter(i => i.status === 'paid' && !isTest(i)).map(i => ({ id: 'inv:' + i.id, auto: true, date: iso(i.paid_at || i.created_at), kind: 'income', category: 'Invoice paid (' + (i.method === 'eft' ? 'EFT' : 'card') + ')', description: i.description || '', party: i.client_name || i.client_email || '', amount: invPaid(i), vat: 0, reference: i.ref }));
    for (const e of LED.entries) rows.push(Object.assign({ auto: false }, e));
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  // ---------- charts (single axis; hover shows the exact values; a table sits under each chart)
  function tipOn(ev, html) { tipEl.innerHTML = html; tipEl.style.display = 'block'; const w = tipEl.offsetWidth, h = tipEl.offsetHeight; let x = ev.clientX + 14, y = ev.clientY - h - 10; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y < 8) y = ev.clientY + 16; tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; }
  function tipOff() { tipEl.style.display = 'none'; }
  function hbars(items, fmt) {
    if (!items.length) return '<p class="muted">Nothing in this period yet.</p>';
    const max = Math.max(...items.map(i => i.v), 1);
    return `<div class="hb">${items.map(i => `<div class="lb">${esc(i.k)}</div><div class="tr" data-tip="${esc(i.k)}: ${esc(fmt(i.v))}${i.s ? ' · ' + esc(i.s) : ''}"><div class="fl" style="width:${Math.max(0.5, 100 * i.v / max)}%"></div></div><div class="vl">${esc(fmt(i.v))}</div>`).join('')}</div>`;
  }
  function vbars(cats, series, fmt) {
    // cats: [{label}], series: [{name, cls, values[]}]
    const W = Math.max(300, Math.min(1100, (root.clientWidth || 640) - 34)), H = 240, L = 54, B = 26, T = 10, n = cats.length, k = series.length;
    const max = Math.max(1, ...series.flatMap(s => s.values));
    const step = fmt === R ? niceStep(max / 4) : Math.max(1, niceStep(max / 4)), top = Math.ceil(max / step) * step;
    const bw = (W - L) / Math.max(n, 1), gw = Math.min(46, bw * 0.72), sw = Math.max(2, (gw - 2 * (k - 1)) / k);
    const y = v => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top + 1e-9; v += step) g += `<line class="gl" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(short(v, fmt))}</text>`;
    const every = Math.ceil(n / Math.max(3, Math.floor((W - L) / 56)));
    cats.forEach((c, i) => {
      const x0 = L + i * bw, gx = x0 + (bw - gw) / 2;
      g += `<rect class="hit" x="${x0}" y="${T}" width="${bw}" height="${H - T - B}" data-i="${i}"/><rect class="hl" x="${x0}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" pointer-events="none"/>`;
      series.forEach((s, j) => { const v = s.values[i] || 0; if (v > 0) { const h = Math.max(1, y(0) - y(v)), x = gx + j * (sw + 2), r = Math.min(4, sw / 2, h); g += `<path class="${s.cls}" pointer-events="none" d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${sw - 2 * r} q${r},0 ${r},${r} v${h - r} z"/>`; } });
      if (i % every === 0) g += `<text class="ax" x="${x0 + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(c.label)}</text>`;
    });
    const id = 'vc' + Math.random().toString(36).slice(2, 8);
    setTimeout(() => {
      const el = document.getElementById(id); if (!el) return;
      el.querySelectorAll('.hit').forEach(h => {
        h.addEventListener('mousemove', ev => { const i = +h.dataset.i; tipOn(ev, `<b>${esc(cats[i].label)}</b><br>` + series.map(s => `${esc(s.name)}: ${esc(fmt(s.values[i] || 0))}`).join('<br>')); });
        h.addEventListener('mouseleave', tipOff);
      });
    });
    const leg = k > 1 ? `<div class="leg">${series.map(s => `<span><i style="background:var(${s.cls === 'm1' ? '--s1' : '--s2'})"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    const table = `<details class="tbl"><summary>Show as a table</summary><div class="scroll"><table><thead><tr><th>Month</th>${series.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${cats.map((c, i) => `<tr><td>${esc(c.label)}</td>${series.map(s => `<td class="r">${esc(fmt(s.values[i] || 0))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    return `${leg}<div class="vc" id="${id}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} per month">${g}</svg></div>${table}`;
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-9)))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function short(v, fmt) { if (fmt !== R) return String(Math.round(v)); return v >= 1e6 ? 'R' + (v / 1e6).toFixed(1).replace('.0', '') + 'm' : v >= 1e3 ? 'R' + Math.round(v / 1e3) + 'k' : 'R' + Math.round(v); }
  function bindTips() { root.querySelectorAll('[data-tip]').forEach(el => { el.addEventListener('mousemove', ev => tipOn(ev, esc(el.dataset.tip))); el.addEventListener('mouseleave', tipOff); }); }
  function count(arr, fn, val) { const m = new Map(); for (const x of arr) { const k = fn(x); m.set(k, (m.get(k) || 0) + (val ? val(x) : 1)); } return [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v); }
  function csv(name, head, rows) {
    const c = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blob = new Blob(['﻿' + [head, ...rows].map(r => r.map(c).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function say(id, text, kind) { const el = document.getElementById(id); if (!el) return; el.textContent = text || ''; el.className = 'msg' + (text ? ' show' : '') + (kind ? ' ' + kind : ''); }

  // ---------- page
  function render() {
    tipOff();
    const C = clients(), due = C.filter(c => c.due).length, owing = INV.filter(i => i.status === 'unpaid' && !isTest(i)).length;
    const head = `<span class="label">Administrator</span><h1>Clients and finances</h1>
      <p class="muted">Signed in as ${esc(user.email)} · <a href="#" id="out">Sign out</a> · <a href="#" id="reload">Refresh</a></p>
      <div class="tabs" role="tablist">${[['clients', 'Clients', due], ['finances', 'Finances', owing], ['analysis', 'Analysis', 0]].map(([k, t, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t}${n ? `<span class="n" title="${k === 'clients' ? 'follow-ups due' : 'unpaid invoices'}">${n}</span>` : ''}</button>`).join('')}</div>`;
    const per = tab === 'clients' ? '' : `<div class="bar"><label class="f" style="max-width:300px">Period<select id="per">${[['month', 'This month'], ['3m', 'Last 3 months'], ['12m', 'Last 12 months'], ['fy', 'This tax year'], ['lfy', 'Last tax year'], ['all', 'All time']].map(([v, t]) => `<option value="${v}"${period === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>`;
    root.innerHTML = head + per + `<div id="body">${tab === 'clients' ? (clientKey ? clientView(C) : clientList(C)) : tab === 'finances' ? finances() : analysis()}</div>`;
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; clientKey = null; history.replaceState(null, '', '#' + tab); render(); });
    document.getElementById('out').onclick = async e => { e.preventDefault(); await sb.auth.signOut(); login(); };
    document.getElementById('reload').onclick = async e => { e.preventDefault(); await start(); };
    const ps = document.getElementById('per'); if (ps) ps.onchange = () => { period = ps.value; render(); };
    bindTips();
    if (tab === 'clients') clientKey ? bindClient(C) : bindList(C); else if (tab === 'finances') bindFinances();
  }

  // ---------- clients
  function clientList(C) {
    const s = lc(search);
    const list = C.filter(c => (!stageF || (stageF === 'due' ? c.due : c.stage === stageF)) && (!s || lc([c.name, c.company, c.email, c.phone, c.city, c.notes, ...c.requests.map(x => x.ref + ' ' + x.address)].join(' ')).includes(s)));
    const tot = k => C.reduce((a, c) => a + c[k], 0);
    return `<div class="kpis">
        <div class="kpi"><div class="k">Clients and leads</div><div class="v">${C.length}</div><div class="s">${C.filter(c => c.stage === 'active').length} active</div></div>
        <div class="kpi"><div class="k">Paid to date</div><div class="v">${R(tot('paid'))}</div><div class="s">${C.filter(c => c.paid > 0).length} paying clients</div></div>
        <div class="kpi"><div class="k">Still owed</div><div class="v">${R(tot('owing'))}</div><div class="s">unpaid invoices</div></div>
        <div class="kpi"><div class="k">Follow-ups due</div><div class="v">${C.filter(c => c.due).length}</div><div class="s">next action date reached</div></div></div>
      <div class="bar"><input class="grow" id="cs" type="search" placeholder="Search name, company, e-mail, site, reference…" value="${esc(search)}" aria-label="Search clients">
        <select id="cf" style="width:auto" aria-label="Filter"><option value="">All stages</option><option value="due"${stageF === 'due' ? ' selected' : ''}>Follow-up due</option>${STAGES.map(([v, t]) => `<option value="${v}"${stageF === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <button class="b red" type="button" id="cadd">+ Add client</button><button class="b" type="button" id="ccsv">Export CSV</button></div>
      <div class="card scroll" style="padding:4px 8px">${list.length ? `<table><thead><tr><th>Client</th><th class="hide">Stage</th><th class="r hide">Requests</th><th class="r hide">Quoted</th><th class="r">Paid</th><th class="r">Owed</th><th class="hide">Last activity</th></tr></thead><tbody>
        ${list.map(c => `<tr class="click" data-k="${esc(c.key)}" tabindex="0"><td><b>${esc(c.name || c.email || 'No name')}</b>${c.due ? ' <span class="tag due">Follow up</span>' : ''}<div class="sub">${esc([c.company, c.email, c.phone].filter(Boolean).join(' · '))}</div>${c.next_action ? `<div class="sub">Next: ${esc(c.next_action)}${c.next_date ? ' (' + esc(day(c.next_date)) + ')' : ''}</div>` : ''}</td>
          <td class="hide"><span class="tag ${esc(c.stage)}">${esc((STAGES.find(x => x[0] === c.stage) || [, c.stage])[1])}</span></td><td class="r hide">${c.requests.length}</td><td class="r hide">${c.quoted ? R(c.quoted) : '–'}</td><td class="r">${c.paid ? R(c.paid) : '–'}</td><td class="r">${c.owing ? R(c.owing) : '–'}</td><td class="hide">${esc(day(c.last))}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted" style="padding:10px">No clients match.</p>'}</div>`;
  }
  function bindList(C) {
    const cs = document.getElementById('cs'); cs.oninput = () => { search = cs.value; const pos = cs.selectionStart; render(); const n = document.getElementById('cs'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('cf').onchange = e => { stageF = e.target.value; render(); };
    root.querySelectorAll('tr[data-k]').forEach(tr => { const go = () => { clientKey = tr.dataset.k; render(); scrollTo(0, 0); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    document.getElementById('cadd').onclick = () => { clientKey = '+new'; render(); };
    document.getElementById('ccsv').onclick = () => csv('floodline-clients-' + today() + '.csv', ['Name', 'Company', 'E-mail', 'Phone', 'Type', 'Stage', 'City', 'VAT number', 'Requests', 'Quoted (R)', 'Invoiced (R)', 'Paid (R)', 'Owed (R)', 'First contact', 'Last activity', 'Next action', 'Next date', 'Notes'],
      C.map(c => [c.name, c.company, c.email, c.phone, (KINDS.find(k => k[0] === c.kind) || [, c.kind])[1], (STAGES.find(k => k[0] === c.stage) || [, c.stage])[1], c.city, c.vat_no, c.requests.length, c.quoted.toFixed(2), c.invoiced.toFixed(2), c.paid.toFixed(2), c.owing.toFixed(2), c.first ? iso(c.first) : '', c.last ? iso(c.last) : '', c.next_action, c.next_date, c.notes]));
  }
  function clientView(C) {
    const isNew = clientKey === '+new';
    const c = isNew ? { key: '', name: '', company: '', email: '', phone: '', kind: 'other', stage: 'lead', city: '', vat_no: '', notes: '', next_action: '', next_date: '', requests: [], invoices: [], quoted: 0, paid: 0, owing: 0 } : C.find(x => x.key === clientKey);
    if (!c) { clientKey = null; return clientList(C); }
    const fld = (id, label, val, type) => `<label class="f">${label}<input id="${id}" type="${type || 'text'}" value="${esc(val)}"></label>`;
    const sel = (id, label, opts, val) => `<label class="f">${label}<select id="${id}">${opts.map(([v, t]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const wa = String(c.phone || '').replace(/\D/g, '').replace(/^0/, '27');
    const own = LED.entries.filter(e => e.client && e.client === c.key);
    return `<p><a href="#" id="back">← All clients</a></p>
      <h2 style="margin-top:6px">${esc(isNew ? 'New client' : (c.name || c.email || 'Client'))}</h2>${!isNew ? `<p class="muted">${esc(c.company)}${c.first ? ' · first contact ' + esc(day(c.first)) : ''}</p>
      <div class="bar">${c.email ? `<a class="b sm" href="mailto:${esc(c.email)}">E-mail</a>` : ''}${c.phone ? `<a class="b sm" href="tel:${esc(c.phone)}">Call</a>` : ''}${wa.length >= 10 ? `<a class="b sm" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="b sm" href="studio.html?tab=inbox">Quote requests in the Studio</a><a class="b sm" href="pricing.html#requests">Quotations</a></div>
      <div class="kpis"><div class="kpi"><div class="k">Requests</div><div class="v">${c.requests.length}</div></div><div class="kpi"><div class="k">Quoted</div><div class="v">${R(c.quoted)}</div></div><div class="kpi"><div class="k">Paid</div><div class="v">${R(c.paid)}</div></div><div class="kpi"><div class="k">Owed</div><div class="v">${R(c.owing)}</div></div></div>` : ''}
      <div class="card"><h3>Details and notes</h3><div class="grid">
        ${fld('c-name', 'Name', c.name)}${fld('c-company', 'Company', c.company)}${fld('c-email', 'E-mail', c.email, 'email')}${fld('c-phone', 'Phone', c.phone, 'tel')}
        ${sel('c-kind', 'Type of client', KINDS, c.kind)}${sel('c-stage', 'Stage', STAGES, c.stage)}${fld('c-city', 'Town or city', c.city)}${fld('c-vat', 'VAT number', c.vat_no)}
        <label class="f wide">Next action<input id="c-next" type="text" value="${esc(c.next_action)}" placeholder="e.g. Phone about the survey on Thursday"></label>${fld('c-date', 'Next action date', c.next_date, 'date')}
        <label class="f wide">Notes<textarea id="c-notes" placeholder="Anything worth remembering about this client">${esc(c.notes)}</textarea></label></div>
        <div class="bar"><button class="b red" type="button" id="c-save">Save</button>${!isNew && c.rec ? '<button class="b" type="button" id="c-reset">Clear my edits</button>' : ''}</div><p class="msg" id="c-msg"></p></div>
      ${!isNew ? `<div class="card scroll"><h3>Quote requests</h3>${c.requests.length ? `<table><thead><tr><th>Reference</th><th>Site and purpose</th><th class="hide">Status</th><th class="r">Quoted</th><th></th></tr></thead><tbody>${c.requests.map(x => `<tr><td><b>${esc(x.ref)}</b><div class="sub">${esc(day(x.created_at))}</div></td><td>${esc(x.address || x.site_description || '')}<div class="sub">${esc(service(x))}${x.size_ha ? ' · ' + esc(x.size_ha) + ' ha' : ''} · ${esc(source(x))}</div>${x.admin_notes ? `<div class="sub">Notes: ${esc(x.admin_notes)}</div>` : ''}</td><td class="hide"><span class="tag ${esc(x.status)}">${esc(x.status || 'new')}</span></td><td class="r">${quoteTotal(x) ? R(quoteTotal(x)) : '–'}</td><td class="r"><button class="b sm" type="button" data-delq="${esc(x.id)}" aria-label="Delete request ${esc(x.ref)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No quote requests from this client.</p>'}${c.requests.length || c.rec ? '<div class="bar"><button class="b" type="button" id="c-delall">Delete this client and all their requests</button></div>' : ''}<p class="msg" id="q-msg"></p></div>
      <div class="card scroll"><h3>Invoices and payments</h3>${c.invoices.length || own.length ? `<table><thead><tr><th>Invoice</th><th>Description</th><th class="hide">Status</th><th class="r">Amount</th></tr></thead><tbody>${c.invoices.map(i => `<tr><td><b>${esc(i.ref)}</b><div class="sub">${esc(day(i.created_at))}</div></td><td>${esc(i.description)}${i.status === 'paid' ? `<div class="sub">Paid ${esc(day(i.paid_at))}${i.method ? ' by ' + (i.method === 'eft' ? 'EFT' : 'card') : ''}</div>` : i.eft_at ? `<div class="sub">Client says paid by EFT on ${esc(day(i.eft_at))}</div>` : ''}</td><td class="hide"><span class="tag ${esc(i.status)}">${esc(i.status)}</span></td><td class="r">${R2(invAmt(i))}${i.status === 'unpaid' && i.token ? `<div><a class="sub" href="pay.html?i=${encodeURIComponent(i.ref)}&t=${encodeURIComponent(i.token)}" target="_blank" rel="noopener">payment link</a></div>` : ''}</td></tr>`).join('')}
        ${own.map(e => `<tr><td><b>${esc(e.reference || 'Manual')}</b><div class="sub">${esc(day(e.date))}</div></td><td>${esc(e.description || e.category)}</td><td class="hide"><span class="tag income">received</span></td><td class="r">${R2(e.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No invoices yet. Create one from Pricing → Requests or the Studio.</p>'}</div>` : ''}`;
  }
  function bindClient(C) {
    document.getElementById('back').onclick = e => { e.preventDefault(); clientKey = null; render(); };
    const v = id => document.getElementById(id).value.trim();
    document.getElementById('c-save').onclick = async () => {
      const rec = { name: v('c-name'), company: v('c-company'), email: v('c-email'), phone: v('c-phone'), kind: v('c-kind'), stage: v('c-stage'), city: v('c-city'), vat_no: v('c-vat'), next_action: v('c-next'), next_date: v('c-date'), notes: document.getElementById('c-notes').value, updated_at: new Date().toISOString() };
      if (!rec.name && !rec.email && !rec.company) { say('c-msg', 'Enter at least a name, company or e-mail address.', 'err'); return; }
      let key = clientKey;
      if (key === '+new') { key = lc(rec.email) || 'm:' + Math.random().toString(36).slice(2, 10); if (clients().some(c => c.key === key)) { say('c-msg', 'A client with this e-mail address already exists.', 'err'); return; } rec.created_at = rec.updated_at; }
      document.getElementById('c-save').disabled = true;
      try { await changeCRM(cur => { cur.clients[key] = Object.assign({}, cur.clients[key] || {}, rec); }); clientKey = key; render(); say('c-msg', 'Saved.', 'good'); }
      catch (e) { document.getElementById('c-save').disabled = false; say('c-msg', 'Not saved: ' + e.message, 'err'); }
    };
    const c = C.find(x => x.key === clientKey);
    async function delQuotes(ids, what) {
      const paid = INV.filter(i => ids.includes(i.quote_id) && i.status === 'paid').length;
      if (!confirm('Delete ' + what + '? This cannot be undone.' + (paid ? '\n\nInvoices and payments stay in your financial records.' : ''))) return false;
      try { if (ids.length) await q(sb.from('floodline_quotes').delete().in('id', ids)); Q = Q.filter(x => !ids.includes(x.id)); return true; }
      catch (e) { say('q-msg', 'Not deleted: ' + e.message, 'err'); return false; }
    }
    root.querySelectorAll('[data-delq]').forEach(b => b.onclick = async () => { const x = Q.find(y => y.id === b.dataset.delq); if (await delQuotes([b.dataset.delq], 'request ' + (x ? x.ref : ''))) { if (!clients().some(k => k.key === clientKey)) clientKey = null; render(); } });
    const da = document.getElementById('c-delall');
    if (da && c) da.onclick = async () => { if (!(await delQuotes(c.requests.map(x => x.id), (c.name || c.email) + ' and their ' + c.requests.length + ' request' + (c.requests.length === 1 ? '' : 's')))) return; try { if (CRM.clients[clientKey]) await changeCRM(cur => { delete cur.clients[clientKey]; }); } catch (e) { } clientKey = null; render(); };
    const rs = document.getElementById('c-reset');
    if (rs) rs.onclick = async () => { if (!confirm('Remove the details and notes you added for this client? Their requests and invoices stay.')) return; try { await changeCRM(cur => { delete cur.clients[clientKey]; }); if (!clients().some(c => c.key === clientKey)) clientKey = null; render(); } catch (e) { say('c-msg', e.message, 'err'); } };
  }

  // ---------- finances
  function finances() {
    const rg = range(), L = ledger(), Lp = L.filter(e => inR(e.date + 'T12:00:00', rg));
    const inc = Lp.filter(e => e.kind === 'income').reduce((s, e) => s + e.amount, 0), exp = Lp.filter(e => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
    const vatIn = Lp.filter(e => e.kind === 'income').reduce((s, e) => s + (e.vat || 0), 0), vatOut = Lp.filter(e => e.kind === 'expense').reduce((s, e) => s + (e.vat || 0), 0);
    const unpaid = INV.filter(i => i.status === 'unpaid' && !isTest(i)), owed = unpaid.reduce((s, i) => s + invAmt(i), 0);
    const quoted = Q.filter(x => inR(x.created_at, rg)).reduce((s, x) => s + quoteTotal(x), 0);
    const ms = months(rg), mi = ms.map(m => Lp.filter(e => e.kind === 'income' && e.date.slice(0, 7) === m.key).reduce((s, e) => s + e.amount, 0)), me = ms.map(m => Lp.filter(e => e.kind === 'expense' && e.date.slice(0, 7) === m.key).reduce((s, e) => s + e.amount, 0));
    const C = clients(), keyByEmail = new Map(C.filter(c => c.email).map(c => [lc(c.email), c]));
    return `<p class="muted">${esc(rg[2])}. Paid invoices are added automatically; add other income (cash, EFT outside an invoice) and every expense below.</p>
      <div class="kpis">
        <div class="kpi"><div class="k">Money received</div><div class="v">${R(inc)}</div><div class="s">${Lp.filter(e => e.kind === 'income').length} payments</div></div>
        <div class="kpi"><div class="k">Expenses</div><div class="v">${R(exp)}</div><div class="s">${Lp.filter(e => e.kind === 'expense').length} entries</div></div>
        <div class="kpi"><div class="k">Profit</div><div class="v">${R(inc - exp)}</div><div class="s">${inc ? 'margin ' + pct(inc - exp, inc) : 'received less expenses'}</div></div>
        <div class="kpi"><div class="k">Still owed to you</div><div class="v">${R(owed)}</div><div class="s">${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'} (all dates)</div></div>
        <div class="kpi"><div class="k">Quoted in period</div><div class="v">${R(quoted)}</div><div class="s">automatic quotations</div></div>
        ${vatIn || vatOut ? `<div class="kpi"><div class="k">VAT</div><div class="v">${R(vatIn - vatOut)}</div><div class="s">output ${R(vatIn)} less input ${R(vatOut)}</div></div>` : ''}</div>
      <div class="card"><h3>Received and spent per month</h3>${vbars(ms, [{ name: 'Received', cls: 'm1', values: mi }, { name: 'Expenses', cls: 'm2', values: me }], R)}</div>
      <div class="card"><h3>Add income or an expense</h3><div class="grid">
        <label class="f">Type<select id="l-kind"><option value="expense">Expense</option><option value="income">Income</option></select></label>
        <label class="f">Date<input id="l-date" type="date" value="${today()}"></label>
        <label class="f">Category<select id="l-cat">${EXP_CATS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label class="f">Amount incl. VAT (R)<input id="l-amt" type="number" min="0" step="0.01" inputmode="decimal"></label>
        <label class="f">VAT included (R)<input id="l-vat" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0 if not VAT registered"></label>
        <label class="f">Paid to / received from<input id="l-party" type="text" list="l-parties"></label>
        <label class="f">Reference (invoice or slip)<input id="l-ref" type="text"></label>
        <label class="f wide">Description<input id="l-desc" type="text" placeholder="e.g. LiDAR survey for FL-1234"></label></div>
        <datalist id="l-parties">${C.map(c => `<option value="${esc(c.name || c.email)}">`).join('')}</datalist>
        <div class="bar"><button class="b red" type="button" id="l-add">Add entry</button><button class="b" type="button" id="l-csv">Export ledger CSV</button></div><p class="msg" id="l-msg"></p></div>
      ${unpaid.length ? `<div class="card scroll"><h3>Unpaid invoices</h3><table><thead><tr><th>Invoice</th><th>Client</th><th class="r">Amount</th><th class="r">Days open</th></tr></thead><tbody>${unpaid.map(i => `<tr><td><b>${esc(i.ref)}</b><div class="sub">${esc(day(i.created_at))}</div></td><td>${esc(i.client_name || i.client_email)}<div class="sub">${esc(i.description)}${i.eft_at ? ' · client says paid by EFT ' + esc(day(i.eft_at)) + ' (confirm on Pricing → Payments)' : ''}</div></td><td class="r">${R2(invAmt(i))}</td><td class="r">${Math.floor((Date.now() - new Date(i.created_at)) / 864e5)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="card scroll"><h3>Ledger</h3>${Lp.length ? `<table><thead><tr><th>Date</th><th>Category and description</th><th class="hide">Party</th><th class="r">Amount</th><th></th></tr></thead><tbody>${Lp.map(e => `<tr><td style="white-space:nowrap">${esc(day(e.date))}<div><span class="tag ${e.kind}">${e.kind === 'income' ? 'in' : 'out'}</span></div></td><td>${esc(e.category)}<div class="sub">${esc([e.description, e.reference].filter(Boolean).join(' · '))}</div></td><td class="hide">${esc(e.party)}</td><td class="r">${e.kind === 'expense' ? '−' : ''}${R2(e.amount)}${e.vat ? `<div class="sub">VAT ${R2(e.vat)}</div>` : ''}</td><td class="r">${e.auto ? '<span class="sub">invoice</span>' : `<button class="b sm" type="button" data-del="${esc(e.id)}" aria-label="Delete entry">Delete</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No money in or out in this period yet.</p>'}</div>`;
  }
  function bindFinances() {
    const kind = document.getElementById('l-kind'), cat = document.getElementById('l-cat');
    kind.onchange = () => { cat.innerHTML = (kind.value === 'income' ? INC_CATS : EXP_CATS).map(c => `<option>${esc(c)}</option>`).join(''); };
    document.getElementById('l-add').onclick = async () => {
      const amt = Number(document.getElementById('l-amt').value), vat = Number(document.getElementById('l-vat').value) || 0, date = document.getElementById('l-date').value;
      if (!(amt > 0)) { say('l-msg', 'Enter the amount.', 'err'); return; }
      if (vat > amt) { say('l-msg', 'The VAT cannot be more than the amount.', 'err'); return; }
      if (!date) { say('l-msg', 'Enter the date.', 'err'); return; }
      const party = document.getElementById('l-party').value.trim(), C = clients(), cl = C.find(c => party && (lc(c.name) === lc(party) || lc(c.email) === lc(party)));
      const e = { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, kind: kind.value, category: cat.value, description: document.getElementById('l-desc').value.trim(), party, client: kind.value === 'income' && cl ? cl.key : '', amount: Math.round(amt * 100) / 100, vat: Math.round(vat * 100) / 100, reference: document.getElementById('l-ref').value.trim(), created_at: new Date().toISOString(), created_by: user.email };
      document.getElementById('l-add').disabled = true;
      try { await changeLedger(cur => { cur.entries.push(e); }); render(); say('l-msg', 'Added.', 'good'); }
      catch (er) { document.getElementById('l-add').disabled = false; say('l-msg', 'Not saved: ' + er.message, 'err'); }
    };
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this entry?')) return; try { await changeLedger(cur => { cur.entries = cur.entries.filter(x => x.id !== b.dataset.del); }); render(); } catch (er) { alert(er.message); } });
    document.getElementById('l-csv').onclick = () => { const rg = range(); csv('floodline-ledger-' + period + '-' + today() + '.csv', ['Date', 'Type', 'Category', 'Description', 'Party', 'Reference', 'Amount incl. VAT (R)', 'VAT (R)', 'Source'], ledger().filter(e => inR(e.date + 'T12:00:00', rg)).map(e => [e.date, e.kind, e.category, e.description, e.party, e.reference, (e.kind === 'expense' ? -e.amount : e.amount).toFixed(2), (e.vat || 0).toFixed(2), e.auto ? 'Invoice' : 'Manual'])); };
  }

  // ---------- analysis
  function analysis() {
    const rg = range(), Qp = Q.filter(x => inR(x.created_at, rg)), ids = new Set(Qp.map(x => x.id));
    const invFor = new Map(); for (const i of INV) if (i.quote_id && !isTest(i)) { const a = invFor.get(i.quote_id) || []; a.push(i); invFor.set(i.quote_id, a); }
    const quoted = Qp.filter(x => quoteTotal(x) > 0 || ['quoted', 'won'].includes(x.status) || invFor.has(x.id));
    const paidQ = Qp.filter(x => (invFor.get(x.id) || []).some(i => i.status === 'paid') || x.status === 'won');
    const paidInv = INV.filter(i => i.status === 'paid' && !isTest(i) && inR(i.paid_at || i.created_at, rg)), revenue = paidInv.reduce((s, i) => s + invPaid(i), 0);
    const resp = Qp.filter(x => x.quoted_at).map(x => (new Date(x.quoted_at) - new Date(x.created_at)) / 36e5).sort((a, b) => a - b);
    const med = resp.length ? resp[Math.floor(resp.length / 2)] : null;
    const ms = months(rg), perM = ms.map(m => Qp.filter(x => mkey(x.created_at) === m.key).length), wonM = ms.map(m => paidQ.filter(x => mkey(x.created_at) === m.key).length);
    const bySrc = count(Qp, source), bySvc = count(Qp, service), byReg = count(Qp, region);
    const valSvc = count(Qp.filter(x => quoteTotal(x) > 0), service, quoteTotal);
    const conv = new Map(); for (const x of Qp) { const s = source(x), o = conv.get(s) || [0, 0]; o[0]++; if (paidQ.includes(x)) o[1]++; conv.set(s, o); }
    const exp = count(LED.entries.filter(e => e.kind === 'expense' && inR(e.date + 'T12:00:00', rg)), e => e.category, e => e.amount);
    const adSpend = LED.entries.filter(e => e.kind === 'expense' && /advertis/i.test(e.category) && inR(e.date + 'T12:00:00', rg)).reduce((s, e) => s + e.amount, 0);
    const funnel = [{ k: 'Quote requests', v: Qp.length }, { k: 'Quoted', v: quoted.length, s: pct(quoted.length, Qp.length) + ' of requests' }, { k: 'Invoiced', v: Qp.filter(x => invFor.has(x.id)).length, s: pct(Qp.filter(x => invFor.has(x.id)).length, Qp.length) + ' of requests' }, { k: 'Paid or won', v: paidQ.length, s: pct(paidQ.length, Qp.length) + ' of requests' }];
    return `<p class="muted">${esc(rg[2])}. Test-mode payments are left out.</p>
      <div class="kpis">
        <div class="kpi"><div class="k">Quote requests</div><div class="v">${Qp.length}</div><div class="s">${Qp.length && ms.length ? (Qp.length / ms.length).toFixed(1) + ' a month' : ''}</div></div>
        <div class="kpi"><div class="k">Conversion</div><div class="v">${pct(paidQ.length, Qp.length)}</div><div class="s">${paidQ.length} paid or won</div></div>
        <div class="kpi"><div class="k">Revenue</div><div class="v">${R(revenue)}</div><div class="s">${paidInv.length} paid invoices</div></div>
        <div class="kpi"><div class="k">Average paid invoice</div><div class="v">${paidInv.length ? R(revenue / paidInv.length) : '–'}</div></div>
        <div class="kpi"><div class="k">Average quotation</div><div class="v">${quoted.filter(quoteTotal).length ? R(quoted.reduce((s, x) => s + quoteTotal(x), 0) / quoted.filter(quoteTotal).length) : '–'}</div></div>
        <div class="kpi"><div class="k">Time to quote</div><div class="v">${med == null ? '–' : med < 1 ? Math.round(med * 60) + ' min' : med < 48 ? med.toFixed(1) + ' h' : Math.round(med / 24) + ' days'}</div><div class="s">median</div></div>
        ${adSpend ? `<div class="kpi"><div class="k">Cost per request</div><div class="v">${Qp.length ? R(adSpend / Qp.length) : '–'}</div><div class="s">advertising ${R(adSpend)} in the ledger</div></div>` : ''}</div>
      <div class="card"><h3>Quote requests per month</h3>${vbars(ms, [{ name: 'Requests', cls: 'm1', values: perM }, { name: 'Paid or won', cls: 'm2', values: wonM }], v => String(Math.round(v)))}</div>
      <div class="two">
        <div class="card"><h3>From request to payment</h3>${hbars(funnel, v => String(v))}</div>
        <div class="card"><h3>Where requests come from</h3>${hbars(bySrc.map(i => { const c = conv.get(i.k) || [0, 0]; return Object.assign(i, { s: c[1] + ' paid (' + pct(c[1], c[0]) + ')' }); }), v => String(v))}<p class="sub">From the advert or post the client arrived through, or what they wrote under "How did you hear about us".</p></div>
        <div class="card"><h3>Services requested</h3>${hbars(bySvc, v => String(v))}</div>
        <div class="card"><h3>Quoted value by service</h3>${hbars(valSvc, R)}</div>
        <div class="card"><h3>Where the sites are</h3>${hbars(byReg, v => String(v))}</div>
        <div class="card"><h3>Expenses by category</h3>${hbars(exp, R)}${exp.length ? '' : '<p class="sub">Add expenses on the Finances tab.</p>'}</div>
      </div>`;
  }

  // ---------- sign in
  function login(msg) {
    root.innerHTML = `<span class="label">Administrator</span><h1>Clients and finances</h1><div class="card gate"><h2>Sign in</h2><p class="muted">Use your Adventuity portal administrator account (the same as the Studio).</p>
      <form id="g-form" novalidate><input id="g-email" type="email" autocomplete="username" placeholder="E-mail" required><input id="g-pass" type="password" autocomplete="current-password" placeholder="Password" required>
      <button class="b red" type="submit" id="g-go">Sign in</button></form><p class="msg${msg ? ' show err' : ''}" id="g-msg">${esc(msg || '')}</p></div>`;
    document.getElementById('g-form').addEventListener('submit', async e => {
      e.preventDefault(); const email = document.getElementById('g-email').value.trim(), password = document.getElementById('g-pass').value;
      if (!email || !password) { say('g-msg', 'Enter your e-mail address and password.', 'err'); return; }
      document.getElementById('g-go').disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { document.getElementById('g-go').disabled = false; say('g-msg', error.message === 'Invalid login credentials' ? 'The e-mail address or password is incorrect.' : error.message, 'err'); return; }
      start();
    });
  }
  async function start() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { login(); return; }
      user = session.user;
      const { data: admin, error } = await sb.rpc('is_admin');
      if (error) throw new Error(error.message);
      if (!admin) { await sb.auth.signOut(); login('This account is not an Adventuity administrator.'); return; }
      await loadAll();
      const h = location.hash.slice(1); if (['clients', 'finances', 'analysis'].includes(h)) tab = h;
      render();
    } catch (e) {
      root.innerHTML = `<h1>Clients and finances</h1><p class="msg show err">${esc(e.message)}</p><p><button class="b" id="retry" type="button">Try again</button></p>`;
      document.getElementById('retry').onclick = start;
    }
  }
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (user && tab !== 'clients' && !root.contains(document.activeElement)) render(); }, 250); });
  (async function boot() {
    try {
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
      sb = window.supabase.createClient(SB.url, SB.key, { auth: { persistSession: true, autoRefreshToken: true } });
      start();
    } catch (e) { root.innerHTML = `<h1>Clients and finances</h1><p class="msg show err">${esc(e.message)}</p>`; }
  })();
})();
