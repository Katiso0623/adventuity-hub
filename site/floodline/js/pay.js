
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
    root.innerHTML = card(inv, `<div class="pay-ok"><b>Paid — thank you${inv.client ? ', ' + esc(inv.client) : ''}.</b><span>We have received your payment${inv.paid_at ? ' on ' + esc(fmtDate(inv.paid_at)) : ''}. A confirmation is on its way by e-mail.</span></div><p><a class="btn" href="./">Back to the website</a></p>`);
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
    root.innerHTML = card(inv, `${note ? '<p class="note err">' + esc(note) + '</p>' : ''}${quoteBox()}
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
      if (inv.status === 'paid') { paidView(inv); return; }
      unpaidView(inv, j.online, ret === 'cancel' ? 'The payment was cancelled. You can try again below.' : ret === 'fail' ? 'The payment did not go through. Please try again or use another card.' : '');
    } catch (e) { root.innerHTML = '<span class="label">Secure payment</span><h1>Something went wrong</h1><p class="lead">' + esc(e.message) + '</p>'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
