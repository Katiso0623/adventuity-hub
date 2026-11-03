// Public flood line quote request: validates the form, saves the request, alerts the admin (push + e-mail)
// and sends the client a confirmation. POST JSON from the Adventuity Floodline website.
// The quotation itself is sent by floodline-autoquote a few minutes later (pricing.html sets the delay).
// Public on purpose (verify_jwt off): visitors have no account. Abuse limits are enforced below.
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
const admin = (path: string, init: RequestInit = {}) => fetch(URL_ + path, { ...init, headers: SH({ 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) }) });
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const PURPOSES = ['Township establishment (NWA s144)', 'Building plan or site development plan', 'Mining or industrial (GN 704)', 'Environmental or water use application', 'Property purchase or insurance', 'Stormwater, culvert or bridge design', 'Development or subdivision approval', 'Mining or industrial site', 'Environmental or water permit', 'Bank, lender or investor requirement', 'Other'];
const RPS = ['1:20', '1:50', '1:100', '1:200', 'RMF'];
// reserved test domains can never receive a quotation: accept quietly and store nothing (form robots use them)
const JUNK = /@(.+\.)?(example\.(com|net|org)|example|test|invalid|localhost)$/i;
async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }
const fakeRef = () => 'F-' + crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use the form on the website to request a quote.' }, 405);
  try {
    const f = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (f.website) return json({ ok: true, ref: fakeRef() }); // honeypot: quietly ignore bots
    const started = Number(f.started_at || 0);
    if (started && Date.now() - started < 4000) return json({ error: 'That was very quick - please check your details and send the form again.' }, 400);

    const full_name = clean(f.full_name, 120), email = clean(f.email, 200).toLowerCase(), phone = clean(f.phone, 30);
    const site_description = clean(f.site_description, 300), address = clean(f.address, 300), notes = clean(f.notes, 2000);
    const purpose = PURPOSES.includes(clean(f.purpose, 80)) ? clean(f.purpose, 80) : '';
    const lat = f.lat === null || f.lat === undefined || f.lat === '' ? null : Number(f.lat), lon = f.lon === null || f.lon === undefined || f.lon === '' ? null : Number(f.lon);
    const size = f.size_ha === null || f.size_ha === undefined || f.size_ha === '' ? null : Number(f.size_ha);
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(f.deadline || '')) ? String(f.deadline) : null;
    const rps = Array.isArray(f.return_periods) ? [...new Set(f.return_periods.map(String).filter((r) => RPS.includes(r)))] : [];
    if (full_name.length < 2) return json({ error: 'Please enter your name.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Please enter a valid e-mail address.' }, 400);
    if (phone.replace(/\D/g, '').length < 9) return json({ error: 'Please enter a phone number we can reach you on.' }, 400);
    if (!site_description && !address && lat === null) return json({ error: 'Please tell us where the site is (erf, address or coordinates).' }, 400);
    if (!purpose) return json({ error: 'Please choose what the flood line is for.' }, 400);
    if (lat !== null && !(lat >= -90 && lat <= 90 && lon !== null && lon >= -180 && lon <= 180)) return json({ error: 'The coordinates are not valid.' }, 400);
    if (size !== null && !(size >= 0 && size < 1e6)) return json({ error: 'Please check the property size.' }, 400);
    if (String(f.consent) !== 'yes') return json({ error: 'Please tick the consent box so we may store your request.' }, 400);
    if (JUNK.test(email)) return json({ ok: true, ref: fakeRef() });

    // abuse limits: 3 per e-mail per day, 6 per network per hour
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const ip_hash = ip ? await sha(ip + '|' + URL_) : null;
    const since = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
    const byEmail = await (await admin('/rest/v1/floodline_quotes?select=id&email=eq.' + encodeURIComponent(email) + '&created_at=gte.' + since(24))).json();
    if (Array.isArray(byEmail) && byEmail.length >= 3) return json({ error: 'We already have your request - we will be in touch.' }, 429);
    if (ip_hash) { const byIp = await (await admin('/rest/v1/floodline_quotes?select=id&ip_hash=eq.' + ip_hash + '&created_at=gte.' + since(1))).json(); if (Array.isArray(byIp) && byIp.length >= 6) return json({ error: 'Too many requests from this network - please try again later.' }, 429); }

    let screening: unknown = null; if (f.screening && typeof f.screening === 'object') screening = JSON.parse(JSON.stringify(f.screening).slice(0, 2000));
    const row = { full_name, company: clean(f.company, 160), email, phone, site_description, address, lat, lon, purpose, return_periods: rps, survey: clean(f.survey, 80), size_ha: size, deadline, referral: clean(f.referral, 80), notes, screening, page: clean(f.page, 200), ip_hash };
    const ins = await admin('/rest/v1/floodline_quotes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!ins.ok) { console.error('insert failed', ins.status, await ins.text()); return json({ error: 'We could not save your request - please try again in a minute.' }, 500); }
    const saved = (await ins.json())[0];

    // when automatic quotations are on, tell the client when to expect it
    let auto = { enabled: false, delay_minutes: 10 };
    try { const s = await (await admin('/rest/v1/floodline_settings?select=value&key=eq.pricing')).json(); if (s[0] && s[0].value && s[0].value.auto) auto = { enabled: s[0].value.auto.enabled !== false, delay_minutes: Number(s[0].value.auto.delay_minutes) || 10 }; } catch (_) { /* settings unavailable */ }
    const promise = auto.enabled
      ? 'Your quotation will follow by e-mail in about ' + auto.delay_minutes + ' minutes (please check your spam folder). Large or unusual sites are quoted by our engineer within one working day.'
      : 'We will reply with a quotation shortly.';

    // notify the admin (push to every device + e-mail) and confirm to the client; failures here do not fail the request
    const cfgRows = await (await admin('/rest/v1/app_config?select=key,value&key=in.(vapid_public,vapid_private,vapid_subject,site_url,floodline_url)')).json();
    const cfg: Record<string, string> = Object.fromEntries(cfgRows.map((r: { key: string; value: string }) => [r.key, r.value]));
    const site = cfg.site_url || '', studio = cfg.floodline_url ? cfg.floodline_url.replace(/\/?$/, '/') + 'studio.html' : '';
    const where = site_description || address || (lat !== null ? lat.toFixed(5) + ', ' + (lon as number).toFixed(5) : '');
    try {
      webpush.setVapidDetails(cfg.vapid_subject || 'mailto:admin@example.com', cfg.vapid_public, cfg.vapid_private);
      const admins = await (await admin('/rest/v1/profiles?select=id&role=eq.admin')).json();
      const ids = admins.map((a: { id: string }) => a.id);
      if (ids.length) {
        const subs = await (await admin('/rest/v1/push_subs?select=id,sub&user_id=in.(' + ids.join(',') + ')')).json();
        for (const s of subs) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title: 'New flood line request', body: full_name + ' - ' + purpose, tag: 'flood-' + saved.ref, url: studio || site }), { TTL: 86400 }); } catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin('/rest/v1/push_subs?id=eq.' + s.id, { method: 'DELETE' }); } }
      }
    } catch (e) { console.error('push failed', String(e)); }
    try {
      const notify = await (await admin('/rest/v1/private_settings?select=value&key=eq.notify')).json();
      const to = notify[0] && notify[0].value && notify[0].value.email;
      if (to && site) {
        const origin = new URL(site).origin;
        await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin, Referer: origin + '/' },
          body: JSON.stringify({
            _subject: 'New flood line request ' + saved.ref + ' - ' + full_name, _template: 'table', _captcha: 'false', _replyto: email,
            _autoresponse: 'Hi ' + full_name.split(' ')[0] + ', thank you for your flood line enquiry with Adventuity (reference ' + saved.ref + '). ' + promise + ' If you would like your details deleted, simply reply to this e-mail.',
            Reference: saved.ref, Name: full_name, Company: row.company || '-', email, Phone: phone, Site: where, Coordinates: lat !== null ? lat + ', ' + lon : '-',
            Purpose: purpose, 'Flood lines': rps.join(', ') || '-', Survey: row.survey || '-', 'Size (ha)': size ?? '-', 'Needed by': deadline || '-', Notes: notes || '-',
            Quotation: auto.enabled ? 'Sent automatically in about ' + auto.delay_minutes + ' minutes unless the request needs your review' : 'Automatic quotations are off: send it from the Studio', 'Open the Studio': studio || '-',
          }),
        });
      }
    } catch (e) { console.error('e-mail failed', String(e)); }
    return json({ ok: true, ref: saved.ref, auto: auto.enabled ? auto.delay_minutes : null });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong - please try again in a minute.' }, 500);
  }
});
