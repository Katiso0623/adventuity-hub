/* Adventuity portal – Analysis (the director only): lessons booked and finished, per tutor and per learner, hours over the
   allocation, sponsors (e.g. SAILI) and their invoices – made from the delivered lessons and printed on the Adventuity layout. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, esc, fmt, pill, ICON, state, sb, SUBJ, toast } = ADV; const now = ADV.now;
  const DAY = 864e5;
  const hrs = (h) => String(Math.round(Number(h || 0) * 10) / 10).replace('.', ',') + ' h';
  const mins = (b) => (new Date(b.ends_at) - new Date(b.starts_at)) / 6e4;
  const delivered = (b) => b.status === 'completed' || (b.status === 'accepted' && !!b.delivered_at);
  const booked = (b) => b.status === 'accepted' || b.status === 'completed';
  const notLogged = (b) => b.status === 'accepted' && !b.delivered_at && new Date(b.ends_at) < now();
  const upcomingB = (b) => b.status === 'accepted' && new Date(b.ends_at) > now();
  const profileOf = (id) => (state.learners || []).find((l) => l.id === id) || null;
  const nameOf = (id) => { const p = profileOf(id); return (p && (p.full_name || p.email)) || 'Learner'; };
  const one = () => (state.bookings || []).filter((b) => !b.class_id);
  const keyAdd = (k, n) => fmt.key(new Date(k + 'T12:00:00+02:00').getTime() + n * DAY);
  const longDate = (k) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(k + 'T12:00:00+02:00'));
  const shortDate = (k) => fmt.date(k + 'T12:00:00+02:00');
  const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------------------------------------------------------------- data (sponsors and invoices: director only) */
  async function loadFin() {
    try { state.sponsors = await sb.select('sponsors', { order: 'name.asc' }); } catch (e) { state.sponsors = state.sponsors || []; }
    try { state.invoices = await sb.select('invoices', { order: 'created_at.desc' }); } catch (e) { state.invoices = state.invoices || []; }
  }
  const prevInit = ADV.adminInit;
  ADV.adminInit = async function () { await Promise.all([prevInit ? prevInit() : null, loadFin()]); };

  /* ---------------------------------------------------------------- period */
  function period() {
    const p = state.anP || (state.anP = { k: 'month' }); const today = fmt.key(now()); const ym = today.slice(0, 7);
    const monthEnd = (k) => { const d = new Date(k.slice(0, 7) + '-01T12:00:00+02:00'); d.setMonth(d.getMonth() + 1); return keyAdd(fmt.key(d), -1); };
    if (p.k === 'month') return { from: ym + '-01', to: monthEnd(today), label: 'This month' };
    if (p.k === 'last') { const d = new Date(ym + '-01T12:00:00+02:00'); d.setMonth(d.getMonth() - 1); const f = fmt.key(d); return { from: f, to: keyAdd(ym + '-01', -1), label: 'Last month' }; }
    if (p.k === '3m') return { from: keyAdd(today, -90), to: today, label: 'Last 90 days' };
    if (p.k === 'year') return { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31', label: 'This year' };
    if (p.k === 'next') return { from: today, to: keyAdd(today, 30), label: 'Next 30 days' };
    const from = p.from || ym + '-01', to = p.to && p.to >= from ? p.to : today; return { from, to, label: shortDate(from) + ' – ' + shortDate(to) };
  }
  const inP = (P) => (b) => { const k = fmt.key(b.starts_at); return k >= P.from && k <= P.to; };

  /* ---------------------------------------------------------------- allocation flags (all time) */
  function allocations() {
    return (state.assign || []).filter((a) => a.active).map((a) => {
      const list = one().filter((b) => b.learner_id === a.learner_id && b.subject === a.subject && b.tutor_id === a.tutor_id);
      const done = list.filter(delivered).reduce((n, b) => n + mins(b), 0) / 60;
      const ahead = list.filter((b) => b.status === 'accepted' && !b.delivered_at).reduce((n, b) => n + mins(b), 0) / 60;
      const h = Number(a.hours) || 0;
      return { a, done, ahead, h, over: h ? done + ahead - h : 0 };
    });
  }

  /* ---------------------------------------------------------------- view */
  ADV.views.analysis = function () {
    if (!state.isAdmin) return '<div class="card"><p class="muted">Only the director can see this page.</p></div>';
    const P = period(); const all = one(); const L = all.filter(inP(P));
    const sum = (arr) => arr.reduce((n, b) => n + mins(b), 0) / 60;
    const bk = L.filter(booked), fin = L.filter(delivered), up = L.filter(upcomingB), nl = L.filter(notLogged), cx = L.filter((b) => b.status === 'cancelled' || b.status === 'declined'), wait = L.filter((b) => b.status === 'pending');
    const inPk = (d) => { if (!d) return false; const k = fmt.key(d); return k >= P.from && k <= P.to; };
    const fees = (state.bookings || []).filter((b) => b.paid && inPk(b.paid_at)).reduce((n, b) => n + Number(b.fee || 0), 0); const bund = (state.bundles || []).filter((bu) => bu.paid && inPk(bu.paid_at)).reduce((n, bu) => n + Number(bu.price || 0), 0);
    const inv = (state.invoices || []).filter((x) => x.issue_date >= P.from && x.issue_date <= P.to).reduce((n, x) => n + Number(x.total || 0), 0);
    const kpi = (label, val, sub) => '<div class="cd kpi"><span class="eyebrow">' + label + '</span><div class="big">' + val + '</div>' + (sub ? '<span class="small muted">' + sub + '</span>' : '') + '</div>';
    const seg = (k, l) => '<button class="' + ((state.anP || {}).k === k ? 'on' : '') + '" data-action="an-p" data-id="' + k + '">' + l + '</button>';
    const custom = (state.anP || {}).k === 'custom';

    // per tutor (the director's own lessons as "You")
    const tutorsList = [{ id: null, name: 'You (director)', rate: 0 }].concat((state.learners || []).filter((p) => p.role === 'tutor').map((t) => ({ id: t.id, name: t.full_name || t.email, rate: Number(t.tutor_rate) || 0 })));
    const tRows = tutorsList.map((t) => { const m = L.filter((b) => (b.tutor_id || null) === t.id || (t.id === null && b.tutor_id && (profileOf(b.tutor_id) || {}).role === 'admin')); const f = m.filter(delivered); return { t, n: m.filter(booked).length, f: f.length, fh: sum(f), up: m.filter(upcomingB).length, nl: m.filter(notLogged).length, pay: sum(f) * t.rate }; }).filter((r) => r.n || r.nl || r.up);
    const td = (v, cls) => '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>';
    const tutorTable = tRows.length ? '<div class="an-wrap"><table class="an-table"><thead><tr><th>Tutor</th><th>Booked</th><th>Finished</th><th>Hours taught</th><th>Upcoming</th><th>Not logged</th><th>Pay</th></tr></thead><tbody>' +
      tRows.map((r) => '<tr><td class="name">' + esc(r.t.name) + '</td>' + td(r.n) + td(r.f) + td(hrs(r.fh)) + td(r.up) + td(r.nl ? pill('warn', String(r.nl)) : '0') + td(r.t.id && r.t.rate ? fmt.rand(r.pay) : '–') + '</tr>').join('') + '</tbody></table></div>' : '<p class="muted small">No lessons in this period.</p>';

    // per learner and subject
    const alloc = allocations(); const keyOf = (l, s) => l + '|' + s;
    const lmap = new Map();
    L.forEach((b) => { const k = keyOf(b.learner_id, b.subject); if (!lmap.has(k)) lmap.set(k, { learner: b.learner_id, subject: b.subject, list: [] }); lmap.get(k).list.push(b); });
    alloc.forEach((x) => { const k = keyOf(x.a.learner_id, x.a.subject); if (!lmap.has(k)) lmap.set(k, { learner: x.a.learner_id, subject: x.a.subject, list: [] }); });
    const lRows = Array.from(lmap.values()).map((r) => { const al = alloc.filter((x) => x.a.learner_id === r.learner && x.a.subject === r.subject); const h = al.reduce((n, x) => n + x.h, 0); const used = al.reduce((n, x) => n + x.done + x.ahead, 0); const tutorsTxt = Array.from(new Set(r.list.map((b) => b.tutor_id ? nameOf(b.tutor_id) : 'You').concat(al.map((x) => nameOf(x.a.tutor_id))))).join(', '); return Object.assign(r, { h, used, over: h ? used - h : 0, tutorsTxt }); })
      .filter((r) => r.list.length || r.h).sort((a, b) => (b.over > 0.01) - (a.over > 0.01) || nameOf(a.learner).localeCompare(nameOf(b.learner)));
    const spName = (id) => { const s = (state.sponsors || []).find((x) => x.id === id); return s ? s.name.split(' ')[0] : ''; };
    const learnerTable = lRows.length ? '<div class="an-wrap"><table class="an-table"><thead><tr><th>Learner</th><th>Subject</th><th>Tutor</th><th>Booked</th><th>Finished</th><th>Allocated (all time)</th><th></th></tr></thead><tbody>' +
      lRows.map((r) => { const p = profileOf(r.learner) || {}; const f = r.list.filter(delivered); return '<tr><td class="name">' + esc(nameOf(r.learner)) + (p.sponsor_id ? ' ' + pill('accent', spName(p.sponsor_id)) : '') + '</td>' + td(esc(SUBJ[r.subject] ? SUBJ[r.subject].short : r.subject)) + td(esc(r.tutorsTxt || '–'), 'left') + td(r.list.filter(booked).length) + td(f.length + ' · ' + hrs(sum(f))) +
        td(r.h ? hrs(r.used) + ' of ' + hrs(r.h) : 'No limit') + td(r.over > 0.01 ? pill('bad', 'Over by ' + hrs(r.over)) : r.h ? pill('good', hrs(r.h - r.used) + ' left') : '') + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">No learners with lessons in this period.</p>';

    // flags for the director
    const overs = alloc.filter((x) => x.over > 0.01);
    const lateLogs = all.filter((b) => notLogged(b) && b.tutor_id && new Date(b.ends_at) < new Date(+now() - 2 * DAY));
    const flags = overs.map((x) => '<li>' + pill('bad', 'Hours') + ' <b>' + esc(nameOf(x.a.learner_id)) + '</b> (' + esc(SUBJ[x.a.subject].short) + ', ' + esc(nameOf(x.a.tutor_id)) + '): ' + hrs(x.done) + ' taught + ' + hrs(x.ahead) + ' booked = <b>' + hrs(x.over) + ' over</b> the ' + hrs(x.h) + ' allocated.</li>')
      .concat(lateLogs.length ? ['<li>' + pill('warn', 'Logs') + ' ' + lateLogs.length + ' tutor lesson' + (lateLogs.length > 1 ? 's' : '') + ' ended more than 2 days ago without a lesson log (' + esc(Array.from(new Set(lateLogs.map((b) => nameOf(b.tutor_id)))).join(', ')) + ').</li>'] : []);

    return '<div class="stack"><div><span class="eyebrow">Analysis · only you see this</span><h1>Analysis</h1><p class="small muted">Lessons booked and finished, per tutor and learner, hours over the allocation, and sponsor invoices. Group classes are under Classes.</p></div>' +
      '<div class="row" style="gap:8px"><div class="seg">' + seg('month', 'This month') + seg('last', 'Last month') + seg('3m', '90 days') + seg('year', 'This year') + seg('next', 'Next 30 days') + seg('custom', 'Choose…') + '</div></div>' +
      (custom ? '<div class="row" style="gap:8px"><label class="small" for="an-from">From</label>' + ADV.dateSelect('an-from', P.from, { back: 400, days: 60 }) + '<label class="small" for="an-to">to</label>' + ADV.dateSelect('an-to', P.to, { back: 400, days: 60 }) + '</div>' : '') +
      '<p class="small muted">' + esc(P.label) + ': ' + esc(shortDate(P.from)) + ' – ' + esc(shortDate(P.to)) + '</p>' +
      '<div class="grid cols-4">' + kpi('Booked', bk.length, hrs(sum(bk))) + kpi('Finished', fin.length, hrs(sum(fin)) + ' taught') + kpi('Upcoming', up.length, hrs(sum(up))) + kpi('Not logged yet', nl.length, nl.length ? 'ended, no log' : 'all logged') + '</div>' +
      '<div class="grid cols-4">' + kpi('Cancelled / declined', cx.length) + kpi('Requests waiting', wait.length) + kpi('Received from learners', fmt.rand(fees + bund), (bund ? fmt.rand(bund) + ' from bundles · ' : '') + 'paid in this period') + kpi('Invoiced to sponsors', fmt.rand(inv), 'invoices dated in this period') + '</div>' +
      (flags.length ? '<div class="card an-flags"><h3>Flags</h3><ul>' + flags.join('') + '</ul><p class="small muted">Tutors may book beyond the allocated hours; they are shown here so you can top up the allocation (Tutors → Assign a learner) or speak to the tutor.</p></div>' : '') +
      '<div class="card"><h3>By tutor</h3>' + tutorTable + '</div>' +
      '<div class="card"><h3>By learner</h3>' + learnerTable + '</div>' +
      sponsorsCard(P) + invoicesCard() + invoiceSettings() + '</div>';
  };
  ADV.actions['an-p'] = (a) => { const p = state.anP || {}; p.k = a.dataset.id; if (p.k === 'custom' && !p.from) { const P0 = period(); p.from = fmt.key(now()).slice(0, 7) + '-01'; p.to = P0.to; } state.anP = p; ADV.render(); };

  /* ---------------------------------------------------------------- sponsors */
  function lastInvoiced(sid) { return (state.invoices || []).filter((x) => x.sponsor_id === sid && x.period_to).map((x) => x.period_to).sort().pop() || ''; }
  function invoicePeriod(sid, P) { const last = lastInvoiced(sid); const from = last && keyAdd(last, 1) > P.from ? keyAdd(last, 1) : P.from; const today = fmt.key(now()); return { from, to: P.to < today ? P.to : today, last }; }   // never past today, so later lessons go on the next invoice
  function uninvoiced(sid, from, to) { return one().filter((b) => b.sponsor_id === sid && delivered(b) && !b.invoice_id && fmt.key(b.starts_at) >= from && fmt.key(b.starts_at) <= to); }
  function sponsorsCard(P) {
    const list = state.sponsors || []; const ed = state.spEdit;
    const learners = (state.learners || []).filter((l) => l.role === 'learner' && !l.blocked);
    const card = (s) => {
      const mine = learners.filter((l) => l.sponsor_id === s.id); const ip = invoicePeriod(s.id, P); const todo = ip.from <= ip.to ? uninvoiced(s.id, ip.from, ip.to) : [];
      const h = todo.reduce((n, b) => n + mins(b), 0) / 60;
      return '<div class="sp-card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><b>' + esc(s.name) + '</b>' + (s.active ? '' : ' ' + pill('', 'Inactive')) + '<p class="small muted">' + fmt.rand(s.rate) + ' per hour' + (s.email ? ' · ' + esc(s.email) : '') + '</p></div><button class="btn sm ghost" data-action="sp-edit" data-id="' + s.id + '">Edit</button></div>' +
        '<div class="row" style="gap:6px;margin-top:8px">' + (mine.length ? mine.map((l) => '<span class="chipbtn">' + esc(l.full_name || l.email) + ' <button class="x" data-action="sp-unlink" data-id="' + l.id + '" aria-label="Stop billing ' + esc(s.name) + ' for ' + esc(l.full_name || 'this learner') + '">✕</button></span>').join('') : '<span class="small muted">No learners billed to this sponsor yet.</span>') +
        '<select id="sp-add-' + s.id + '" data-action="sp-link" data-id="' + s.id + '" aria-label="Bill a learner to ' + esc(s.name) + '" style="width:auto"><option value="">+ Bill a learner to ' + esc(s.name.split(' ')[0]) + '…</option>' + learners.filter((l) => l.sponsor_id !== s.id).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map((l) => '<option value="' + l.id + '">' + esc((l.full_name || l.email) + (l.sponsor_id ? ' (now: ' + ((list.find((x) => x.id === l.sponsor_id) || {}).name || 'other') + ')' : '')) + '</option>').join('') + '</select></div>' +
        '<div class="decide"><p class="small">' + (ip.from > ip.to ? 'Everything up to ' + esc(shortDate(ip.last)) + ' is invoiced already.' : '<b>Not invoiced yet</b> (' + esc(shortDate(ip.from)) + ' – ' + esc(shortDate(ip.to)) + '): ' + todo.length + ' delivered lesson' + (todo.length === 1 ? '' : 's') + ' · ' + hrs(h) + ' · <b>' + fmt.rand(h * Number(s.rate)) + '</b>' + (ip.last ? ' <span class="muted">(invoiced up to ' + esc(shortDate(ip.last)) + ')</span>' : '')) + '</p>' +
        (todo.length ? '<div class="row"><button class="btn sm primary" data-action="inv-make" data-id="' + s.id + '" data-from="' + ip.from + '" data-to="' + ip.to + '">' + ICON.note + 'Make the invoice</button></div>' : '') + '</div></div>';
    };
    const form = ed ? (() => { const s = ed === 'new' ? { name: '', bill_lines: '', email: '', rate: 200, note: '', active: true } : list.find((x) => x.id === ed) || {}; return '<form id="f-sponsor" data-id="' + esc(ed) + '" class="decide"><div class="grid cols-2"><div class="field"><label for="sp-name">Name (as on the invoice)</label><input id="sp-name" required value="' + esc(s.name) + '" placeholder="e.g. SAILI – SA Improved Learning Initiative"></div><div class="field"><label for="sp-email">Invoice e-mail</label><input id="sp-email" type="email" value="' + esc(s.email) + '"></div><div class="field"><label for="sp-rate">Rate per hour (R)</label><input id="sp-rate" type="number" min="0" step="10" value="' + esc(s.rate) + '"></div><div class="field"><label for="sp-active">Status</label><select id="sp-active"><option value="1"' + (s.active ? ' selected' : '') + '>Active</option><option value="0"' + (s.active ? '' : ' selected') + '>Inactive</option></select></div><div class="field" style="grid-column:1/-1"><label for="sp-lines">Lines under the name on the invoice (attention, city …)</label><textarea id="sp-lines" rows="2">' + esc(s.bill_lines) + '</textarea></div></div><div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-action="sp-edit" data-id="">Cancel</button></div></form>'; })() : '';
    return '<div class="card"><div class="row" style="justify-content:space-between"><h3>Sponsors and invoices</h3>' + (ed ? '' : '<button class="btn sm" data-action="sp-edit" data-id="new">' + ICON.plus + 'Add a sponsor</button>') + '</div><p class="small muted">Lessons booked for a learner billed to a sponsor have no learner fee; once delivered they go on the sponsor\'s invoice (one line per learner, subject and tutor). Each invoice covers the lessons after the previous one, up to today or the end of the period chosen above.</p>' + form +
      (list.length ? list.map(card).join('') : '<p class="small muted">No sponsors yet.</p>') + '</div>';
  }
  ADV.actions['sp-edit'] = (a) => { state.spEdit = a.dataset.id || null; ADV.render(); const el = $('#sp-name'); if (el) el.focus(); };
  async function saveSponsor(e) {
    e.preventDefault(); const id = e.target.dataset.id; const row = { name: $('#sp-name').value.trim(), email: $('#sp-email').value.trim(), rate: Math.max(0, Number($('#sp-rate').value) || 0), active: $('#sp-active').value === '1', bill_lines: $('#sp-lines').value.trim() };
    if (row.name.length < 2) return toast('Enter the sponsor\'s name');
    try { if (id === 'new') await sb.insert('sponsors', [row]); else await sb.update('sponsors', { id: 'eq.' + id }, row); state.spEdit = null; await loadFin(); toast('Saved'); ADV.render(); } catch (err) { toast(ADV.errMsg(err), 5000); }
  }
  /* A lesson is billed to the sponsor it was booked under (bookings.sponsor_id, learner fee R0). Linking a learner can also move
     their lessons that are not paid and not invoiced yet; unlinking can take lessons that are not invoiced yet off the sponsor. */
  async function setSponsor(learnerId, sponsorId) {
    const l = profileOf(learnerId) || {}; const prev = l.sponsor_id; const sp = (state.sponsors || []).find((x) => x.id === (sponsorId || prev)) || {};
    const movable = sponsorId ? one().filter((b) => b.learner_id === learnerId && !b.paid && !b.invoice_id && b.sponsor_id !== sponsorId && ['pending', 'accepted', 'completed'].includes(b.status))
      : one().filter((b) => b.learner_id === learnerId && b.sponsor_id === prev && !b.invoice_id);
    try {
      const r = await sb.update('profiles', { id: 'eq.' + learnerId }, { sponsor_id: sponsorId }); const i = state.learners.findIndex((x) => x.id === learnerId); if (i >= 0 && r[0]) state.learners[i] = r[0];
      let moved = 0;
      if (movable.length && confirm(sponsorId
        ? 'Also bill ' + (sp.name || 'the sponsor') + ' for ' + (l.full_name || 'this learner') + '\'s ' + movable.length + ' lesson' + (movable.length === 1 ? '' : 's') + ' that are not paid and not invoiced yet (from ' + fmt.date(movable.map((b) => b.starts_at).sort()[0]) + ')? Their learner fee becomes R0. Lessons already invoiced by hand are left out of the next invoice anyway – it starts after the last one.'
        : 'Also take ' + movable.length + ' lesson' + (movable.length === 1 ? '' : 's') + ' that are not invoiced yet off ' + (sp.name || 'the sponsor') + '? They then show no fee – set the fee under Bookings if the learner should pay.')) {
        for (const b of movable) { try { await sb.update('bookings', { id: 'eq.' + b.id }, sponsorId ? { sponsor_id: sponsorId, fee: 0 } : { sponsor_id: null }); moved++; } catch (e) { /* keep going */ } }
        await ADV.loadBookings();
      }
      ADV.render(); toast((sponsorId ? 'Billed to ' + (sp.name || 'the sponsor') + ' from now on' : 'No longer billed to ' + (sp.name || 'the sponsor')) + (moved ? ' – ' + moved + ' lesson' + (moved === 1 ? '' : 's') + ' moved' : ''), 5000);
    } catch (err) { toast(ADV.errMsg(err), 5000); }
  }
  ADV.actions['sp-unlink'] = (a) => { const l = profileOf(a.dataset.id); if (confirm('Stop billing the sponsor for ' + ((l && l.full_name) || 'this learner') + '? New lessons get the normal fee again. Lessons already invoiced stay on their invoice.')) setSponsor(a.dataset.id, null); };
  ADV.actions['inv-make'] = async (a) => {
    const s = (state.sponsors || []).find((x) => x.id === a.dataset.id); const todo = uninvoiced(s.id, a.dataset.from, a.dataset.to); const h = todo.reduce((n, b) => n + mins(b), 0) / 60;
    if (!confirm('Make an invoice to ' + s.name + ' for ' + todo.length + ' delivered lesson' + (todo.length === 1 ? '' : 's') + ' (' + hrs(h) + ', ' + fmt.rand(h * Number(s.rate)) + '), ' + shortDate(a.dataset.from) + ' – ' + shortDate(a.dataset.to) + '?')) return;
    a.disabled = true;
    try { const inv = await sb.rpc('make_sponsor_invoice', { p_sponsor: s.id, p_from: a.dataset.from, p_to: a.dataset.to }); await Promise.all([loadFin(), ADV.loadBookings()]); state.invNew = inv && inv.id; ADV.render(); const el = $('#inv-' + state.invNew); if (el) el.scrollIntoView({ block: 'center' }); toast('Invoice ' + ((inv && inv.number) || '') + ' made – open it to print or save as PDF', 6000); }
    catch (err) { a.disabled = false; toast(ADV.errMsg(err), 6000); }
  };

  /* ---------------------------------------------------------------- invoices */
  const ST = { draft: ['warn', 'Draft – not sent'], sent: ['accent', 'Sent'], paid: ['good', 'Paid'] };
  function invoicesCard() {
    const list = state.invoices || [];
    const row = (x) => '<div class="inv-row' + (state.invNew === x.id ? ' new' : '') + '" id="inv-' + x.id + '"><div style="min-width:0"><div class="row" style="gap:6px"><b class="mono">' + esc(x.number) + '</b>' + pill(ST[x.status][0], ST[x.status][1]) + '<b>' + fmt.rand(x.total) + '</b></div><p class="small muted">' + esc(((x.bill_to || {}).name) || 'Sponsor') + ' · dated ' + esc(shortDate(x.issue_date)) + (x.period_to ? ' · lessons ' + (x.period_from ? esc(shortDate(x.period_from)) + ' – ' : 'up to ') + esc(shortDate(x.period_to)) : '') + ' · ' + (x.lines || []).length + ' line' + ((x.lines || []).length === 1 ? '' : 's') + '</p></div>' +
      '<div class="row" style="gap:6px"><button class="btn sm primary" data-action="inv-open" data-id="' + x.id + '">' + ICON.ext + 'Open / print</button>' + (((x.bill_to || {}).email) ? '<a class="btn sm" href="' + esc(mailto(x)) + '">E-mail</a>' : '') +
      (x.status === 'draft' ? '<button class="btn sm" data-action="inv-st" data-id="' + x.id + '" data-v="sent">Mark sent</button>' : '') + (x.status !== 'paid' ? '<button class="btn sm" data-action="inv-st" data-id="' + x.id + '" data-v="paid">Mark paid</button>' : '<button class="btn sm ghost" data-action="inv-st" data-id="' + x.id + '" data-v="sent">Not paid</button>') +
      (x.status === 'draft' ? '<button class="btn sm ghost" data-action="inv-del" data-id="' + x.id + '">Delete</button>' : '') + '</div></div>';
    return '<div class="card"><h3>Invoices</h3>' + (list.length ? list.map(row).join('') : '<p class="small muted">No invoices yet. Make one from a sponsor above.</p>') + '</div>';
  }
  function mailto(x) {
    const b = x.bill_to || {}; const inv = state.priv.invoice || {}; const att = String(b.lines || '').match(/Attention:\s*([^,\n]+)/i);
    const body = 'Dear ' + (att ? att[1].trim().split(' ')[0] : (b.name || 'Sir/Madam')) + ',\n\nPlease find attached Adventuity invoice ' + x.number + ' for ' + fmt.rand(x.total) + (x.period_to ? ', for the lessons delivered ' + (x.period_from ? 'from ' + longDate(x.period_from) + ' ' : '') + 'to ' + longDate(x.period_to) : '') + '.\n\nKind regards\n' + String(inv.issuer || state.profile.full_name || 'Adventuity').split(',')[0];
    return 'mailto:' + encodeURIComponent(b.email || '') + '?subject=' + encodeURIComponent('Adventuity invoice ' + x.number) + '&body=' + encodeURIComponent(body);
  }
  ADV.actions['inv-st'] = async (a) => {
    const v = a.dataset.v; const patch = { status: v }; if (v === 'sent') { patch.sent_at = new Date().toISOString(); patch.paid_at = null; } if (v === 'paid') patch.paid_at = new Date().toISOString();
    try { await sb.update('invoices', { id: 'eq.' + a.dataset.id }, patch); await loadFin(); ADV.render(); toast(v === 'paid' ? 'Marked paid' : 'Marked sent'); } catch (err) { toast(ADV.errMsg(err)); }
  };
  ADV.actions['inv-del'] = async (a) => {
    const x = (state.invoices || []).find((y) => y.id === a.dataset.id); if (!confirm('Delete draft invoice ' + x.number + '? Its lessons become "not invoiced" again, so you can make a new one.')) return;
    try { await sb.remove('invoices', { id: 'eq.' + x.id }); await Promise.all([loadFin(), ADV.loadBookings()]); ADV.render(); toast('Draft deleted'); } catch (err) { toast(ADV.errMsg(err)); }
  };
  ADV.actions['inv-open'] = (a) => {
    const x = (state.invoices || []).find((y) => y.id === a.dataset.id); if (!x) return;
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups for this site to open the invoice', 5000);
    w.document.open(); w.document.write(invoiceHtml(x)); w.document.close();
    const pb = w.document.getElementById('inv-print'); if (pb) pb.addEventListener('click', () => w.print());   // the page's own scripts are blocked by the site's security policy
  };

  /* the printable invoice, on the layout of the Adventuity invoices so far (A4, navy) */
  function invoiceHtml(x) {
    const s = Object.assign({ company: 'Adventuity (Pty) Ltd', tagline: 'Transforming ideas into reality.', bank: '', footer: '', issuer: '' }, state.priv.invoice || {});
    const b = x.bill_to || {}; const logo = new URL('assets/invoice-logo.png', location.href).href;
    const lines = (x.lines || []).map((l, i) => '<tr class="item"><td class="c">' + (i + 1) + '</td><td>' + esc(l.desc) + '</td><td class="c">' + esc(String(l.qty).replace('.', ',')) + '</td><td class="m"><span>R</span>' + money(l.rate) + '</td><td class="m"><span>R</span>' + money(l.amount) + '</td></tr>').join('');
    const notes = [x.notes, s.issuer ? 'Issued by ' + s.issuer + '.' : ''].filter(Boolean).map((n) => '<tr class="note"><td></td><td>' + esc(n) + '</td><td></td><td></td><td></td></tr>').join('');
    const blank = '<tr class="note"><td></td><td></td><td></td><td></td><td></td></tr>';
    const to = [b.name ? '<b>' + esc(b.name) + '</b>' : '', esc(b.email || '')].concat(String(b.lines || '').split('\n').map(esc)).filter(Boolean).join('<br>');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adventuity invoice ' + esc(x.number) + ' – ' + esc(b.name || '') + '</title><style>' +
      '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e9edf1;font-family:Helvetica,Arial,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#1c3246}.bar button{font:600 14px Helvetica,Arial,sans-serif;padding:9px 16px;border-radius:8px;border:0;background:#fff;color:#1c3246;cursor:pointer}.bar span{color:#fff;font-size:13px;align-self:center}' +
      '.page{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:22mm 18mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}.frame{position:relative;border:.6pt solid #1c3246;min-height:253mm;display:flex;flex-direction:column}' +
      '.sweep{position:absolute;top:0;right:0;width:66%;height:30mm}.logo{position:relative;padding:5mm 0 0 5mm;width:42%}.logo img{width:36mm;display:block}.tag{color:#1c3246;font:700 8.5pt Helvetica,Arial,sans-serif;margin:2mm 0 0 1mm}.rule{border-top:1.2pt solid #1c3246;margin:1.5mm 0 0 -4mm}' +
      'h1{font:700 20pt Helvetica,Arial,sans-serif;margin:7mm 0 0 10mm;letter-spacing:.5pt}.addr{display:flex;justify-content:space-between;align-items:flex-end;margin:6mm 4mm 0 10mm;font-size:8.5pt;line-height:1.6}.addr .to b{font-size:9pt}.addr .meta{text-align:right}' +
      'table{width:100%;border-collapse:collapse;margin-top:5mm;font-size:8.5pt}th{background:#1c3246;color:#fff;font-weight:700;height:7mm;text-align:center}td{border-left:.4pt dashed #9aa6b2;border-bottom:.4pt dashed #9aa6b2;padding:0 1.5mm;vertical-align:middle}td:first-child{border-left:0}' +
      'tr.item td{height:11mm}tr.note td{height:6.2mm;font-size:8pt}td.c{text-align:center}td.m{text-align:right;white-space:nowrap}td.m span{float:left}col.n{width:9mm}col.q{width:14mm}col.u{width:27mm}col.a{width:34mm}' +
      '.tot{display:flex;border-top:.8pt solid #1c3246}.bank{flex:1;padding:5mm 0 0 10mm;font-size:8.5pt;line-height:1.75;white-space:pre-line}.bank b{display:block}.sums{width:61mm;font-size:8.5pt}.sums>div{display:flex}.sums>div>span:first-child{width:27mm;padding-left:1.5mm}.sums>div>span:last-child{flex:1;display:flex;justify-content:space-between;padding:0 1.5mm}.sums .sub{font-weight:700;margin-top:3.5mm}' +
      '.sums .total{background:#1c3246;color:#fff;font:700 11pt Helvetica,Arial,sans-serif;height:7mm;align-items:center;margin-top:4mm}.thanks{text-align:center;font:700 9.5pt Helvetica,Arial,sans-serif;margin:10mm 0 8mm}' +
      '.foot{margin-top:auto;background:#1c3246;color:#fff;text-align:center;font-size:7.5pt;line-height:1.5;padding:1.5mm}@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none}}</style></head><body>' +
      '<div class="bar"><button id="inv-print" type="button">Print / save as PDF</button><span>Choose “Save as PDF” as the printer to attach it to an e-mail.</span></div>' +
      '<div class="page"><div class="frame"><svg class="sweep" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H100V30C75 29.5 31 21 0 0Z" fill="#1c3246"/></svg>' +
      '<div class="logo"><img src="' + esc(logo) + '" alt="Adventuity"><div class="tag">' + esc(s.tagline) + '</div><div class="rule"></div></div>' +
      '<h1>INVOICE</h1><div class="addr"><div class="to"><b>To</b><br>' + to + '</div><div class="meta">Date: ' + esc(longDate(x.issue_date)) + '<br><b>Invoice no.: ' + esc(x.number) + '</b></div></div>' +
      '<table><colgroup><col class="n"><col><col class="q"><col class="u"><col class="a"></colgroup><thead><tr><th>NO</th><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody>' + lines + blank + notes + blank + blank + '</tbody></table>' +
      '<div class="tot"><div class="bank">' + (s.bank ? '<b>Banking Details:</b>' + esc(s.bank) : '') + '</div><div class="sums"><div class="sub"><span>SUBTOTAL</span><span><span>R</span>' + money(x.total) + '</span></div><div class="total"><span>TOTAL</span><span><span>R</span>' + money(x.total) + '</span></div></div></div>' +
      '<div class="thanks">Thank you for your Business!</div><div class="foot">' + esc(s.footer) + '<br>' + esc(s.company) + '</div></div></div></body></html>';
  }
  ADV.invoiceHtml = invoiceHtml;

  /* ---------------------------------------------------------------- what every invoice prints (banking details stay private) */
  function invoiceSettings() {
    const s = state.priv.invoice || {}; const pay = (state.priv.payment || {}).text || '';
    const ta = (id, label, v, rows, ph) => '<div class="field"><label for="' + id + '">' + label + '</label><textarea id="' + id + '" rows="' + rows + '" placeholder="' + esc(ph || '') + '">' + esc(v || '') + '</textarea></div>';
    const inp = (id, label, v, ph) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"></div>';
    return '<details class="card"' + (s.bank ? '' : ' open') + '><summary><b>Invoice details</b> <span class="small muted">– banking details, contact line and signature printed on every invoice (only you can see them)</span></summary><form id="f-invset" class="stack" style="margin-top:10px">' +
      ta('is-bank', 'Banking details (one per line)', s.bank || pay, 4, 'Bank Name: …\nAccount Holder: Adventuity (Pty) Ltd\nAccount Number: …\nBranch Code: …') + inp('is-footer', 'Contact line at the bottom', s.footer, 'Phone … · Mail … · Address …') +
      '<div class="grid cols-2">' + inp('is-issuer', 'Issued by', s.issuer || ((state.profile.full_name || '') + ', Director, Adventuity (Pty) Ltd'), 'Name, Director, Adventuity (Pty) Ltd') + inp('is-company', 'Company name', s.company || 'Adventuity (Pty) Ltd') + '</div>' +
      '<div class="row"><button class="btn primary" type="submit">Save</button></div></form></details>';
  }
  async function saveInvSet(e) {
    e.preventDefault(); const v = { bank: $('#is-bank').value.trim(), footer: $('#is-footer').value.trim(), issuer: $('#is-issuer').value.trim(), company: $('#is-company').value.trim() || 'Adventuity (Pty) Ltd', tagline: (state.priv.invoice || {}).tagline || 'Transforming ideas into reality.' };
    try { await sb.upsert('private_settings', [{ key: 'invoice', value: v, updated_at: new Date().toISOString() }], 'key'); state.priv.invoice = v; toast('Saved'); ADV.render(); } catch (err) { toast(ADV.errMsg(err)); }
  }

  const prevChange = ADV.onChange;
  ADV.onChange = function (e) {
    if (prevChange) prevChange(e); const t = e.target;
    if (t.id === 'an-from' || t.id === 'an-to') { const p = state.anP || (state.anP = { k: 'custom' }); p.from = ($('#an-from') || {}).value; p.to = ($('#an-to') || {}).value; ADV.render(); }
    if (t.dataset && t.dataset.action === 'sp-link' && t.value) setSponsor(t.value, t.dataset.id);
  };
  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    if (e.target.id === 'f-sponsor') return saveSponsor(e);
    if (e.target.id === 'f-invset') return saveInvSet(e);
  };
})();
