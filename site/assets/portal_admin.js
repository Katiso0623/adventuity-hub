/* Adventuity portal – tutor (administrator) dashboard: requests, lessons, learners, classes, money, settings. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, $$, esc, fmt, pill, ICON, state, sb, SUBJ, toast } = ADV; const CFG = ADV.cfg;
  const now = ADV.now;
  const rid = (n) => { const a = new Uint8Array(n || 8); crypto.getRandomValues(a); return Array.from(a, (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
  const portalUrl = () => location.origin + location.pathname;
  const tutorName = () => (state.settings.site && state.settings.site.tutorName) || state.profile.full_name || 'Tutor';
  const learnerOf = (b) => (b.profiles || (state.learners || []).find((l) => l.id === b.learner_id) || {});
  const tutors = ADV.tutorList = () => (state.learners || []).filter((l) => l.role === 'tutor');
  const learnersOnly = () => (state.learners || []).filter((l) => l.role === 'learner');
  const profileOf = (id) => (state.learners || []).find((l) => l.id === id) || null;
  const tutorOf = (b) => (b.tutor_id ? profileOf(b.tutor_id) : null);
  const firstName = (p) => ((p && p.full_name) || '').split(' ')[0];
  const teacher = (b) => b.tutor_id || 'me';
  const assignFor = (learnerId, subject) => (state.assign || []).find((a) => a.active && a.learner_id === learnerId && (!subject || a.subject === subject));

  /* ---------------------------------------------------------------- data */
  ADV.adminInit = async function () {
    await Promise.all([loadLearners(), loadClassRooms(), loadApps(), loadAssign()]);
    if (ADV.startPolling) ADV.startPolling();
  };
  async function loadLearners() { try { state.learners = await sb.select('profiles', { order: 'created_at.desc' }); } catch (e) { state.learners = state.learners || []; } }
  async function loadAssign() { try { state.assign = await sb.select('assignments', { order: 'created_at.asc' }); } catch (e) { state.assign = state.assign || []; } }
  ADV.loadAssign = loadAssign;
  async function loadClassRooms() { try { const r = await sb.select('class_private', {}); state.rooms = {}; r.forEach((x) => { state.rooms[x.class_id] = x; }); } catch (e) { state.rooms = {}; } }
  const reload = async () => { await ADV.loadBookings(); const y = window.scrollY; ADV.render(); window.scrollTo(0, y); };
  const upcoming = () => state.bookings.filter((b) => b.status === 'accepted' && new Date(b.ends_at) > now()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const pending = () => state.bookings.filter((b) => b.status === 'pending' && new Date(b.starts_at) > now()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  // the same teacher or the same learner twice at once
  const clashes = (b) => state.bookings.filter((x) => x.id !== b.id && x.status === 'accepted' && new Date(x.starts_at) < new Date(b.ends_at) && new Date(x.ends_at) > new Date(b.starts_at) && !(b.class_id && x.class_id === b.class_id) && (teacher(x) === teacher(b) || x.learner_id === b.learner_id));
  const monthKey = (d) => fmt.key(d).slice(0, 7);

  /* ---------------------------------------------------------------- booking cards */
  function whoLine(b) {
    const l = learnerOf(b);
    return '<div class="row" style="gap:8px"><b>' + esc(l.full_name || 'Learner') + '</b>' + (l.school ? '<span class="small muted">' + esc(l.school) + '</span>' : '') + (l.phone ? '<a class="small" href="' + esc(ADV.wa(l.phone)) + '" target="_blank" rel="noopener">WhatsApp ' + esc(l.phone) + '</a>' : '') + '<button class="chipbtn" data-action="msg-learner" data-id="' + b.learner_id + '">' + ICON.chat + ' Message</button></div>';
  }
  function tutorLine(b) {
    const t = tutorOf(b); if (!t || b.class_id) return '';
    const st = b.status === 'accepted' || b.status === 'completed' ? (b.delivered_at ? pill('good', 'Delivered ' + fmt.date(b.delivered_at)) : new Date(b.ends_at) < now() && b.status === 'accepted' ? pill('warn', 'Not logged yet') : '') : '';
    return '<p class="small row" style="gap:6px;margin-top:4px">' + ICON.user + '<span>Tutor: <b>' + esc(t.full_name || t.email) + '</b></span>' + st + '</p>';
  }
  function tutorSelect(id, sel, subject) {
    const list = tutors().filter((t) => !t.blocked);
    const can = (t) => !subject || !t.tutor_subjects || t.tutor_subjects.split(',').includes(subject);
    return '<select id="' + id + '"><option value="">Me (' + esc(firstName(state.profile) || 'admin') + ')</option>' + list.map((t) => '<option value="' + t.id + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(t.full_name || t.email) + (can(t) ? '' : ' – not their subject') + '</option>').join('') + '</select>';
  }
  const slot = (b) => fmt.date(b.starts_at) + ', ' + fmt.time(b.starts_at) + '–' + fmt.time(b.ends_at);
  function learnerMsg(l, t, subject, list) {
    return 'Hi ' + (firstName(l) || 'there') + ', your ' + SUBJ[subject].short + ' lesson' + (list.length > 1 ? 's' : '') + (t ? ' with ' + (t.full_name || 'your tutor') : '') + (list.length > 1 ? ' are' : ' is') + ' booked:\n' + list.map((b) => '• ' + slot(b)).join('\n') +
      '\n\nSign in at ' + portalUrl() + ' → My lessons → Join the lesson (it opens 15 minutes before the start). Use earphones and have a pen, paper and calculator ready.';
  }
  function tutorMsg(t, l, subject, list, room) {
    return 'Hi ' + (firstName(t) || 'there') + ', new Adventuity lesson' + (list.length > 1 ? 's' : '') + ' for you:\n' + list.map((b) => '• ' + ((l && l.full_name) || 'Learner') + ' – ' + SUBJ[subject].short + ' – ' + slot(b)).join('\n') +
      '\n\nSign in at ' + portalUrl() + ' → Today → Join the lesson. ' + (room && /meet\.google\.com/.test(room) ? 'Meet link: ' + room + ' (let the learner in when they ask to join). ' : '') + 'Open the Board in the portal and present that tab in Meet. Afterwards tap "Lesson delivered" and add a short note.';
  }
  function bookingCard(b) {
    const s = new Date(b.starts_at); const jw = ADV.joinWindow(b); const room = ADV.bookingRoom(b) || (b.class_id && state.rooms[b.class_id] && state.rooms[b.class_id].room);
    const title = b.class_id ? ((state.classes.find((c) => c.id === b.class_id) || {}).title || 'Group class') : SUBJ[b.subject].name + ' – one-on-one';
    const mins = Math.round((new Date(b.ends_at) - s) / 6e4); const cl = b.status === 'pending' ? clashes(b) : [];
    const edit = state.editB === b.id;
    let body = '<div class="row" style="gap:6px">' + ADV.statusPill(b) + pill(b.subject, SUBJ[b.subject].short) + pill('', fmt.mins(mins)) + (b.bundle_id ? pill('accent', 'From bundle') : !Number(b.fee) ? pill('', 'No fee') : b.status !== 'pending' && b.status !== 'declined' && b.status !== 'cancelled' ? (b.paid ? pill('good', 'Paid ' + fmt.rand(b.fee)) : pill('warn', 'Unpaid ' + fmt.rand(b.fee))) : pill('', fmt.rand(b.fee))) + (b.pop_path ? '<button class="chipbtn" data-action="pop-view" data-id="' + b.id + '">Proof of payment</button>' : '') + '<span class="mono small muted">Ref ' + esc(b.ref) + '</span></div>' +
      '<h3 style="margin-top:6px">' + esc(title) + '</h3><p class="small muted">' + esc(fmt.long(s)) + ' · ' + esc(fmt.time(s)) + '–' + esc(fmt.time(b.ends_at)) + (b.topics ? ' · ' + esc(ADV.topicNames(b.topics)) : '') + '</p>' + whoLine(b) +
      tutorLine(b) +
      (b.learner_note ? '<p class="tutor-msg"><b>Learner:</b> ' + esc(b.learner_note) + '</p>' : '') + (b.admin_message ? '<p class="tutor-msg"><b>You:</b> ' + esc(b.admin_message) + '</p>' : '') +
      (b.tutor_note ? '<p class="tutor-msg"><b>' + esc(firstName(tutorOf(b)) || 'Tutor') + '\'s log:</b> ' + esc(b.tutor_note) + '</p>' : '') +
      (cl.length ? '<p class="warnline">' + ICON.clock + ' Clashes with ' + cl.map((x) => esc(learnerOf(x).full_name || 'a lesson') + ' ' + fmt.time(x.starts_at) + '–' + fmt.time(x.ends_at)).join(', ') + '</p>' : '');
    if (b.status === 'pending') {
      const asg = assignFor(b.learner_id, b.subject);
      body += '<div class="decide"><div class="grid cols-3"><div class="field"><label for="msg-' + b.id + '">Message to the learner (optional)</label><input id="msg-' + b.id + '" placeholder="e.g. See you then – bring your 2024 P1"></div><div class="field"><label for="fee-' + b.id + '">Fee (R)</label><input id="fee-' + b.id + '" type="number" min="0" step="10" value="' + Number(b.fee) + '"></div>' +
        (b.class_id ? '' : '<div class="field"><label for="tu-' + b.id + '">Who teaches it</label>' + tutorSelect('tu-' + b.id, asg ? asg.tutor_id : '', b.subject) + '</div>') + '</div>' +
        (edit ? '<div class="grid cols-3"><div class="field"><label for="nd-' + b.id + '">New date</label>' + ADV.dateSelect('nd-' + b.id, fmt.key(s)) + '</div><div class="field"><label for="nt-' + b.id + '-h">New start time</label>' + ADV.timeSelect('nt-' + b.id, fmt.time(s)) + '</div><div class="field"><label for="nm-' + b.id + '">Lesson length</label>' + ADV.lengthSelect('nm-' + b.id, mins) + '</div></div>' : '') +
        '<div class="row"><button class="btn primary" data-action="b-accept" data-id="' + b.id + '">' + ICON.check + (edit ? 'Accept at the new time' : 'Accept') + '</button>' + (b.class_id ? '' : '<button class="btn" data-action="b-move" data-id="' + b.id + '">' + (edit ? 'Keep the asked time' : 'Change the time') + '</button>') + '<button class="btn ghost" data-action="b-decline" data-id="' + b.id + '">' + ICON.x + 'Decline</button></div></div>';
    } else if (b.status === 'accepted') {
      const l = learnerOf(b);
      const t = tutorOf(b);
      const waMsg = learnerMsg(l, t, b.subject, [b]);
      body += (jw.open ? '<div style="margin-top:8px">' + ADV.lessonTimer(b) + '</div>' : '') + '<div class="row" style="margin-top:10px">' + (room ? '<a class="btn join-link ' + (jw.open && !t ? 'primary' : '') + '" href="' + esc(ADV.roomUrl(room, tutorName())) + '" target="_blank" rel="noopener">' + ICON.video + (t ? 'Open the room' : 'Start lesson') + '</a>' : '') +
        (l.phone ? '<a class="btn sm" href="' + esc(ADV.wa(l.phone, waMsg)) + '" target="_blank" rel="noopener">WhatsApp ' + esc(firstName(l) || 'learner') + '</a>' : '') +
        (t && t.phone ? '<a class="btn sm" href="' + esc(ADV.wa(t.phone, tutorMsg(t, l, b.subject, [b], room))) + '" target="_blank" rel="noopener">WhatsApp ' + esc(firstName(t)) + '</a>' : '') +
        (b.class_id ? '' : '<button class="btn sm ghost" data-action="b-tutor-open" data-id="' + b.id + '">' + (t ? 'Change tutor' : 'Give to a tutor') + '</button>') +
        (Number(b.fee) ? '<button class="btn sm" data-action="b-paid" data-id="' + b.id + '">' + (b.paid ? 'Mark unpaid' : ICON.money + 'Mark paid') + '</button>' : '') +
        (new Date(b.starts_at) < now() ? '<button class="btn sm" data-action="b-complete" data-id="' + b.id + '">' + ICON.check + 'Completed</button>' : '') +
        '<button class="btn sm ghost" data-action="b-tcancel" data-id="' + b.id + '">Cancel lesson</button></div>' +
        (state.bTutorOpen === b.id ? '<div class="decide"><div class="row" style="flex-wrap:nowrap"><label for="bt-' + b.id + '" class="small" style="white-space:nowrap">Who teaches it</label>' + tutorSelect('bt-' + b.id, b.tutor_id || '', b.subject) + '<button class="btn sm primary" data-action="b-tutor-save" data-id="' + b.id + '">Save</button></div><p class="small muted">The lesson moves to that tutor\'s portal with their Meet link (if they set one); both of you get a notification.</p></div>' : '');
    } else if (b.status === 'completed') {
      if (Number(b.fee)) body += '<div class="row" style="margin-top:10px"><button class="btn sm" data-action="b-paid" data-id="' + b.id + '">' + (b.paid ? 'Mark unpaid' : ICON.money + 'Mark paid') + '</button></div>';
    }
    return '<div class="card lesson' + (['declined', 'cancelled', 'completed'].includes(b.status) || (b.status === 'accepted' && jw.over) ? ' past' : '') + '" id="b-' + b.id + '"><div class="date"><span>' + esc(fmt.wd(s)) + '</span><b>' + esc(fmt.day(s)) + '</b><span>' + esc(fmt.mon(s)) + '</span></div><div style="min-width:0">' + body + '</div></div>';
  }

  /* ---------------------------------------------------------------- dashboard */
  ADV.views.dash = function () {
    const p = pending(), up = upcoming(); const week = up.filter((b) => new Date(b.starts_at) - now() < 7 * 864e5);
    const owed = state.bookings.filter((b) => ['accepted', 'completed'].includes(b.status) && !b.paid && new Date(b.starts_at) < now()).reduce((n, b) => n + Number(b.fee), 0);
    const mk = monthKey(now()); const got = state.bookings.filter((b) => b.paid && monthKey(b.paid_at || b.starts_at) === mk).reduce((n, b) => n + Number(b.fee), 0);
    const first = (state.profile.full_name || '').split(' ')[0];
    const hr = Number(new Intl.DateTimeFormat('en-ZA', { hour: 'numeric', hour12: false, timeZone: 'Africa/Johannesburg' }).format(now()));
    const kpi = (label, val, go, cls) => '<button class="cd kpi ' + (cls || '') + '" data-go="tab" data-id="' + go + '"><span class="eyebrow">' + label + '</span><div class="big">' + val + '</div></button>';
    const newL = learnersOnly().filter((l) => !l.approved && !l.blocked);
    return '<div class="stack"><div><span class="eyebrow">Tutor dashboard</span><h1>' + (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + esc(first) : '') + '</h1></div>' +
      '<div class="grid cols-4">' + kpi('Requests waiting', p.length, 'bookings', p.length ? 'hot' : '') + kpi('Lessons in 7 days', week.length, 'bookings') + kpi('Owed to you', fmt.rand(owed), 'money') + kpi('Received this month', fmt.rand(got), 'money') + '</div>' +
      (p.length ? '<h2>Waiting for your answer</h2>' + p.map(bookingCard).join('') : '<div class="card row">' + ICON.check + '<span>No requests waiting. New requests show up here, on your phone (turn on notifications below) and in your e-mail.</span></div>') +
      (ADV.bundleRequests ? ADV.bundleRequests() : '') +
      (newL.length ? '<div class="card"><div class="row" style="justify-content:space-between"><h3>' + newL.length + ' new learner' + (newL.length > 1 ? 's' : '') + ' waiting for access to the notes</h3><button class="btn sm" data-go="tab" data-id="learners">Open learners</button></div><p class="small muted" style="margin-top:4px">' + newL.slice(0, 6).map((l) => esc(l.full_name || l.email)).join(', ') + '</p></div>' : '') +
      tutorCheckCard() +
      '<h2>Coming up</h2>' + (up.length ? up.slice(0, 8).map(bookingCard).join('') : '<div class="card"><p class="muted">No confirmed lessons yet.</p></div>') +
      shareCard() + (ADV.pushCard ? ADV.pushCard('Get an alert on this device for every new booking request and message.') : '') + '</div>';
  };
  function tutorCheckCard() {
    const unl = state.bookings.filter((b) => b.tutor_id && b.status === 'accepted' && new Date(b.ends_at) < now() - 36e5 && !b.delivered_at);
    if (!unl.length) return '';
    return '<div class="card"><div class="row" style="justify-content:space-between"><h3>' + unl.length + ' tutor lesson' + (unl.length > 1 ? 's' : '') + ' not logged yet</h3><button class="btn sm" data-go="tab" data-id="tutors">Open tutors</button></div><p class="small muted" style="margin-top:4px">' + unl.slice(0, 6).map((b) => esc(((tutorOf(b) || {}).full_name || 'Tutor') + ' with ' + (learnerOf(b).full_name || 'learner') + ', ' + fmt.date(b.starts_at))).join(' · ') + '</p><p class="small muted">Tutors tap “Lesson delivered” in their portal. Check with them if a lesson did not happen.</p></div>';
  }
  function shareCard() {
    const link = portalUrl(); const site = link.replace(/portal\.html$/, '');
    const msg = 'Hi! Book your Grade 12 Maths / Physical Sciences lessons with ' + ((state.settings.site && state.settings.site.brand) || 'Adventuity') + ' here: ' + site + ' – create a free account, pick a time and I confirm it. You can also install it as an app on your phone.';
    return '<div class="card"><span class="eyebrow">Invite learners</span><h3 style="margin-top:4px">Share your booking link</h3><div class="copybox" style="margin-top:10px"><code>' + esc(site) + '</code><button class="btn sm" data-action="copy" data-v="' + esc(site) + '">Copy</button></div><div class="row" style="margin-top:10px"><a class="btn sm primary" href="https://wa.me/?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">Share on WhatsApp</a><button class="btn sm" data-action="copy" data-v="' + esc(msg) + '">Copy invitation text</button></div></div>';
  }
  ADV.actions.copy = (a) => ADV.copy(a.dataset.v);
  ADV.actions['msg-learner'] = (a) => ADV.openThread(a.dataset.id);

  /* ---------------------------------------------------------------- booking actions */
  async function setBooking(id, patch, event, okMsg) {
    try { await sb.update('bookings', { id: 'eq.' + id }, patch); if (event) ADV.notify(id, event); toast(okMsg || 'Saved'); state.editB = null; await reload(); }
    catch (e) { toast(ADV.errMsg(e), 5000); }
  }
  ADV.actions['b-move'] = (a) => { state.editB = state.editB === a.dataset.id ? null : a.dataset.id; ADV.render(); const el = $('#b-' + a.dataset.id); if (el) el.scrollIntoView({ block: 'center' }); };
  ADV.actions['b-accept'] = async (a) => {
    const id = a.dataset.id; const b = state.bookings.find((x) => x.id === id); const patch = { status: 'accepted', admin_message: ($('#msg-' + id) || {}).value || '' };
    const fee = Number(($('#fee-' + id) || {}).value); if (isFinite(fee) && fee >= 0) patch.fee = fee;
    if (state.editB === id) { const d = $('#nd-' + id).value, t = ADV.readTime('nt-' + id), m = Number($('#nm-' + id).value) || 60; if (!d || !t) return toast('Choose the new date and time'); const s = ADV.sast(d, t); patch.starts_at = s.toISOString(); patch.ends_at = new Date(+s + m * 6e4).toISOString(); }
    const link = state.priv.meeting && state.priv.meeting.link;
    const tsel = $('#tu-' + id); const t = tsel && tsel.value ? profileOf(tsel.value) : null;
    if (!b.class_id) patch.tutor_id = t ? t.id : null;
    patch.room = b.class_id ? ((state.rooms[b.class_id] || {}).room || 'AdventuityClass-' + rid(10)) : t ? (t.meet_link || 'AdventuityLesson-' + rid(10)) : (link || 'AdventuityLesson-' + rid(10));
    const test = Object.assign({}, b, patch); const cl = clashes(test);
    if (cl.length && !confirm('This overlaps another confirmed lesson. Accept anyway?')) return;
    a.disabled = true; await setBooking(id, patch, 'accepted', 'Accepted – the learner has been notified');
  };
  ADV.actions['b-tutor-open'] = (a) => { state.bTutorOpen = state.bTutorOpen === a.dataset.id ? null : a.dataset.id; ADV.render(); };
  ADV.actions['b-tutor-save'] = async (a) => {
    const id = a.dataset.id; const b = state.bookings.find((x) => x.id === id); const v = ($('#bt-' + id) || {}).value || ''; const t = v ? profileOf(v) : null;
    if ((b.tutor_id || '') === v) { state.bTutorOpen = null; ADV.render(); return; }
    const patch = { tutor_id: t ? t.id : null, delivered_at: null, tutor_note: '' };
    const custom = /^https:\/\//.test(b.room || '') && !tutors().some((x) => x.meet_link && x.meet_link === b.room) && b.room !== ((state.priv.meeting || {}).link || '');
    if (!custom) patch.room = t ? (t.meet_link || 'AdventuityLesson-' + rid(10)) : (((state.priv.meeting || {}).link) || 'AdventuityLesson-' + rid(10));
    const cl = clashes(Object.assign({}, b, patch)); if (cl.length && !confirm('This overlaps another lesson of that tutor or learner. Save anyway?')) return;
    state.bTutorOpen = null; await setBooking(id, patch, 'updated', t ? 'Given to ' + (t.full_name || 'the tutor') + ' – they have been notified' : 'You teach this lesson now');
  };
  ADV.actions['b-decline'] = async (a) => { const id = a.dataset.id; let m = ($('#msg-' + id) || {}).value || ''; if (!m) m = prompt('Optional message to the learner (e.g. suggest other times):', '') || ''; await setBooking(id, { status: 'declined', admin_message: m }, 'declined', 'Declined – the learner has been notified'); };
  ADV.actions['b-paid'] = async (a) => { const b = state.bookings.find((x) => x.id === a.dataset.id); await setBooking(b.id, b.paid ? { paid: false, paid_at: null } : { paid: true, paid_at: new Date().toISOString() }, b.paid ? null : 'paid', b.paid ? 'Marked unpaid' : 'Marked paid – the learner gets a receipt notice'); };
  ADV.actions['b-complete'] = (a) => setBooking(a.dataset.id, { status: 'completed' }, null, 'Marked completed');
  ADV.actions['b-tcancel'] = async (a) => { const m = prompt('Cancel this lesson? Optional message to the learner:', ''); if (m === null) return; await setBooking(a.dataset.id, { status: 'cancelled', admin_message: m || 'The tutor cancelled this lesson.' }, 'updated', 'Lesson cancelled – the learner has been notified'); };
  ADV.actions['pop-view'] = async (a) => { const b = state.bookings.find((x) => x.id === a.dataset.id); const w = window.open('', '_blank'); try { const u = await sb.signedUrl('pop', b.pop_path, 600); if (w) w.location = u; else location.href = u; } catch (e) { if (w) w.close(); toast(ADV.errMsg(e)); } };

  /* ---------------------------------------------------------------- bookings list */
  ADV.views.bookings = function () {
    const f = state.bFilter || 'upcoming'; const q = (state.bq || '').toLowerCase();
    const sets = { requests: pending(), upcoming: state.bookings.filter((b) => ['pending', 'accepted'].includes(b.status) && new Date(b.ends_at) > now()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)), past: state.bookings.filter((b) => b.status === 'completed' || (b.status === 'accepted' && new Date(b.ends_at) <= now())).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)), closed: state.bookings.filter((b) => ['declined', 'cancelled'].includes(b.status)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)), all: state.bookings.slice().sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)) };
    const tf = state.bTeacher || '';
    const listB = (sets[f] || []).filter((b) => (!tf || teacher(b) === tf) && (!q || ((learnerOf(b).full_name || '') + ' ' + b.ref + ' ' + (learnerOf(b).school || '') + ' ' + ((tutorOf(b) || {}).full_name || '')).toLowerCase().includes(q)));
    const seg = (k, l) => '<button class="' + (f === k ? 'on' : '') + '" data-action="b-filter" data-id="' + k + '">' + l + (k === 'requests' && sets.requests.length ? ' (' + sets.requests.length + ')' : '') + '</button>';
    return '<div class="stack"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="eyebrow">Bookings</span><h1>Bookings</h1></div><div class="row"><button class="btn sm primary" data-action="sched-go">' + ICON.plus + 'Schedule a lesson</button><button class="btn sm" data-action="csv-bookings">Download CSV</button></div></div>' +
      '<div class="seg">' + seg('requests', 'Requests') + seg('upcoming', 'Upcoming') + seg('past', 'Past') + seg('closed', 'Declined/cancelled') + seg('all', 'All') + '</div>' +
      '<div class="card search row" style="flex-wrap:nowrap"><input id="bq" type="search" placeholder="Search by learner, tutor, school or reference" value="' + esc(state.bq || '') + '" aria-label="Search bookings">' + (tutors().length ? '<select id="b-teacher" aria-label="Who teaches" style="max-width:220px"><option value="">All tutors</option><option value="me"' + (tf === 'me' ? ' selected' : '') + '>Me</option>' + tutors().map((t) => '<option value="' + t.id + '"' + (tf === t.id ? ' selected' : '') + '>' + esc(t.full_name || t.email) + '</option>').join('') + '</select>' : '') + '</div>' +
      (listB.length ? listB.map(bookingCard).join('') : '<div class="card"><p class="muted">Nothing here.</p></div>') + '</div>';
  };
  ADV.actions['b-filter'] = (a) => { state.bFilter = a.dataset.id; ADV.render(); };
  const csv = (rows) => rows.map((r) => r.map((x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  ADV.actions['csv-bookings'] = () => download('adventuity-bookings-' + fmt.key(now()) + '.csv', csv([['Reference', 'Date', 'Start', 'End', 'Learner', 'Phone', 'School', 'Subject', 'Kind', 'Topics', 'Status', 'Fee (R)', 'Paid', 'Paid on', 'Tutor', 'Delivered', 'Tutor log']].concat(state.bookings.map((b) => { const l = learnerOf(b); const t = tutorOf(b); return [b.ref, fmt.key(b.starts_at), fmt.time(b.starts_at), fmt.time(b.ends_at), l.full_name, l.phone, l.school, SUBJ[b.subject].short, b.kind, ADV.topicNames(b.topics), b.status, Number(b.fee).toFixed(2), b.paid ? 'yes' : 'no', b.paid_at ? fmt.key(b.paid_at) : '', t ? t.full_name : 'Director', b.delivered_at ? fmt.key(b.delivered_at) : '', b.tutor_note || '']; }))));

  /* ---------------------------------------------------------------- learners */
  ADV.views.learners = function () {
    const q = (state.lq || '').toLowerCase(); const f = state.lFilter || 'all';
    const all = learnersOnly();
    const lg = state.lGrade || '';
    const shown = all.filter((l) => (f === 'all' || (f === 'waiting' && !l.approved && !l.blocked) || (f === 'approved' && l.approved && !l.blocked) || (f === 'blocked' && l.blocked)) && (!lg || String(l.grade || '') === lg) && (!q || ((l.full_name || '') + ' ' + (l.email || '') + ' ' + (l.school || '') + ' ' + (l.phone || '') + ' gr ' + (l.grade || '')).toLowerCase().includes(q)));
    const open = !!(state.settings.access && state.settings.access.open);
    const seg = (k, l, n) => '<button class="' + (f === k ? 'on' : '') + '" data-action="l-filter" data-id="' + k + '">' + l + (n != null ? ' (' + n + ')' : '') + '</button>';
    const card = (l) => {
      const bs = state.bookings.filter((b) => b.learner_id === l.id); const lessons = bs.filter((b) => ['accepted', 'completed'].includes(b.status)).length; const owed = bs.filter((b) => ['accepted', 'completed'].includes(b.status) && !b.paid).reduce((n, b) => n + Number(b.fee), 0);
      const prog = state.progOpen === l.id;
      return '<div class="card" id="l-' + l.id + '"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><div class="row" style="gap:6px"><h3>' + esc(l.full_name || '(no name)') + '</h3>' + (l.blocked ? pill('bad', 'Blocked') : l.approved ? pill('good', 'Notes unlocked') : pill('warn', 'Waiting for access')) + '<label class="sr" for="lg-' + l.id + '">Grade</label><select id="lg-' + l.id + '" data-action="l-grade" data-id="' + l.id + '" class="mini-select" title="Grade">' + ['', 10, 11, 12].map((g) => '<option value="' + g + '"' + ((Number(l.grade) || '') === g ? ' selected' : '') + '>' + (g ? 'Gr ' + g : 'Grade?') + '</option>').join('') + '</select></div>' +
        '<p class="small muted" style="margin-top:4px">' + [l.email, l.phone, l.school, l.guardian_phone ? 'Parent ' + l.guardian_phone : ''].filter(Boolean).map(esc).join(' · ') + '</p><p class="small muted">Joined ' + esc(fmt.date(l.created_at)) + ' · ' + lessons + ' lesson' + (lessons === 1 ? '' : 's') + (ADV.bundleSummary ? esc(ADV.bundleSummary(l.id)) : '') + (owed ? ' · <b style="color:var(--warn)">owes ' + fmt.rand(owed) + '</b>' : '') + (l.must_change_password ? ' · temporary password not changed yet' : '') + (l.created_by && profileOf(l.created_by) && profileOf(l.created_by).role === 'tutor' ? ' · added by ' + esc(profileOf(l.created_by).full_name || 'a tutor') : '') + (l.sponsor_id ? ' · billed to ' + esc(((state.sponsors || []).find((x) => x.id === l.sponsor_id) || {}).name || 'a sponsor') : '') + '</p>' +
        ((state.assign || []).some((x) => x.active && x.learner_id === l.id) ? '<div class="row" style="gap:6px;margin-top:6px">' + (state.assign || []).filter((x) => x.active && x.learner_id === l.id).map((x) => pill(x.subject, SUBJ[x.subject].short + ' · ' + ((profileOf(x.tutor_id) || {}).full_name || 'tutor'))).join('') + '</div>' : '') + '</div>' +
        '<div class="row">' + (l.approved ? '<button class="btn sm" data-action="l-set" data-id="' + l.id + '" data-k="approved" data-v="0">Lock the notes</button>' : '<button class="btn sm primary" data-action="l-set" data-id="' + l.id + '" data-k="approved" data-v="1">' + ICON.check + 'Unlock the notes</button>') + '</div></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn sm" data-action="msg-learner" data-id="' + l.id + '">' + ICON.chat + 'Message</button>' + (l.phone ? '<a class="btn sm" href="' + esc(ADV.wa(l.phone)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '<button class="btn sm" data-action="l-prog" data-id="' + l.id + '">' + ICON.chart + (prog ? 'Hide progress' : 'Progress') + '</button><button class="btn sm" data-action="sched-go" data-learner="' + l.id + '">' + ICON.cal + 'Schedule</button><button class="btn sm ghost" data-action="l-pass" data-id="' + l.id + '">Reset password</button><button class="btn sm ghost" data-action="l-set" data-id="' + l.id + '" data-k="blocked" data-v="' + (l.blocked ? '0' : '1') + '">' + (l.blocked ? 'Unblock' : 'Block') + '</button><button class="btn sm ghost" data-action="l-tutor" data-id="' + l.id + '">Make tutor</button><button class="btn sm ghost" data-action="l-del" data-id="' + l.id + '">Delete</button></div>' +
        (prog ? '<div style="margin-top:12px">' + (state.progData && state.progData.id === l.id ? (state.progData.data ? ((Number(l.grade) || 12) === 12 ? progSummary(state.progData.data) : '') + ADV.progressTable(state.progData.data, false, Number(l.grade) || 12) : '<p class="small muted">No progress saved yet.</p>') : '<p class="small muted">Loading…</p>') + '</div>' : '') + '</div>';
    };
    return '<div class="stack"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="eyebrow">Learners</span><h1>Learners</h1><p class="small muted">' + (open ? 'Everyone with an account can read the notes (change this in Settings).' : 'Learners read the notes only after you unlock them. Everyone can book lessons.') + '</p></div>' + (state.accForm ? '' : '<button class="btn primary" data-action="acc-new" data-role="learner">' + ICON.plus + 'Add a learner</button>') + '</div>' +
      credsPanel() + (state.accForm && state.accForm.role === 'learner' ? accountForm() : '') +
      '<div class="seg">' + seg('all', 'All', all.length) + seg('waiting', 'Waiting', all.filter((l) => !l.approved && !l.blocked).length) + seg('approved', 'Unlocked') + seg('blocked', 'Blocked') + '</div>' +
      '<div class="card search row" style="flex-wrap:nowrap"><input id="lq" type="search" placeholder="Search by name, e-mail, school or phone" value="' + esc(state.lq || '') + '" aria-label="Search learners"><select id="l-grade-filter" aria-label="Grade" style="max-width:150px"><option value="">All grades</option>' + [10, 11, 12].map((g) => '<option value="' + g + '"' + (lg === String(g) ? ' selected' : '') + '>Grade ' + g + '</option>').join('') + '</select></div>' +
      (shown.length ? shown.map(card).join('') : '<div class="card"><p class="muted">No learners here yet. Share your booking link from the Dashboard.</p></div>') + '</div>';
  };
  function progSummary(d) {
    const loads = ADV.paperLoad(d);
    return '<div class="grid cols-4" style="margin-bottom:10px">' + loads.map((L) => '<div class="cd"><span class="eyebrow">' + esc(SUBJ[L.e.subj].short + ' ' + L.e.paper.replace(/ \(.*\)/, '')) + '</span><div class="big" style="font-size:1.2rem">' + fmt.mins(L.left) + '</div><span class="small muted">left of ' + fmt.mins(L.total) + '</span></div>').join('') + '</div>';
  }
  ADV.actions['l-filter'] = (a) => { state.lFilter = a.dataset.id; ADV.render(); };
  ADV.actions['l-set'] = async (a) => {
    const id = a.dataset.id, k = a.dataset.k, v = a.dataset.v === '1';
    if (k === 'blocked' && v && !confirm('Block this learner? They are signed out and cannot book or read the notes.')) return;
    try { const r = await sb.update('profiles', { id: 'eq.' + id }, { [k]: v }); const i = state.learners.findIndex((x) => x.id === id); if (i >= 0 && r[0]) state.learners[i] = r[0]; toast(k === 'approved' ? (v ? 'Notes unlocked for this learner' : 'Notes locked') : v ? 'Learner blocked' : 'Learner unblocked'); ADV.render(); }
    catch (e) { toast(ADV.errMsg(e)); }
  };
  ADV.actions['l-prog'] = async (a) => {
    const id = a.dataset.id; if (state.progOpen === id) { state.progOpen = null; ADV.render(); return; }
    state.progOpen = id; state.progData = null; ADV.render();
    try { const r = await sb.select('progress', { user_id: 'eq.' + id }); const d = r[0] && r[0].data; if (d) ['topics', 'secs', 'quiz', 'practice', 'plan'].forEach((k) => { d[k] = d[k] || {}; }); state.progData = { id, data: d || null }; } catch (e) { state.progData = { id, data: null }; }
    ADV.render();
  };
  ADV.actions['l-pass'] = async (a) => {
    const l = state.learners.find((x) => x.id === a.dataset.id); const pw = 'Adv-' + rid(6);
    if (!confirm('Give ' + ((l && l.full_name) || 'this account') + ' a new temporary password? They choose their own password when they next sign in.')) return;
    try { await sb.fn('admin-users', { action: 'reset_password', user_id: l.id, password: pw }); l.must_change_password = true; state.creds = { name: l.full_name, email: l.email, phone: l.phone, password: pw, role: l.role, reset: true }; ADV.render(); window.scrollTo({ top: 0 }); }
    catch (e) { toast(ADV.errMsg(e)); }
  };
  ADV.actions['l-tutor'] = async (a) => {
    const l = state.learners.find((x) => x.id === a.dataset.id); if (!confirm('Make ' + (l.full_name || l.email) + ' a tutor? Their account moves to the Tutors page: they see the lessons you give them, and stop being a learner.')) return;
    try { const r = await sb.update('profiles', { id: 'eq.' + l.id }, { role: 'tutor', approved: true }); Object.assign(l, r[0] || { role: 'tutor', approved: true }); toast((l.full_name || 'The account') + ' is now a tutor'); state.tView = 'team'; ADV.go('tutors'); }
    catch (e) { toast(ADV.errMsg(e)); }
  };
  ADV.actions['l-del'] = async (a) => {
    const l = state.learners.find((x) => x.id === a.dataset.id); if (!confirm('Delete ' + (l.full_name || l.email) + '\'s account, bookings and messages? This cannot be undone.')) return;
    try { await sb.fn('admin-users', { action: 'delete', user_id: l.id }); state.learners = state.learners.filter((x) => x.id !== l.id); await reload(); toast('Account deleted'); } catch (e) { toast(ADV.errMsg(e)); }
  };

  /* ---------------------------------------------------------------- group classes */
  ADV.views.classes = function () {
    const f = state.classForm; const cls = state.classes.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const seats = (c) => state.bookings.filter((b) => b.class_id === c.id);
    const form = f ? '<form id="f-class" class="card stack"><h3>' + (f.id ? 'Edit class' : 'New group class') + '</h3><div class="grid cols-3">' +
      '<div class="field"><label for="c-subj">Subject</label><select id="c-subj">' + Object.keys(SUBJ).map((k) => '<option value="' + k + '"' + (f.subject === k ? ' selected' : '') + '>' + SUBJ[k].short + '</option>').join('') + '</select></div>' +
      '<div class="field" style="grid-column:span 2"><label for="c-title">Title</label><input id="c-title" required value="' + esc(f.title || '') + '" placeholder="e.g. Calculus crash course – cubic graphs and optimisation"></div>' +
      '<div class="field"><label for="c-date">Date</label>' + ADV.dateSelect('c-date', f.date || '', { required: true, blank: !f.date }) + '</div><div class="field"><label for="c-time-h">Start time</label>' + ADV.timeSelect('c-time', f.time || '16:00') + '</div><div class="field"><label for="c-min">Class length (time limit)</label>' + ADV.lengthSelect('c-min', f.minutes || 90) + '</div>' +
      '<div class="field"><label for="c-fee">Fee per learner (R)</label><input id="c-fee" type="number" min="0" step="10" value="' + (f.fee != null ? f.fee : (ADV.setting('fees', {}).group || 100)) + '"></div><div class="field"><label for="c-cap">Seats</label><input id="c-cap" type="number" min="1" value="' + (f.capacity || 20) + '"></div><label class="check" style="align-self:end"><input id="c-pub" type="checkbox"' + (f.published !== false ? ' checked' : '') + '> Learners can see and book it</label></div>' +
      '<div class="field"><label for="c-notes">Notes for learners (optional)</label><input id="c-notes" value="' + esc(f.notes || '') + '" placeholder="e.g. Bring the Nov 2024 P1"></div>' +
      '<div class="row"><button class="btn primary" type="submit">Save class</button><button class="btn" type="button" data-action="class-cancel">Cancel</button></div></form>' : '';
    const card = (c) => {
      const s = seats(c); const acc = s.filter((b) => b.status === 'accepted'), pend = s.filter((b) => b.status === 'pending'); const room = state.rooms[c.id] && state.rooms[c.id].room; const past = new Date(c.starts_at) < now() - c.minutes * 6e4;
      return '<div class="card lesson' + (past ? ' past' : '') + '"><div class="date"><span>' + esc(fmt.wd(c.starts_at)) + '</span><b>' + esc(fmt.day(c.starts_at)) + '</b><span>' + esc(fmt.mon(c.starts_at)) + '</span></div><div style="min-width:0"><div class="row" style="gap:6px">' + pill(c.subject, SUBJ[c.subject].short) + pill('', fmt.rand(c.fee)) + pill(acc.length >= c.capacity ? 'bad' : 'good', acc.length + '/' + c.capacity + ' confirmed') + (pend.length ? pill('warn', pend.length + ' waiting') : '') + (c.published ? '' : pill('', 'Hidden')) + '</div>' +
        '<h3 style="margin-top:6px">' + esc(c.title) + '</h3><p class="small muted">' + esc(fmt.long(c.starts_at)) + ' · ' + esc(fmt.time(c.starts_at)) + ' · ' + c.minutes + ' min' + (c.notes ? ' · ' + esc(c.notes) : '') + '</p>' +
        (s.length ? '<p class="small" style="margin-top:4px">' + s.filter((b) => ['pending', 'accepted'].includes(b.status)).map((b) => esc(learnerOf(b).full_name || 'Learner') + (b.status === 'pending' ? ' (waiting)' : b.paid ? ' ✓paid' : '')).join(', ') + '</p>' : '') +
        '<div class="row" style="margin-top:10px">' + (room && !past ? '<a class="btn primary sm" href="' + esc(ADV.roomUrl(room, tutorName())) + '" target="_blank" rel="noopener">' + ICON.video + 'Start class</a>' : '') + (pend.length ? '<button class="btn sm" data-action="class-accept-all" data-id="' + c.id + '">Accept all ' + pend.length + '</button>' : '') + '<button class="btn sm" data-action="class-edit" data-id="' + c.id + '">Edit</button><button class="btn sm ghost" data-action="class-del" data-id="' + c.id + '">Delete</button></div></div></div>';
    };
    return '<div class="stack"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="eyebrow">Group classes</span><h1>Group classes</h1><p class="small muted">Learners request a seat; you accept them here or on the Dashboard. Everyone accepted joins the same private room.</p></div>' + (f ? '' : '<button class="btn primary" data-action="class-new">' + ICON.plus + 'New class</button>') + '</div>' + form +
      (cls.length ? cls.map(card).join('') : '<div class="card"><p class="muted">No classes yet.</p></div>') + '</div>';
  };
  ADV.actions['class-new'] = () => { state.classForm = { subject: 'maths', date: fmt.key(Date.now() + 2 * 864e5) }; ADV.render(); };
  ADV.actions['class-cancel'] = () => { state.classForm = null; ADV.render(); };
  ADV.actions['class-edit'] = (a) => { const c = state.classes.find((x) => x.id === a.dataset.id); state.classForm = Object.assign({}, c, { date: fmt.key(c.starts_at), time: fmt.time(c.starts_at) }); ADV.render(); window.scrollTo({ top: 0 }); };
  ADV.actions['class-del'] = async (a) => { if (!confirm('Delete this class? Learners who booked it keep their booking record but lose the class link.')) return; try { await sb.remove('classes', { id: 'eq.' + a.dataset.id }); await reload(); toast('Class deleted'); } catch (e) { toast(ADV.errMsg(e)); } };
  ADV.actions['class-accept-all'] = async (a) => {
    const c = state.classes.find((x) => x.id === a.dataset.id); const room = (state.rooms[c.id] || {}).room;
    const list = state.bookings.filter((b) => b.class_id === c.id && b.status === 'pending');
    for (const b of list) { try { await sb.update('bookings', { id: 'eq.' + b.id }, { status: 'accepted', room }); ADV.notify(b.id, 'accepted'); } catch (e) { toast(ADV.errMsg(e)); } }
    toast(list.length + ' learner' + (list.length === 1 ? '' : 's') + ' accepted'); await reload();
  };
  async function saveClass(e) {
    e.preventDefault(); const f = state.classForm;
    const row = { subject: $('#c-subj').value, title: $('#c-title').value.trim(), starts_at: ADV.sast($('#c-date').value, ADV.readTime('c-time')).toISOString(), minutes: Number($('#c-min').value) || 90, fee: Number($('#c-fee').value) || 0, capacity: Number($('#c-cap').value) || 20, notes: $('#c-notes').value.trim(), published: $('#c-pub').checked };
    try {
      if (f.id) { await sb.update('classes', { id: 'eq.' + f.id }, row); const moved = state.bookings.filter((b) => b.class_id === f.id && ['pending', 'accepted'].includes(b.status)); for (const b of moved) await sb.update('bookings', { id: 'eq.' + b.id }, { starts_at: row.starts_at, ends_at: new Date(+new Date(row.starts_at) + row.minutes * 6e4).toISOString(), subject: row.subject }); }
      else await sb.insert('classes', [row]);
      state.classForm = null; await loadClassRooms(); await reload(); toast('Class saved');
    } catch (err) { toast(ADV.errMsg(err)); }
  }

  /* ---------------------------------------------------------------- money */
  ADV.views.money = function () {
    const fees = ADV.setting('fees', { maths: 250, phys: 250, chem: 250, life: 250, group: 100 }); const pay = state.priv.payment || {};
    const billable = state.bookings.filter((b) => ['accepted', 'completed'].includes(b.status)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    const mk = monthKey(now()); const sum = (arr) => arr.reduce((n, b) => n + Number(b.fee), 0);
    const got = sum(billable.filter((b) => b.paid && monthKey(b.paid_at || b.starts_at) === mk)), all = sum(billable.filter((b) => b.paid)), owed = sum(billable.filter((b) => !b.paid && new Date(b.starts_at) < now())), coming = sum(billable.filter((b) => !b.paid && new Date(b.starts_at) >= now()));
    const fee = (id, label, v) => '<div class="field"><label for="' + id + '">' + label + '</label><div class="rand"><span>R</span><input id="' + id + '" type="number" min="0" step="10" value="' + (v != null ? v : '') + '"></div></div>';
    return '<div class="stack"><div><span class="eyebrow">Money</span><h1>Fees and payments</h1></div>' +
      '<div class="grid cols-4"><div class="cd"><span class="eyebrow">Received this month</span><div class="big" style="font-size:1.35rem">' + fmt.rand(got) + '</div></div><div class="cd"><span class="eyebrow">Received in total</span><div class="big" style="font-size:1.35rem">' + fmt.rand(all) + '</div></div><div class="cd"><span class="eyebrow">Owed (lessons done)</span><div class="big" style="font-size:1.35rem;color:var(--warn)">' + fmt.rand(owed) + '</div></div><div class="cd"><span class="eyebrow">Booked, not yet due</span><div class="big" style="font-size:1.35rem">' + fmt.rand(coming) + '</div></div></div>' +
      tutorPayCard() + (ADV.bundlesCard ? ADV.bundlesCard() : '') +
      '<form id="f-fees" class="card stack"><div><h3>Your fees</h3><p class="small muted">Per hour for one-on-one lessons. Learners see the price before they request a lesson; the server works out the fee, so nobody can change it. You can still adjust a single booking when you accept it.</p></div><div class="grid cols-4">' + fee('fee-maths', 'Mathematics', fees.maths) + fee('fee-phys', 'Physics', fees.phys) + fee('fee-chem', 'Chemistry', fees.chem) + fee('fee-life', 'Life Sciences', fees.life != null ? fees.life : fees.maths) + fee('fee-group', 'Group class (default per seat)', fees.group) + '</div><div class="row"><button class="btn primary" type="submit">Save fees</button></div></form>' +
      '<form id="f-pay" class="card stack"><div><h3>How learners pay you</h3><p class="small muted">Shown only to learners after you accept their lesson, with their booking reference. Learners then upload a proof of payment, and you get a notification.</p></div><div class="field"><label for="pay-text">Payment instructions</label><textarea id="pay-text" placeholder="Bank: …&#10;Account name: …&#10;Account number: …&#10;Branch code: …&#10;Use your booking reference.">' + esc(pay.text || '') + '</textarea></div><div class="field"><label for="pay-link">Online payment link (optional – e.g. a SnapScan, Zapper, PayFast or Yoco link)</label><input id="pay-link" type="url" value="' + esc(pay.link || '') + '" placeholder="https://"></div><div class="row"><button class="btn primary" type="submit">Save payment details</button></div></form>' +
      '<div class="card"><div class="row" style="justify-content:space-between"><h3>Lessons and payments</h3><button class="btn sm" data-action="csv-pay">Download CSV</button></div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Date</th><th>Learner</th><th>Lesson</th><th style="text-align:right">Fee</th><th>Status</th><th></th></tr></thead><tbody>' +
      (billable.length ? billable.map((b) => '<tr><td class="mono">' + esc(fmt.key(b.starts_at)) + '</td><td>' + esc(learnerOf(b).full_name || '') + '</td><td>' + esc(SUBJ[b.subject].short) + (b.class_id ? ' (class)' : '') + ' <span class="mono small muted">' + esc(b.ref) + '</span></td><td class="mono" style="text-align:right">' + fmt.rand(b.fee) + '</td><td>' + (b.bundle_id ? pill('accent', 'From bundle') : !Number(b.fee) ? pill('', 'No fee') : b.paid ? pill('good', 'Paid' + (b.paid_at ? ' ' + fmt.date(b.paid_at) : '')) : b.pop_path ? pill('accent', 'Proof sent') : pill('warn', 'Unpaid')) + '</td><td><div class="row" style="gap:4px;flex-wrap:nowrap">' + (b.pop_path ? '<button class="chipbtn" data-action="pop-view" data-id="' + b.id + '">Proof</button>' : '') + (Number(b.fee) ? '<button class="chipbtn" data-action="b-paid" data-id="' + b.id + '">' + (b.paid ? 'Mark unpaid' : 'Mark paid') + '</button>' : '') + '</div></td></tr>').join('') : '<tr><td colspan="6" class="muted">No accepted lessons yet.</td></tr>') + '</tbody></table></div></div></div>';
  };
  function payRows(mk) { return state.bookings.filter((b) => b.tutor_id && (b.status === 'completed' || (b.status === 'accepted' && b.delivered_at)) && monthKey(b.starts_at) === mk).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)); }
  function tutorPayCard() {
    if (!tutors().length) return '';
    const months = []; for (let i = 0; i < 6; i++) { const d = new Date(now()); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); months.push(monthKey(d)); }
    const mk = state.payMonth || months[0]; const rows = payRows(mk);
    const per = tutors().map((t) => { const list = rows.filter((b) => b.tutor_id === t.id); const h = list.reduce((n, b) => n + (new Date(b.ends_at) - new Date(b.starts_at)) / 36e5, 0); return { t, n: list.length, h, amt: h * (Number(t.tutor_rate) || 0) }; }).filter((x) => x.n);
    const mname = (k) => new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(k + '-15T12:00:00+02:00'));
    return '<div class="card"><div class="row" style="justify-content:space-between"><div><h3>Tutor pay</h3><p class="small muted">Lessons tutors marked as delivered (or you marked completed), at each tutor\'s hourly rate.</p></div><div class="row"><select id="pay-month" aria-label="Month">' + months.map((k) => '<option value="' + k + '"' + (k === mk ? ' selected' : '') + '>' + esc(mname(k)) + '</option>').join('') + '</select><button class="btn sm" data-action="csv-tutorpay">Download CSV</button></div></div>' +
      '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Tutor</th><th style="text-align:right">Lessons</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">To pay</th></tr></thead><tbody>' +
      (per.length ? per.map((x) => '<tr><td>' + esc(x.t.full_name || x.t.email) + '</td><td class="mono" style="text-align:right">' + x.n + '</td><td class="mono" style="text-align:right">' + String(Math.round(x.h * 100) / 100).replace('.', ',') + '</td><td class="mono" style="text-align:right">' + fmt.rand(x.t.tutor_rate) + '</td><td class="mono" style="text-align:right"><b>' + fmt.rand(x.amt) + '</b></td></tr>').join('') + '<tr><td><b>Total</b></td><td></td><td></td><td></td><td class="mono" style="text-align:right"><b>' + fmt.rand(per.reduce((n, x) => n + x.amt, 0)) + '</b></td></tr>' : '<tr><td colspan="5" class="muted">No delivered tutor lessons in ' + esc(mname(mk)) + '.</td></tr>') + '</tbody></table></div></div>';
  }
  ADV.actions['csv-tutorpay'] = () => { const mk = state.payMonth || monthKey(now()); download('adventuity-tutor-pay-' + mk + '.csv', csv([['Date', 'Start', 'Minutes', 'Tutor', 'Learner', 'School', 'Subject', 'Reference', 'Delivered', 'Tutor log', 'Rate (R/h)', 'Amount (R)']].concat(payRows(mk).map((b) => { const t = tutorOf(b) || {}; const l = learnerOf(b); const m = Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 6e4); return [fmt.key(b.starts_at), fmt.time(b.starts_at), m, t.full_name, l.full_name, l.school, SUBJ[b.subject].short, b.ref, b.delivered_at ? fmt.key(b.delivered_at) : 'completed', b.tutor_note || '', Number(t.tutor_rate || 0).toFixed(2), (m / 60 * Number(t.tutor_rate || 0)).toFixed(2)]; })))); };
  ADV.actions['csv-pay'] = () => download('adventuity-payments-' + fmt.key(now()) + '.csv', csv([['Date', 'Reference', 'Learner', 'Subject', 'Fee (R)', 'Paid', 'Paid on']].concat(state.bookings.filter((b) => ['accepted', 'completed'].includes(b.status)).map((b) => [fmt.key(b.starts_at), b.ref, learnerOf(b).full_name, SUBJ[b.subject].short, Number(b.fee).toFixed(2), b.paid ? 'yes' : 'no', b.paid_at ? fmt.key(b.paid_at) : '']))));


  /* ---------------------------------------------------------------- tutor applications */
  const APP_STATUS = { new: ['warn', 'New'], shortlisted: ['accent', 'Shortlisted'], interview: ['accent', 'Interview'], accepted: ['good', 'Accepted'], declined: ['', 'Declined'] };
  const SUBJ_NAMES = { maths: 'Mathematics', phys: 'Physics', chem: 'Chemistry', lifesci: 'Life Sciences', other: 'Other' };
  async function loadApps() {
    try { state.apps = await sb.select('tutor_applications', { order: 'created_at.desc', limit: 500 }); } catch (e) { state.apps = state.apps || []; }
    state.badges.tutors = (state.apps || []).filter((a) => a.status === 'new').length;
  }
  ADV.adminTick = async function (announce) {
    const before = new Set((state.apps || []).map((a) => a.id)); await loadApps();
    const fresh = (state.apps || []).filter((a) => !before.has(a.id));
    if (announce && fresh.length) ADV.alert(fresh.length === 1 ? 'New tutor application' : fresh.length + ' new tutor applications', fresh.map((a) => a.full_name).join(', '));
  };
  function appsView() {
    const f = state.aFilter || 'open'; const all = state.apps || [];
    const sets = { open: all.filter((a) => ['new', 'shortlisted', 'interview'].includes(a.status)), new: all.filter((a) => a.status === 'new'), accepted: all.filter((a) => a.status === 'accepted'), declined: all.filter((a) => a.status === 'declined'), all };
    const seg = (k, l) => '<button class="' + (f === k ? 'on' : '') + '" data-action="a-filter" data-id="' + k + '">' + l + ' (' + sets[k].length + ')</button>';
    const site = (CFG.siteUrl || '').replace(/\/?$/, '/');
    const card = (a) => {
      const st = APP_STATUS[a.status] || ['', a.status]; const open = state.appOpen === a.id;
      const first = (a.full_name || '').split(' ')[0];
      const mail = 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent('Your Adventuity tutor application ' + a.ref) + '&body=' + encodeURIComponent('Hi ' + first + ',\n\nThank you for applying to tutor with Adventuity.\n\n');
      return '<div class="card" id="app-' + a.id + '"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><div class="row" style="gap:6px">' + pill(st[0], st[1]) + '<span class="mono small muted">' + esc(a.ref) + '</span><span class="small muted">' + esc(fmt.date(a.created_at)) + '</span></div>' +
        '<h3 style="margin-top:6px">' + esc(a.full_name) + '</h3><p class="small muted">' + [a.qualification, a.institution].filter(Boolean).map(esc).join(' · ') + '</p>' +
        '<div class="row" style="gap:6px;margin-top:6px">' + (a.subjects || []).map((x) => pill(x === 'chem' ? 'chem' : x === 'phys' ? 'phys' : x === 'maths' ? 'maths' : '', SUBJ_NAMES[x] || x)).join('') + (a.grades && a.grades.length ? pill('', 'Gr ' + a.grades.join(', ')) : '') + pill('', (a.experience_years || 0) + ' yrs experience') + pill('', { online: 'Online', in_person: 'In person', both: 'Online and in person' }[a.mode] || a.mode) + (a.province ? pill('', a.province + (a.town ? ' · ' + a.town : '')) : '') + '</div></div>' +
        '<div class="row">' + (a.cv_path ? '<button class="btn sm primary" data-action="a-cv" data-id="' + a.id + '">' + ICON.ext + 'Open CV</button>' : '') + '</div></div>' +
        (a.availability ? '<p class="small" style="margin-top:8px"><b>Available:</b> ' + esc(a.availability) + '</p>' : '') +
        (a.about ? '<p class="tutor-msg" style="white-space:pre-line">' + esc(open || a.about.length < 280 ? a.about : a.about.slice(0, 260) + '…') + (a.about.length >= 280 ? ' <button class="chipbtn" data-action="a-more" data-id="' + a.id + '">' + (open ? 'Less' : 'Read all') + '</button>' : '') + '</p>' : '') +
        (a.referral ? '<p class="small muted" style="margin-top:6px">Heard about us: ' + esc(a.referral) + '</p>' : '') +
        '<div class="grid cols-2" style="margin-top:12px"><div class="field"><label for="as-' + a.id + '">Status</label><select id="as-' + a.id + '" data-action="a-status" data-id="' + a.id + '">' + Object.keys(APP_STATUS).map((k) => '<option value="' + k + '"' + (a.status === k ? ' selected' : '') + '>' + APP_STATUS[k][1] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="an-' + a.id + '">Your notes (only you see these)</label><div class="row" style="flex-wrap:nowrap"><input id="an-' + a.id + '" value="' + esc(a.admin_notes || '') + '" placeholder="e.g. Strong on calculus – interview Thu 17:00"><button class="btn sm" data-action="a-note" data-id="' + a.id + '">Save</button></div></div></div>' +
        '<div class="row" style="margin-top:10px"><a class="btn sm" href="' + esc(mail) + '">E-mail ' + esc(first) + '</a>' + (a.phone ? '<a class="btn sm" href="' + esc(ADV.wa(a.phone, 'Hi ' + first + ', thank you for applying to tutor with Adventuity (' + a.ref + ').')) + '" target="_blank" rel="noopener">WhatsApp ' + esc(a.phone) + '</a>' : '') + '<button class="btn sm ghost" data-action="a-del" data-id="' + a.id + '">Delete application and CV</button></div></div>';
    };
    return '<div class="stack"><div><p class="small muted">Tutors apply on your public page <a href="' + esc(site + 'tutor-apply.html') + '" target="_blank" rel="noopener">tutor-apply.html</a> and upload a CV. Only you can see applications and CVs. You get a notification and an e-mail for each one; applicants get a confirmation e-mail.</p></div>' +
      '<div class="row"><button class="btn sm" data-action="copy" data-v="' + esc(site + 'tutor-apply.html') + '">Copy the application link</button><a class="btn sm" href="https://wa.me/?text=' + encodeURIComponent('We are looking for Grade 12 Maths and Physical Sciences tutors (online). Apply with your CV here: ' + site + 'tutor-apply.html') + '" target="_blank" rel="noopener">Share on WhatsApp</a><button class="btn sm ghost" data-action="csv-apps">Download CSV</button></div>' +
      '<div class="seg">' + seg('open', 'To review') + seg('new', 'New') + seg('accepted', 'Accepted') + seg('declined', 'Declined') + seg('all', 'All') + '</div>' +
      ((sets[f] || []).length ? sets[f].map(card).join('') : '<div class="card"><p class="muted">No applications here yet.</p></div>') + '</div>';
  }
  ADV.actions['a-filter'] = (a) => { state.aFilter = a.dataset.id; ADV.render(); };
  ADV.actions['a-more'] = (a) => { state.appOpen = state.appOpen === a.dataset.id ? null : a.dataset.id; ADV.render(); };
  ADV.actions['a-cv'] = async (a) => {
    const ap = state.apps.find((x) => x.id === a.dataset.id); const w = window.open('', '_blank');
    try { const u = await sb.signedUrl('cvs', ap.cv_path, 600); if (w) w.location = u; else location.href = u; if (ap.status === 'new') await setApp(ap.id, { status: 'shortlisted' }, true); }
    catch (e) { if (w) w.close(); toast(ADV.errMsg(e)); }
  };
  async function setApp(id, patch, quiet) {
    try { const r = await sb.update('tutor_applications', { id: 'eq.' + id }, patch); const i = state.apps.findIndex((x) => x.id === id); if (i >= 0 && r[0]) state.apps[i] = r[0]; state.badges.tutors = state.apps.filter((x) => x.status === 'new').length; if (!quiet) toast('Saved'); ADV.render(); }
    catch (e) { toast(ADV.errMsg(e)); }
  }
  ADV.actions['a-note'] = (a) => setApp(a.dataset.id, { admin_notes: ($('#an-' + a.dataset.id) || {}).value || '' });
  ADV.actions['a-del'] = async (a) => {
    const ap = state.apps.find((x) => x.id === a.dataset.id);
    if (!confirm('Delete ' + ap.full_name + '\'s application and CV permanently? Do this when they ask, or when you no longer need it.')) return;
    try { if (ap.cv_path) await sb.removeObject('cvs', ap.cv_path); await sb.remove('tutor_applications', { id: 'eq.' + ap.id }); state.apps = state.apps.filter((x) => x.id !== ap.id); state.badges.tutors = state.apps.filter((x) => x.status === 'new').length; toast('Application and CV deleted'); ADV.render(); }
    catch (e) { toast(ADV.errMsg(e)); }
  };
  ADV.actions['csv-apps'] = () => download('adventuity-tutor-applications-' + fmt.key(now()) + '.csv', csv([['Reference', 'Date', 'Name', 'E-mail', 'Phone', 'Province', 'Town', 'Subjects', 'Grades', 'Qualification', 'Institution', 'Experience (years)', 'Mode', 'Availability', 'Status', 'Notes']].concat((state.apps || []).map((x) => [x.ref, fmt.key(x.created_at), x.full_name, x.email, x.phone, x.province, x.town, (x.subjects || []).map((k) => SUBJ_NAMES[k] || k).join('; '), (x.grades || []).join('; '), x.qualification, x.institution, x.experience_years, x.mode, x.availability, x.status, x.admin_notes]))));
  const prevChange = ADV.onChange;
  ADV.onChange = function (e) {
    if (prevChange) prevChange(e); const t = e.target; if (t.dataset && t.dataset.action === 'a-status') setApp(t.dataset.id, { status: t.value });
    if (t.id === 'b-teacher') { state.bTeacher = t.value; ADV.render(); }
    if (t.id === 'pay-month') { state.payMonth = t.value; ADV.render(); }
    if (t.id === 'l-grade-filter') { state.lGrade = t.value; ADV.render(); }
    if (t.dataset && t.dataset.action === 'l-grade') { const id = t.dataset.id; const g = Number(t.value) || null; sb.update('profiles', { id: 'eq.' + id }, { grade: g }).then((r) => { const i = state.learners.findIndex((x) => x.id === id); if (i >= 0 && r[0]) state.learners[i] = r[0]; toast('Grade saved'); }).catch((e) => toast(ADV.errMsg(e))); }
    if (t.id === 'sc-learner') { const f = readSched(); state.sched = { learner: f.learner, fee: f.fee, link: f.link, msg: f.msg }; ADV.render(); }
    if (t.id === 'sc-tutor' || t.id === 'sc-subj') { const was = state.sched || {}; state.sched = Object.assign(readSched(), { tutorSet: t.id === 'sc-tutor' || !!was.tutorSet }); ADV.render(); }
    if (t.id === 'as-learner' || t.id === 'as-tutor') { const a = state.asgForm || {}; a.learner = ($('#as-learner') || {}).value; a.tutor = ($('#as-tutor') || {}).value; }
  };


  /* ---------------------------------------------------------------- tutors: team, schedule, applications */
  ADV.views.tutors = function () {
    const newApps = (state.apps || []).filter((a) => a.status === 'new').length; const v = state.tView || (!tutors().length && newApps ? 'apps' : 'team');
    const seg = (k, l) => '<button class="' + (v === k ? 'on' : '') + '" data-action="t-view" data-id="' + k + '">' + l + '</button>';
    return '<div class="stack"><div><span class="eyebrow">Tutors</span><h1>Tutors</h1><p class="small muted">Give tutors a login, assign learners to them and schedule lessons. Tutors join each lesson from their own portal (with their Google Meet link) and write on the lesson board.</p></div>' +
      '<div class="seg">' + seg('team', 'Team (' + tutors().length + ')') + seg('schedule', 'Schedule a lesson') + seg('apps', 'Applications' + (newApps ? ' (' + newApps + ' new)' : '')) + '</div>' +
      (v === 'apps' ? appsView() : v === 'schedule' ? scheduleView() : teamView()) + '</div>';
  };
  ADV.actions['t-view'] = (a) => { state.tView = a.dataset.id; ADV.render(); };
  ADV.actions['sched-go'] = (a) => { state.sched = { learner: a.dataset.learner || '', tutor: a.dataset.tutor || '', tutorSet: !!a.dataset.tutor }; state.lastSched = null; state.tView = 'schedule'; ADV.go('tutors'); };

  /* login details to hand out (new account or password reset) */
  function credsPanel() {
    const c = state.creds; if (!c) return '';
    const isT = c.role === 'tutor';
    const text = 'Hi ' + (String(c.name || '').split(' ')[0] || 'there') + ', ' + (c.reset ? 'here is a new temporary password for the Adventuity portal' : isT ? 'welcome to the Adventuity tutor team! Here is your tutor login' : 'here is your Adventuity learner login') + ':\n\nPortal: ' + portalUrl() + '\nE-mail: ' + c.email + '\nTemporary password: ' + c.password +
      '\n\nYou will choose your own password when you sign in. ' + (isT ? 'Your lessons, learners and the lesson board are in the portal. Please add your Google Meet link on the Today page.' : 'Your lessons, notes and past papers are in the portal.');
    return '<div class="card creds"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="eyebrow">' + (c.reset ? 'New temporary password' : isT ? 'Tutor account created' : 'Learner account created') + '</span><h3 style="margin-top:4px">' + esc(c.name || c.email) + '</h3></div><button class="btn sm ghost" data-action="creds-done">Done</button></div>' +
      '<div class="copybox" style="margin-top:10px"><code style="white-space:pre-line">E-mail: ' + esc(c.email) + '\nPassword: ' + esc(c.password) + '</code><button class="btn sm" data-action="copy" data-v="' + esc(c.password) + '">Copy password</button></div>' +
      '<div class="row" style="margin-top:10px">' + (c.phone ? '<a class="btn primary" href="' + esc(ADV.wa(c.phone, text)) + '" target="_blank" rel="noopener">Send on WhatsApp</a>' : '<a class="btn primary" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">Send on WhatsApp</a>') + '<button class="btn" data-action="copy" data-v="' + esc(text) + '">Copy the message</button></div>' +
      '<p class="small muted" style="margin-top:8px">This password is shown only now. If it gets lost, use Reset password.</p></div>';
  }
  ADV.actions['creds-done'] = () => { state.creds = null; ADV.render(); };

  /* new tutor / learner account */
  function accountForm() {
    const f = state.accForm; const isT = f.role === 'tutor';
    const inp = (id, label, type, ph, val, req) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph || '') + '" value="' + esc(val || '') + '"' + (req ? ' required' : '') + '></div>';
    return '<form id="f-acc" class="card stack"><h3>' + (isT ? 'Add a tutor' : 'Add a learner') + '</h3><p class="small muted">' + (isT ? 'Creates a tutor login with a temporary password. Send it on WhatsApp; they choose their own password when they first sign in.' : 'For learners who should not sign up themselves (e.g. sponsored learners). They get a temporary password and choose their own when they first sign in.') + '</p><div class="grid cols-2">' +
      inp('ac-name', 'Name and surname', 'text', isT ? 'e.g. Patience Mazibuko' : 'e.g. Priscilla Ngoie', f.name, true) + inp('ac-email', 'E-mail (their login)', 'email', 'name@example.com', f.email, true) + inp('ac-phone', 'WhatsApp number', 'tel', '082 123 4567', f.phone) +
      (isT ? '<div class="field"><label for="ac-rate">Pay per hour (R) – only you see this</label><input id="ac-rate" type="number" min="0" step="10" value="' + esc(f.rate != null ? f.rate : 160) + '"></div><div class="field"><label>Subjects</label><div class="row" style="gap:12px">' + Object.keys(SUBJ).map((k) => '<label class="check"><input type="checkbox" name="ac-subj" value="' + k + '" checked> ' + SUBJ[k].short + '</label>').join('') + '</div></div>' + inp('ac-meet', 'Their Google Meet link (optional – they can add it themselves)', 'url', 'https://meet.google.com/abc-defg-hij', f.meet)
        : inp('ac-school', 'School', 'text', 'e.g. The Settlers High School', f.school) + '<div class="field"><label for="ac-grade">Grade</label>' + ADV.gradeSelect('ac-grade', f.grade || 12) + '</div>' + '<label class="check" style="align-self:end"><input id="ac-unlock" type="checkbox" checked> Unlock the study notes</label>') +
      '</div><div class="row"><button class="btn primary" type="submit">Create the account</button><button class="btn" type="button" data-action="acc-cancel">Cancel</button></div></form>';
  }
  ADV.actions['acc-new'] = (a) => { state.accForm = { role: a.dataset.role }; state.creds = null; ADV.render(); const el = $('#ac-name'); if (el) el.focus(); };
  ADV.actions['acc-cancel'] = () => { state.accForm = null; ADV.render(); };
  async function saveAccount(e) {
    e.preventDefault(); const f = state.accForm; const isT = f.role === 'tutor'; const btn = e.target.querySelector('[type=submit]');
    const body = { action: 'create_account', role: f.role, full_name: $('#ac-name').value.trim(), email: $('#ac-email').value.trim(), phone: $('#ac-phone').value.trim(), password: 'Adv-' + rid(6) };
    if (isT) { body.tutor_rate = Number($('#ac-rate').value) || 0; body.tutor_subjects = $$('input[name="ac-subj"]:checked').map((x) => x.value).join(','); body.meet_link = $('#ac-meet').value.trim(); }
    else { body.school = $('#ac-school').value.trim(); body.grade = Number($('#ac-grade').value) || null; body.approved = $('#ac-unlock').checked; }
    if (body.meet_link && !/^https:\/\/\S{6,}$/.test(body.meet_link)) return toast('The Meet link must start with https://', 4000);
    btn.disabled = true;
    try {
      const r = await sb.fn('admin-users', body);
      if (r.profile) state.learners.unshift(r.profile); else await loadLearners();
      state.creds = { name: body.full_name, email: body.email.toLowerCase(), phone: body.phone, password: body.password, role: f.role }; state.accForm = null; ADV.render(); window.scrollTo({ top: 0 });
    } catch (err) { btn.disabled = false; toast(ADV.errMsg(err), 6000); }
  }

  /* team: tutor cards with their learners, lessons and pay */
  function taughtMins(list) { return list.reduce((n, b) => n + Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 6e4), 0); }
  const delivered = (b) => b.status === 'completed' || (b.status === 'accepted' && !!b.delivered_at);
  function teamView() {
    const list = tutors(); const mk = monthKey(now());
    const card = (t) => {
      const mine = state.bookings.filter((b) => b.tutor_id === t.id);
      const month = mine.filter((b) => delivered(b) && monthKey(b.starts_at) === mk); const hrs = taughtMins(month) / 60;
      const next = mine.filter((b) => b.status === 'accepted' && new Date(b.ends_at) > now()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      const unlogged = mine.filter((b) => b.status === 'accepted' && new Date(b.ends_at) < now() && !b.delivered_at).length;
      const asg = (state.assign || []).filter((x) => x.tutor_id === t.id && x.active);
      const edit = state.tEdit === t.id;
      const subj = (t.tutor_subjects || '').split(',').filter(Boolean).map((k) => SUBJ[k] ? SUBJ[k].short : k).join(', ');
      return '<div class="card" id="tu-card-' + t.id + '"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><div class="row" style="gap:6px"><h3>' + esc(t.full_name || t.email) + '</h3>' + (t.blocked ? pill('bad', 'Blocked') : t.must_change_password ? pill('warn', 'Has not signed in yet') : pill('good', 'Active')) + (unlogged ? pill('warn', unlogged + ' lesson' + (unlogged > 1 ? 's' : '') + ' not logged') : '') + '</div>' +
        '<p class="small muted" style="margin-top:4px">' + [t.email, t.phone, subj, Number(t.tutor_rate) ? fmt.rand(t.tutor_rate) + ' per hour' : ''].filter(Boolean).map(esc).join(' · ') + '</p>' +
        '<p class="small" style="margin-top:4px">' + ICON.video + ' ' + (t.meet_link ? 'Meet link: <a href="' + esc(t.meet_link) + '" target="_blank" rel="noopener">' + esc(t.meet_link.replace(/^https:\/\//, '')) + '</a>' : '<span class="muted">No Meet link yet – their lessons use the built-in classroom until they add one</span>') + '</p></div>' +
        '<div class="cd" style="min-width:150px"><span class="eyebrow">This month</span><div class="big" style="font-size:1.2rem">' + String(Math.round(hrs * 10) / 10).replace('.', ',') + ' h</div><span class="small muted">' + month.length + ' lesson' + (month.length === 1 ? '' : 's') + (Number(t.tutor_rate) ? ' · ' + fmt.rand(hrs * Number(t.tutor_rate)) : '') + '</span></div></div>' +
        '<div class="row" style="gap:6px;margin-top:10px">' + (asg.length ? asg.map((x) => { const l = profileOf(x.learner_id) || {}; const done = taughtMins(state.bookings.filter((b) => b.tutor_id === t.id && b.learner_id === x.learner_id && b.subject === x.subject && delivered(b))) / 60; return '<span class="chipbtn asg ' + x.subject + '" title="' + esc(x.note || '') + '">' + esc((l.full_name || 'Learner') + ' · ' + SUBJ[x.subject].short + ' · ' + String(Math.round(done * 10) / 10).replace('.', ',') + (Number(x.hours) ? '/' + String(Number(x.hours)).replace('.', ',') : '') + ' h') + ' <button class="x" data-action="asg-del" data-id="' + x.id + '" aria-label="Remove this learner from ' + esc(t.full_name || 'the tutor') + '">✕</button></span>'; }).join('') : '<span class="small muted">No learners assigned yet.</span>') + '</div>' +
        '<p class="small" style="margin-top:8px">' + (next[0] ? ICON.cal + ' Next: <b>' + esc((learnerOf(next[0]).full_name || 'Learner') + ' · ' + fmt.date(next[0].starts_at) + ' ' + fmt.time(next[0].starts_at)) + '</b>' + (next.length > 1 ? ' <span class="muted">and ' + (next.length - 1) + ' more</span>' : '') : '<span class="muted">No upcoming lessons.</span>') + '</p>' +
        (edit ? '<form id="f-tedit" data-id="' + t.id + '" class="decide"><div class="grid cols-2"><div class="field"><label for="te-name">Name and surname</label><input id="te-name" value="' + esc(t.full_name || '') + '"></div><div class="field"><label for="te-phone">WhatsApp number</label><input id="te-phone" type="tel" value="' + esc(t.phone || '') + '"></div><div class="field"><label for="te-rate">Pay per hour (R)</label><input id="te-rate" type="number" min="0" step="10" value="' + esc(Number(t.tutor_rate) || 0) + '"></div><div class="field"><label>Subjects</label><div class="row" style="gap:12px">' + Object.keys(SUBJ).map((k) => '<label class="check"><input type="checkbox" name="te-subj" value="' + k + '"' + ((t.tutor_subjects || '').split(',').includes(k) ? ' checked' : '') + '> ' + SUBJ[k].short + '</label>').join('') + '</div></div><div class="field" style="grid-column:1/-1"><label for="te-meet">Google Meet link</label><input id="te-meet" type="url" value="' + esc(t.meet_link || '') + '" placeholder="https://meet.google.com/…"></div></div><div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-action="t-edit" data-id="' + t.id + '">Cancel</button></div></form>' : '') +
        '<div class="row" style="margin-top:10px"><button class="btn sm primary" data-action="sched-go" data-tutor="' + t.id + '">' + ICON.cal + 'Schedule a lesson</button><button class="btn sm" data-action="asg-open" data-id="' + t.id + '">' + ICON.plus + 'Assign a learner</button>' + (t.phone ? '<a class="btn sm" href="' + esc(ADV.wa(t.phone)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '<button class="btn sm" data-action="msg-learner" data-id="' + t.id + '">' + ICON.chat + 'Message</button><button class="btn sm ghost" data-action="t-edit" data-id="' + t.id + '">Edit</button><button class="btn sm ghost" data-action="l-pass" data-id="' + t.id + '">Reset password</button><button class="btn sm ghost" data-action="l-set" data-id="' + t.id + '" data-k="blocked" data-v="' + (t.blocked ? '0' : '1') + '">' + (t.blocked ? 'Unblock' : 'Block') + '</button><button class="btn sm ghost" data-action="t-del" data-id="' + t.id + '">Remove</button></div></div>';
    };
    const a = state.asgForm;
    const asgForm = a ? '<form id="f-asg" class="card stack"><h3>Assign a learner to a tutor</h3><p class="small muted">The tutor then sees the learner\'s name, school and hours under My learners (not their phone number or e-mail).</p><div class="grid cols-3">' +
      '<div class="field"><label for="as-learner">Learner</label><select id="as-learner" required><option value="">Choose…</option>' + learnersOnly().filter((l) => !l.blocked).sort((x, y) => (x.full_name || '').localeCompare(y.full_name || '')).map((l) => '<option value="' + l.id + '"' + (a.learner === l.id ? ' selected' : '') + '>' + esc((l.full_name || l.email) + (l.school ? ' – ' + l.school : '')) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="as-tutor">Tutor</label><select id="as-tutor" required>' + list.filter((t) => !t.blocked).map((t) => '<option value="' + t.id + '"' + (a.tutor === t.id ? ' selected' : '') + '>' + esc(t.full_name || t.email) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="as-subj">Subject</label><select id="as-subj">' + Object.keys(SUBJ).map((k) => '<option value="' + k + '">' + SUBJ[k].short + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="as-hours">Hours allocated (optional)</label><input id="as-hours" type="number" min="0" max="500" step="0.5" placeholder="e.g. 10"></div><div class="field" style="grid-column:span 2"><label for="as-note">Note for the tutor (optional)</label><input id="as-note" maxlength="500" placeholder="e.g. Writes Maths P1 on Friday – focus on calculus and functions"></div></div>' +
      '<div class="row"><button class="btn primary" type="submit">Assign</button><button class="btn" type="button" data-action="asg-cancel">Cancel</button></div></form>' : '';
    return '<div class="stack">' + credsPanel() + (state.accForm && state.accForm.role === 'tutor' ? accountForm() : '') + asgForm +
      (state.accForm || a ? '' : '<div class="row"><button class="btn primary" data-action="acc-new" data-role="tutor">' + ICON.plus + 'Add a tutor</button>' + (list.length ? '<button class="btn" data-action="asg-open">Assign a learner</button><button class="btn" data-action="sched-go">' + ICON.cal + 'Schedule a lesson</button>' : '') + '</div>') +
      (list.length ? list.map(card).join('') : '<div class="card"><p class="muted">No tutors yet. Add one to give them a login – or accept an application and add them from there.</p></div>') + '</div>';
  }
  ADV.actions['t-edit'] = (a) => { state.tEdit = state.tEdit === a.dataset.id ? null : a.dataset.id; ADV.render(); };
  ADV.actions['asg-open'] = (a) => { state.asgForm = { tutor: a.dataset.id || '' }; state.accForm = null; state.tView = 'team'; ADV.render(); window.scrollTo({ top: 0 }); };
  ADV.actions['asg-cancel'] = () => { state.asgForm = null; ADV.render(); };
  ADV.actions['asg-del'] = async (a) => {
    const x = (state.assign || []).find((y) => y.id === a.dataset.id); const l = profileOf(x.learner_id) || {}; const t = profileOf(x.tutor_id) || {};
    if (!confirm('Remove ' + (l.full_name || 'this learner') + ' (' + SUBJ[x.subject].short + ') from ' + (t.full_name || 'the tutor') + '? Lessons already scheduled stay as they are.')) return;
    try { await sb.update('assignments', { id: 'eq.' + x.id }, { active: false }); await loadAssign(); ADV.render(); toast('Removed'); } catch (e) { toast(ADV.errMsg(e)); }
  };
  ADV.actions['t-del'] = async (a) => {
    const t = profileOf(a.dataset.id); const up = state.bookings.filter((b) => b.tutor_id === t.id && b.status === 'accepted' && new Date(b.ends_at) > now()).length;
    if (!confirm('Remove ' + (t.full_name || t.email) + '\'s tutor account? ' + (up ? up + ' upcoming lesson' + (up > 1 ? 's go' : ' goes') + ' back to you. ' : '') + 'Past lessons keep their log. This cannot be undone – to pause a tutor, use Block instead.')) return;
    try { await sb.fn('admin-users', { action: 'delete', user_id: t.id }); state.learners = state.learners.filter((x) => x.id !== t.id); await loadAssign(); await reload(); toast('Tutor account removed'); } catch (e) { toast(ADV.errMsg(e)); }
  };

  /* schedule lessons for a learner with a tutor (or yourself) */
  function scheduleView() {
    const f = state.sched || (state.sched = { learner: '', tutor: '' });
    const L = learnersOnly().filter((l) => !l.blocked).sort((x, y) => (x.full_name || '').localeCompare(y.full_name || ''));
    const asg = f.learner ? assignFor(f.learner, f.subject) : null;
    const tut = f.tutorSet || f.tutor ? (f.tutor || '') : (asg ? asg.tutor_id : '');
    const subj = f.subject || (asg ? asg.subject : 'maths'); const t = tut ? profileOf(tut) : null;
    const done = state.lastSched;
    const share = done ? (() => {
      const l = profileOf(done.learner) || {}; const tt = done.tutor ? profileOf(done.tutor) : null; const rows = done.rows;
      return '<div class="card creds"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="eyebrow">Scheduled ✔</span><h3 style="margin-top:4px">' + rows.length + ' lesson' + (rows.length > 1 ? 's' : '') + ' for ' + esc(l.full_name || 'the learner') + (tt ? ' with ' + esc(tt.full_name) : '') + '</h3><p class="small muted">Both see ' + (rows.length > 1 ? 'them' : 'it') + ' in their portal now' + (tt ? ' and get a notification' : '') + '. Send the times on WhatsApp:</p></div><button class="btn sm ghost" data-action="sched-done">Done</button></div>' +
        '<div class="row" style="margin-top:10px">' + (tt ? '<a class="btn primary" href="' + esc(tt.phone ? ADV.wa(tt.phone, tutorMsg(tt, l, done.subject, rows, rows[0].room)) : 'https://wa.me/?text=' + encodeURIComponent(tutorMsg(tt, l, done.subject, rows, rows[0].room))) + '" target="_blank" rel="noopener">WhatsApp ' + esc(firstName(tt)) + ' (tutor)</a>' : '') +
        '<a class="btn ' + (tt ? '' : 'primary') + '" href="' + esc(l.phone ? ADV.wa(l.phone, learnerMsg(l, tt, done.subject, rows)) : 'https://wa.me/?text=' + encodeURIComponent(learnerMsg(l, tt, done.subject, rows))) + '" target="_blank" rel="noopener">WhatsApp ' + esc(firstName(l) || 'the learner') + '</a>' +
        (l.guardian_phone ? '<a class="btn" href="' + esc(ADV.wa(l.guardian_phone, learnerMsg(l, tt, done.subject, rows).replace(/^Hi [^,]*, your/, 'Hello, ' + (firstName(l) || 'your child') + '\'s'))) + '" target="_blank" rel="noopener">WhatsApp the parent</a>' : '') +
        '<button class="btn sm" data-action="copy" data-v="' + esc(learnerMsg(l, tt, done.subject, rows)) + '">Copy learner message</button>' + (tt ? '<button class="btn sm" data-action="copy" data-v="' + esc(tutorMsg(tt, l, done.subject, rows, rows[0].room)) + '">Copy tutor message</button>' : '') + '</div></div>';
    })() : '';
    const day = f.date || fmt.key(Date.now() + 864e5);
    const linkHint = t ? (t.meet_link ? 'Empty = ' + firstName(t) + '\'s Meet link (' + t.meet_link.replace(/^https:\/\//, '') + ')' : 'Empty = the built-in classroom (' + firstName(t) + ' has no Meet link yet)') : ((state.priv.meeting || {}).link ? 'Empty = your meeting link from Settings' : 'Empty = a private built-in classroom');
    const upT = state.bookings.filter((b) => b.tutor_id && b.status === 'accepted' && new Date(b.ends_at) > now()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return '<div class="stack">' + share +
      '<form id="f-sched" class="card stack"><div><h3>Schedule lessons</h3><p class="small muted">Add one or several days and times. The lessons are confirmed straight away and show up in the learner\'s and the tutor\'s portal with a Join button for each time.</p></div><div class="grid cols-3" style="align-items:start">' +
      '<div class="field"><label for="sc-learner">Learner</label><select id="sc-learner" required><option value="">Choose…</option>' + L.map((l) => '<option value="' + l.id + '"' + (f.learner === l.id ? ' selected' : '') + '>' + esc((l.full_name || l.email) + (l.school ? ' – ' + l.school : '')) + '</option>').join('') + '</select><span class="small muted">Not listed? <button type="button" class="linkbtn" data-action="acc-new-learner">Add a learner</button></span></div>' +
      '<div class="field"><label for="sc-tutor">Tutor</label>' + tutorSelect('sc-tutor', tut, subj) + (asg && asg.tutor_id === tut ? '<span class="small muted">Assigned tutor for ' + SUBJ[asg.subject].short + '</span>' : '') + '</div>' +
      '<div class="field"><label for="sc-subj">Subject</label><select id="sc-subj">' + Object.keys(SUBJ).map((k) => '<option value="' + k + '"' + (subj === k ? ' selected' : '') + '>' + SUBJ[k].short + '</option>').join('') + '</select></div>' +
      '<div style="grid-column:1/-1">' + ADV.slots.html('sc', { date: day, time: '18:00' }) + '</div>' +
      '<div class="field"><label for="sc-fee">Fee per lesson (R)</label><input id="sc-fee" type="number" min="0" step="10" placeholder="Automatic" value="' + esc(f.fee != null ? f.fee : '') + '"><span class="small muted">' + esc(feeHint(f.learner, subj)) + '</span></div>' +
      '<div class="field"><label for="sc-link">Meeting link (optional)</label><input id="sc-link" type="url" placeholder="https://meet.google.com/…" value="' + esc(f.link || '') + '"><span class="small muted" id="sc-link-hint">' + esc(linkHint) + '</span></div>' +
      '<div class="field" style="grid-column:1/-1"><label for="sc-msg">Note for the learner and tutor (optional)</label><input id="sc-msg" maxlength="500" value="' + esc(f.msg || '') + '" placeholder="e.g. Exam prep for Paper 1 on Friday – bring the 2024 paper"></div></div>' +
      '<div class="row"><button class="btn primary" type="submit">' + ICON.check + 'Schedule</button></div></form>' +
      '<h2>Upcoming lessons with tutors</h2>' + (upT.length ? upT.slice(0, 30).map(bookingCard).join('') : '<div class="card"><p class="muted">None yet.</p></div>') + '</div>';
  }
  ADV.actions['sched-done'] = () => { state.lastSched = null; ADV.render(); };
  ADV.actions['acc-new-learner'] = () => { state.accForm = { role: 'learner' }; ADV.go('learners'); };
  function readSched() { const v = (id) => ($(id) || {}).value; if ($('#sc-slots')) ADV.slots.read('sc'); return { learner: v('#sc-learner') || '', tutor: v('#sc-tutor') || '', subject: v('#sc-subj'), fee: v('#sc-fee'), link: (v('#sc-link') || '').trim(), msg: (v('#sc-msg') || '').trim() }; }
  /* the fee per lesson when none is typed: nothing for sponsored learners (the sponsor gets an invoice), otherwise the hourly fee */
  function autoFee(learnerId, subject, mins, bundleLeft) { const l = profileOf(learnerId); if (l && l.sponsor_id) return 0; if (bundleLeft && bundleLeft.h >= mins / 60 - 0.001) { bundleLeft.h -= mins / 60; return 0; } const fees = ADV.setting('fees', {}); const rate = Number(fees[subject] != null ? fees[subject] : fees.maths) || 0; return Math.round(rate * mins / 60 * 100) / 100; }
  function feeHint(learnerId, subject) { const l = learnerId ? profileOf(learnerId) : null; if (l && l.sponsor_id) { const sp = (state.sponsors || []).find((x) => x.id === l.sponsor_id); return 'Empty = R0 – ' + ((sp && sp.name) || 'the sponsor') + ' pays (invoice under Analysis).'; } const bh = learnerId && ADV.bundleHoursFor ? ADV.bundleHoursFor(learnerId) : 0; return (bh ? 'Empty = from the learner\'s bundle (' + String(Math.round(bh * 10) / 10).replace('.', ',') + ' h left), then ' : 'Empty = ') + 'the hourly fee × length (' + fmt.rand(autoFee(learnerId, subject, 60)) + ' per hour). 0 for free lessons.'; }
  async function saveSched(e) {
    e.preventDefault(); const f = readSched(); state.sched = f; const btn = e.target.querySelector('[type=submit]');
    if (!f.learner) return toast('Choose the learner');
    if (f.link && !/^https:\/\/\S{6,}$/.test(f.link)) return toast('The meeting link must start with https://', 4000);
    const list = ADV.slots.expand('sc'); const pr = ADV.slots.problems(list); if (pr.length) return toast(pr[0], 5000);
    const t = f.tutor ? profileOf(f.tutor) : null;
    const room = f.link || (t ? t.meet_link : (state.priv.meeting || {}).link) || '';
    const bl = { h: ADV.bundleHoursFor ? ADV.bundleHoursFor(f.learner) : 0 };
    const rows = list.map((x) => ({ learner_id: f.learner, tutor_id: t ? t.id : null, subject: f.subject, kind: 'one-on-one', starts_at: x.s.toISOString(), ends_at: x.e.toISOString(), status: 'accepted', fee: f.fee === '' || f.fee == null ? autoFee(f.learner, f.subject, x.m, bl) : Math.max(0, Number(f.fee) || 0), paid: false, admin_message: f.msg, room: room || 'AdventuityLesson-' + rid(10) }));
    const cl = rows.flatMap((r) => clashes(Object.assign({ id: '-' }, r))); if (cl.length && !confirm('Clashes with ' + cl.length + ' lesson' + (cl.length > 1 ? 's' : '') + ' of this tutor or learner (' + cl.slice(0, 3).map((x) => (learnerOf(x).full_name || 'lesson') + ' ' + fmt.date(x.starts_at) + ' ' + fmt.time(x.starts_at)).join('; ') + '). Schedule anyway?')) return;
    btn.disabled = true;
    try {
      const made = await sb.insert('bookings', rows); made.forEach((b) => ADV.notify(b.id, 'accepted'));
      if (t && !assignFor(f.learner, f.subject) && confirm('Also assign ' + ((profileOf(f.learner) || {}).full_name || 'this learner') + ' to ' + (t.full_name || 'this tutor') + ' for ' + SUBJ[f.subject].short + '? Then the tutor sees them under My learners.')) {
        try { await sb.upsert('assignments', [{ learner_id: f.learner, tutor_id: t.id, subject: f.subject, active: true }], 'learner_id,tutor_id,subject'); await loadAssign(); } catch (err) { toast(ADV.errMsg(err)); }
      }
      state.lastSched = { learner: f.learner, tutor: t ? t.id : '', subject: f.subject, rows: made.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)) };
      state.sched = { learner: '', tutor: '' }; ADV.slots.reset('sc'); await reload(); window.scrollTo({ top: 0 });
    } catch (err) { btn.disabled = false; toast(ADV.errMsg(err), 6000); }
  }

  async function saveAsg(e) {
    e.preventDefault(); const row = { learner_id: $('#as-learner').value, tutor_id: $('#as-tutor').value, subject: $('#as-subj').value, hours: Math.max(0, Number($('#as-hours').value) || 0), note: $('#as-note').value.trim(), active: true };
    if (!row.learner_id || !row.tutor_id) return toast('Choose the learner and the tutor');
    try { await sb.upsert('assignments', [row], 'learner_id,tutor_id,subject'); await loadAssign(); state.asgForm = null; toast('Assigned – ' + ((profileOf(row.tutor_id) || {}).full_name || 'the tutor') + ' sees this learner now'); ADV.render(); }
    catch (err) { toast(ADV.errMsg(err)); }
  }
  async function saveTutor(e) {
    e.preventDefault(); const id = e.target.dataset.id; const link = $('#te-meet').value.trim();
    if (link && !/^https:\/\/\S{6,}$/.test(link)) return toast('The Meet link must start with https://', 4000);
    const t = profileOf(id); const old = t.meet_link || '';
    const patch = { full_name: $('#te-name').value.trim(), phone: $('#te-phone').value.trim(), tutor_rate: Math.max(0, Number($('#te-rate').value) || 0), tutor_subjects: $$('input[name="te-subj"]:checked').map((x) => x.value).join(','), meet_link: link };
    try {
      const r = await sb.update('profiles', { id: 'eq.' + id }, patch); Object.assign(t, r[0] || patch); state.tEdit = null;
      if (link !== old) { const up = state.bookings.filter((b) => b.tutor_id === id && b.status === 'accepted' && new Date(b.ends_at) > now() && (!/^https:\/\//.test(b.room || '') || (old && b.room === old))); for (const b of up) { try { await sb.update('bookings', { id: 'eq.' + b.id }, { room: link || 'AdventuityLesson-' + rid(10) }); } catch (err) { /* keep going */ } } if (up.length) toast('Saved – ' + up.length + ' upcoming lesson' + (up.length > 1 ? 's use' : ' uses') + ' the new link'); else toast('Saved'); await reload(); }
      else { toast('Saved'); ADV.render(); }
    } catch (err) { toast(ADV.errMsg(err)); }
  }

  /* ---------------------------------------------------------------- settings */
  async function savePublic(key, value) { await sb.upsert('public_settings', [{ key, value, updated_at: new Date().toISOString() }], 'key'); state.settings[key] = value; }
  async function savePrivate(key, value) { await sb.upsert('private_settings', [{ key, value, updated_at: new Date().toISOString() }], 'key'); state.priv[key] = value; }
  ADV.views.settings = function () {
    const site = ADV.setting('site', {}); const bk = Object.assign({ slotMinutes: 30, durations: [60, 90, 120], daysAhead: 21, minNoticeHours: 3, blocked: [] }, ADV.setting('booking', {}));
    const av = ADV.setting('availability', 'Mon-Fri 16:00-20:00; Sat 09:00-13:00'); const open = !!(state.settings.access && state.settings.access.open);
    const notify = state.priv.notify || {}; const meet = state.priv.meeting || {}; const cls = state.priv.class || {};
    const inp = (id, label, val, ph, type, help) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(ph || '') + '">' + (help ? '<span class="small muted">' + help + '</span>' : '') + '</div>';
    const parsed = ADV.parseAvailability(av); const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const avPreview = [1, 2, 3, 4, 5, 6, 0].map((d) => '<span class="pill ' + (parsed[d] ? 'good' : '') + '">' + DN[d] + ' ' + (parsed[d] ? parsed[d].map(([a, b]) => String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0') + '–' + String(Math.floor(b / 60)).padStart(2, '0') + ':' + String(b % 60).padStart(2, '0')).join(', ') : 'closed') + '</span>').join(' ');
    return '<div class="stack"><div><span class="eyebrow">Settings</span><h1>Settings</h1><p class="small muted">Changes apply immediately for everyone – no files to edit.</p></div>' +
      '<form id="f-avail" class="card stack"><div><h3>When learners can book</h3><p class="small muted">Write your teaching hours like <span class="mono">Mon-Fri 16:00-20:00; Sat 09:00-13:00</span>. Times already booked are hidden from other learners automatically.</p></div>' +
      inp('s-avail', 'Teaching hours', av, 'Mon-Fri 16:00-20:00; Sat 09:00-13:00') + '<div class="row" style="gap:6px">' + avPreview + '</div>' +
      '<div class="grid cols-4"><div class="field"><label for="s-step">Start times every</label><select id="s-step">' + [15, 30, 60].map((m) => '<option value="' + m + '"' + (Number(bk.slotMinutes) === m ? ' selected' : '') + '>' + m + ' minutes</option>').join('') + '</select></div>' + inp('s-ahead', 'Book up to (days ahead)', bk.daysAhead, '', 'number') + inp('s-notice', 'Minimum notice (hours)', bk.minNoticeHours, '', 'number') +
      '<div class="field"><label>Lesson lengths offered</label><div class="row" style="gap:10px">' + [30, 45, 60, 90, 120].map((m) => '<label class="check"><input type="checkbox" name="s-dur" value="' + m + '"' + (bk.durations.includes(m) ? ' checked' : '') + '> ' + fmt.mins(m) + '</label>').join('') + '</div></div></div>' +
      '<div class="field"><label for="s-block">Days off (no bookings)</label><div class="row">' + ADV.dateSelect('s-block', '', { blank: true, days: 365 }) + '<button class="btn sm" type="button" data-action="block-add">Add day off</button></div><div class="row" style="gap:6px;margin-top:6px">' + (bk.blocked || []).filter((d) => d >= fmt.key(now())).map((d) => '<button type="button" class="chipbtn" data-action="block-del" data-id="' + d + '">' + esc(fmt.date(d + 'T12:00:00+02:00')) + ' ✕</button>').join('') + '</div></div>' +
      '<div class="row"><button class="btn primary" type="submit">Save booking settings</button></div></form>' +
      '<form id="f-access" class="card stack"><div><h3>Who can read the study notes</h3><p class="small muted">The notes are encrypted; only these learners get the key. Booking is always open to everyone with an account.</p></div><label class="check"><input type="radio" name="s-open" value="0"' + (open ? '' : ' checked') + '> Only learners I unlock (recommended – unlock them under Learners)</label><label class="check"><input type="radio" name="s-open" value="1"' + (open ? ' checked' : '') + '> Everyone who creates an account</label><div class="row"><button class="btn primary" type="submit">Save</button></div></form>' +
      '<form id="f-notify" class="card stack"><div><h3>Notifications to you</h3><p class="small muted">You get a notification on every device where you tap “Turn on” (Dashboard or Account), and an e-mail for every new request and message. The very first e-mail asks you to confirm the address once (sent by FormSubmit) – click the link in it.</p></div>' + inp('s-email', 'E-mail for alerts', notify.email || state.profile.email, 'you@example.com', 'email') + '<div class="row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-action="mail-test">Send a test e-mail</button></div></form>' +
      '<form id="f-meet" class="card stack"><div><h3>Online classroom</h3><p class="small muted">By default every accepted lesson gets its own private room (video, screen share, whiteboard and chat) that opens in a new window – no account needed for learners. The first time you start a lesson, the room asks you to sign in once with Google so you are the host; learners wait in the lobby until you arrive.</p></div>' + inp('s-meet', 'Use my own meeting link instead (optional – e.g. a Microsoft Teams or Google Meet link)', meet.link, 'https://teams.microsoft.com/…', 'url', 'Leave empty for a new private room per lesson.') + inp('s-drive', 'Class folder for learners (optional – e.g. a Google Drive folder link)', cls.drive, 'https://drive.google.com/…', 'url', 'Shown under Papers to signed-in learners.') + '<div class="row"><button class="btn primary" type="submit">Save</button></div></form>' +
      '<form id="f-site" class="card stack"><div><h3>Your business details</h3></div><div class="grid cols-2">' + inp('s-brand', 'Business name', site.brand || 'Adventuity') + inp('s-tutor', 'Your name (shown in lessons)', site.tutorName || state.profile.full_name) + inp('s-tag', 'Tagline', site.tagline || 'Grade 12 Maths & Physical Sciences') + inp('s-wa', 'WhatsApp number (shown to learners)', site.whatsapp, '082 123 4567', 'tel') + inp('s-review', 'Google review link (optional)', site.reviewUrl, 'https://g.page/r/…/review', 'url', 'From your Google Business Profile → “Ask for reviews”. Learners see it after a completed lesson – real reviews help you rank higher.') + '</div><div class="field"><label for="s-notice">Notice on every learner\'s home page (optional)</label><textarea id="s-notice" placeholder="e.g. No lessons on 24 September. Group class on calculus this Saturday!">' + esc(site.notice || '') + '</textarea></div><div class="row"><button class="btn primary" type="submit">Save</button></div></form>' +
      shareCard() + '</div>';
  };
  ADV.actions['block-add'] = async () => { const d = $('#s-block').value; if (!d) return toast('Choose a date'); const bk = Object.assign({}, ADV.setting('booking', {})); bk.blocked = Array.from(new Set((bk.blocked || []).concat(d))).sort(); try { await savePublic('booking', bk); toast('Day off added'); ADV.render(); } catch (e) { toast(ADV.errMsg(e)); } };
  ADV.actions['block-del'] = async (a) => { const bk = Object.assign({}, ADV.setting('booking', {})); bk.blocked = (bk.blocked || []).filter((d) => d !== a.dataset.id); try { await savePublic('booking', bk); ADV.render(); } catch (e) { toast(ADV.errMsg(e)); } };
  ADV.actions['mail-test'] = async () => { const to = $('#s-email').value.trim(); if (!to) return; await savePrivate('notify', { email: to }); await ADV.emailTutor('Test from your Adventuity portal', { Message: 'E-mail alerts are working. New booking requests and messages arrive like this.', Portal: portalUrl() }); toast('Sent – check ' + to + ' (and spam). Confirm the first FormSubmit e-mail.', 6000); };

  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    const id = e.target.id; if (!['f-class', 'f-fees', 'f-pay', 'f-avail', 'f-access', 'f-notify', 'f-meet', 'f-site', 'f-acc', 'f-sched', 'f-asg', 'f-tedit'].includes(id)) return;
    if (id === 'f-class') return saveClass(e);
    if (id === 'f-acc') return saveAccount(e);
    if (id === 'f-sched') return saveSched(e);
    if (id === 'f-asg') return saveAsg(e);
    if (id === 'f-tedit') return saveTutor(e);
    e.preventDefault(); const btn = e.target.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try {
      if (id === 'f-fees') { const n = (x) => Math.max(0, Number($(x).value) || 0); await savePublic('fees', { maths: n('#fee-maths'), phys: n('#fee-phys'), chem: n('#fee-chem'), life: n('#fee-life'), group: n('#fee-group') }); }
      if (id === 'f-pay') await savePrivate('payment', { text: $('#pay-text').value.trim(), link: $('#pay-link').value.trim() });
      if (id === 'f-avail') {
        const av = $('#s-avail').value.trim(); if (!Object.keys(ADV.parseAvailability(av)).length) throw new Error('Write the hours like: Mon-Fri 16:00-20:00; Sat 09:00-13:00');
        const durs = $$('input[name="s-dur"]:checked').map((x) => Number(x.value)); if (!durs.length) throw new Error('Choose at least one lesson length');
        await savePublic('availability', av); await savePublic('booking', Object.assign({}, ADV.setting('booking', {}), { slotMinutes: Number($('#s-step').value), daysAhead: Math.min(120, Math.max(1, Number($('#s-ahead').value) || 21)), minNoticeHours: Math.max(1, Number($('#s-notice').value) || 3), durations: durs }));
      }
      if (id === 'f-access') await savePublic('access', { open: ($$('input[name="s-open"]:checked')[0] || {}).value === '1' });
      if (id === 'f-notify') await savePrivate('notify', { email: $('#s-email').value.trim() });
      if (id === 'f-meet') { await savePrivate('meeting', { link: $('#s-meet').value.trim() }); await savePrivate('class', { drive: $('#s-drive').value.trim() }); }
      if (id === 'f-site') await savePublic('site', Object.assign({}, ADV.setting('site', {}), { brand: $('#s-brand').value.trim() || 'Adventuity', tutorName: $('#s-tutor').value.trim(), tagline: $('#s-tag').value.trim(), whatsapp: $('#s-wa').value.trim(), reviewUrl: $('#s-review').value.trim(), notice: $('#s-notice').value.trim() }));
      toast('Saved'); ADV.render();
    } catch (err) { toast(ADV.errMsg(err), 5000); if (btn) btn.disabled = false; }
  };
  const prevInput = ADV.onInput;
  ADV.onInput = function (e) {
    if (prevInput) prevInput(e);
    if (e.target.id === 'bq' || e.target.id === 'lq') { state[e.target.id] = e.target.value; const pos = e.target.selectionStart; ADV.render(); const el = $('#' + e.target.id); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }
  };
})();
