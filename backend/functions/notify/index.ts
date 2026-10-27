// Sends push notifications about a booking.
// POST { booking_id, event }   event: requested | cancelled | pop | accepted | declined | paid | updated | test
// POST { event: 'message', learner_id }   a new chat message in that learner's conversation
// Learner events (requested, cancelled, pop, their own messages) notify the admin; admin events notify the learner
// and, for lessons another tutor teaches, that tutor too. A tutor's 'delivered' event notifies the admin.
// verify_jwt is off because the project uses publishable keys; the caller's session is checked below via /auth/v1/user.
import webpush from 'npm:web-push@3.6.7';

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
const admin = (path: string, init: RequestInit = {}) => fetch(URL_ + path, { ...init, headers: SH({ 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) }) });
const SUBJ: Record<string, string> = { maths: 'Mathematics', phys: 'Physics', chem: 'Chemistry', life: 'Life Sciences' };
const when = (iso: string) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') || '';
    const me = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: SECRET, Authorization: auth } });
    if (!me.ok) return json({ error: 'Sign in first' }, 401);
    const user = await me.json();
    const { booking_id, event, learner_id } = await req.json();
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    if ((booking_id && !UUID.test(booking_id)) || (learner_id && !UUID.test(learner_id))) return json({ error: 'Invalid request' }, 400);
    const cfgRows = await (await admin('/rest/v1/app_config?select=key,value&key=in.(vapid_public,vapid_private,vapid_subject,site_url)')).json();
    const cfg: Record<string, string> = Object.fromEntries(cfgRows.map((r: { key: string; value: string }) => [r.key, r.value]));
    webpush.setVapidDetails(cfg.vapid_subject || 'mailto:tutor@example.com', cfg.vapid_public, cfg.vapid_private);
    const profs = await (await admin('/rest/v1/profiles?select=id,role,full_name&id=eq.' + user.id)).json();
    const caller = profs[0]; if (!caller) return json({ error: 'No profile' }, 403);
    let recipients: string[] = []; let title = ''; let body = ''; let tag = 'booking';
    const extra: { to: string[]; title: string; body: string; url: string }[] = [];
    const site = cfg.site_url || '';
    if (event === 'test') {
      recipients = [user.id]; title = 'Notifications are on'; body = 'You will be alerted here about lessons and bookings.'; tag = 'test';
    } else if (event === 'message') {
      const isAdmin = caller.role === 'admin';
      if (!isAdmin && learner_id !== user.id) return json({ error: 'Not your conversation' }, 403);
      const last = await (await admin('/rest/v1/messages?select=body&order=created_at.desc&limit=1&learner_id=eq.' + learner_id + '&sender=eq.' + user.id)).json();
      const text = (last[0] && last[0].body) || '';
      if (isAdmin) { recipients = [learner_id]; const r = await (await admin('/rest/v1/profiles?select=role&id=eq.' + learner_id)).json(); title = r[0] && r[0].role === 'tutor' ? 'New message from Adventuity' : 'New message from your tutor'; }
      else { const admins = await (await admin('/rest/v1/profiles?select=id&role=eq.admin')).json(); recipients = admins.map((a: { id: string }) => a.id); title = 'Message from ' + (caller.full_name || 'a learner'); }
      body = text.length > 140 ? text.slice(0, 137) + '…' : text; tag = 'msg-' + learner_id;
      const subs = await (await admin('/rest/v1/push_subs?select=id,sub&user_id=in.(' + recipients.join(',') + ')')).json();
      let sent = 0;
      for (const s of subs) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title, body, tag, url: site + 'portal.html#messages' }), { TTL: 86400 }); sent++; } catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin('/rest/v1/push_subs?id=eq.' + s.id, { method: 'DELETE' }); } }
      return json({ sent, devices: subs.length });
    } else {
      const rows = await (await admin('/rest/v1/bookings?select=*,profiles!bookings_learner_id_fkey(full_name)&id=eq.' + booking_id)).json();
      const b = rows[0]; if (!b) return json({ error: 'Booking not found' }, 404);
      const isAdmin = caller.role === 'admin';
      const isItsTutor = caller.role === 'tutor' && b.tutor_id === user.id;
      if (!isAdmin && !isItsTutor && b.learner_id !== user.id) return json({ error: 'Not your booking' }, 403);
      const who = (b.profiles && b.profiles.full_name) || 'A learner';
      const what = (SUBJ[b.subject] || b.subject) + ' · ' + when(b.starts_at);
      // a lesson taught by another tutor: tell that tutor about changes too
      let tutorId = '';
      if (b.tutor_id && b.tutor_id !== user.id) {
        const t = await (await admin('/rest/v1/profiles?select=id,role&id=eq.' + b.tutor_id)).json();
        if (t[0] && t[0].role === 'tutor') tutorId = t[0].id;
      }
      if (isItsTutor) {
        if (event !== 'delivered') return json({ sent: 0 });
        const admins = await (await admin('/rest/v1/profiles?select=id&role=eq.admin')).json();
        recipients = admins.map((a: { id: string }) => a.id);
        title = 'Lesson delivered · ' + (caller.full_name || 'tutor'); body = who + ' – ' + what + (b.tutor_note ? ' – ' + String(b.tutor_note).slice(0, 100) : '');
      } else if (['requested', 'cancelled', 'pop'].includes(event)) {
        const admins = await (await admin('/rest/v1/profiles?select=id&role=eq.admin')).json();
        recipients = admins.map((a: { id: string }) => a.id);
        title = event === 'requested' ? 'New booking request' : event === 'cancelled' ? 'Booking cancelled' : 'Proof of payment uploaded';
        body = who + ' – ' + what + (event === 'requested' ? ' · R' + Number(b.fee).toFixed(2) : '');
        if (event === 'cancelled' && tutorId) extra.push({ to: [tutorId], title: 'Lesson cancelled', body: who + ' – ' + what, url: 'portal.html#tlessons' });
      } else if (isAdmin) {
        recipients = [b.learner_id];
        title = event === 'accepted' ? 'Lesson confirmed ✔' : event === 'declined' ? 'Booking not accepted' : event === 'paid' ? 'Payment received – thank you' : b.status === 'cancelled' ? 'Lesson cancelled' : 'Lesson updated';
        body = what + (b.admin_message ? ' – ' + b.admin_message : '');
        if (tutorId && ['accepted', 'updated'].includes(event)) extra.push({ to: [tutorId], title: event === 'accepted' ? 'New lesson: ' + who : b.status === 'cancelled' ? 'Lesson cancelled: ' + who : 'Lesson changed: ' + who, body: what, url: 'portal.html#tlessons' });
      }
      tag = 'booking-' + b.id;
    }
    let sent = 0;
    for (const x of extra) {
      const xs = await (await admin('/rest/v1/push_subs?select=id,sub&user_id=in.(' + x.to.join(',') + ')')).json();
      for (const s of xs) { try { await webpush.sendNotification(s.sub, JSON.stringify({ title: x.title, body: x.body, tag, url: site + x.url }), { TTL: 86400 }); sent++; } catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await admin('/rest/v1/push_subs?id=eq.' + s.id, { method: 'DELETE' }); } }
    }
    if (!recipients.length) return json({ sent });
    const subs = await (await admin('/rest/v1/push_subs?select=id,sub&user_id=in.(' + recipients.join(',') + ')')).json();
    for (const s of subs) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ title, body, tag, url: site + 'portal.html#' + (recipients.length && caller.role !== 'admin' ? 'dash' : 'lessons') }), { TTL: 86400 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin('/rest/v1/push_subs?id=eq.' + s.id, { method: 'DELETE' });
        else console.error('push failed', code, String(e));
      }
    }
    return json({ sent, devices: subs.length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
