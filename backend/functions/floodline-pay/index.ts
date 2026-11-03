// Payment of accepted flood line quotes: EFT into Adventuity's bank account, or card through Yoco Checkout.
//  - Studio / pricing page (signed-in administrator): create a payment request, mark an EFT payment as received,
//    check the Yoco connection, register the webhook.
//  - Pay page (client): view the invoice (with the quotation and the bank details), tell us about an EFT payment,
//    start a Yoco checkout, confirm the payment on return. These public actions are authorised by the invoice
//    reference plus its secret token (in the payment link).
//  - Yoco webhook (payment.succeeded): the payment is always confirmed by reading the checkout back from Yoco
//    with the secret key, so a forged webhook cannot mark an invoice paid.
// verify_jwt is off on purpose: clients have no account, and Yoco calls the webhook without one. Admin actions check
// the caller's session and admin role below.
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const SECRET: string = (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); if (k.default) return k.default; } catch (_) { /* fall back */ } return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; })();
const SH = (extra: Record<string, string> = {}): Record<string, string> => (SECRET.startsWith('sb_') ? { apikey: SECRET, ...extra } : { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...extra });
const db = (path: string, init: RequestInit = {}) => fetch(URL_ + '/rest/v1' + path, { ...init, headers: SH({ 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) }) });
const YOCO = 'https://payments.yoco.com/api';
const KEY = (Deno.env.get('YOCO_SECRET_KEY') || '').trim();
const FN_URL = URL_ + '/functions/v1/floodline-pay';
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rand = (c: number) => 'R ' + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
// payment links may point to the Adventuity websites (and their Azure / GitHub Pages copies) only
const SITE_OK = /^https:\/\/([a-z0-9-]+\.)*(adventuity\.co\.za|adventuity\.com|azurestaticapps\.net|katiso0623\.github\.io)\//i;

type Inv = { id: string; ref: string; quote_id: string | null; description: string; amount_cents: number; currency: string; client_name: string; client_email: string; token: string; status: string; checkout_id: string | null; paid_at: string | null; paid_cents: number | null; mode: string | null; eft_at: string | null; eft_note: string; method: string | null; created_at: string };
type Bank = { bank: string; holder: string; number: string; branch: string; type: string };

async function cfg(): Promise<Record<string, string>> {
  const rows = await (await db('/app_config?select=key,value&key=in.(vapid_public,vapid_private,vapid_subject,site_url,floodline_url)')).json();
  return Object.fromEntries((rows || []).map((r: { key: string; value: string }) => [r.key, r.value]));
}
function siteBase(back: unknown, c: Record<string, string>) {
  const b = String(back || '');
  if (SITE_OK.test(b)) return b.replace(/[^/]*$/, '');
  return (c.floodline_url || 'https://www.adventuity.co.za/').replace(/\/?$/, '/');
}
/** Adventuity's banking details, kept once in private_settings.invoice.bank (the same text the learning hub invoices use). */
async function bankDetails(): Promise<Bank | null> {
  const rows = await (await db('/private_settings?select=value&key=eq.invoice')).json();
  const text = Array.isArray(rows) && rows[0] && rows[0].value ? String(rows[0].value.bank || '') : '';
  if (!text.trim()) return null;
  const b: Bank = { bank: '', holder: '', number: '', branch: '', type: '' };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:]+):\s*(.+?)\s*$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2];
    if (/holder|name of account|account name/.test(k)) b.holder = v;
    else if (/bank/.test(k)) b.bank = v;
    else if (/number|acc(ount)?\s*no/.test(k)) b.number = v;
    else if (/branch/.test(k)) b.branch = v;
    else if (/type/.test(k)) b.type = v;
  }
  return b.number ? b : null;
}
const bankLine = (b: Bank | null) => (b ? [b.bank, b.holder, b.type, 'account ' + b.number, b.branch ? 'branch code ' + b.branch : ''].filter(Boolean).join(', ') : '');
async function yoco(path: string, init: RequestInit = {}) {
  const r = await fetch(YOCO + path, { ...init, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) } });
  const t = await r.text(); let j: Record<string, unknown> = {}; try { j = JSON.parse(t); } catch (_) { /* not json */ }
  if (!r.ok) throw new Error('Yoco ' + r.status + ': ' + (j.displayMessage || j.errorMessage || j.description || t.slice(0, 200)));
  return j;
}
async function getInv(ref: unknown, token: unknown): Promise<Inv | null> {
  const r = clean(ref, 20), t = clean(token, 80);
  if (!/^INV-[A-Z0-9]{6}$/.test(r) || t.length < 40) return null;
  const rows = await (await db('/floodline_invoices?select=*&ref=eq.' + encodeURIComponent(r) + '&limit=1')).json();
  const inv = Array.isArray(rows) ? rows[0] : null;
  if (!inv || inv.token.length !== t.length) return null;
  let diff = 0; for (let i = 0; i < t.length; i++) diff |= inv.token.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0 ? inv : null;
}
function publicView(inv: Inv) {
  return { ref: inv.ref, description: inv.description, amount_cents: inv.amount_cents, amount: rand(inv.amount_cents), currency: inv.currency, status: inv.status, client: (inv.client_name || '').split(' ')[0], paid_at: inv.paid_at, eft_at: inv.eft_at, method: inv.method, company: 'Adventuity (Pty) Ltd' };
}
/** The automatic quotation behind an invoice, for the pay page (only what the client already received by e-mail). */
async function quoteView(inv: Inv) {
  if (!inv.quote_id) return null;
  const rows = await (await db('/floodline_quotes?select=ref,auto_status,auto_quote,quoted_at&id=eq.' + inv.quote_id)).json();
  const q = Array.isArray(rows) ? rows[0] : null;
  if (!q || q.auto_status !== 'sent' || !q.auto_quote || !Array.isArray(q.auto_quote.lines)) return null;
  const a = q.auto_quote;
  return { ref: q.ref, date: q.quoted_at, service: a.service ? a.service.name : '', lines: a.lines, optional: a.optional || [], total: a.total, deposit: a.deposit, deposit_pct: a.deposit_pct, balance: a.balance, turnaround: a.turnaround, valid_until: a.valid_until, assumptions: a.assumptions || [], exclusions: a.exclusions || [] };
}

/** Signed-in administrator, or null. */
async function adminUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+ey/.test(auth)) return null;
  const r = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: SECRET, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  const p = await (await db('/profiles?select=role&id=eq.' + u.id)).json();
  return Array.isArray(p) && p[0] && p[0].role === 'admin' ? { id: u.id, email: u.email } : null;
}

async function notifyAdmin(title: string, body: string, c: Record<string, string>, url = '') {
  try {
    webpush.setVapidDetails(c.vapid_subject || 'mailto:admin@example.com', c.vapid_public, c.vapid_private);
    const admins = await (await db('/profiles?select=id&role=eq.admin')).json();
    const ids = (admins || []).map((a: { id: string }) => a.id);
    if (ids.length) {
      const subs = await (await db('/push_subs?select=id,sub&user_id=in.(' + ids.join(',') + ')')).json();
      const open = url || (c.floodline_url ? c.floodline_url.replace(/\/?$/, '/') + 'studio.html' : '');
      for (const s of subs) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title, body, tag: 'pay-' + Date.now(), url: open }), { TTL: 86400 }); } catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db('/push_subs?id=eq.' + s.id, { method: 'DELETE' }); } }
    }
  } catch (e) { console.error('push failed', String(e)); }
}
/** E-mail through the same form relay as quote requests: the admin gets the message, the client gets the auto-response. */
async function mail(subject: string, fields: Record<string, unknown>, clientEmail: string, clientText: string, c: Record<string, string>) {
  try {
    const notify = await (await db('/private_settings?select=value&key=eq.notify')).json();
    const to = notify[0] && notify[0].value && notify[0].value.email, site = c.site_url || c.floodline_url;
    if (!to || !site) return false;
    const origin = new URL(site).origin;
    const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin, Referer: origin + '/' },
      body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...(clientEmail ? { email: clientEmail, _replyto: clientEmail, _autoresponse: clientText } : {}), ...fields }),
    });
    return r.ok;
  } catch (e) { console.error('e-mail failed', String(e)); return false; }
}

type PaidInfo = { method: 'card' | 'eft'; payment_id?: string; paid_cents?: number; by?: string; event?: unknown };
async function markPaid(inv: Inv, info: PaidInfo, c: Record<string, string>) {
  if (inv.status === 'paid') return inv;
  const paid = { status: 'paid', paid_at: new Date().toISOString(), method: info.method, payment_id: info.payment_id || null, paid_cents: info.paid_cents || inv.amount_cents, confirmed_by: info.by || null, ...(info.event ? { last_event: info.event } : {}) };
  const up = await db('/floodline_invoices?id=eq.' + inv.id + '&status=eq.unpaid', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(paid) });
  const rows = await up.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return inv;   // someone else already marked it
  let quoteRef = '';
  if (inv.quote_id) {
    await db('/floodline_quotes?id=eq.' + inv.quote_id, { method: 'PATCH', body: JSON.stringify({ status: 'won' }) });
    const q = await (await db('/floodline_quotes?select=ref&id=eq.' + inv.quote_id)).json(); quoteRef = q[0] ? q[0].ref : '';
  }
  const how = info.method === 'eft' ? 'EFT' : 'card';
  await notifyAdmin('Payment received ' + rand(inv.amount_cents), inv.ref + ' · ' + how + ' · ' + inv.description + (inv.client_name ? ' · ' + inv.client_name : ''), c);
  await mail('Payment received ' + inv.ref + ' - ' + rand(inv.amount_cents), { Invoice: inv.ref, Quote: quoteRef || '-', Description: inv.description, Amount: rand(inv.amount_cents), Method: how, Client: inv.client_name || '-', 'Client e-mail': inv.client_email || '-', ...(info.method === 'card' ? { 'Yoco payment': paid.payment_id || '-' } : {}) },
    inv.client_email, 'Hi ' + ((inv.client_name || '').split(' ')[0] || 'there') + ', thank you - we have received your payment of ' + rand(inv.amount_cents) + ' for ' + inv.description + ' (invoice ' + inv.ref + '). We will be in touch about the next steps. Adventuity (Pty) Ltd', c);
  return Object.assign(inv, paid);
}
/** Read the checkout back from Yoco and mark the invoice paid when it is completed. */
async function confirm(inv: Inv, c: Record<string, string>) {
  if (inv.status !== 'unpaid' || !inv.checkout_id || !KEY) return inv;
  const co = await yoco('/checkouts/' + encodeURIComponent(inv.checkout_id));
  if (co.status === 'completed') return await markPaid(inv, { method: 'card', payment_id: String(co.paymentId || ''), paid_cents: Number(co.amount || inv.amount_cents), event: co }, c);
  return inv;
}

// Standard Webhooks signature (webhook-id.webhook-timestamp.body, HMAC-SHA256 with the whsec_ secret)
async function signatureOk(req: Request, raw: string): Promise<boolean | null> {
  const rows = await (await db('/floodline_private_assets?select=body&name=eq.yoco-webhook')).json();
  const sec = Array.isArray(rows) && rows[0] ? String(rows[0].body || '') : '';
  const id = req.headers.get('webhook-id'), ts = req.headers.get('webhook-timestamp'), sig = req.headers.get('webhook-signature');
  if (!sec || !id || !ts || !sig) return null;   // not verifiable: rely on reading the checkout back from Yoco
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const keyBytes = Uint8Array.from(atob(sec.replace(/^whsec_/, '')), (ch) => ch.charCodeAt(0));
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(id + '.' + ts + '.' + raw)));
  const expect = btoa(String.fromCharCode(...mac));
  return sig.split(' ').some((p) => p.split(',')[1] === expect);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  const raw = await req.text();
  let f: Record<string, unknown> = {}; try { f = JSON.parse(raw || '{}'); } catch (_) { return json({ error: 'Bad request' }, 400); }
  try {
    // ---- Yoco webhook
    if (req.headers.get('webhook-id') || (typeof f.type === 'string' && String(f.type).startsWith('payment.'))) {
      const ok = await signatureOk(req, raw);
      if (ok === false) return json({ ok: false }, 401);
      const p = (f.payload || {}) as Record<string, unknown>, md = (p.metadata || {}) as Record<string, unknown>;
      const checkoutId = clean(md.checkoutId || md.checkout_id || '', 80), invRef = clean(md.invoice || '', 20);
      let rows: Inv[] = [];
      if (checkoutId) rows = await (await db('/floodline_invoices?select=*&checkout_id=eq.' + encodeURIComponent(checkoutId))).json();
      if ((!Array.isArray(rows) || !rows.length) && /^INV-[A-Z0-9]{6}$/.test(invRef)) rows = await (await db('/floodline_invoices?select=*&ref=eq.' + invRef)).json();
      if (Array.isArray(rows) && rows[0] && f.type === 'payment.succeeded') { try { await confirm(rows[0], await cfg()); } catch (e) { console.error('webhook confirm', String(e)); } }
      return json({ ok: true });
    }
    const action = String(f.action || '');
    // ---- administrator marks an EFT payment as received (from the pay page or the pricing page)
    if (action === 'paid') {
      const me = await adminUser(req);
      if (!me) return json({ error: 'Sign in with an Adventuity administrator account to mark payments.' }, 401);
      let inv: Inv | null = null;
      if (typeof f.id === 'string' && /^[0-9a-f-]{36}$/.test(f.id)) inv = ((await (await db('/floodline_invoices?select=*&id=eq.' + f.id)).json()) || [])[0] || null;
      else if (/^INV-[A-Z0-9]{6}$/.test(clean(f.ref, 20))) inv = ((await (await db('/floodline_invoices?select=*&ref=eq.' + clean(f.ref, 20))).json()) || [])[0] || null;
      if (!inv) return json({ error: 'Invoice not found.' }, 404);
      if (inv.status === 'cancelled') return json({ error: 'This invoice was cancelled.' }, 400);
      inv = await markPaid(inv, { method: f.method === 'card' ? 'card' : 'eft', by: me.id }, await cfg());
      return json({ invoice: publicView(inv) });
    }
    // ---- public: the client's payment page
    if (action === 'view' || action === 'start' || action === 'confirm' || action === 'eft') {
      let inv = await getInv(f.ref, f.token);
      if (!inv) return json({ error: 'This payment link is not valid. Please use the link in your e-mail or ask us for a new one.' }, 404);
      if (inv.status === 'cancelled') return json({ invoice: publicView(inv), error: 'This invoice has been cancelled.' });
      const c = await cfg();
      if (action === 'view') {
        try { inv = await confirm(inv, c); } catch (_) { /* status check only */ }
        const [bank, quote] = await Promise.all([bankDetails(), quoteView(inv)]);
        return json({ invoice: publicView(inv), online: !!KEY, bank, quote });
      }
      if (action === 'confirm') { inv = await confirm(inv, c); return json({ invoice: publicView(inv) }); }
      if (action === 'eft') {
        if (inv.status !== 'unpaid') return json({ invoice: publicView(inv) });
        const note = clean(f.note, 120);
        const again = inv.eft_at && Date.now() - new Date(inv.eft_at).getTime() < 10 * 60e3;
        const up = await db('/floodline_invoices?id=eq.' + inv.id, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ eft_at: new Date().toISOString(), eft_note: note }) });
        const rows = await up.json().catch(() => []); if (Array.isArray(rows) && rows[0]) inv = rows[0];
        if (!again) {
          const base = (c.floodline_url || 'https://www.adventuity.co.za/').replace(/\/?$/, '/');
          const link = base + 'pay.html?i=' + inv!.ref + '&t=' + inv!.token;
          await notifyAdmin('EFT to check ' + rand(inv!.amount_cents), inv!.ref + ' · ' + (inv!.client_name || 'client') + ' says they paid by EFT' + (note ? ' · ' + note : ''), c, base + 'pricing.html#payments');
          await mail('EFT payment to check ' + inv!.ref + ' - ' + rand(inv!.amount_cents), { Invoice: inv!.ref, Amount: rand(inv!.amount_cents), Description: inv!.description, Client: inv!.client_name || '-', 'Client e-mail': inv!.client_email || '-', 'Client note': note || '-', 'What to do': 'Check the Capitec Business account for this amount with reference ' + inv!.ref + '. When it has reflected, open the link below while signed in and press "Mark as paid", or use the Payments tab on pricing.html.', 'Invoice link': link }, '', '', c);
        }
        return json({ invoice: publicView(inv!) });
      }
      // start a checkout
      if (inv.status === 'paid') return json({ invoice: publicView(inv) });
      if (!KEY) return json({ error: 'Card payment is not switched on yet. Please pay by EFT using the bank details on this page.' }, 503);
      const base = siteBase(f.back, c), link = base + 'pay.html?i=' + inv.ref + '&t=' + inv.token;
      let quoteRef = '';
      if (inv.quote_id) { const q = await (await db('/floodline_quotes?select=ref&id=eq.' + inv.quote_id)).json(); quoteRef = q[0] ? q[0].ref : ''; }
      const co = await yoco('/checkouts', {
        method: 'POST', headers: { 'Idempotency-Key': inv.id + '-' + Date.now() },
        body: JSON.stringify({ amount: inv.amount_cents, currency: 'ZAR', successUrl: link + '&r=ok', cancelUrl: link + '&r=cancel', failureUrl: link + '&r=fail', externalId: inv.ref, metadata: { invoice: inv.ref, quote: quoteRef, description: inv.description.slice(0, 120) } }),
      });
      await db('/floodline_invoices?id=eq.' + inv.id, { method: 'PATCH', body: JSON.stringify({ checkout_id: co.id, mode: KEY.startsWith('sk_live_') ? 'live' : 'test' }) });
      return json({ redirectUrl: co.redirectUrl });
    }
    // ---- administrator: the Studio
    const me = await adminUser(req);
    if (!me) return json({ error: 'Sign in with an administrator account.' }, 401);
    const c = await cfg();
    if (action === 'status') {
      const wh = await (await db('/floodline_private_assets?select=updated_at&name=eq.yoco-webhook')).json();
      return json({ configured: !!KEY, mode: !KEY ? null : KEY.startsWith('sk_live_') ? 'live' : 'test', webhook: Array.isArray(wh) && wh.length ? wh[0].updated_at : null, eft: !!(await bankDetails()) });
    }
    if (action === 'connect') {
      if (!KEY) return json({ error: 'Add the Yoco secret key first (Supabase secret YOCO_SECRET_KEY).' }, 400);
      const w = await yoco('/webhooks', { method: 'POST', body: JSON.stringify({ name: 'Adventuity Floodline', url: FN_URL }) });
      if (w.secret) await db('/floodline_private_assets?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ name: 'yoco-webhook', encoding: 'text', body: String(w.secret), sha256: String(w.id || ''), updated_at: new Date().toISOString() }) });
      return json({ ok: true, id: w.id, mode: w.mode || null });
    }
    if (action === 'create') {
      const amount = Math.round(Number(f.amount) * 100), description = clean(f.description, 200), email = clean(f.client_email, 200).toLowerCase(), name = clean(f.client_name, 120);
      if (!(amount >= 200 && amount <= 100000000)) return json({ error: 'Enter an amount between R 2 and R 1 000 000.' }, 400);
      if (description.length < 3) return json({ error: 'Enter a short description, e.g. "Flood line report - 50% deposit".' }, 400);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'The client e-mail address is not valid.' }, 400);
      const quote_id = typeof f.quote_id === 'string' && /^[0-9a-f-]{36}$/.test(f.quote_id) ? f.quote_id : null;
      const ins = await db('/floodline_invoices', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ quote_id, description, amount_cents: amount, client_name: name, client_email: email, created_by: me.id }) });
      if (!ins.ok) { console.error('insert', ins.status, await ins.text()); return json({ error: 'Could not save the payment request.' }, 500); }
      const inv: Inv = (await ins.json())[0];
      if (quote_id) await db('/floodline_quotes?id=eq.' + quote_id + '&status=in.(new,contacted)', { method: 'PATCH', body: JSON.stringify({ status: 'quoted' }) });
      const link = siteBase(f.back, c) + 'pay.html?i=' + inv.ref + '&t=' + inv.token;
      const bank = bankLine(await bankDetails());
      let emailed = false;
      if (f.send_email && email) emailed = await mail('Payment link sent ' + inv.ref + ' - ' + rand(amount), { Invoice: inv.ref, Description: description, Amount: rand(amount), Client: name || '-', 'Client e-mail': email, 'Payment link': link },
        email, 'Hi ' + (name.split(' ')[0] || 'there') + ', thank you for accepting our quotation. You can pay ' + rand(amount) + ' for ' + description + ' (invoice ' + inv.ref + ') by EFT' + (KEY ? ' or card' : '') + ' here: ' + link + (bank ? ' . Bank details for EFT: ' + bank + ', reference ' + inv.ref + '.' : '') + ' - Adventuity (Pty) Ltd', c);
      return json({ ok: true, ref: inv.ref, id: inv.id, link, emailed, online: !!KEY });
    }
    if (action === 'cancel') {
      const id = String(f.id || ''); if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request' }, 400);
      await db('/floodline_invoices?id=eq.' + id + '&status=eq.unpaid', { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      return json({ ok: true });
    }
    if (action === 'check') {
      const id = String(f.id || ''); if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request' }, 400);
      const rows = await (await db('/floodline_invoices?select=*&id=eq.' + id)).json(); if (!rows[0]) return json({ error: 'Not found' }, 404);
      const inv = await confirm(rows[0], c); return json({ status: inv.status, paid_at: inv.paid_at });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message && String((e as Error).message).startsWith('Yoco') ? 'The payment service did not respond as expected. Please try again in a minute.' : 'Something went wrong - please try again in a minute.' }, 500);
  }
});
