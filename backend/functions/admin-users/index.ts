// Tutor-only account tools. POST { action: 'reset_password', user_id, password } | { action: 'delete', user_id }
// verify_jwt is off because the project uses publishable keys; the caller is checked below (must be the tutor).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const SECRET: string = (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); if (k.default) return k.default; } catch (_) { /* fall back */ } return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; })();
// new sb_secret_ keys go on the apikey header only; legacy service_role JWTs also as Bearer
const SH = (extra: Record<string, string> = {}): Record<string, string> => (SECRET.startsWith('sb_') ? { apikey: SECRET, ...extra } : { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...extra });
const H = SH({ 'Content-Type': 'application/json' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const me = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: SECRET, Authorization: req.headers.get('Authorization') || '' } });
  if (!me.ok) return json({ error: 'Sign in first' }, 401);
  const user = await me.json();
  const prof = await (await fetch(URL_ + '/rest/v1/profiles?select=role,blocked&id=eq.' + user.id, { headers: H })).json();
  if (!prof[0] || prof[0].role !== 'admin' || prof[0].blocked) return json({ error: 'Only the tutor can do this' }, 403);
  const b = await req.json();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(b.user_id || ''))) return json({ error: 'Choose a learner' }, 400);
  if (b.user_id === user.id) return json({ error: 'Use Account to change your own password' }, 400);
  if (b.action === 'reset_password') {
    if (String(b.password || '').length < 8) return json({ error: 'Use at least 8 characters' }, 400);
    const r = await fetch(URL_ + '/auth/v1/admin/users/' + b.user_id, { method: 'PUT', headers: H, body: JSON.stringify({ password: b.password }) });
    return r.ok ? json({ ok: true }) : json({ error: 'Could not reset the password' }, 500);
  }
  if (b.action === 'delete') {
    const r = await fetch(URL_ + '/auth/v1/admin/users/' + b.user_id, { method: 'DELETE', headers: H });
    return r.ok ? json({ ok: true }) : json({ error: 'Could not delete the account' }, 500);
  }
  return json({ error: 'Unknown action' }, 400);
});
