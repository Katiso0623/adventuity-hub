/* Adventuity portal – scheduling several lessons at once (shared by the director and tutors), the tutor's Schedule page,
   tutors adding learners and sending them their login details on WhatsApp. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, $$, esc, fmt, pill, ICON, state, sb, SUBJ, toast } = ADV; const now = ADV.now;
  const DAY = 864e5;
  const rid = (n) => { const a = new Uint8Array(n || 8); crypto.getRandomValues(a); return Array.from(a, (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
  const portalUrl = () => location.origin + location.pathname;
  const firstName = (n) => String(n || '').trim().split(' ')[0];
  const addDays = (k, n) => fmt.key(new Date(k + 'T12:00:00+02:00').getTime() + n * DAY);
  const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const hrs = ADV.hrsText = (h) => String(Math.round(Number(h || 0) * 10) / 10).replace('.', ',') + ' h';
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

  /* ================================================================ several days and times at once
     Each row is one lesson (day, start, length); "Repeat" copies all rows weekly. Row ids use a stable key, so removing
     a row never moves typed values into the wrong row. */
  const S = ADV.slots = { onUpdate: {} };
  let seq = 0;
  S.init = (p, o) => {
    state.slots = state.slots || {};
    if (!state.slots[p]) { o = o || {}; state.slots[p] = { rows: [{ k: ++seq, date: o.date || fmt.key(+now() + DAY), time: o.time || '16:00', mins: Number(o.mins) || 60 }], rep: 1 }; }
    return state.slots[p];
  };
  S.reset = (p) => { if (state.slots) delete state.slots[p]; };
  S.read = (p) => {
    const f = S.init(p);
    f.rows.forEach((r) => { r.date = val(p + '-d-' + r.k) || r.date; r.time = ADV.readTime(p + '-t-' + r.k) || r.time; r.mins = Number(val(p + '-m-' + r.k)) || r.mins; });
    f.rep = Number(val(p + '-rep')) || f.rep || 1; return f;
  };
  S.list = (f) => {
    const out = [];
    for (let w = 0; w < Math.max(1, f.rep || 1); w++) f.rows.forEach((r) => { const s = new Date(+ADV.sast(r.date, r.time) + w * 7 * DAY); out.push({ s, e: new Date(+s + r.mins * 6e4), m: r.mins }); });
    return out.sort((a, b) => a.s - b.s);
  };
  S.expand = (p) => S.list(S.read(p));
  S.problems = (list) => {
    const out = []; const over = list.filter((x) => x.e <= now());
    if (over.length) out.push('The lesson on ' + fmt.date(over[0].s) + ' at ' + fmt.time(over[0].s) + ' would already be over – choose a later time.');
    for (let i = 1; i < list.length; i++) if (list[i].s < list[i - 1].e) { out.push(fmt.date(list[i].s) + ' ' + fmt.time(list[i].s) + ' overlaps the lesson before it – change one of them.'); break; }
    if (list.length > 60) out.push('Schedule at most 60 lessons at once.');
    return out;
  };
  const sumHtml = (list) => {
    const h = list.reduce((n, x) => n + x.m, 0) / 60; const pr = S.problems(list);
    return '<b>' + list.length + ' lesson' + (list.length === 1 ? '' : 's') + ' · ' + hrs(h) + '</b>: ' + esc(list.slice(0, 8).map((x) => fmt.date(x.s) + ' ' + fmt.time(x.s)).join(', ')) + (list.length > 8 ? ' and ' + (list.length - 8) + ' more' : '') +
      (pr.length ? '<span class="slot-warn" role="alert">' + esc(pr[0]) + '</span>' : '');
  };
  S.html = (p, o) => {
    const f = S.init(p, o);
    const rows = f.rows.map((r, i) =>
      '<div class="slot-row"><div class="field"><label for="' + p + '-d-' + r.k + '">' + (i ? 'Day' : 'Day') + '</label>' + ADV.dateSelect(p + '-d-' + r.k, r.date, { required: true }) + '</div>' +
      '<div class="field"><label for="' + p + '-t-' + r.k + '-h">Start</label>' + ADV.timeSelect(p + '-t-' + r.k, r.time) + '</div>' +
      '<div class="field"><label for="' + p + '-m-' + r.k + '">Length (time limit)</label>' + ADV.lengthSelect(p + '-m-' + r.k, r.mins) + '</div>' +
      '<div class="slot-x">' + (i === 0 ? '<button type="button" class="chipbtn" data-keep data-action="slot-now" data-p="' + p + '" data-k="' + r.k + '" title="Start now (rounded down to 5 minutes)">Now</button>' : '') +
      (f.rows.length > 1 ? '<button type="button" class="btn sm ghost" data-keep data-action="slot-del" data-p="' + p + '" data-k="' + r.k + '" aria-label="Remove this day and time">✕</button>' : '') + '</div></div>').join('');
    return '<div class="slots" id="' + p + '-slots"><div><b>Days and times</b><p class="small muted">One row per lesson. Add every day and time you agreed – they are all booked in one go. Join closes 5 minutes after each lesson ends.</p></div>' + rows +
      '<div class="row" style="gap:10px"><button type="button" class="btn sm" data-keep data-action="slot-add" data-p="' + p + '">' + ICON.plus + 'Add another day / time</button>' +
      '<label class="row small" style="gap:6px" for="' + p + '-rep">Repeat <select id="' + p + '-rep" style="width:auto">' + [1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => '<option value="' + n + '"' + (Number(f.rep) === n ? ' selected' : '') + '>' + (n === 1 ? 'once' : 'every week for ' + n + ' weeks') + '</option>').join('') + '</select></label></div>' +
      '<p class="small slot-sum" id="' + p + '-sum" aria-live="polite">' + sumHtml(S.list(f)) + '</p></div>';
  };
  S.refresh = (p) => { const el = document.getElementById(p + '-sum'); const list = S.expand(p); if (el) el.innerHTML = sumHtml(list); if (S.onUpdate[p]) S.onUpdate[p](list); };
  ADV.actions['slot-add'] = (a) => { const p = a.dataset.p; const f = S.read(p); const last = f.rows[f.rows.length - 1]; f.rows.push({ k: ++seq, date: addDays(last.date, 1), time: last.time, mins: last.mins }); ADV.render(); const el = document.getElementById(p + '-d-' + seq); if (el) el.focus(); };
  ADV.actions['slot-del'] = (a) => { const p = a.dataset.p; const f = S.read(p); f.rows = f.rows.filter((r) => String(r.k) !== a.dataset.k); ADV.render(); };
  ADV.actions['slot-now'] = (a) => {
    const p = a.dataset.p; const f = S.read(p); const r = f.rows.find((x) => String(x.k) === a.dataset.k) || f.rows[0]; const t = new Date(Math.floor(+now() / 3e5) * 3e5);
    r.date = fmt.key(t); r.time = hhmm(t); ADV.render();
    // set the pickers and announce the change, so a later redraw keeps "now" instead of what was chosen before
    const d = document.getElementById(p + '-d-' + r.k); if (d) d.value = r.date; ADV.setTime(p + '-t-' + r.k, r.time);
    [p + '-d-' + r.k, p + '-t-' + r.k + '-h', p + '-t-' + r.k + '-m'].forEach((id) => { const el = document.getElementById(id); if (el) el.dispatchEvent(new Event('change', { bubbles: true })); });
  };

  const prevChange = ADV.onChange;
  ADV.onChange = function (e) {
    if (prevChange) prevChange(e);
    const id = (e.target && e.target.id) || ''; const m = id.match(/^(sc|ts)-(d|t|m|rep)\b/); if (m) S.refresh(m[1]);
    if (id === 'ts-who') { readTs(); ADV.render(); }
  };

  /* ================================================================ tutors: schedule lessons for their learners */
  const combos = () => (state.myLearners || []).map((l) => ({ key: l.learner_id + '|' + l.subject, l }));
  const comboOf = (key) => { const c = combos().find((x) => x.key === key); return c ? c.l : null; };
  function readTs() { const f = state.tsf || (state.tsf = {}); if ($('#ts-who')) { f.key = val('ts-who'); f.link = val('ts-link').trim(); f.note = val('ts-note').trim(); } if ($('#ts-slots')) S.read('ts'); return f; }
  function hoursPanel(l, list) {
    if (!l) return '';
    const alloc = Number(l.hours) || 0, done = Number(l.taught) || 0, booked = Number(l.booked) || 0, adding = (list || []).reduce((n, x) => n + x.m, 0) / 60;
    const cell = (k, v) => '<div class="cd"><span class="eyebrow">' + k + '</span><div class="big" style="font-size:1.1rem">' + v + '</div></div>';
    const left = alloc - done - booked - adding;
    return '<div class="hours-panel"><div class="grid cols-4">' + cell('Allocated', alloc ? hrs(alloc) : 'No limit') + cell('Taught', hrs(done)) + cell('Booked, not taught yet', hrs(booked)) + cell('This booking', hrs(adding)) + '</div>' +
      (alloc ? (left < -0.01 ? '<p class="slot-warn" role="alert">' + ICON.clock + ' This goes <b>' + hrs(-left) + ' over</b> the ' + hrs(alloc) + ' allocated. You can still schedule – the director sees it flagged.</p>' : '<p class="small muted">' + hrs(left) + ' of the allocated hours left after this booking.</p>') : '<p class="small muted">The director has not set an hours limit for this learner.</p>') + '</div>';
  }
  S.onUpdate.ts = (list) => { const el = $('#ts-hours'); if (el) el.innerHTML = hoursPanel(comboOf(val('ts-who')), list); };

  const slotTxt = (b) => fmt.date(b.starts_at) + ', ' + fmt.time(b.starts_at) + '–' + fmt.time(b.ends_at);
  function loginTxt(c) { return 'Your Adventuity login:\nPortal: ' + portalUrl() + '\nE-mail: ' + c.email + '\nTemporary password: ' + c.password + '\nYou choose your own password when you first sign in.'; }
  function learnerMsg(d, parent) {
    const me = state.profile.full_name || 'your tutor'; const nm = firstName(d.name) || 'there';
    return (parent ? 'Hello, ' + (firstName(d.name) || 'your child') + '\'s ' : 'Hi ' + nm + ', your ') + SUBJ[d.subject].short + ' lesson' + (d.rows.length > 1 ? 's' : '') + ' with ' + me + (d.rows.length > 1 ? ' are' : ' is') + ' booked:\n' + d.rows.map((b) => '• ' + slotTxt(b)).join('\n') +
      '\n\n' + (d.creds ? loginTxt(d.creds) + '\n\n' : '') + 'Sign in at ' + portalUrl() + ' → My lessons → Join the lesson (it opens 15 minutes before the start). Have a pen, paper and calculator ready.';
  }
  const waBtn = (phone, text, label, primary) => '<a class="btn ' + (primary ? 'primary' : '') + '" href="' + esc(phone ? ADV.wa(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text)) + '" target="_blank" rel="noopener">' + esc(label) + '</a>';
  function doneCard() {
    const d = state.tsDone; if (!d) return '';
    return '<div class="card creds"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="eyebrow">Scheduled ✔</span><h3 style="margin-top:4px">' + d.rows.length + ' lesson' + (d.rows.length > 1 ? 's' : '') + ' for ' + esc(d.name) + '</h3><p class="small muted">' + esc(firstName(d.name)) + ' sees ' + (d.rows.length > 1 ? 'them' : 'it') + ' in the portal now and gets a notification. Send the times' + (d.creds ? ' and the login details' : '') + ' on WhatsApp:</p></div><button class="btn sm ghost" data-action="ts-done">Done</button></div>' +
      '<ul class="small" style="margin:8px 0 0 18px">' + d.rows.slice(0, 12).map((b) => '<li>' + esc(slotTxt(b)) + '</li>').join('') + (d.rows.length > 12 ? '<li>and ' + (d.rows.length - 12) + ' more</li>' : '') + '</ul>' +
      '<div class="row" style="margin-top:10px">' + waBtn(d.phone, learnerMsg(d), 'WhatsApp ' + (firstName(d.name) || 'the learner'), true) + (d.gphone ? waBtn(d.gphone, learnerMsg(d, true), 'WhatsApp the parent') : '') +
      '<button class="btn sm" data-action="copy" data-v="' + esc(learnerMsg(d)) + '">Copy the message</button></div>' + (d.phone ? '' : '<p class="small muted" style="margin-top:6px">WhatsApp opens without a number – choose the learner or parent in WhatsApp.</p>') + '</div>';
  }
  ADV.actions['ts-done'] = () => { state.tsDone = null; ADV.render(); };
  ADV.actions['ts-go'] = (a) => { state.tsf = { key: a.dataset.key || '' }; state.tsDone = null; S.reset('ts'); ADV.go('tsched'); };

  ADV.views.tsched = function () {
    const f = state.tsf || (state.tsf = { key: '' }); const list = combos();
    if (!f.key && list.length === 1) f.key = list[0].key;
    const cur = comboOf(f.key); const p = state.profile;
    const lessons = S.list(S.init('ts', { date: fmt.key(+now() + DAY) }));
    const opts = list.slice().sort((x, y) => (x.l.full_name || '').localeCompare(y.l.full_name || '')).map((c) => '<option value="' + esc(c.key) + '"' + (c.key === f.key ? ' selected' : '') + '>' + esc((c.l.full_name || 'Learner') + ' – ' + SUBJ[c.l.subject].short + (c.l.school ? ' (' + c.l.school + ')' : '')) + '</option>').join('');
    const linkHint = p.meet_link ? 'Empty = your Meet link (' + p.meet_link.replace(/^https:\/\//, '') + ')' : 'Empty = the built-in classroom (add your Meet link on Today)';
    return '<div class="stack"><div><span class="eyebrow">Schedule</span><h1>Schedule lessons</h1><p class="small muted">Book the lessons you agreed with a learner – several days and times at once. They are confirmed straight away and show up in the learner\'s portal with a Join button.</p></div>' +
      doneCard() + (state.tCreds && !state.tsDone ? credsCard() : '') + (state.taForm ? addForm() : '') +
      (list.length ? '<form id="f-tsched" class="card stack"><div class="grid cols-2" style="align-items:start"><div class="field"><label for="ts-who">Learner and subject</label><select id="ts-who" required><option value="">Choose…</option>' + opts + '</select><span class="small muted">Not listed? <button type="button" class="linkbtn" data-action="ta-open">Add a learner</button></span></div>' +
        '<div class="field"><label for="ts-link">Meeting link (optional)</label><input id="ts-link" type="url" placeholder="https://meet.google.com/…" value="' + esc(f.link || '') + '"><span class="small muted">' + esc(linkHint) + '</span></div></div>' +
        S.html('ts') + '<div id="ts-hours">' + hoursPanel(cur, lessons) + '</div>' +
        '<div class="field"><label for="ts-note">Note for the learner (optional)</label><input id="ts-note" maxlength="500" value="' + esc(f.note || '') + '" placeholder="e.g. We start with Paper 1 calculus – bring your textbook"></div>' +
        '<div class="row"><button class="btn primary" type="submit">' + ICON.check + 'Schedule</button></div></form>'
        : (state.taForm ? '' : '<div class="card stack"><p class="muted">You have no learners yet. Add a learner you teach – they get a login and are linked to you – or ask the director to assign one.</p><div class="row"><button class="btn primary" data-action="ta-open">' + ICON.plus + 'Add a learner</button></div></div>')) + '</div>';
  };
  async function saveTsched(e) {
    e.preventDefault(); const f = readTs(); const cur = comboOf(f.key); const btn = e.target.querySelector('[type=submit]');
    if (!cur) return toast('Choose the learner and subject');
    const list = S.expand('ts'); const pr = S.problems(list); if (pr.length) return toast(pr[0], 5000);
    if (f.link && !/^https:\/\/\S{6,}$/.test(f.link)) return toast('The meeting link must start with https://', 4000);
    const alloc = Number(cur.hours) || 0; const over = alloc ? Number(cur.taught || 0) + Number(cur.booked || 0) + list.reduce((n, x) => n + x.m, 0) / 60 - alloc : 0;
    if (over > 0.01 && !confirm('This goes ' + hrs(over) + ' over the ' + hrs(alloc) + ' allocated to ' + (cur.full_name || 'this learner') + '. Schedule anyway? The director will see it flagged.')) return;
    btn.disabled = true;
    try {
      const rows = ((await sb.rpc('tutor_schedule', { p_learner: cur.learner_id, p_subject: cur.subject, p_slots: list.map((x) => ({ s: x.s.toISOString(), m: x.m })), p_note: f.note || '', p_room: f.link || '' })) || []).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      if (rows[0]) ADV.notify(rows[0].id, 'scheduled');
      const c = state.tCreds && state.tCreds.learner_id === cur.learner_id ? state.tCreds : null;
      state.tsDone = { name: cur.full_name || 'the learner', subject: cur.subject, rows, phone: cur.phone || (c && c.phone) || '', gphone: cur.guardian_phone || (c && c.gphone) || '', creds: c };
      if (c) state.tCreds = null;
      S.reset('ts'); state.tsf = { key: f.key }; await ADV.tutorReload(); window.scrollTo({ top: 0 });
    } catch (err) { btn.disabled = false; toast(ADV.errMsg(err), 6000); }
  }

  /* ================================================================ tutors add learners and hand out their login */
  const mySubjects = () => { const t = String(state.profile.tutor_subjects || '').split(',').filter((k) => SUBJ[k]); return t.length ? t : Object.keys(SUBJ); };
  function addForm() {
    const f = state.taForm || {}; const subs = mySubjects();
    const inp = (id, label, type, ph, v, req, help) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph || '') + '" value="' + esc(v || '') + '"' + (req ? ' required' : '') + '>' + (help ? '<span class="small muted">' + help + '</span>' : '') + '</div>';
    return '<form id="f-tadd" class="card stack"><div><h3>Add a learner</h3><p class="small muted">Creates their login with a temporary password and links them to you. Send the login on WhatsApp – they choose their own password when they first sign in.</p></div><div class="grid cols-2">' +
      inp('ta-name', 'Name and surname', 'text', 'e.g. Thabo Mokoena', f.name, true) + inp('ta-email', 'E-mail (their login)', 'email', 'name@example.com', f.email, true) +
      inp('ta-phone', 'Learner\'s WhatsApp number', 'tel', '082 123 4567', f.phone, true) + inp('ta-gphone', 'Parent\'s WhatsApp number (optional)', 'tel', '083 765 4321', f.gphone) +
      inp('ta-school', 'School', 'text', 'e.g. Grey College', f.school) + '<div class="field"><label for="ta-grade">Grade</label>' + ADV.gradeSelect('ta-grade', f.grade || 12) + '</div>' +
      '<div class="field" style="grid-column:1/-1"><label>Subjects you will teach them</label><div class="row" style="gap:12px">' + subs.map((k, i) => '<label class="check"><input type="checkbox" name="ta-subj" value="' + k + '"' + ((f.subjects ? f.subjects.includes(k) : i === 0) ? ' checked' : '') + '> ' + SUBJ[k].short + '</label>').join('') + '</div></div></div>' +
      '<div class="row"><button class="btn primary" type="submit">Create the login</button><button class="btn" type="button" data-action="ta-cancel">Cancel</button></div></form>';
  }
  ADV.tutorAddForm = () => (state.taForm ? addForm() : '');
  ADV.actions['ta-open'] = () => { state.taForm = {}; state.tCreds = null; ADV.render(); window.scrollTo({ top: 0 }); const el = $('#ta-name'); if (el) el.focus(); };
  ADV.actions['ta-cancel'] = () => { state.taForm = null; ADV.render(); };
  async function saveAdd(e) {
    e.preventDefault(); const btn = e.target.querySelector('[type=submit]');
    const f = { name: val('ta-name').trim(), email: val('ta-email').trim().toLowerCase(), phone: val('ta-phone').trim(), gphone: val('ta-gphone').trim(), school: val('ta-school').trim(), grade: Number(val('ta-grade')) || null, subjects: $$('input[name="ta-subj"]:checked').map((x) => x.value) };
    state.taForm = f;
    if (!f.subjects.length) return toast('Choose at least one subject');
    if (String(f.phone).replace(/\D/g, '').length < 9) return toast('Enter the learner\'s WhatsApp number');
    const password = 'Adv-' + rid(6); btn.disabled = true;
    try {
      const r = await sb.fn('admin-users', { action: 'create_account', role: 'learner', full_name: f.name, email: f.email, phone: f.phone, guardian_phone: f.gphone, school: f.school, grade: f.grade, subjects: f.subjects, password });
      state.tCreds = { learner_id: r.user_id, name: f.name, email: f.email, phone: f.phone, gphone: f.gphone, password, subject: (r.subjects || f.subjects)[0] };
      state.taForm = null; await ADV.tutorReload();
      state.tsf = { key: r.user_id + '|' + state.tCreds.subject }; S.reset('ts'); state.tsDone = null;
      if (state.tab !== 'tsched') ADV.go('tsched'); else { ADV.render(); window.scrollTo({ top: 0 }); }
    } catch (err) { btn.disabled = false; toast(ADV.errMsg(err), 6000); }
  }
  function credsCard() {
    const c = state.tCreds; if (!c) return '';
    const text = 'Hi ' + (firstName(c.name) || 'there') + ', ' + (c.reset ? 'here is a new temporary password for the Adventuity portal' : 'welcome to Adventuity! I will be your tutor.') + '\n\n' + loginTxt(c) + '\n\nYour lessons, notes and past papers are in the portal.';
    return '<div class="card creds"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="eyebrow">' + (c.reset ? 'New temporary password' : 'Login created') + '</span><h3 style="margin-top:4px">' + esc(c.name) + '</h3>' +
      (c.reset ? '' : '<p class="small muted">Schedule the lessons below and send the times and the login in one WhatsApp message – or send the login now.</p>') + '</div><button class="btn sm ghost" data-action="tc-done">Done</button></div>' +
      '<div class="copybox" style="margin-top:10px"><code>E-mail: ' + esc(c.email) + '\nPassword: ' + esc(c.password) + '</code><button class="btn sm" data-action="copy" data-v="' + esc(c.password) + '">Copy password</button></div>' +
      '<div class="row" style="margin-top:10px">' + waBtn(c.phone, text, 'Send the login on WhatsApp', !!c.reset) + (c.gphone ? waBtn(c.gphone, text.replace(/^Hi [^,]*,/, 'Hello,'), 'Send to the parent') : '') + '<button class="btn sm" data-action="copy" data-v="' + esc(text) + '">Copy the message</button></div>' +
      '<p class="small muted" style="margin-top:8px">The password is shown only now. Until ' + esc(firstName(c.name) || 'the learner') + ' signs in and chooses their own, you can make a new one under My learners.</p></div>';
  }
  ADV.tutorCredsCard = credsCard;
  ADV.actions['tc-done'] = () => { state.tCreds = null; ADV.render(); };
  ADV.actions['t-pass'] = async (a) => {
    const l = (state.myLearners || []).find((x) => x.learner_id === a.dataset.id); if (!l) return;
    if (!confirm('Make a new temporary password for ' + (l.full_name || 'this learner') + '? The old one stops working.')) return;
    const password = 'Adv-' + rid(6); a.disabled = true;
    try { await sb.fn('admin-users', { action: 'reset_password', user_id: l.learner_id, password }); state.tCreds = { learner_id: l.learner_id, name: l.full_name, email: l.email, phone: l.phone, gphone: l.guardian_phone, password, reset: true }; ADV.render(); window.scrollTo({ top: 0 }); }
    catch (err) { a.disabled = false; toast(ADV.errMsg(err), 6000); }
  };

  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    if (e.target.id === 'f-tsched') return saveTsched(e);
    if (e.target.id === 'f-tadd') return saveAdd(e);
  };
})();
