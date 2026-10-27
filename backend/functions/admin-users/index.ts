// Admin-only account tools.
// POST { action: 'reset_password', user_id, password } | { action: 'delete', user_id }
//      { action: 'create_account', role: 'tutor' | 'learner', email, password, full_name, phone,
//        tutor: meet_link, tutor_rate, tutor_subjects · learner: school, grade, approved }   → a login with a temporary password
// verify_jwt is off because the project uses publishable keys; the caller is checked below (must be the admin).
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const flagPasswordChange = (id: string) => fetch(URL_ + '/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify({ must_change_password: true }) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const me = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: SECRET, Authorization: req.headers.get('Authorization') || '' } });
  if (!me.ok) return json({ error: 'Sign in first' }, 401);
  const user = await me.json();
  const prof = await (await fetch(URL_ + '/rest/v1/profiles?select=role,blocked&id=eq.' + user.id, { headers: H })).json();
  if (!prof[0] || prof[0].role !== 'admin' || prof[0].blocked) return json({ error: 'Only the administrator can do this' }, 403);
  const b = await req.json();

  if (b.action === 'create_account') {
    const role = b.role === 'tutor' ? 'tutor' : 'learner';
    const email = String(b.email || '').trim().toLowerCase();
    const full_name = String(b.full_name || '').trim().slice(0, 120);
    const phone = String(b.phone || '').trim().slice(0, 30);
    const password = String(b.password || '');
    const meet_link = String(b.meet_link || '').trim().slice(0, 400);
    const tutor_rate = Math.max(0, Math.min(5000, Number(b.tutor_rate) || 0));
    const tutor_subjects = String(b.tutor_subjects || '').split(',').filter((s) => ['maths', 'phys', 'chem', 'life'].includes(s)).join(',');
    const school = String(b.school || '').trim().slice(0, 120);
    const grade = [10, 11, 12].includes(Number(b.grade)) ? Number(b.grade) : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ error: 'Enter a valid e-mail address' }, 400);
    if (full_name.length < 2) return json({ error: 'Enter the name and surname' }, 400);
    if (password.length < 8) return json({ error: 'Use a temporary password of at least 8 characters' }, 400);
    if (meet_link && !/^https:\/\/\S{6,}$/.test(meet_link)) return json({ error: 'The meeting link must start with https://' }, 400);
    const r = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name, phone, school, ...(grade ? { grade: String(grade) } : {}) } }) });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 422 || /already|exists|registered/i.test(t)) return json({ error: role === 'tutor' ? 'That e-mail already has an account. Use another e-mail, or make that account a tutor from the Learners page.' : 'That e-mail already has an account – find the learner under Learners.' }, 409);
      console.error('create user failed', r.status, t);
      return json({ error: 'Could not create the account' }, 500);
    }
    const u = await r.json(); const id = u.id || (u.user && u.user.id);
    if (!UUID.test(String(id || ''))) return json({ error: 'Account created, but its id was not returned – refresh the page' }, 500);
    // the sign-up trigger made a learner profile: set it up (the service key may change role and approval)
    const patch = role === 'tutor' ? { role, approved: true, must_change_password: true, full_name, phone, meet_link, tutor_rate, tutor_subjects } : { approved: b.approved !== false, must_change_password: true, full_name, phone, school, grade };
    const p = await fetch(URL_ + '/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', headers: SH({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(patch) });
    const rows = p.ok ? await p.json() : [];
    if (!rows[0]) return json({ error: 'Account created, but its profile could not be set up – refresh and check the Learners page' }, 500);
    return json({ ok: true, user_id: id, profile: rows[0] });
  }

  if (!UUID.test(String(b.user_id || ''))) return json({ error: 'Choose an account' }, 400);
  if (b.user_id === user.id) return json({ error: 'Use Account to change your own password' }, 400);
  if (b.action === 'reset_password') {
    if (String(b.password || '').length < 8) return json({ error: 'Use at least 8 characters' }, 400);
    const r = await fetch(URL_ + '/auth/v1/admin/users/' + b.user_id, { method: 'PUT', headers: H, body: JSON.stringify({ password: b.password }) });
    if (!r.ok) return json({ error: 'Could not reset the password' }, 500);
    await flagPasswordChange(b.user_id);   // they choose their own password at the next sign-in
    return json({ ok: true });
  }
  if (b.action === 'delete') {
    const r = await fetch(URL_ + '/auth/v1/admin/users/' + b.user_id, { method: 'DELETE', headers: H });
    return r.ok ? json({ ok: true }) : json({ error: 'Could not delete the account' }, 500);
  }
  return json({ error: 'Unknown action' }, 400);
});
