// Creates a learner account (already confirmed, so no confirmation e-mail is needed).
// POST { email, password, full_name, phone, school, guardian_phone, website(honeypot) }
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let b: Record<string, string> = {};
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  if (b.website) return json({ ok: true }); // honeypot filled in by a bot
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const full_name = String(b.full_name || '').trim().slice(0, 80);
  const phone = String(b.phone || '').replace(/[^\d+ ]/g, '').slice(0, 20);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid e-mail address.' }, 400);
  if (password.length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);
  if (full_name.length < 2) return json({ error: 'Enter your name and surname.' }, 400);
  if (phone.replace(/\D/g, '').length < 9) return json({ error: 'Enter a phone number (WhatsApp) so the tutor can reach you.' }, 400);
  const url = Deno.env.get('SUPABASE_URL')!;
  // the tutor's address is reserved for the tutor account
  const cfg = await (await fetch(url + '/rest/v1/app_config?select=value&key=eq.admin_email', { headers: SH() })).json().catch(() => []);
  if (Array.isArray(cfg) && cfg[0] && String(cfg[0].value).toLowerCase() === email) return json({ error: 'An account with this e-mail already exists. Sign in instead.' }, 409);
  const r = await fetch(url + '/auth/v1/admin/users', {
    method: 'POST',
    headers: SH({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { full_name, phone, school: String(b.school || '').slice(0, 80), guardian_phone: String(b.guardian_phone || '').slice(0, 20) },
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
