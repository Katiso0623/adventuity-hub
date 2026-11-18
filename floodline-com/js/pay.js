
(function () {
  'use strict';
  const CFG = window.FL_CONFIG || {}, EP = (CFG.payments || {}).endpoint, KEY = (CFG.quotes || {}).key, SB = CFG.supabase || {}, CT = CFG.contact || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const q = new URLSearchParams(location.search), ref = q.get('i') || '', token = q.get('t') || '', ret = q.get('r') || '';
  const root = $('#pay-root');
  const fmtDate = d => new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  let bank = null, admin = null, quote = null;   // bank details and the quotation from the payment service; admin = { email, token } when an Adventuity administrator is signed in
  const R = v => 'R ' + Number(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  async function call(action, extra, auth) {
    const headers = { 'Content-Type': 'application/json', apikey: KEY };
    if (auth) headers.Authorization = 'Bearer ' + auth;
    const r = await fetch(EP, { method: 'POST', headers, body: JSON.stringify(Object.assign({ action, ref, token, back: location.href.split('?')[0] }, extra || {})) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.invoice) throw new Error(j.error || 'The payment service is not available right now. Please try again in a minute.');
    return j;
  }
  function card(inv, extra) {
    return `<span class="label">Secure payment</span><h1>${esc(inv.company || 'Adventuity (Pty) Ltd')}</h1>
      <dl class="pay-dl"><dt>Invoice</dt><dd>${esc(inv.ref)}</dd><dt>For</dt><dd>${esc(inv.description)}</dd><dt>Amount</dt><dd class="amt">${esc(inv.amount)}</dd></dl>${extra}`;
  }
  function paidView(inv) {
    root.innerHTML = card(inv, `<div class="pay-ok"><b>Paid — thank you${inv.client ? ', ' + esc(inv.client) : ''}.</b><span>We have received your payment${inv.paid_at ? ' on ' + esc(fmtDate(inv.paid_at)) : ''}. A confirmation is on its way by e-mail.</span></div>${pdfButton(inv)}<p><a class="btn" href="./">Back to the website</a></p>`);
    wirePdf();
  }
  async function start(btn) {
    btn.disabled = true; btn.textContent = 'Opening the secure checkout…';
    try { const j = await call('start'); if (j.redirectUrl) { location.href = j.redirectUrl; return; } if (j.invoice && j.invoice.status === 'paid') { paidView(j.invoice); return; } throw new Error(j.error || 'Could not open the checkout.'); }
    catch (e) { btn.disabled = false; btn.textContent = 'Try again'; $('#pay-err').textContent = e.message; }
  }
  function contactLine() {
    const parts = [];
    if (CT.email) parts.push(`e-mail <a href="mailto:${esc(CT.email)}">${esc(CT.email)}</a>`);
    if (CT.whatsapp) parts.push(`WhatsApp <a href="https://wa.me/${esc(CT.whatsapp)}" target="_blank" rel="noopener">${esc(CT.phone || CT.whatsapp)}</a>`);
    else if (CT.phone) parts.push(`phone ${esc(CT.phone)}`);
    return parts.length ? 'Proof of payment: ' + parts.join(' or ') + '.' : '';
  }
  function eftNotice(inv) {
    if (inv.eft_at) return `<div class="pay-ok soft"><b>Thank you — we have your EFT notice${inv.eft_at ? ' of ' + esc(fmtDate(inv.eft_at)) : ''}.</b><span>We confirm EFT payments as soon as they reflect, usually the same working day, and e-mail you a receipt.</span></div>`;
    return `<form class="pay-eft-form" id="eft-form" novalidate><label for="eft-note">Paid by EFT? Tell us and we will confirm it as soon as it reflects.</label>
      <div class="pay-eft-row"><input id="eft-note" type="text" maxlength="120" placeholder="Optional: your bank's reference or the account name you paid from"><button class="btn" type="submit" id="eft-go">I have paid by EFT</button></div>
      <p class="note err" id="eft-err" role="alert" hidden></p></form>`;
  }
  function eftBox(inv, online) {
    if (!bank) return '';
    const rows = [['Bank', bank.bank], ['Account holder', bank.holder], ['Account number', bank.number], ['Branch code', bank.branch], ['Account type', bank.type]].filter(r => r[1]);
    const copyText = rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\nReference: ' + inv.ref + '\nAmount: ' + inv.amount;
    return `<section class="pay-eft" aria-labelledby="eft-h"><h2 id="eft-h">${online ? 'Or pay by bank transfer (EFT)' : 'Pay by bank transfer (EFT)'}</h2>
      <dl class="pay-bank">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}<dt>Reference</dt><dd class="ref">${esc(inv.ref)}</dd><dt>Amount</dt><dd>${esc(inv.amount)}</dd></dl>
      <p class="pay-fine">Please use <b>${esc(inv.ref)}</b> as your payment reference so that we can match your payment.</p>
      <p class="pay-actions"><button class="btn" type="button" id="eft-copy" data-copy="${esc(copyText)}">Copy bank details</button></p>
      <div id="eft-notice">${eftNotice(inv)}</div>
      <p class="pay-fine">${contactLine()}</p></section>`;
  }
  function adminBox(inv) {
    if (!admin) return '';
    return `<section class="pay-admin" aria-label="Administrator"><p><b>Adventuity administrator</b> (${esc(admin.email)})</p>
      <p class="pay-actions"><button class="btn red" type="button" id="adm-paid">Mark ${esc(inv.ref)} as paid (EFT received)</button></p>
      <p class="note err" id="adm-err" role="alert" hidden></p></section>`;
  }
  function wire(inv) {
    wirePdf();
    const b = $('#pay-go'); if (b) b.addEventListener('click', () => start(b));
    const c = $('#eft-copy'); if (c) c.addEventListener('click', async () => {
      const text = c.getAttribute('data-copy') || '';
      try { await navigator.clipboard.writeText(text); c.textContent = 'Copied'; }
      catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); c.textContent = 'Copied'; } catch (e) { c.textContent = 'Select and copy the details above'; } ta.remove(); }
      setTimeout(() => { c.textContent = 'Copy bank details'; }, 2500);
    });
    const f = $('#eft-form'); if (f) f.addEventListener('submit', async e => {
      e.preventDefault(); const go = $('#eft-go'), err = $('#eft-err'); go.disabled = true; go.textContent = 'Sending…'; err.hidden = true;
      try { const j = await call('eft', { note: $('#eft-note').value.trim().slice(0, 120) }); if (j.invoice) { inv = j.invoice; if (inv.status === 'paid') { paidView(inv); return; } $('#eft-notice').innerHTML = eftNotice(Object.assign({}, inv, { eft_at: inv.eft_at || new Date().toISOString() })); } else throw new Error(j.error || 'Could not send the notice.'); }
      catch (ex) { go.disabled = false; go.textContent = 'I have paid by EFT'; err.textContent = ex.message; err.hidden = false; }
    });
    const p = $('#adm-paid'); if (p) p.addEventListener('click', async () => {
      if (!confirm('Mark invoice ' + inv.ref + ' (' + inv.amount + ') as paid? The client receives a payment confirmation by e-mail.')) return;
      p.disabled = true; p.textContent = 'Saving…';
      try { const j = await call('paid', { method: 'eft' }, admin.token); if (j.invoice && j.invoice.status === 'paid') { paidView(j.invoice); return; } throw new Error(j.error || 'Could not mark the invoice as paid.'); }
      catch (ex) { p.disabled = false; p.textContent = 'Mark ' + inv.ref + ' as paid (EFT received)'; const er = $('#adm-err'); er.textContent = ex.message; er.hidden = false; }
    });
  }
  /** The quotation this invoice belongs to (automatic quotations only): what the client accepts by paying. */
  function quoteBox() {
    if (!quote || !Array.isArray(quote.lines) || !quote.lines.length) return '';
    const rows = quote.lines.map(l => `<tr><td>${esc(l.label)}${l.note ? `<small>${esc(l.note)}</small>` : ''}</td><td>${R(l.amount)}</td></tr>`).join('');
    const opt = (quote.optional || []).map(o => `<tr class="opt"><td>Optional: ${esc(o.label)}</td><td>${R(o.amount)}</td></tr>`).join('');
    const list = (t, a) => a && a.length ? `<p class="pay-fine"><b>${t}</b></p><ul class="pay-list">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const pay = quote.deposit_pct >= 100 ? `Payable in full to start: <b>${R(quote.deposit)}</b>` : `Deposit to start (${esc(quote.deposit_pct)}%): <b>${R(quote.deposit)}</b> · balance of ${R(quote.balance)} on delivery of the final report`;
    return `<section class="pay-quote" aria-labelledby="q-h"><h2 id="q-h">Quotation ${esc(quote.ref)}</h2>
      <table><tbody>${rows}</tbody><tfoot><tr><th>Total (no VAT: not VAT registered)</th><th>${R(quote.total)}</th></tr>${opt}</tfoot></table>
      <p class="pay-fine">${pay}.</p><p class="pay-fine">Turnaround: ${esc(quote.turnaround || '')}.${quote.valid_until ? ' Valid until ' + esc(fmtDate(quote.valid_until)) + '.' : ''}</p>
      <details><summary>Assumptions and exclusions</summary>${list('Based on the details you gave us', quote.assumptions)}${list('Not included', quote.exclusions)}<p class="pay-fine">The quotation is based on the details you supplied; if the site or scope is materially different, we confirm a revised price before any work starts.</p></details></section>`;
  }
  function unpaidView(inv, online, note) {
    root.innerHTML = card(inv, `${note ? '<p class="note err">' + esc(note) + '</p>' : ''}${pdfButton(inv)}${quoteBox()}
      ${online ? `<button class="btn red pay-go" type="button" id="pay-go">Pay ${esc(inv.amount)} by card</button><p class="pay-fine">You pay on the secure Yoco checkout page (Visa, Mastercard, American Express and more; overseas cards welcome). The amount is in South African rand (ZAR); your bank converts it if your card is in another currency. Your card details never reach Adventuity.</p>` : (bank ? '' : '<p class="note">Online card payment is being set up. Please pay by EFT using the banking details on your quotation, or contact us.</p>')}
      <p class="note err" id="pay-err" role="alert"></p>${eftBox(inv, online)}${adminBox(inv)}`);
    wire(inv);
  }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  /** An Adventuity administrator who opened the link while signed in to the Studio (same site) can mark EFT payments as received. */
  async function findAdmin() {
    try {
      if (!SB.url || !SB.key) return;
      const storeKey = 'sb-' + new URL(SB.url).host.split('.')[0] + '-auth-token';
      if (!localStorage.getItem(storeKey)) return;
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
      const sb = window.supabase.createClient(SB.url, SB.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.access_token) admin = { email: session.user.email || '', token: session.access_token };
    } catch (_) { admin = null; }
  }
  /* ---------- downloadable invoice: a real PDF drawn in the browser, in the same layout as Adventuity's other invoices */
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  function pdfButton(inv) {
    return `<p class="pay-actions"><button class="btn" type="button" id="inv-pdf">${inv.status === 'paid' ? 'Download paid invoice (PDF)' : 'Download invoice (PDF)'}</button></p><p class="note err" id="inv-pdf-err" role="alert" hidden></p>`;
  }
  function wirePdf() { const b = $('#inv-pdf'); if (b) b.addEventListener('click', () => invoicePdf(b)); }
  // the PDF's built-in fonts cover Western European characters only
  const pt = s => String(s == null ? '' : s).replace(/[‐-―]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x00-\xff€]/g, '?');
  function imgData(src) {
    return fetch(src).then(r => (r.ok ? r.blob() : null)).then(b => b && new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); })).catch(() => null);
  }
  async function invoicePdf(btn) {
    const label = btn.textContent, err = $('#inv-pdf-err');
    btn.disabled = true; btn.textContent = 'Preparing the PDF…'; if (err) err.hidden = true;
    try {
      const [j, logo] = await Promise.all([call('view'), imgData('assets/invoice-logo.png'), window.jspdf ? null : loadScript(JSPDF)]);
      if (!j.invoice) throw new Error(j.error || 'Could not load the invoice.');
      const doc = drawInvoice(new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), j, logo);
      const name = 'Adventuity invoice ' + j.invoice.ref + '.pdf';
      try { doc.save(name); } catch (_) { window.open(doc.output('bloburl'), '_blank'); }
    } catch (e) { if (err) { err.textContent = (e && e.message) || 'Could not make the PDF. Please try again.'; err.hidden = false; } }
    btn.disabled = false; btn.textContent = label;
  }
  function drawInvoice(doc, j, logo) {
    const inv = j.invoice, b = j.billing || {}, s = j.seller || {}, bk = j.bank, qt = j.quote, paid = inv.status === 'paid';
    const NAVY = [28, 50, 70], GREY = [154, 166, 178], L = 14, Rr = 196, T = 14, B = 283, FW = Rr - L;
    const money = c => R(Number(c || 0) / 100);
    doc.setProperties({ title: 'Invoice ' + inv.ref, subject: pt(inv.description), author: pt(s.company || 'Adventuity (Pty) Ltd'), creator: 'Adventuity Floodline' });
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.25); doc.rect(L, T, FW, B - T);
    // navy sweep across the top right
    const sw = FW * 0.66, sx = Rr - sw;
    doc.setFillColor(...NAVY);
    doc.lines([[sw, 0], [0, 30], [-0.25 * sw, -0.5, -0.69 * sw, -9, -sw, -30]], sx, T, [1, 1], 'F', true);
    // logo, slogan and rule
    let y = T + 5;
    if (logo) { try { doc.addImage(logo, 'PNG', L + 5, y, 34, 34 * 174 / 260); y += 34 * 174 / 260; } catch (_) { y += 4; } }
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NAVY); doc.text('ADVENTUITY', L + 5, y + 10); y += 14; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY); doc.text(pt(s.tagline || 'Transforming ideas into reality.'), L + 6, y + 4);
    doc.setLineWidth(0.45); doc.line(L, y + 6, L + FW * 0.42, y + 6);
    // title
    y += 18; doc.setTextColor(0, 0, 0); doc.setFontSize(20); doc.text('INVOICE', L + 10, y);
    if (paid) {
      doc.setDrawColor(31, 122, 77); doc.setTextColor(31, 122, 77); doc.setLineWidth(0.6); doc.roundedRect(L + 52, y - 7.5, 25, 10, 1.5, 1.5, 'S');
      doc.setFontSize(14); doc.text('PAID', L + 64.5, y - 0.6, { align: 'center' }); doc.setTextColor(0, 0, 0); doc.setDrawColor(...NAVY);
    }
    // to (left) and invoice details (right)
    y += 9; const top = y;
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.text('To', L + 10, y); y += 4.6;
    const to = [];
    if (b.name) to.push(['bold', b.name]);
    if (b.company) to.push(['normal', b.company]);
    if (b.email) to.push(['normal', b.email]);
    if (b.site) to.push(['normal', 'Site: ' + b.site]);
    if (!to.length && inv.client) to.push(['bold', inv.client]);
    for (const [w, t] of to) { doc.setFont('helvetica', w); for (const line of doc.splitTextToSize(pt(t), 92)) { doc.text(line, L + 10, y); y += 4.3; } }
    let my = top; const mx = Rr - 4;
    const meta = [['Date', fmtDate(b.date || inv.paid_at || Date.now())], ['Invoice no.', inv.ref, true]];
    if (b.quote_ref || (qt && qt.ref)) meta.push(['Quotation', b.quote_ref || qt.ref]);
    meta.push(paid ? ['Paid', fmtDate(inv.paid_at || Date.now()) + (inv.method ? ' (' + (inv.method === 'eft' ? 'EFT' : 'card') + ')' : '')] : ['Payment', 'Due on receipt']);
    for (const [k, v, bold] of meta) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.text(pt(k + ': ' + v), mx, my, { align: 'right' }); my += 4.6; }
    y = Math.max(y, my) + 4;
    // items table
    const cols = [9, FW - 9 - 14 - 27 - 34, 14, 27, 34], xs = [L]; for (const w of cols) xs.push(xs[xs.length - 1] + w);
    doc.setFillColor(...NAVY); doc.rect(L, y, FW, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    ['NO', 'DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT'].forEach((h, i) => doc.text(h, xs[i] + cols[i] / 2, y + 4.7, { align: 'center' }));
    doc.setTextColor(0, 0, 0); y += 7;
    const cellLines = (y0, h) => { doc.setDrawColor(...GREY); doc.setLineWidth(0.15); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(L, y0 + h, Rr, y0 + h); for (let i = 1; i < xs.length - 1; i++) doc.line(xs[i], y0, xs[i], y0 + h); doc.setLineDashPattern([], 0); doc.setDrawColor(...NAVY); };
    doc.setFont('helvetica', 'normal');
    const desc = doc.splitTextToSize(pt(inv.description), cols[1] - 4), rh = Math.max(11, desc.length * 4 + 5);
    doc.text('1', xs[0] + cols[0] / 2, y + rh / 2 + 1.2, { align: 'center' });
    doc.text(desc, xs[1] + 2, y + rh / 2 + 1.2 - (desc.length - 1) * 2);
    doc.text('1', xs[2] + cols[2] / 2, y + rh / 2 + 1.2, { align: 'center' });
    doc.text(money(inv.amount_cents), xs[4] - 2, y + rh / 2 + 1.2, { align: 'right' });
    doc.text(money(inv.amount_cents), xs[5] - 2, y + rh / 2 + 1.2, { align: 'right' });
    cellLines(y, rh); y += rh;
    const notes = [];
    if (qt && qt.total) notes.push('Quotation ' + qt.ref + ': total ' + R(qt.total) + (qt.deposit_pct && qt.deposit_pct < 100 ? '. This invoice is the ' + qt.deposit_pct + '% deposit; the balance of ' + R(qt.balance) + ' is due when the final report is delivered.' : '.'));
    if (s.issuer) notes.push('Issued by ' + s.issuer + '.');
    doc.setFontSize(8);
    for (const n of notes) { const ls = doc.splitTextToSize(pt(n), cols[1] - 4), h = Math.max(6.2, ls.length * 3.6 + 2.6); doc.text(ls, xs[1] + 2, y + 4.2); cellLines(y, h); y += h; }
    for (let k = 0; k < 2; k++) { cellLines(y, 6.2); y += 6.2; }
    // totals (right) and banking details (left)
    doc.setLineWidth(0.3); doc.line(L, y, Rr, y);
    const sx2 = Rr - 61; let ty = y + 6;
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
    doc.text('SUBTOTAL', sx2 + 1.5, ty); doc.text(money(inv.amount_cents), Rr - 1.5, ty, { align: 'right' }); ty += 3;
    doc.setFillColor(...NAVY); doc.rect(sx2, ty, 61, 7, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(11);
    doc.text('TOTAL', sx2 + 1.5, ty + 5); doc.text(money(inv.amount_cents), Rr - 1.5, ty + 5, { align: 'right' }); doc.setTextColor(0, 0, 0); ty += 12;
    doc.setFontSize(8.5);
    if (paid) {
      doc.setFont('helvetica', 'normal'); doc.text('Paid ' + fmtDate(inv.paid_at || Date.now()), sx2 + 1.5, ty); doc.text(money(inv.paid_cents || inv.amount_cents), Rr - 1.5, ty, { align: 'right' }); ty += 4.6;
      doc.setFont('helvetica', 'bold'); doc.text('BALANCE DUE', sx2 + 1.5, ty); doc.text(R(0), Rr - 1.5, ty, { align: 'right' }); ty += 4.6;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(pt((s.company || 'Adventuity (Pty) Ltd') + ' is not registered for VAT; no VAT is charged.'), 59), sx2 + 1.5, ty + 1);
    let by = y + 6; doc.setFontSize(8.5);
    if (bk) {
      doc.setFont('helvetica', 'bold'); doc.text('Banking details:', L + 10, by); by += 4.5; doc.setFont('helvetica', 'normal');
      for (const [k, v] of [['Bank', bk.bank], ['Account holder', bk.holder], ['Account number', bk.number], ['Branch code', bk.branch], ['Account type', bk.type], ['Reference', inv.ref]]) if (v) { doc.text(pt(k + ': ' + v), L + 10, by); by += 4.5; }
    }
    y = Math.max(by, ty + 8) + 2;
    if (!paid) {
      doc.setFontSize(8); doc.setTextColor(...NAVY);
      const link = location.href.split('#')[0].replace(/[?&]pdf=1/, '');
      doc.text('Pay online or tell us about your EFT:', L + 10, y); y += 4;
      for (const line of doc.splitTextToSize(link, FW - 20)) { doc.textWithLink(line, L + 10, y, { url: link }); y += 3.6; }
      doc.setTextColor(0, 0, 0); y += 2;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Thank you for your business!', (L + Rr) / 2, Math.min(y + 8, B - 22), { align: 'center' });
    // footer bar
    const foot = [CT.phone ? 'Phone ' + CT.phone : '', CT.email ? 'Mail ' + CT.email : '', s.address ? 'Address ' + s.address : ''].filter(Boolean).join('   ·   ');
    doc.setFillColor(...NAVY); doc.rect(L, B - 11, FW, 11, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(pt(foot), (L + Rr) / 2, B - 6.6, { align: 'center' }); doc.text(pt((s.company || 'Adventuity (Pty) Ltd') + '   ·   ' + location.host), (L + Rr) / 2, B - 2.9, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    return doc;
  }
  async function boot() {
    if (!EP || !/^INV-[A-Z0-9]{6}$/.test(ref) || token.length < 40) { root.innerHTML = '<span class="label">Secure payment</span><h1>Payment link not complete</h1><p class="lead">Please open the full link from your e-mail, or ask us to send it again.</p><p><a class="btn" href="./">Back to the website</a></p>'; return; }
    try {
      await findAdmin();
      if (ret === 'ok') {
        $('#pay-msg').textContent = 'Confirming your payment…';
        for (let k = 0; k < 8; k++) { const j = await call('confirm'); if (j.invoice && j.invoice.status === 'paid') { paidView(j.invoice); return; } await new Promise(r => setTimeout(r, 2500)); }
        const j = await call('view'); bank = j.bank || null; quote = j.quote || null; unpaidView(j.invoice, j.online, 'We have not received the payment confirmation yet. If your card was charged, there is no need to pay again: it will show here within a few minutes, and we will confirm by e-mail.'); return;
      }
      const j = await call('view'); const inv = j.invoice; bank = j.bank || null; quote = j.quote || null;
      if (j.error && inv) { root.innerHTML = card(inv, '<p class="note err">' + esc(j.error) + '</p>'); return; }
      if (inv.status === 'paid') paidView(inv);
      else unpaidView(inv, j.online, ret === 'cancel' ? 'The payment was cancelled. You can try again below.' : ret === 'fail' ? 'The payment did not go through. Please try again or use another card.' : '');
      const pb = $('#inv-pdf'); if (pb && q.get('pdf') === '1') { pb.scrollIntoView({ block: 'center' }); invoicePdf(pb); }
    } catch (e) { root.innerHTML = '<span class="label">Secure payment</span><h1>Something went wrong</h1><p class="lead">' + esc(e.message) + '</p>'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
