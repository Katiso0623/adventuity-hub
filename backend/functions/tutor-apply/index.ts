// Public tutor application: validates the form, stores the CV privately, saves the application,
// alerts the tutor (push + e-mail) and sends the applicant a confirmation e-mail.
// POST multipart/form-data (from tutor-apply.html) or JSON with cv_base64/cv_name/cv_type (for tests).
// Public on purpose (verify_jwt off): applicants have no account. Abuse limits are enforced below.
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

const SUBJECTS: Record<string, string> = { maths: 'Mathematics', phys: 'Physics', chem: 'Chemistry', lifesci: 'Life Sciences', other: 'Other' };
const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
const TYPES: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const MAX = 5 * 1024 * 1024;
const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use the form on the website to apply.' }, 405);
  try {
    // ---- read the form
    let f: Record<string, unknown> = {}; let subjects: string[] = []; let grades: string[] = [];
    let file: { name: string; type: string; bytes: Uint8Array } | null = null;
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) if (typeof v === 'string' && k !== 'subjects' && k !== 'grades') f[k] = v;
      subjects = fd.getAll('subjects').map(String); grades = fd.getAll('grades').map(String);
      const cv = fd.get('cv');
      if (cv && typeof cv !== 'string') file = { name: cv.name || 'cv', type: cv.type || '', bytes: new Uint8Array(await cv.arrayBuffer()) };
    } else {
      const b = await req.json(); f = b; subjects = Array.isArray(b.subjects) ? b.subjects.map(String) : []; grades = Array.isArray(b.grades) ? b.grades.map(String) : [];
      if (b.cv_base64) file = { name: String(b.cv_name || 'cv.pdf'), type: String(b.cv_type || ''), bytes: Uint8Array.from(atob(String(b.cv_base64)), (c) => c.charCodeAt(0)) };
    }
    if (f.website) return json({ ok: true, ref: 'T-' + crypto.randomUUID().slice(0, 6).toUpperCase() });   // honeypot: quietly ignore bots
    const started = Number(f.started_at || 0);
    if (started && Date.now() - started < 4000) return json({ error: 'That was very quick – please check your details and send the form again.' }, 400);

    // ---- validate (mirrors the checks in the browser)
    const full_name = clean(f.full_name, 120), email = clean(f.email, 200).toLowerCase(), phone = clean(f.phone, 30);
    const qualification = clean(f.qualification, 200), about = clean(f.about, 1500);
    const province = PROVINCES.includes(clean(f.province, 40)) ? clean(f.province, 40) : '';
    const mode = ['online', 'in_person', 'both'].includes(String(f.mode)) ? String(f.mode) : 'online';
    const exp = f.experience_years === undefined || f.experience_years === '' ? 0 : Number(f.experience_years);
    subjects = [...new Set(subjects.filter((s) => SUBJECTS[s]))]; grades = [...new Set(grades.filter((g) => ['10', '11', '12'].includes(g)))];
    if (full_name.length < 2) return json({ error: 'Please enter your name and surname.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Please enter a valid e-mail address.' }, 400);
    if (phone.replace(/\D/g, '').length < 9) return json({ error: 'Please enter a phone number we can reach you on (WhatsApp).' }, 400);
    if (!subjects.length) return json({ error: 'Please tick at least one subject you can teach.' }, 400);
    if (qualification.length < 2) return json({ error: 'Please tell us your qualification or what you are studying.' }, 400);
    if (!Number.isInteger(exp) || exp < 0 || exp > 50) return json({ error: 'Years of experience must be a whole number from 0 to 50.' }, 400);
    if (String(f.about || '').length > 1500) return json({ error: 'Please keep "About you" to 1 500 characters.' }, 400);
    if (String(f.consent) !== 'yes') return json({ error: 'Please tick the consent box so we may store your application.' }, 400);
    if (!file || !file.bytes.length) return json({ error: 'Please attach your CV (PDF or Word).' }, 400);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!TYPES[ext]) return json({ error: 'Your CV must be a PDF or Word file (.pdf, .doc or .docx).' }, 400);
    if (file.bytes.length > MAX) return json({ error: 'Your CV is larger than 5 MB – please send a smaller file.' }, 400);
    const magic = Array.from(file.bytes.slice(0, 4), (x) => x.toString(16).padStart(2, '0')).join('');
    const okMagic = ext === 'pdf' ? magic === '25504446' : ext === 'docx' ? magic === '504b0304' : magic === 'd0cf11e0';
    if (!okMagic) return json({ error: 'That file does not look like a real ' + ext.toUpperCase() + ' document – please export your CV again and attach it.' }, 400);

    // ---- abuse limits: 3 per e-mail per day, 6 per network per hour
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const ip_hash = ip ? await sha(ip + '|' + URL_) : null;
    const since = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
    const byEmail = await (await admin('/rest/v1/tutor_applications?select=id&email=eq.' + encodeURIComponent(email) + '&created_at=gte.' + since(24))).json();
    if (Array.isArray(byEmail) && byEmail.length >= 3) return json({ error: 'We already have your application – we will be in touch.' }, 429);
    if (ip_hash) { const byIp = await (await admin('/rest/v1/tutor_applications?select=id&ip_hash=eq.' + ip_hash + '&created_at=gte.' + since(1))).json(); if (Array.isArray(byIp) && byIp.length >= 6) return json({ error: 'Too many applications from this network – please try again later.' }, 429); }

    // ---- store the CV privately, then the application
    const month = new Date().toISOString().slice(0, 7);
    const path = month + '/' + crypto.randomUUID() + '.' + ext;
    const up = await fetch(URL_ + '/storage/v1/object/cvs/' + path, { method: 'POST', headers: SH({ 'Content-Type': TYPES[ext] }), body: new Blob([file.bytes as BlobPart], { type: TYPES[ext] }) });
    if (!up.ok) { console.error('cv upload failed', up.status, await up.text()); return json({ error: 'We could not save your CV – please try again in a minute.' }, 500); }
    const row = {
      full_name, email, phone, province, town: clean(f.town, 80), subjects, grades, qualification, institution: clean(f.institution, 160),
      experience_years: exp, mode, availability: clean(f.availability, 300), about, referral: clean(f.referral, 160),
      cv_path: path, cv_name: clean(file.name, 160), cv_size: file.bytes.length, ip_hash,
    };
    const ins = await admin('/rest/v1/tutor_applications', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!ins.ok) { console.error('insert failed', ins.status, await ins.text()); await fetch(URL_ + '/storage/v1/object/cvs/' + path, { method: 'DELETE', headers: SH() }); return json({ error: 'We could not save your application – please try again in a minute.' }, 500); }
    const saved = (await ins.json())[0];

    // ---- tell the tutor (push to every device + e-mail) and confirm to the applicant; failures here do not fail the application
    const cfgRows = await (await admin('/rest/v1/app_config?select=key,value&key=in.(vapid_public,vapid_private,vapid_subject,site_url)')).json();
    const cfg: Record<string, string> = Object.fromEntries(cfgRows.map((r: { key: string; value: string }) => [r.key, r.value]));
    const site = cfg.site_url || '';
    const subjText = subjects.map((s) => SUBJECTS[s]).join(', ');
    try {
      webpush.setVapidDetails(cfg.vapid_subject || 'mailto:tutor@example.com', cfg.vapid_public, cfg.vapid_private);
      const admins = await (await admin('/rest/v1/profiles?select=id&role=eq.admin')).json();
      const ids = admins.map((a: { id: string }) => a.id);
      if (ids.length) {
        const subs = await (await admin('/rest/v1/push_subs?select=id,sub&user_id=in.(' + ids.join(',') + ')')).json();
        for (const s of subs) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title: 'New tutor application', body: full_name + ' – ' + subjText, tag: 'tutor-' + saved.ref, url: site + 'portal.html#tutors' }), { TTL: 86400 }); } catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin('/rest/v1/push_subs?id=eq.' + s.id, { method: 'DELETE' }); } }
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
            _subject: 'New tutor application ' + saved.ref + ' – ' + full_name, _template: 'table', _captcha: 'false', _replyto: email,
            _autoresponse: 'Hi ' + full_name.split(' ')[0] + ', thank you for applying to tutor with Adventuity (reference ' + saved.ref + '). We review every application and usually reply within a week. If you would like your application and CV deleted, simply reply to this e-mail.',
            Reference: saved.ref, Name: full_name, email, Phone: phone, Subjects: subjText, Grades: grades.join(', ') || '-', Qualification: qualification,
            Experience: exp + ' years', Mode: mode.replace('_', ' '), Province: province || '-', 'Open in the portal': site + 'portal.html#tutors',
          }),
        });
      }
    } catch (e) { console.error('e-mail failed', String(e)); }
    return json({ ok: true, ref: saved.ref });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong – please try again in a minute.' }, 500);
  }
});
