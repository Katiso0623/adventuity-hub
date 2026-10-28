// Account tools for the director (admin) and, in part, for tutors.
// POST { action: 'reset_password', user_id, password } | { action: 'delete', user_id }
//      { action: 'create_account', role: 'tutor' | 'learner', email, password, full_name, phone,
//        tutor: meet_link, tutor_rate, tutor_subjects · learner: school, grade, approved, guardian_phone }   → a login with a temporary password
// Tutors may only create learner accounts (assigned to themselves for the subjects they choose) and give a new temporary
// password to a learner they added who has not signed in and chosen their own password yet. Everything else is the director's.
// verify_jwt is off because the project uses publishable keys; the caller is checked below.
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
  const prof = await (await fetch(URL_ + '/rest/v1/profiles?select=role,blocked,approved,tutor_subjects&id=eq.' + user.id, { headers: H })).json();
  const isAdmin = !!prof[0] && prof[0].role === 'admin' && !prof[0].blocked;
  const isTutor = !!prof[0] && prof[0].role === 'tutor' && !prof[0].blocked && prof[0].approved !== false;
  if (!isAdmin && !isTutor) return json({ error: 'Only the director can do this' }, 403);
  const b = await req.json();
  if (isTutor && !['create_account', 'reset_password'].includes(b.action)) return json({ error: 'Only the director can do this' }, 403);

  if (b.action === 'create_account') {
    const role = isTutor ? 'learner' : b.role === 'tutor' ? 'tutor' : 'learner';
    const SUBJECTS = ['maths', 'phys', 'chem', 'life'];
    const mySubjects = isTutor ? String(prof[0].tutor_subjects || '').split(',').filter((x) => SUBJECTS.includes(x)) : SUBJECTS;
    if (isTutor && !mySubjects.length) return json({ error: 'The director has not set your subjects yet – ask them to' }, 403);
    const subjects = isTutor ? (Array.isArray(b.subjects) ? b.subjects : String(b.subjects || '').split(',')).map(String).filter((x) => SUBJECTS.includes(x) && mySubjects.includes(x)) : [];
    if (isTutor && !subjects.length) return json({ error: 'Choose the subject(s) you will teach this learner' }, 400);
    const addedToday = async () => {   // a tutor adds at most 15 learners a day
      const r = await fetch(URL_ + '/rest/v1/profiles?select=id&created_by=eq.' + user.id + '&created_at=gte.' + new Date(Date.now() - 864e5).toISOString(), { headers: H });
      const rows = r.ok ? await r.json() : null; return Array.isArray(rows) ? rows.length : 999;
    };
    if (isTutor && (await addedToday()) >= 15) return json({ error: 'You have added 15 learners today – ask the director to add more' }, 429);
    const email = String(b.email || '').trim().toLowerCase();
    const full_name = String(b.full_name || '').trim().slice(0, 120);
    const phone = String(b.phone || '').trim().slice(0, 30);
    const password = String(b.password || '');
    const meet_link = String(b.meet_link || '').trim().slice(0, 400);
    const tutor_rate = Math.max(0, Math.min(5000, Number(b.tutor_rate) || 0));
    const tutor_subjects = String(b.tutor_subjects || '').split(',').filter((s) => ['maths', 'phys', 'chem', 'life'].includes(s)).join(',');
    const school = String(b.school || '').trim().slice(0, 120);
    const grade = [10, 11, 12].includes(Number(b.grade)) ? Number(b.grade) : null;
    const guardian_phone = String(b.guardian_phone || '').trim().slice(0, 30);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ error: 'Enter a valid e-mail address' }, 400);
    if (full_name.length < 2) return json({ error: 'Enter the name and surname' }, 400);
    if (password.length < 8) return json({ error: 'Use a temporary password of at least 8 characters' }, 400);
    if (isTutor) {   // the director's own address can never be created by a tutor
      const cfg = await (await fetch(URL_ + '/rest/v1/app_config?select=value&key=eq.admin_email', { headers: H })).json().catch(() => []);
      if (!Array.isArray(cfg) || (cfg[0] && String(cfg[0].value).trim().toLowerCase() === email)) return json({ error: 'That e-mail already has an account – ask the director to assign this learner to you.' }, 409);
    }
    if (meet_link && !/^https:\/\/\S{6,}$/.test(meet_link)) return json({ error: 'The meeting link must start with https://' }, 400);
    const r = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name, phone, school, ...(grade ? { grade: String(grade) } : {}) } }) });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 422 || /already|exists|registered/i.test(t)) return json({ error: isTutor ? 'That e-mail already has an account – ask the director to assign this learner to you.' : role === 'tutor' ? 'That e-mail already has an account. Use another e-mail, or make that account a tutor from the Learners page.' : 'That e-mail already has an account – find the learner under Learners.' }, 409);
      console.error('create user failed', r.status, t);
      return json({ error: 'Could not create the account' }, 500);
    }
    const u = await r.json(); const id = u.id || (u.user && u.user.id);
    if (!UUID.test(String(id || ''))) return json({ error: 'Account created, but its id was not returned – refresh the page' }, 500);
    // the sign-up trigger made a learner profile: set it up (the service key may change role and approval)
    const patch = role === 'tutor' ? { role, approved: true, must_change_password: true, full_name, phone, meet_link, tutor_rate, tutor_subjects }
      : isTutor ? { role: 'learner', approved: true, must_change_password: true, full_name, phone, guardian_phone, school, grade, created_by: user.id }
      : { role: 'learner', approved: b.approved !== false, must_change_password: true, full_name, phone, guardian_phone, school, grade };
    const p = await fetch(URL_ + '/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', headers: SH({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(patch) });
    const rows = p.ok ? await p.json() : [];
    if (!rows[0]) return json({ error: 'Account created, but its profile could not be set up – refresh and check the Learners page' }, 500);
    const undo = () => fetch(URL_ + '/auth/v1/admin/users/' + id, { method: 'DELETE', headers: H });
    if (rows[0].role !== role) { await undo(); return json({ error: 'Could not create that account' }, 409); }
    if (isTutor && (await addedToday()) > 15) { await undo(); return json({ error: 'You have added 15 learners today – ask the director to add more' }, 429); }
    if (isTutor) {   // the learner is assigned to the tutor who added them; the director sets the hours
      const a = await fetch(URL_ + '/rest/v1/assignments?on_conflict=learner_id,tutor_id,subject', { method: 'POST', headers: SH({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify(subjects.map((subject) => ({ learner_id: id, tutor_id: user.id, subject, active: true }))) });
      if (!a.ok) { console.error('assign failed', a.status, await a.text()); return json({ error: 'Account created, but it could not be assigned to you – ask the director to assign the learner' }, 500); }
      return json({ ok: true, user_id: id, subjects });
    }
    return json({ ok: true, user_id: id, profile: rows[0] });
  }

  if (!UUID.test(String(b.user_id || ''))) return json({ error: 'Choose an account' }, 400);
  if (b.user_id === user.id) return json({ error: 'Use Account to change your own password' }, 400);
  if (b.action === 'reset_password') {
    if (String(b.password || '').length < 8) return json({ error: 'Use at least 8 characters' }, 400);
    if (isTutor) {   // only a learner this tutor added, still assigned to them, who has not chosen their own password yet
      const t = await (await fetch(URL_ + '/rest/v1/profiles?select=role,created_by,must_change_password&id=eq.' + b.user_id, { headers: H })).json();
      const asg = await (await fetch(URL_ + '/rest/v1/assignments?select=id&active=eq.true&learner_id=eq.' + b.user_id + '&tutor_id=eq.' + user.id, { headers: H })).json();
      if (!t[0] || t[0].role !== 'learner' || t[0].created_by !== user.id || !Array.isArray(asg) || !asg.length) return json({ error: 'Ask the director to reset this password' }, 403);
      if (!t[0].must_change_password) return json({ error: 'This learner has already signed in and chosen a password – ask the director to reset it' }, 403);
    }
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
