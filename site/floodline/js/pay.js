 
(function () {
  'use strict';
  const CFG = window.FL_CONFIG || {}, EP = (CFG.payments || {}).endpoint, KEY = (CFG.quotes || {}).key;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const q = new URLSearchParams(location.search), ref = q.get('i') || '', token = q.get('t') || '', ret = q.get('r') || '';
  const root = $('#pay-root');
  async function call(action) {
    const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ action, ref, token, back: location.href.split('?')[0] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.invoice) throw new Error(j.error || 'The payment service is not available right now. Please try again in a minute.');
    return j;
  }
  function card(inv, extra) {
    return `<span class="label">Secure payment</span><h1>${esc(inv.company || 'Adventuity (Pty) Ltd')}</h1>
      <dl class="pay-dl"><dt>Invoice</dt><dd>${esc(inv.ref)}</dd><dt>For</dt><dd>${esc(inv.description)}</dd><dt>Amount</dt><dd class="amt">${esc(inv.amount)}</dd></dl>${extra}`;
  }
  function paidView(inv) {
    root.innerHTML = card(inv, `<div class="pay-ok"><b>Paid — thank you${inv.client ? ', ' + esc(inv.client) : ''}.</b><span>We have received your payment${inv.paid_at ? ' on ' + esc(new Date(inv.paid_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })) : ''}. A confirmation is on its way by e-mail.</span></div><p><a class="btn" href="./">Back to the website</a></p>`);
  }
  async function start(btn) {
    btn.disabled = true; btn.textContent = 'Opening the secure checkout…';
    try { const j = await call('start'); if (j.redirectUrl) { location.href = j.redirectUrl; return; } if (j.invoice && j.invoice.status === 'paid') { paidView(j.invoice); return; } throw new Error(j.error || 'Could not open the checkout.'); }
    catch (e) { btn.disabled = false; btn.textContent = 'Try again'; $('#pay-err').textContent = e.message; }
  }
  function unpaidView(inv, online, note) {
    root.innerHTML = card(inv, `${note ? '<p class="note err">' + esc(note) + '</p>' : ''}
      ${online ? `<button class="btn red pay-go" type="button" id="pay-go">Pay ${esc(inv.amount)} by card</button>` : '<p class="note">Online card payment is being set up. Please pay by EFT using the banking details on your quotation, or contact us.</p>'}
      <p class="note" id="pay-err" role="alert"></p>
      <p class="pay-fine">You pay on the secure Yoco checkout page (Visa, Mastercard, American Express and more; overseas cards welcome). The amount is in South African rand (ZAR); your bank converts it if your card is in another currency. Your card details never reach Adventuity.</p>`);
    const b = $('#pay-go'); if (b) b.addEventListener('click', () => start(b));
  }
  async function boot() {
    if (!EP || !/^INV-[A-Z0-9]{6}$/.test(ref) || token.length < 40) { root.innerHTML = '<span class="label">Secure payment</span><h1>Payment link not complete</h1><p class="lead">Please open the full link from your e-mail, or ask us to send it again.</p><p><a class="btn" href="./">Back to the website</a></p>'; return; }
    try {
      if (ret === 'ok') {
        $('#pay-msg').textContent = 'Confirming your payment…';
        for (let k = 0; k < 8; k++) { const j = await call('confirm'); if (j.invoice && j.invoice.status === 'paid') { paidView(j.invoice); return; } await new Promise(r => setTimeout(r, 2500)); }
        const j = await call('view'); unpaidView(j.invoice, j.online, 'We have not received the payment confirmation yet. If your card was charged, there is no need to pay again: it will show here within a few minutes, and we will confirm by e-mail.'); return;
      }
      const j = await call('view'); const inv = j.invoice;
      if (j.error && inv) { root.innerHTML = card(inv, '<p class="note err">' + esc(j.error) + '</p>'); return; }
      if (inv.status === 'paid') { paidView(inv); return; }
      unpaidView(inv, j.online, ret === 'cancel' ? 'The payment was cancelled. You can try again below.' : ret === 'fail' ? 'The payment did not go through. Please try again or use another card.' : '');
    } catch (e) { root.innerHTML = '<span class="label">Secure payment</span><h1>Something went wrong</h1><p class="lead">' + esc(e.message) + '</p>'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
