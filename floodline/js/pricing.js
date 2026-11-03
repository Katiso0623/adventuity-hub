/* Adventuity Floodline: pricing and quotations (administrators only).
   Requests: every quote request with its automatic quotation; send the matrix price by hand.
   Payments: invoices, EFT notices from clients, "Mark as paid".
   Price matrix: the cost matrix the automatic quotations use.  Try it: price a sample request.
   All data comes from the floodline-autoquote and floodline-pay functions, which check the administrator role. */
(function () {
  'use strict';
  const CFG = window.FL_CONFIG || {}, SB = CFG.supabase || {};
  const AQ = (SB.url || '') + '/functions/v1/floodline-autoquote', PAY = (CFG.payments || {}).endpoint || (SB.url || '') + '/functions/v1/floodline-pay';
  const root = document.getElementById('adm');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = v => 'R ' + Number(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const R0 = v => 'R ' + Math.round(Number(v || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const when = d => d ? new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const clone = o => JSON.parse(JSON.stringify(o));
  const PURPOSES = ['Property purchase or insurance', 'Bank, lender or investor requirement', 'Building plan or site development plan', 'Environmental or water use application', 'Environmental or water permit', 'Development or subdivision approval', 'Township establishment (NWA s144)', 'Mining or industrial (GN 704)', 'Mining or industrial site', 'Stormwater, culvert or bridge design', 'Other'];
  const KIND = { letter: 'Pre-purchase flood risk letter', desktop: 'Desktop flood line study', certified: 'Certified flood line report', large: 'Township, mining or large site', crossing: 'Bridge or culvert check', building: 'Certified if there is (or we arrange) a survey, otherwise desktop', manual: 'Always quoted by hand (no automatic quotation)' };
  const SURVEY = [['', 'Not sure'], ['Yes, I have a survey or LiDAR', 'Yes, I have a survey or LiDAR'], ['No, please arrange a survey', 'No, please arrange a survey']];
  let sb = null, session = null, M = null, DEF = null, saved = '', data = { quotes: [], invoices: [] }, tab = 'requests', preview = {}, trial = null;

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  async function api(url, body) {
    const { data: { session: s } } = await sb.auth.getSession(); session = s;
    if (!s) { login('Your session has ended. Please sign in again.'); throw new Error('Signed out'); }
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.key, Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'The service did not respond (HTTP ' + r.status + ').'); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  function say(id, text, kind) { const el = document.getElementById(id); if (!el) return; el.textContent = text || ''; el.className = 'msg' + (text ? ' show' : '') + (kind ? ' ' + kind : ''); }

  // ---------- sign in
  function login(msg) {
    root.innerHTML = `<span class="label">Administrator</span><h1>Pricing and quotations</h1><div class="card gate"><h2>Sign in</h2><p class="muted">Use your Adventuity portal administrator account (the same as the Studio).</p>
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
    root.innerHTML = '<span class="label">Administrator</span><h1>Pricing and quotations</h1><p class="muted">Loading…</p>';
    try {
      const [g, l] = await Promise.all([api(AQ, { action: 'get' }), api(AQ, { action: 'list' })]);
      M = g.matrix; DEF = g.defaults; saved = JSON.stringify(M); data = l;
      tab = ['requests', 'payments', 'matrix', 'try'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'requests';
      render();
    } catch (e) {
      if (e.status === 401) { await sb.auth.signOut(); login('This account is not an Adventuity administrator.'); return; }
      if (e.message !== 'Signed out') root.innerHTML = `<h1>Pricing and quotations</h1><p class="msg show err">${esc(e.message)}</p><p><button class="b" id="retry" type="button">Try again</button></p>`, document.getElementById('retry').onclick = start;
    }
  }
  async function reload() { try { data = await api(AQ, { action: 'list' }); render(); } catch (e) { say('top-msg', e.message, 'err'); } }

  // ---------- layout
  function render() {
    const eft = data.invoices.filter(i => i.status === 'unpaid' && i.eft_at).length;
    const need = data.quotes.filter(q => q.auto_status === 'manual' || q.auto_status === 'error').length;
    const a = M.auto || {};
    root.innerHTML = `<span class="label">Administrator</span><h1>Pricing and quotations</h1>
      <p class="muted">Automatic quotations are <b>${a.enabled ? 'on' : 'off'}</b>${a.enabled ? `: sent ${esc(a.delay_minutes)} minutes after each request, up to ${R0(a.max_total)}` : ''}. Signed in as ${esc(session && session.user && session.user.email)} · <a href="#" id="out">Sign out</a></p>
      <p class="msg" id="top-msg"></p>
      <div class="tabs" role="tablist">${[['requests', 'Requests', need], ['payments', 'Payments', eft], ['matrix', 'Price matrix', 0], ['try', 'Try a request', 0]].map(([k, t, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
      <div id="pane"></div>`;
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { if (tab === 'matrix' && dirty() && !confirm('You have unsaved changes to the price matrix. Leave them unsaved for now?')) return; tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); render(); }));
    document.getElementById('out').addEventListener('click', async e => { e.preventDefault(); await sb.auth.signOut(); login(); });
    ({ requests: paneRequests, payments: panePayments, matrix: paneMatrix, try: paneTry })[tab]();
  }
  const dirty = () => M && JSON.stringify(M) !== saved;

  // ---------- requests
  function statusOf(q) {
    const since = M.auto && M.auto.since ? new Date(M.auto.since).getTime() : Infinity;
    const aq = q.auto_quote || {};
    switch (q.auto_status) {
      case 'sent': return { tag: 'sent', label: 'Quotation sent', text: `${R(aq.total)} · ${aq.service ? esc(aq.service.name) : ''} · invoice ${esc(aq.invoice_ref || '')}${aq.emailed === false ? ` · <b>e-mail not delivered yet: retrying automatically${aq.mail_attempts ? ' (attempt ' + esc(aq.mail_attempts) + ')' : ''}</b>` : ''} · ${when(q.quoted_at)}` };
      case 'manual': return { tag: 'manual', label: 'Needs your quotation', text: esc((aq.reasons || []).join(' ')) + (aq.total ? ` Matrix price: ${R(aq.total)}.` : '') };
      case 'error': return { tag: 'error', label: 'Not sent (error)', text: esc((aq.reasons || []).join(' ')) };
      case 'skipped': return { tag: '', label: 'Skipped', text: esc((aq.reasons || []).join(' ')) };
      case 'dismissed': return { tag: '', label: 'Handled by hand', text: '' };
      case 'before': return { tag: '', label: 'Before automatic quotes', text: '' };
      case 'working': return { tag: 'waiting', label: 'Being priced', text: '' };
      default: {
        const t = new Date(q.created_at).getTime();
        if (M.auto && M.auto.enabled && t >= since) { const due = Math.max(0, Math.ceil((t + M.auto.delay_minutes * 60e3 - Date.now()) / 60e3)); return { tag: 'waiting', label: 'Waiting', text: due ? `Quotation goes out in about ${due} min.` : 'Going out now.' }; }
        return { tag: '', label: 'Not automatic', text: 'Received while automatic quotations were off.' };
      }
    }
  }
  function paneRequests() {
    const p = document.getElementById('pane');
    if (!data.quotes.length) { p.innerHTML = '<p class="muted card">No quote requests yet.</p>'; return; }
    p.innerHTML = `<p class="muted">The latest 40 requests. Requests that need you are also e-mailed to you and sent to your phone.</p><p class="msg" id="rq-msg"></p>
      <div class="scroll"><table><thead><tr><th>Request</th><th>Client</th><th class="hide">Details</th><th>Quotation</th><th></th></tr></thead><tbody>${data.quotes.map(q => {
        const s = statusOf(q), canSend = !['sent', 'working'].includes(q.auto_status) && !(q.auto_status === 'skipped' && /test or invalid/i.test(JSON.stringify(q.auto_quote || '')));
        return `<tr><td><b>${esc(q.ref)}</b><div class="adm-sub">${when(q.created_at)}</div></td>
          <td>${esc(q.full_name)}${q.company ? `<div class="adm-sub">${esc(q.company)}</div>` : ''}<div class="adm-sub">${esc(q.email)} · ${esc(q.phone)}</div></td>
          <td class="hide">${esc(q.purpose)}<div class="adm-sub">${q.size_ha != null ? esc(q.size_ha) + ' ha · ' : ''}${esc(q.survey || 'survey: not sure')}${q.deadline ? ' · needed by ' + esc(q.deadline) : ''}</div><div class="adm-sub">${esc(q.site_description || q.address || '')}</div></td>
          <td><span class="tag ${s.tag}">${s.label}</span><div class="adm-sub">${s.text}</div></td>
          <td class="act"><button class="b sm" type="button" data-prev="${q.id}">Preview</button>${canSend ? ` <button class="b sm red" type="button" data-send="${q.id}">Send matrix price</button>` : ''}${q.auto_status === 'manual' ? ` <button class="b sm" type="button" data-dis="${q.id}" title="You quoted this one yourself">Done by hand</button>` : ''}</td></tr>
          ${preview[q.id] ? `<tr><td colspan="5">${preview[q.id]}</td></tr>` : ''}`;
      }).join('')}</tbody></table></div>`;
    p.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.prev; if (preview[id]) { delete preview[id]; paneRequests(); return; }
      b.disabled = true;
      try { const j = await api(AQ, { action: 'preview', quote_id: id }); preview[id] = resultHtml(j.result, j.text); paneRequests(); }
      catch (e) { b.disabled = false; say('rq-msg', e.message, 'err'); }
    }));
    p.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.send, q = data.quotes.find(x => x.id === id);
      if (!confirm(`E-mail ${q.full_name} (${q.email}) the matrix quotation for ${q.ref}?`)) return;
      b.disabled = true; b.textContent = 'Sending…';
      try { await api(AQ, { action: 'send', quote_id: id }); }
      catch (e) {
        if (e.body && e.body.needs_force && confirm('The matrix flagged this request:\n\n' + e.message + '\n\nSend the matrix price anyway?')) { try { await api(AQ, { action: 'send', quote_id: id, force: true }); } catch (e2) { say('rq-msg', e2.message, 'err'); b.disabled = false; b.textContent = 'Send matrix price'; return; } }
        else { say('rq-msg', e.body && e.body.needs_force ? 'Not sent.' : e.message, e.body && e.body.needs_force ? '' : 'err'); b.disabled = false; b.textContent = 'Send matrix price'; return; }
      }
      delete preview[id]; await reload(); say('rq-msg', 'Quotation sent to ' + q.email + '.', 'good');
    }));
    p.querySelectorAll('[data-dis]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { await api(AQ, { action: 'dismiss', quote_id: b.dataset.dis }); await reload(); } catch (e) { say('rq-msg', e.message, 'err'); b.disabled = false; } }));
  }
  function resultHtml(r, text) {
    if (!r) return '';
    const head = r.mode === 'auto' ? '<span class="tag sent">Would be sent automatically</span>' : '<span class="tag manual">Would go to you for review</span>';
    const why = r.reasons && r.reasons.length ? `<p class="adm-sub"><b>Why:</b> ${esc(r.reasons.join(' '))}</p>` : '';
    if (!r.service) return `<div class="card">${head}${why}</div>`;
    return `<div class="card">${head}${why}<div class="scroll"><table><tbody>${r.lines.map(l => `<tr><td>${esc(l.label)}${l.note ? `<div class="adm-sub">${esc(l.note)}</div>` : ''}</td><td class="r">${R(l.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="r total">${R(r.total)}</th></tr><tr><td>${r.deposit_pct >= 100 ? 'Payable in full' : 'Deposit (' + r.deposit_pct + '%)'}</td><td class="r">${R(r.deposit)}</td></tr>${(r.optional || []).map(o => `<tr><td class="adm-sub">Optional: ${esc(o.label)}</td><td class="r adm-sub">${R(o.amount)}</td></tr>`).join('')}</tfoot></table></div>
      <p class="adm-sub">Turnaround: ${esc(r.turnaround)}. Valid until ${esc(r.valid_until)}.</p>${text ? `<details><summary class="muted">E-mail the client receives</summary><pre>${esc(text)}</pre></details>` : ''}</div>`;
  }

  // ---------- payments
  function panePayments() {
    const p = document.getElementById('pane');
    if (!data.invoices.length) { p.innerHTML = '<p class="muted card">No invoices yet.</p>'; return; }
    p.innerHTML = `<p class="muted">When a client says they paid by EFT, check the Capitec Business account for the amount and the invoice number as reference, then mark it paid: the client gets a receipt by e-mail and the request is marked won.</p><p class="msg" id="pm-msg"></p>
      <div class="scroll"><table><thead><tr><th>Invoice</th><th>Client</th><th class="hide">For</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>${data.invoices.map(i => {
        const st = i.status === 'paid' ? `<span class="tag paid">Paid${i.method ? ' · ' + (i.method === 'eft' ? 'EFT' : 'card') : ''}</span><div class="adm-sub">${when(i.paid_at)}</div>`
          : i.status === 'cancelled' ? '<span class="tag">Cancelled</span>'
          : i.eft_at ? `<span class="tag eft">Client says paid by EFT</span><div class="adm-sub">${when(i.eft_at)}${i.eft_note ? ' · ' + esc(i.eft_note) : ''}</div>` : '<span class="tag unpaid">Unpaid</span>';
        return `<tr><td><b>${esc(i.ref)}</b><div class="adm-sub">${when(i.created_at)}</div></td><td>${esc(i.client_name || '-')}<div class="adm-sub">${esc(i.client_email || '')}</div></td><td class="hide">${esc(i.description)}</td><td class="r">${R(i.amount_cents / 100)}</td><td>${st}</td>
          <td class="act"><a class="b sm" href="${esc(i.link)}" target="_blank" rel="noopener">Open</a>${i.status === 'unpaid' ? ` <button class="b sm ok" type="button" data-paid="${i.id}">Mark paid (EFT)</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    p.querySelectorAll('[data-paid]').forEach(b => b.addEventListener('click', async () => {
      const i = data.invoices.find(x => x.id === b.dataset.paid);
      if (!confirm(`Has ${R(i.amount_cents / 100)} for ${i.ref} reflected in the bank account? The client receives a payment confirmation by e-mail.`)) return;
      b.disabled = true; b.textContent = 'Saving…';
      try { await api(PAY, { action: 'paid', id: i.id, method: 'eft' }); await reload(); say('pm-msg', i.ref + ' marked as paid.', 'good'); }
      catch (e) { b.disabled = false; b.textContent = 'Mark paid (EFT)'; say('pm-msg', e.message, 'err'); }
    }));
  }

  // ---------- price matrix
  const num = (path, v, cls, step) => `<input type="number" inputmode="decimal" ${cls ? `class="${cls}"` : ''} step="${step || 'any'}" data-p="${path}" value="${esc(v)}">`;
  const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setP(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
  function bandsHtml(path, list, unitKey, unit) {
    return `<div class="bands">${list.map((b, i) => `<span class="band">up to ${b[unitKey] === null ? '<b>any size</b>' : num(`${path}.${i}.${unitKey}`, b[unitKey])} ${unit} × ${num(`${path}.${i}.factor`, b.factor, '', '0.01')}${list.length > 1 ? `<button class="x" type="button" title="Remove" data-delband="${path}" data-i="${i}">×</button>` : ''}</span>`).join('')}
      <button class="b sm" type="button" data-addband="${path}" data-unit="${unitKey}">+ band</button></div>`;
  }
  function paneMatrix() {
    const p = document.getElementById('pane'), a = M.auto, t = M.travel, u = M.urgency, sv = M.survey;
    const svc = Object.entries(M.services).map(([k, s]) => `<div class="svc"><h3>${esc(KIND[k] || k)}</h3><div class="grid">
        <label class="f">Name on the quotation<input class="w-l" type="text" maxlength="80" data-p="services.${k}.name" value="${esc(s.name)}"></label>
        <label class="f">Base price (R)${num(`services.${k}.base`, s.base, '', '50')}</label>
        <label class="f">Turnaround (working days)${num(`services.${k}.days`, s.days, '', '1')}</label>
        <label class="f">Deposit to start (%)${num(`services.${k}.deposit_pct`, s.deposit_pct, '', '5')}</label>
        <label class="f">Each extra return period (R)${num(`services.${k}.extra_rp`, s.extra_rp, '', '50')}</label>
        <label class="f">If the client gives no site size<select data-p="services.${k}.unknown_size"><option value="assume"${s.unknown_size !== 'manual' ? ' selected' : ''}>Price the smallest band</option><option value="manual"${s.unknown_size === 'manual' ? ' selected' : ''}>Send to me for review</option></select></label>
        <label class="chk"><input type="checkbox" data-p="services.${k}.site_visit"${s.site_visit ? ' checked' : ''}> Includes a site inspection (travel charged beyond ${esc(t.free_km)} km)</label>
        <label class="chk"><input type="checkbox" data-p="services.${k}.survey_needed"${s.survey_needed ? ' checked' : ''}> Needs a topographical survey</label></div>
        <p class="muted" style="margin-top:10px">Site size: price × factor. Larger than the last band goes to you for review.</p>${bandsHtml(`services.${k}.bands`, s.bands, 'max_ha', 'ha')}</div>`).join('');
    p.innerHTML = `<p class="muted">Changes apply to every automatic quotation from the moment you save. Use <b>Try a request</b> to check a price before saving.</p>
      <div class="card"><h2 style="margin-top:0">Automatic quotations</h2><div class="grid">
        <label class="chk"><input type="checkbox" data-p="auto.enabled"${a.enabled ? ' checked' : ''}> Send quotations automatically</label>
        <label class="f">Minutes after the request${num('auto.delay_minutes', a.delay_minutes, '', '1')}</label>
        <label class="f">Largest automatic quotation (R)${num('auto.max_total', a.max_total, '', '1000')}</label>
        <label class="f">At most per hour (spam guard)${num('auto.max_per_hour', a.max_per_hour, '', '1')}</label>
        <label class="chk"><input type="checkbox" data-p="auto.send_international"${a.send_international ? ' checked' : ''}> Also for sites outside South Africa</label>
        <label class="f">Phone number on quotations<input type="text" maxlength="30" data-p="contact.phone" value="${esc((M.contact || {}).phone || '')}"></label>
        <label class="f">Quotation valid for (days)${num('valid_days', M.valid_days, '', '1')}</label>
        <label class="f">Round each line up to (R)${num('rounding', M.rounding, '', '10')}</label></div></div>
      <div class="card"><h2 style="margin-top:0">What each request is priced as</h2><p class="muted">The client's answer to "What is the flood line for?"</p>
        <div class="scroll"><table><tbody>${PURPOSES.map(pu => `<tr><td>${esc(pu)}</td><td><select data-purpose="${esc(pu)}">${Object.keys(KIND).filter(k => k === 'building' || k === 'manual' || M.services[k]).map(k => `<option value="${k}"${M.purposes[pu] === k ? ' selected' : ''}>${esc(KIND[k])}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h2 style="margin-top:0">Services</h2><p class="muted">1:50 and 1:100 year flood lines are included; 1:20, 1:200 and the RMF are extras.</p>${svc}</div>
      <div class="card"><h2 style="margin-top:0">Catchment size</h2><p class="muted">From the client's free flood check, when they ran it (not for letters). Factor on the service price.</p>${bandsHtml('catchment.bands', M.catchment.bands, 'max_km2', 'km²')}</div>
      <div class="card"><h2 style="margin-top:0">Urgent work</h2><div class="grid">
        <label class="f">Express: at least this share of the normal time${num('urgency.express_share', u.express_share, '', '0.05')}</label><label class="f">Express surcharge (%)${num('urgency.express_pct', u.express_pct, '', '5')}</label>
        <label class="f">Urgent: at least this share${num('urgency.urgent_share', u.urgent_share, '', '0.05')}</label><label class="f">Urgent surcharge (%)${num('urgency.urgent_pct', u.urgent_pct, '', '5')}</label></div>
        <p class="muted">Example: a 10-day job needed in 7 working days is express (0.7); in 4 days urgent (0.4); in 3 days or less it comes to you.</p></div>
      <div class="card"><h2 style="margin-top:0">Site inspection travel</h2><div class="grid">
        <label class="f">Travel from<input type="text" maxlength="40" data-p="travel.from" value="${esc(t.from)}"></label><label class="f">Included (km each way)${num('travel.free_km', t.free_km, '', '10')}</label>
        <label class="f">Rate beyond that (R per km, both ways)${num('travel.rate_per_km', t.rate_per_km, '', '0.5')}</label><label class="f">Road distance ÷ straight line${num('travel.road_factor', t.road_factor, '', '0.01')}</label>
        <label class="f">Overnight when further than (km)${num('travel.overnight_km', t.overnight_km, '', '10')}</label><label class="f">Overnight allowance (R)${num('travel.overnight', t.overnight, '', '50')}</label></div></div>
      <div class="card"><h2 style="margin-top:0">Topographical survey (provisional sum)</h2><p class="muted">Added when the client asks us to arrange the survey; offered as an option when they are not sure.</p><div class="grid">
        <label class="f">Base price (R)${num('survey.base', sv.base, '', '50')}</label><label class="f">Base covers up to (ha)${num('survey.base_ha', sv.base_ha, '', '0.5')}</label><label class="f">Extra working days${num('survey.days', sv.days, '', '1')}</label>
        ${sv.tiers.map((x, i) => `<label class="f">${x.to_ha === null ? 'Beyond that' : 'Up to ' + esc(x.to_ha) + ' ha'}: R per extra ha${num(`survey.tiers.${i}.per_ha`, x.per_ha, '', '10')}</label>`).join('')}</div></div>
      <div class="card"><h2 style="margin-top:0">Sites outside South Africa</h2><div class="grid"><label class="f">Coordination surcharge (%)${num('international.uplift_pct', M.international.uplift_pct, '', '1')}</label></div><p class="muted">No site inspection or survey from us; sign-off by a locally registered engineer is excluded.</p></div>
      <div class="sticky bar"><button class="b red" type="button" id="m-save">Save the matrix</button><button class="b" type="button" id="m-undo">Undo changes</button><button class="b" type="button" id="m-def">Load the starting prices</button><span class="muted" id="m-dirty"></span></div><p class="msg" id="m-msg"></p>`;
    const mark = () => { document.getElementById('m-dirty').textContent = dirty() ? 'Unsaved changes' : 'Saved'; };
    if (!p.dataset.bound) p.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.purpose) { M.purposes[el.dataset.purpose] = el.value; mark(); return; }
      const path = el.dataset.p; if (!path) return;
      let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
      if (el.type === 'number' && v !== null && /(days|delay_minutes|max_per_hour|valid_days)$/.test(path)) v = Math.round(v);
      setP(M, path, v); mark();
    });
    p.dataset.bound = '1';
    p.querySelectorAll('[data-addband]').forEach(b => b.addEventListener('click', () => {
      const list = getP(M, b.dataset.addband), key = b.dataset.unit, last = list[list.length - 1];
      if (last[key] === null) { list.splice(list.length - 1, 0, { [key]: (list.length > 1 ? list[list.length - 2][key] * 2 : 10), factor: last.factor }); }
      else list.push({ [key]: Math.round(last[key] * 2), factor: Math.round((last.factor + 0.3) * 100) / 100 });
      paneMatrix();
    }));
    p.querySelectorAll('[data-delband]').forEach(b => b.addEventListener('click', () => { const list = getP(M, b.dataset.delband); const i = +b.dataset.i; if (list[i][Object.keys(list[i]).find(k => k !== 'factor')] === null) return; list.splice(i, 1); paneMatrix(); }));
    document.getElementById('m-save').addEventListener('click', async () => {
      const btn = document.getElementById('m-save'); btn.disabled = true; say('m-msg', '');
      try { const j = await api(AQ, { action: 'save', matrix: M }); M = j.matrix; saved = JSON.stringify(M); say('m-msg', 'Saved. New quotations use these prices.', 'good'); mark(); }
      catch (e) { say('m-msg', e.message, 'err'); } finally { btn.disabled = false; }
    });
    document.getElementById('m-undo').addEventListener('click', () => { M = JSON.parse(saved); paneMatrix(); });
    document.getElementById('m-def').addEventListener('click', () => { if (!confirm('Replace the prices on this page with the starting prices? Nothing changes until you save.')) return; const keepAuto = M.auto; M = clone(DEF); M.auto = keepAuto; paneMatrix(); });
    mark();
  }

  // ---------- try a request
  function paneTry() {
    const p = document.getElementById('pane'), f = trial || { purpose: 'Building plan or site development plan', survey: 'Yes, I have a survey or LiDAR', size_ha: 3, return_periods: ['1:50', '1:100'], deadline: '', lat: '', lon: '', catchment_km2: '', page: 'https://www.adventuity.co.za/' };
    p.innerHTML = `<p class="muted">Price a made-up request with the matrix ${dirty() ? '<b>as it is on the Price matrix tab (unsaved changes included)</b>' : 'as saved'}. Nothing is sent.</p>
      <form class="card" id="t-form"><div class="grid">
        <label class="f">What is the flood line for?<select name="purpose">${PURPOSES.map(x => `<option${x === f.purpose ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="f">Survey<select name="survey">${SURVEY.map(([v, t]) => `<option value="${esc(v)}"${v === f.survey ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="f">Site size (ha)<input type="number" name="size_ha" step="any" value="${esc(f.size_ha)}"></label>
        <label class="f">Needed by<input type="date" name="deadline" value="${esc(f.deadline)}"></label>
        <label class="f">Latitude (e.g. -26.20)<input type="number" name="lat" step="any" value="${esc(f.lat)}"></label>
        <label class="f">Longitude (e.g. 28.05)<input type="number" name="lon" step="any" value="${esc(f.lon)}"></label>
        <label class="f">Catchment (km², from the free check)<input type="number" name="catchment_km2" step="any" value="${esc(f.catchment_km2)}"></label>
        <label class="f">Website<select name="page"><option value="https://www.adventuity.co.za/"${/co\.za/.test(f.page) ? ' selected' : ''}>adventuity.co.za (South Africa)</option><option value="https://www.adventuity.com/"${/\.com/.test(f.page) ? ' selected' : ''}>adventuity.com (international)</option></select></label></div>
        <p class="muted" style="margin:10px 0 4px">Flood lines</p><div class="bar">${['1:20', '1:50', '1:100', '1:200', 'RMF'].map(r => `<label class="chk"><input type="checkbox" name="rp" value="${r}"${f.return_periods.includes(r) ? ' checked' : ''}> ${r}</label>`).join('')}</div>
        <div class="bar"><button class="b red" type="submit">Price it</button></div></form><p class="msg" id="t-msg"></p><div id="t-out"></div>`;
    document.getElementById('t-form').addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      trial = { purpose: fd.get('purpose'), survey: fd.get('survey'), size_ha: fd.get('size_ha'), deadline: fd.get('deadline'), lat: fd.get('lat'), lon: fd.get('lon'), catchment_km2: fd.get('catchment_km2'), page: fd.get('page'), return_periods: fd.getAll('rp') };
      say('t-msg', '');
      try { const j = await api(AQ, { action: 'preview', request: trial, matrix: M }); document.getElementById('t-out').innerHTML = (j.problems && j.problems.length ? `<p class="msg show err">The matrix has problems: ${esc(j.problems.join(' '))}</p>` : '') + resultHtml(j.result, j.text); }
      catch (ex) { say('t-msg', ex.message, 'err'); }
    });
  }

  async function boot() {
    if (!SB.url || !SB.key) { root.innerHTML = '<h1>Pricing and quotations</h1><p class="msg show err">Supabase is not configured in config.js.</p>'; return; }
    try {
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
      sb = window.supabase.createClient(SB.url, SB.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data: { session: s } } = await sb.auth.getSession(); session = s;
      if (s) start(); else login();
    } catch (e) { root.innerHTML = `<h1>Pricing and quotations</h1><p class="msg show err">${esc(e.message)}</p>`; }
  }
  window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
