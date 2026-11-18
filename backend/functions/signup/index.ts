// Creates a learner account (already confirmed, so no confirmation e-mail is needed).
// POST { email, password, full_name, phone, school, grade, guardian_phone, website(honeypot) }
// Public on purpose (verify_jwt off): new learners have no session yet. Input is validated here.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SECRET: string = (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); if (k.default) return k.default; } catch (_) { /* fall back */ } return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; })();
// new sb_secret_ keys go on the apikey header only; legacy service_role JWTs also as Bearer
const SH = (extra: Record<string, string> = {}): Record<string, string> => (SECRET.startsWith('sb_') ? { apikey: SECRET, ...extra } : { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// reserved test domains (example.com, .test, .invalid, localhost) belong to no real person: robots use them
const JUNK = /@(.+\.)?(example\.(com|net|org)|example|test|invalid|localhost)$/i;
const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
// networks blocked by the administrator: app_config 'signup_blocked_ips', separated by commas or spaces; '46.62.*' blocks a range
const isBlocked = (ip: string, list: string) => !!ip && list.split(/[\s,;]+/).filter(Boolean).some((b) => (b.endsWith('*') ? ip.startsWith(b.slice(0, -1)) : ip === b));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const url = Deno.env.get('SUPABASE_URL')!;
  const cfgRows = await fetch(url + '/rest/v1/app_config?select=key,value&key=in.(admin_email,signup_blocked_ips)', { headers: SH() }).then((r) => r.json()).catch(() => []);
  const cfg: Record<string, string> = Object.fromEntries((Array.isArray(cfgRows) ? cfgRows : []).map((r: { key: string; value: unknown }) => [r.key, String(r.value ?? '')]));
  if (isBlocked(clientIp(req), cfg.signup_blocked_ips || '')) return json({ error: 'Sign-ups from this network are blocked. Contact Adventuity if this is a mistake.' }, 403);
  if (b.website) return json({ ok: true }); // honeypot filled in by a bot
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const full_name = String(b.full_name || '').trim().slice(0, 80);
  const phone = String(b.phone || '').replace(/[^\d+ ]/g, '').slice(0, 20);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid e-mail address.' }, 400);
  if (password.length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);
  if (full_name.length < 2) return json({ error: 'Enter your name and surname.' }, 400);
  if (phone.replace(/\D/g, '').length < 9) return json({ error: 'Enter a phone number (WhatsApp) so the tutor can reach you.' }, 400);
  if (JUNK.test(email)) return json({ error: 'Enter your own e-mail address.' }, 400);
  // the tutor's address is reserved for the tutor account
  if (cfg.admin_email && cfg.admin_email.toLowerCase() === email) return json({ error: 'An account with this e-mail already exists. Sign in instead.' }, 409);
  const r = await fetch(url + '/auth/v1/admin/users', {
    method: 'POST',
    headers: SH({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { full_name, phone, school: String(b.school || '').slice(0, 80), guardian_phone: String(b.guardian_phone || '').slice(0, 20), ...([10, 11, 12].includes(Number(b.grade)) ? { grade: String(Number(b.grade)) } : {}) },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (/already|registered|exists/i.test(t)) return json({ error: 'An account with this e-mail already exists. Sign in instead.' }, 409);
    console.error('signup failed', r.status, t);
    return json({ error: 'Could not create the account. Try again in a minute.' }, 500);
  }
  return json({ ok: true });
});
