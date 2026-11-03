// Automatic flood line quotations.
//  - run (pg_cron, every minute, with the key in floodline_private_assets 'autoquote-cron'): each quote request that has
//    waited the set delay (10 minutes) is priced with the cost matrix. Clear requests get a quotation e-mail with a
//    payment link (deposit by EFT or card); unusual ones go to the engineer with the reasons.
//  - get / save / preview / list / send / dismiss (signed-in administrator, pricing.html): edit the matrix, try it out,
//    see what went out, send a quotation by hand.
// verify_jwt is off on purpose: the scheduler has no user session. Every action checks the cron key or the admin role.
import webpush from 'npm:web-push@3.6.7';
import { DEFAULT_MATRIX, priceRequest, quoteText, rand, validateMatrix, withDefaults } from './pricing.js';

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
const rows = async (path: string) => { const r = await db(path); const j = await r.json().catch(() => []); if (!r.ok) throw new Error('db ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)); return Array.isArray(j) ? j : []; };
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const KEY_KINDS = ['letter', 'desktop', 'certified', 'large', 'crossing'];
// addresses that can never receive a quotation (reserved test domains): skipped without e-mail
const JUNK = /@(.+\.)?(example\.(com|net|org)|example|test|invalid|localhost)$/i;

type Quote = { id: string; ref: string; created_at: string; full_name: string; company: string; email: string; phone: string; site_description: string; address: string; lat: number | null; lon: number | null; purpose: string; return_periods: string[]; survey: string; size_ha: number | null; deadline: string | null; notes: string; screening: Record<string, unknown> | null; page: string; status: string; auto_status: string | null; auto_quote: Record<string, unknown> | null; quoted_at: string | null; invoice_id: string | null };

async function cfg(): Promise<Record<string, string>> {
  const r = await rows('/app_config?select=key,value&key=in.(vapid_public,vapid_private,vapid_subject,site_url,floodline_url)');
  return Object.fromEntries(r.map((x: { key: string; value: string }) => [x.key, x.value]));
}
async function loadMatrix(): Promise<{ matrix: typeof DEFAULT_MATRIX; updated_at: string | null }> {
  const r = await rows('/floodline_settings?select=value,updated_at&key=eq.pricing');
  return { matrix: withDefaults(r[0] ? r[0].value : null), updated_at: r[0] ? r[0].updated_at : null };
}
async function bankText(): Promise<string> {
  const r = await rows('/private_settings?select=value&key=eq.invoice');
  const t = r[0] && r[0].value ? String(r[0].value.bank || '') : '';
  const b: Record<string, string> = {};
  for (const line of t.split(/\r?\n/)) {
    const mm = line.match(/^\s*([^:]+):\s*(.+?)\s*$/); if (!mm) continue;
    const k = mm[1].toLowerCase();
    b[/holder|account name/.test(k) ? 'holder' : /bank/.test(k) ? 'bank' : /number|acc(ount)?\s*no/.test(k) ? 'number' : /branch/.test(k) ? 'branch' : /type/.test(k) ? 'type' : k] = mm[2];
  }
  if (!b.number) return '';
  return [b.bank, b.holder, b.type, 'account ' + b.number, b.branch ? 'branch code ' + b.branch : ''].filter(Boolean).join(', ');
}
function siteFor(q: Quote, c: Record<string, string>) {
  try { const u = new URL(q.page); if (/(^|\.)adventuity\.(co\.za|com)$/i.test(u.hostname)) return u.origin + '/'; } catch (_) { /* no page */ }
  return (c.floodline_url || 'https://www.adventuity.co.za/').replace(/\/?$/, '/');
}

async function adminUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+ey/.test(auth)) return null;
  const r = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: SECRET, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  const p = await rows('/profiles?select=role&id=eq.' + u.id);
  return p[0] && p[0].role === 'admin' ? { id: u.id, email: u.email } : null;
}
async function cronKeyOk(k: unknown): Promise<boolean> {
  const r = await rows('/floodline_private_assets?select=body&name=eq.autoquote-cron');
  const want = r[0] ? String(r[0].body || '') : '', got = String(k || '');
  if (want.length < 32 || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}

async function notifyAdmin(title: string, body: string, c: Record<string, string>, url: string) {
  try {
    webpush.setVapidDetails(c.vapid_subject || 'mailto:admin@example.com', c.vapid_public, c.vapid_private);
    const admins = await rows('/profiles?select=id&role=eq.admin');
    const ids = admins.map((a: { id: string }) => a.id);
    if (!ids.length) return;
    const subs = await rows('/push_subs?select=id,sub&user_id=in.(' + ids.join(',') + ')');
    for (const s of subs) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title, body, tag: 'aq-' + Date.now(), url }), { TTL: 86400 }); } catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db('/push_subs?id=eq.' + s.id, { method: 'DELETE' }); } }
  } catch (e) { console.error('push failed', String(e)); }
}
/** Same relay as the quote form: the admin receives the table, the client receives the auto-response text. */
async function mail(subject: string, fields: Record<string, unknown>, clientEmail: string, clientText: string, c: Record<string, string>) {
  try {
    const notify = await rows('/private_settings?select=value&key=eq.notify');
    const to = notify[0] && notify[0].value && notify[0].value.email, site = c.site_url || c.floodline_url;
    if (!to || !site) return false;
    const origin = new URL(site).origin;
    const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
      method: 'POST', signal: AbortSignal.timeout(25000), headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin, Referer: origin + '/' },
      body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...(clientEmail ? { email: clientEmail, _replyto: clientEmail, _autoresponse: clientText } : {}), ...fields }),
    });
    if (!r.ok) console.error('formsubmit', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) { console.error('e-mail failed', String(e)); return false; }
}
const reqOf = (q: Quote) => ({ purpose: q.purpose, survey: q.survey, size_ha: q.size_ha, return_periods: q.return_periods, deadline: q.deadline, lat: q.lat, lon: q.lon, page: q.page, screening: q.screening });
const where = (q: Quote) => q.site_description || q.address || (q.lat !== null && q.lon !== null ? q.lat.toFixed(5) + ', ' + q.lon.toFixed(5) : '-');

type Inv = { id: string; ref: string; token: string };
type Result = ReturnType<typeof priceRequest> & Record<string, unknown>;
const MAX_MAIL_TRIES = 12;   // retried for about 6 hours: 5, 10, 15 … 60 minutes apart
/** The quotation e-mail: the client receives the text, the admin receives the table. */
async function composeMail(q: Quote, result: Result, inv: Inv, m: typeof DEFAULT_MATRIX, c: Record<string, string>, byHand: boolean) {
  const site = siteFor(q, c), link = site + 'pay.html?i=' + inv.ref + '&t=' + inv.token;
  const text = quoteText(result, { name: q.full_name, ref: q.ref, link, bank: await bankText(), invoice: inv.ref, phone: (m.contact || {}).phone || '' });
  const fields: Record<string, unknown> = {
    Quotation: q.ref, Client: q.full_name + (q.company ? ' (' + q.company + ')' : ''), email: q.email, Phone: q.phone, Site: where(q), Purpose: q.purpose,
    Service: result.service!.name, ...Object.fromEntries(result.lines.map((l, i) => [`Line ${i + 1}`, `${l.label}${l.note ? ' (' + l.note + ')' : ''}: ${rand(l.amount)}`])),
    Total: rand(result.total), [result.deposit_pct >= 100 ? 'Payable' : 'Deposit']: rand(result.deposit), Invoice: inv.ref, 'Payment link': link,
    Sent: byHand ? 'By hand from the pricing page' : 'Automatically, ' + m.auto.delay_minutes + ' minutes after the request',
  };
  return { subject: `Flood line quotation ${q.ref} - ${rand(result.total)} - Adventuity`, fields, text, site };
}

/** Create the deposit invoice and e-mail the quotation. Returns the stored auto_quote. */
async function sendQuote(q: Quote, result: Result, m: typeof DEFAULT_MATRIX, c: Record<string, string>, by: string | null) {
  const what = result.deposit_pct >= 100 ? 'payment in full' : result.deposit_pct + '% deposit';
  const ins = await db('/floodline_invoices', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ quote_id: q.id, description: `${result.service!.name} - ${what} (quotation ${q.ref})`, amount_cents: Math.round(result.deposit * 100), client_name: q.full_name, client_email: q.email, created_by: by }) });
  if (!ins.ok) throw new Error('invoice insert ' + ins.status + ' ' + (await ins.text()).slice(0, 200));
  const inv = (await ins.json())[0] as Inv;
  const mm = await composeMail(q, result, inv, m, c, !!by);
  const emailed = await mail(mm.subject, mm.fields, q.email, mm.text, c);
  const stored = { ...result, invoice_ref: inv.ref, emailed, mail_attempts: 1, last_mail_at: new Date().toISOString(), sent_by: by ? 'admin' : 'auto' };
  await db('/floodline_quotes?id=eq.' + q.id, { method: 'PATCH', body: JSON.stringify({ auto_status: 'sent', auto_quote: stored, quoted_at: new Date().toISOString(), invoice_id: inv.id, status: q.status === 'new' || q.status === 'contacted' ? 'quoted' : q.status }) });
  await notifyAdmin(`Quotation ${emailed ? 'sent' : 'saved'} ${rand(result.total)}`, `${q.ref} · ${q.full_name} · ${result.service!.name}${emailed ? '' : ' · e-mail will be retried'}`, c, mm.site + 'pricing.html#requests');
  return stored;
}

/** The e-mail relay sometimes times out: re-send the quotation a few minutes later, then hand it to the engineer. */
async function retryMail(q: Quote, m: typeof DEFAULT_MATRIX, c: Record<string, string>) {
  const a = (q.auto_quote || {}) as Result;
  const tries = Number(a.mail_attempts || 1), last = new Date(String(a.last_mail_at || q.quoted_at || 0)).getTime();
  if (tries >= MAX_MAIL_TRIES || Date.now() - last < Math.min(tries * 5, 60) * 60e3) return 'later';
  const inv = (await rows('/floodline_invoices?select=id,ref,token&id=eq.' + q.invoice_id))[0] as Inv | undefined;
  if (!inv || !a.service) return 'no-invoice';
  const mm = await composeMail(q, a, inv, m, c, a.sent_by === 'admin');
  const ok = await mail(mm.subject, mm.fields, q.email, mm.text, c);
  const next = { ...a, emailed: ok, mail_attempts: tries + 1, last_mail_at: new Date().toISOString() };
  await db('/floodline_quotes?id=eq.' + q.id, { method: 'PATCH', body: JSON.stringify({ auto_quote: next }) });
  if (ok) await notifyAdmin('Quotation e-mailed ' + rand(Number(a.total)), `${q.ref} · ${q.full_name} (after a retry)`, c, mm.site + 'pricing.html#requests');
  else if (tries + 1 >= MAX_MAIL_TRIES) await notifyAdmin('Quotation e-mail failed: ' + q.ref, `Could not e-mail ${q.full_name} (${q.email}). Send the payment link yourself from the Payments tab.`, c, mm.site + 'pricing.html#payments');
  return ok ? 'emailed' : 'failed';
}

async function processOne(q: Quote, m: typeof DEFAULT_MATRIX, c: Record<string, string>, budget: { left: number }) {
  // claim the request so two runs never quote it twice
  const claim = await db('/floodline_quotes?id=eq.' + q.id + '&auto_status=is.null', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ auto_status: 'working' }) });
  const got = await claim.json().catch(() => []);
  if (!Array.isArray(got) || !got.length) return 'taken';
  try {
    if (JUNK.test(q.email || '')) {
      await db('/floodline_quotes?id=eq.' + q.id, { method: 'PATCH', body: JSON.stringify({ auto_status: 'skipped', auto_quote: { reasons: ['Test or invalid e-mail address: no quotation sent.'] } }) });
      return 'skipped';
    }
    if (q.status !== 'new') {
      await db('/floodline_quotes?id=eq.' + q.id, { method: 'PATCH', body: JSON.stringify({ auto_status: 'skipped', auto_quote: { reasons: [`Already handled in the Studio (status "${q.status}").`] } }) });
      return 'skipped';
    }
    const result = priceRequest(reqOf(q), m, new Date().toISOString()) as Result;
    if (result.mode === 'auto' && budget.left <= 0) { result.mode = 'manual'; result.reasons.push(`More than ${m.auto.max_per_hour} quotations in the last hour (spam guard).`); }
    if (result.mode === 'manual') {
      await db('/floodline_quotes?id=eq.' + q.id, { method: 'PATCH', body: JSON.stringify({ auto_status: 'manual', auto_quote: result }) });
      const site = siteFor(q, c);
      await notifyAdmin('Quotation needed: ' + q.ref, `${q.full_name} · ${q.purpose} · ${result.reasons[0] || ''}`.slice(0, 180), c, site + 'pricing.html#requests');
      await mail(`Quotation needed ${q.ref} - ${q.full_name}`, { Reference: q.ref, Client: q.full_name + (q.company ? ' (' + q.company + ')' : ''), 'Client e-mail': q.email, Phone: q.phone, Site: where(q), Purpose: q.purpose, 'Size (ha)': q.size_ha ?? '-', 'Needed by': q.deadline || '-', 'Why not automatic': result.reasons.join(' '), 'Matrix price (for reference)': result.total ? rand(result.total) : '-', 'What to do': 'Open the Requests tab on pricing.html to send the matrix price, or send your own price from the Studio.', Pricing: site + 'pricing.html#requests' }, '', '', c);
      return 'manual';
    }
    await sendQuote(q, result, m, c, null);
    budget.left--;
    return 'sent';
  } catch (e) {
    console.error('autoquote', q.ref, String(e));
    await db('/floodline_quotes?id=eq.' + q.id, { method: 'PATCH', body: JSON.stringify({ auto_status: 'error', auto_quote: { reasons: ['Could not send automatically: ' + String((e as Error).message || e).slice(0, 200)] } }) });
    return 'error';
  }
}

function sanitizeRequest(r: Record<string, unknown>) {
  return {
    purpose: clean(r.purpose, 80), survey: clean(r.survey, 80), size_ha: r.size_ha === '' || r.size_ha === null || r.size_ha === undefined ? null : Number(r.size_ha),
    return_periods: Array.isArray(r.return_periods) ? r.return_periods.map((x) => clean(x, 6)) : [], deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(r.deadline || '')) ? String(r.deadline) : null,
    lat: r.lat === '' || r.lat === null || r.lat === undefined ? null : Number(r.lat), lon: r.lon === '' || r.lon === null || r.lon === undefined ? null : Number(r.lon),
    page: clean(r.page, 200), screening: r.catchment_km2 ? { catchment_km2: Number(r.catchment_km2) } : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  let f: Record<string, unknown> = {}; try { f = await req.json(); } catch (_) { return json({ error: 'Bad request' }, 400); }
  const action = String(f.action || '');
  try {
    // ---- scheduler
    if (action === 'run') {
      if (!(await cronKeyOk(f.key))) return json({ error: 'Not allowed' }, 401);
      const { matrix: m } = await loadMatrix();
      if (!m.auto.enabled) return json({ ok: true, off: true });
      const since = m.auto.since || new Date().toISOString();
      const due = new Date(Date.now() - m.auto.delay_minutes * 60e3).toISOString();
      const list: Quote[] = await rows('/floodline_quotes?select=*&auto_status=is.null&created_at=gte.' + encodeURIComponent(since) + '&created_at=lte.' + encodeURIComponent(due) + '&order=created_at.asc&limit=8');
      const retry: Quote[] = await rows('/floodline_quotes?select=*&auto_status=eq.sent&auto_quote->>emailed=eq.false&quoted_at=gte.' + encodeURIComponent(new Date(Date.now() - 12 * 3600e3).toISOString()) + '&limit=5');
      if (!list.length && !retry.length) return json({ ok: true, due: 0 });
      const c = await cfg(), out: Record<string, string> = {};
      if (list.length) {
        const hour = await rows('/floodline_quotes?select=id&auto_status=eq.sent&quoted_at=gte.' + encodeURIComponent(new Date(Date.now() - 3600e3).toISOString()));
        const budget = { left: m.auto.max_per_hour - hour.length };
        for (const q of list) out[q.ref] = await processOne(q, m, c, budget);
      }
      for (const q of retry) out[q.ref + ' e-mail'] = await retryMail(q, m, c);
      return json({ ok: true, done: out });
    }

    // ---- administrator
    const me = await adminUser(req);
    if (!me) return json({ error: 'Sign in with an Adventuity administrator account.' }, 401);
    if (action === 'get') {
      const { matrix, updated_at } = await loadMatrix();
      return json({ matrix, defaults: DEFAULT_MATRIX, updated_at, kinds: KEY_KINDS });
    }
    if (action === 'save') {
      const incoming = withDefaults(f.matrix);
      const problems = validateMatrix(incoming);
      if (problems.length) return json({ error: problems.join(' '), problems }, 400);
      const { matrix: old } = await loadMatrix();
      // switching automatic quotes on starts from now: requests that came in while they were off stay with the engineer
      incoming.auto.since = incoming.auto.enabled ? (old.auto.enabled && old.auto.since ? old.auto.since : new Date().toISOString()) : old.auto.since;
      const up = await db('/floodline_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ key: 'pricing', value: incoming, updated_at: new Date().toISOString(), updated_by: me.id }) });
      if (!up.ok) return json({ error: 'Could not save the matrix.' }, 500);
      return json({ ok: true, matrix: incoming, updated_at: new Date().toISOString() });
    }
    if (action === 'preview') {
      const m = f.matrix ? withDefaults(f.matrix) : (await loadMatrix()).matrix;
      let request: Record<string, unknown>;
      if (typeof f.quote_id === 'string' && /^[0-9a-f-]{36}$/.test(f.quote_id)) { const q = (await rows('/floodline_quotes?select=*&id=eq.' + f.quote_id))[0]; if (!q) return json({ error: 'Request not found.' }, 404); request = reqOf(q); }
      else request = sanitizeRequest((f.request || {}) as Record<string, unknown>);
      const result = priceRequest(request, m, new Date().toISOString());
      const text = result.service ? quoteText(result, { name: 'Client Name', ref: 'F-XXXXXX', link: siteFor({ page: String(request.page || '') } as Quote, await cfg()) + 'pay.html?i=INV-XXXXXX&t=…', bank: await bankText(), invoice: 'INV-XXXXXX', phone: (m.contact || {}).phone || '' }) : '';
      return json({ result, text, problems: validateMatrix(m) });
    }
    if (action === 'list') {
      const [quotes, invoices] = await Promise.all([
        rows('/floodline_quotes?select=id,ref,created_at,full_name,company,email,phone,purpose,size_ha,survey,deadline,site_description,address,status,auto_status,auto_quote,quoted_at,invoice_id&order=created_at.desc&limit=40'),
        rows('/floodline_invoices?select=id,ref,created_at,description,amount_cents,client_name,client_email,status,paid_at,method,eft_at,eft_note,token,quote_id&order=created_at.desc&limit=40'),
      ]);
      const c = await cfg(), base = (c.floodline_url || 'https://www.adventuity.co.za/').replace(/\/?$/, '/');
      return json({ quotes, invoices: invoices.map((i: Record<string, unknown>) => ({ ...i, token: undefined, link: base + 'pay.html?i=' + i.ref + '&t=' + i.token })) });
    }
    if (action === 'send') {
      const id = String(f.quote_id || ''); if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request' }, 400);
      const q: Quote = (await rows('/floodline_quotes?select=*&id=eq.' + id))[0]; if (!q) return json({ error: 'Request not found.' }, 404);
      if (q.auto_status === 'sent' && !f.again) return json({ error: 'A quotation was already sent for this request.' }, 409);
      if (JUNK.test(q.email || '')) return json({ error: 'This request has a test or invalid e-mail address.' }, 400);
      const { matrix: m } = await loadMatrix();
      const result = priceRequest(reqOf(q), m, new Date().toISOString()) as Result;
      if (!result.service || !result.total) return json({ error: 'The matrix cannot price this request (' + (result.reasons[0] || 'no service') + '). Send your own price from the Studio.' }, 400);
      if (result.mode === 'manual' && !f.force) return json({ error: result.reasons.join(' '), needs_force: true }, 409);
      result.mode = 'auto';
      const stored = await sendQuote(q, result, m, await cfg(), me.id);
      return json({ ok: true, quote: stored });
    }
    if (action === 'dismiss') {
      const id = String(f.quote_id || ''); if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Bad request' }, 400);
      await db('/floodline_quotes?id=eq.' + id + '&auto_status=neq.sent', { method: 'PATCH', body: JSON.stringify({ auto_status: 'dismissed' }) });
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong - please try again in a minute.' }, 500);
  }
});
