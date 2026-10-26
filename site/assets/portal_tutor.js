/* Adventuity portal – tutor portal: today's lessons, joining the meeting, the lesson log and the learners assigned to the tutor. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, esc, fmt, pill, ICON, state, sb, SUBJ, toast } = ADV; const now = ADV.now;
  const byStart = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
  const mins = (b) => Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 6e4);
  const meetLabel = (room) => (!room ? 'No meeting link yet' : /meet\.google\.com/.test(room) ? 'Google Meet · ' + room.replace(/^https:\/\//, '') : /^https?:\/\//.test(room) ? room.replace(/^https:\/\//, '').slice(0, 60) : 'Built-in private classroom (Jitsi)');

  ADV.tutorInit = async function () { await loadMyLearners(); if (ADV.startPolling) ADV.startPolling(); };
  async function loadMyLearners() { try { state.myLearners = (await sb.rpc('tutor_learners', {})) || []; } catch (e) { state.myLearners = state.myLearners || []; } }
  const reload = async () => { await ADV.loadBookings(); await loadMyLearners(); const y = window.scrollY; ADV.render(); window.scrollTo(0, y); };
  const upcoming = () => state.bookings.filter((b) => b.status === 'accepted' && new Date(b.ends_at) > now()).sort(byStart);
  const toLog = () => state.bookings.filter((b) => b.status === 'accepted' && new Date(b.ends_at) <= now() && !b.delivered_at).sort(byStart);
  /* the tutor's default Meet link: saved on the profile and used for upcoming lessons that had no link of their own */
  ADV.tutorApplyLink = async (link) => {
    try { const n = await sb.rpc('tutor_set_room', { b: null, link }); state.profile.meet_link = link; await reload(); toast(link ? 'Meet link saved' + (n ? ' and used for ' + n + ' upcoming lesson' + (n === 1 ? '' : 's') : '') : 'Meet link removed – lessons use the built-in classroom'); return true; }
    catch (e) { toast(ADV.errMsg(e), 5000); return false; }
  };

  /* ---------------------------------------------------------------- lesson card */
  function card(b, big) {
    const s = new Date(b.starts_at); const jw = ADV.joinWindow(b); const room = b.room || '';
    const started = new Date(b.starts_at) - now() < 15 * 6e4; const live = b.status === 'accepted';
    const st = b.status === 'cancelled' ? pill('', 'Cancelled') : b.status === 'completed' ? pill('good', 'Completed') : b.delivered_at ? pill('good', 'Delivered ✓') : jw.open ? pill('warn', 'Now') : jw.over ? pill('warn', 'Not logged yet') : pill('good', 'Confirmed');
    let html = '<div class="row" style="gap:6px">' + st + pill(b.subject, SUBJ[b.subject].short) + pill('', fmt.mins(mins(b))) + '<span class="mono small muted">Ref ' + esc(b.ref) + '</span></div>' +
      '<h3 style="margin-top:6px">' + esc(b.learner_name || 'Learner') + (b.school ? ' <span class="small muted" style="font-weight:400">· ' + esc(b.school) + '</span>' : '') + '</h3>' +
      '<p class="small muted">' + esc(fmt.long(s)) + ' · ' + esc(fmt.time(s)) + '–' + esc(fmt.time(b.ends_at)) + (b.topics ? ' · ' + esc(ADV.topicNames ? ADV.topicNames(b.topics) : b.topics) : '') + '</p>' +
      (b.learner_note ? '<p class="tutor-msg"><b>Learner:</b> ' + esc(b.learner_note) + '</p>' : '') +
      (b.admin_message ? '<p class="tutor-msg"><b>From the director:</b> ' + esc(b.admin_message) + '</p>' : '');
    if (live && !jw.over) {
      html += '<p class="small" style="margin-top:8px">' + ICON.video + ' ' + esc(meetLabel(room)) + '</p>';
      if (state.tLink === b.id) {
        html += '<div class="decide"><div class="field"><label for="tl-' + b.id + '">Meeting link for this lesson</label><input id="tl-' + b.id + '" type="url" placeholder="https://meet.google.com/abc-defg-hij" value="' + esc(/^https:\/\//.test(room) ? room : '') + '"></div><div class="row"><button class="btn sm primary" data-action="t-link-save" data-id="' + b.id + '">Save link</button><button class="btn sm" data-action="t-link-room" data-id="' + b.id + '">Use the built-in classroom</button><button class="btn sm ghost" data-action="t-link" data-id="' + b.id + '">Cancel</button></div><p class="small muted">The learner gets this link on their Join button. Create one at meet.google.com → New meeting → Create a meeting for later.</p></div>';
      }
      html += '<div class="row" style="margin-top:10px">' + (room ? '<a class="btn ' + (jw.open ? 'primary' : '') + '" href="' + esc(ADV.roomUrl(room, state.profile.full_name)) + '" target="_blank" rel="noopener">' + ICON.video + (jw.open ? 'Join the lesson' : 'Open the meeting') + '</a>' : '') +
        '<button class="btn" data-go="tab" data-id="board">' + ICON.pen + 'Open the board</button>' +
        (room && /^https?:\/\//.test(room) ? '<button class="btn sm" data-action="copy" data-v="' + esc(room) + '">Copy link</button>' : '') +
        (state.tLink === b.id ? '' : '<button class="btn sm ghost" data-action="t-link" data-id="' + b.id + '">Change link</button>') +
        '<a class="btn sm ghost" href="' + esc(ADV.gcal('Adventuity lesson – ' + (b.learner_name || 'learner'), b.starts_at, b.ends_at, 'Open the Adventuity portal: ' + location.origin + location.pathname + '#tlessons', /^https:\/\//.test(room) ? room : '')) + '" target="_blank" rel="noopener">Add to calendar</a></div>';
      if (!jw.open && !big) html += '<p class="small muted" style="margin-top:6px">' + ICON.clock + ' The learner\'s Join button opens 15 minutes before the start.</p>';
    }
    if ((live || b.status === 'completed') && started) {
      const editing = state.tLog === b.id || (!b.delivered_at && !b.tutor_note);
      html += editing && b.status !== 'completed'
        ? '<div class="decide"><div class="field"><label for="tn-' + b.id + '">Lesson log – what did you cover? (only you and the director see this)</label><textarea id="tn-' + b.id + '" rows="2" placeholder="e.g. Factorised cubics, did 2023 P1 Q6. Homework: Q7.">' + esc(b.tutor_note || '') + '</textarea></div><div class="row">' +
          (b.delivered_at ? '<button class="btn sm primary" data-action="t-log" data-id="' + b.id + '" data-d="1">Save</button><button class="btn sm ghost" data-action="t-log" data-id="' + b.id + '" data-d="0">Not delivered after all</button>' : '<button class="btn sm primary" data-action="t-log" data-id="' + b.id + '" data-d="1">' + ICON.check + 'Lesson delivered</button><button class="btn sm" data-action="t-log" data-id="' + b.id + '" data-d="0">Save note only</button>') + '</div></div>'
        : '<p class="tutor-msg"><b>Your log' + (b.delivered_at ? ' · delivered ' + esc(fmt.date(b.delivered_at)) : '') + ':</b> ' + esc(b.tutor_note || '–') + (b.status === 'completed' ? '' : ' <button class="chipbtn" data-action="t-log-edit" data-id="' + b.id + '">Edit</button>') + '</p>';
    }
    return '<div class="card lesson' + (b.status === 'cancelled' || b.status === 'completed' || (jw.over && b.delivered_at) ? ' past' : '') + (big ? ' big' : '') + '" id="tb-' + b.id + '"><div class="date"><span>' + esc(fmt.wd(s)) + '</span><b>' + esc(fmt.day(s)) + '</b><span>' + esc(fmt.mon(s)) + '</span></div><div style="min-width:0">' + html + '</div></div>';
  }

  /* ---------------------------------------------------------------- today */
  ADV.views.tdash = function () {
    const p = state.profile; const first = (p.full_name || '').split(' ')[0];
    const up = upcoming(); const next = up[0]; const logs = toLog();
    const mk = fmt.key(now()).slice(0, 7);
    const taught = state.bookings.filter((b) => (b.delivered_at || b.status === 'completed') && b.status !== 'cancelled' && fmt.key(b.starts_at).slice(0, 7) === mk);
    const hrs = taught.reduce((n, b) => n + mins(b), 0) / 60;
    const week = up.filter((b) => new Date(b.starts_at) - now() < 7 * 864e5).length;
    const kpi = (label, val, go) => '<button class="cd kpi" data-go="tab" data-id="' + go + '"><span class="eyebrow">' + label + '</span><div class="big">' + val + '</div></button>';
    const hr = Number(new Intl.DateTimeFormat('en-ZA', { hour: 'numeric', hour12: false, timeZone: 'Africa/Johannesburg' }).format(now()));
    return '<div class="stack"><div><span class="eyebrow">Tutor portal</span><h1>' + (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (first ? ', ' + esc(first) : '') + '</h1><p class="muted small" style="margin-top:4px">Your lessons and learners. At lesson time, tap Join, then present the Board in Google Meet.</p></div>' +
      (p.meet_link ? '' : '<form id="f-tmeet" class="card stack"><div class="row" style="flex-wrap:nowrap;align-items:flex-start">' + ICON.video + '<div><b>Add your Google Meet link</b><p class="small muted">Lessons the director gives you use your own Meet link, so you are the host and can let the learner in. On meet.google.com click <b>New meeting → Create a meeting for later</b>, copy the link and paste it here. You can reuse the same link for every lesson.</p></div></div><div class="row" style="flex-wrap:nowrap"><input id="tm-link" type="url" placeholder="https://meet.google.com/abc-defg-hij" aria-label="Google Meet link" required><button class="btn primary" type="submit">Save</button></div></form>') +
      '<div class="grid cols-4">' + kpi('Lessons in 7 days', week, 'tlessons') + kpi('Hours taught this month', (Math.round(hrs * 10) / 10).toString().replace('.', ','), 'tlessons') + kpi('My learners', new Set((state.myLearners || []).map((l) => l.learner_id)).size, 'tlearners') + kpi('Lessons to log', logs.length, 'tlessons') + '</div>' +
      '<h2>' + (next && ADV.joinWindow(next).open ? 'Now' : 'Next lesson') + '</h2>' + (next ? card(next, true) : '<div class="card"><p class="muted">No lessons scheduled yet. The director assigns your lessons and sends you the times on WhatsApp – they show up here.</p></div>') +
      (logs.length ? '<h2>Log these lessons</h2><p class="small muted" style="margin-top:-6px">Mark each lesson as delivered and note what you covered – the director uses this for reports and your pay.</p>' + logs.map((b) => card(b)).join('') : '') +
      (up.length > 1 ? '<h2>Coming up</h2>' + up.slice(1, 6).map((b) => card(b)).join('') + (up.length > 6 ? '<button class="btn" data-go="tab" data-id="tlessons">All ' + up.length + ' upcoming lessons</button>' : '') : '') +
      '<details class="card"><summary><b>How a lesson works</b></summary><ol class="wb-help" style="margin-top:10px"><li>The director schedules the lesson here and sends you and the learner the time on WhatsApp.</li><li>15 minutes before the start, open <b>Today</b> and tap <b>Join the lesson</b>. Google Meet opens – let the learner in when they ask to join.</li><li>Open the <b>Board</b> in this portal and, in Meet, click <b>Present now → A tab</b> and choose the Adventuity tab. Write and draw – the learner sees it live. Use the notes under Maths and Sciences (Teach mode and the pen work there too).</li><li>After the lesson, tap <b>Lesson delivered</b> and write a line about what you covered.</li></ol></details>' +
      (ADV.pushCard ? ADV.pushCard('Get an alert on this device when a lesson is assigned to you or changes.') : '') + '</div>';
  };

  /* ---------------------------------------------------------------- all lessons */
  ADV.views.tlessons = function () {
    const f = state.tFilter || 'upcoming';
    const sets = { upcoming: upcoming(), log: toLog(), past: state.bookings.filter((b) => new Date(b.ends_at) <= now() || b.status !== 'accepted').sort(byStart).reverse() };
    const seg = (k, l) => '<button class="' + (f === k ? 'on' : '') + '" data-action="t-filter" data-id="' + k + '">' + l + ' (' + sets[k].length + ')</button>';
    return '<div class="stack"><div><span class="eyebrow">Lessons</span><h1>My lessons</h1></div><div class="seg">' + seg('upcoming', 'Upcoming') + seg('log', 'To log') + seg('past', 'Past') + '</div>' +
      (sets[f].length ? sets[f].map((b) => card(b)).join('') : '<div class="card"><p class="muted">' + (f === 'log' ? 'All your lessons are logged. Thank you!' : 'Nothing here yet.') + '</p></div>') + '</div>';
  };

  /* ---------------------------------------------------------------- learners */
  ADV.views.tlearners = function () {
    const list = state.myLearners || [];
    const items = list.map((l) => {
      const bs = state.bookings.filter((b) => b.learner_id === l.learner_id && b.subject === l.subject);
      const next = bs.filter((b) => b.status === 'accepted' && new Date(b.ends_at) > now()).sort(byStart)[0];
      const h = Number(l.hours) || 0, done = Number(l.taught) || 0; const pct = h ? Math.min(100, Math.round(done / h * 100)) : 0;
      return '<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><div class="row" style="gap:6px">' + pill(l.subject, SUBJ[l.subject].short) + (h ? pill(done >= h ? 'good' : '', String(done).replace('.', ',') + ' of ' + String(h).replace('.', ',') + ' h taught') : pill('', String(done).replace('.', ',') + ' h taught')) + '</div><h3 style="margin-top:6px">' + esc(l.full_name || 'Learner') + '</h3>' + (l.school ? '<p class="small muted">' + esc(l.school) + '</p>' : '') + '</div></div>' +
        (h ? '<div class="bar" style="margin-top:10px" aria-label="' + pct + '% of the allocated hours"><i style="width:' + pct + '%"></i></div>' : '') +
        (l.note ? '<p class="tutor-msg"><b>From the director:</b> ' + esc(l.note) + '</p>' : '') +
        '<p class="small" style="margin-top:8px">' + (next ? ICON.cal + ' Next lesson: <b>' + esc(fmt.long(next.starts_at)) + ' ' + esc(fmt.time(next.starts_at)) + '</b>' : '<span class="muted">No lesson scheduled yet – the director will add one.</span>') + '</p></div>';
    }).join('');
    return '<div class="stack"><div><span class="eyebrow">Learners</span><h1>My learners</h1><p class="small muted">The learners the director assigned to you, per subject. Contact details stay with the director – message Adventuity if you need anything arranged.</p></div>' +
      (items || '<div class="card"><p class="muted">No learners assigned yet.</p></div>') + '</div>';
  };

  /* ---------------------------------------------------------------- actions */
  ADV.actions['t-filter'] = (a) => { state.tFilter = a.dataset.id; ADV.render(); };
  ADV.actions['t-link'] = (a) => { state.tLink = state.tLink === a.dataset.id ? null : a.dataset.id; ADV.render(); const el = $('#tl-' + a.dataset.id); if (el) el.focus(); };
  async function setRoom(id, link) {
    try { await sb.rpc('tutor_set_room', { b: id, link }); state.tLink = null; await reload(); toast(link ? 'Link saved – the learner joins with it' : 'This lesson uses the built-in classroom'); } catch (e) { toast(ADV.errMsg(e), 5000); }
  }
  ADV.actions['t-link-save'] = (a) => { const v = (($('#tl-' + a.dataset.id) || {}).value || '').trim(); if (!/^https:\/\/\S{6,}$/.test(v)) return toast('Paste the full meeting link, starting with https://', 4000); return setRoom(a.dataset.id, v); };
  ADV.actions['t-link-room'] = (a) => setRoom(a.dataset.id, '');
  ADV.actions['t-log-edit'] = (a) => { state.tLog = a.dataset.id; ADV.render(); const el = $('#tn-' + a.dataset.id); if (el) el.focus(); };
  ADV.actions['t-log'] = async (a) => {
    const id = a.dataset.id, delivered = a.dataset.d === '1'; const note = (($('#tn-' + id) || {}).value || '').trim(); const b = state.bookings.find((x) => x.id === id);
    if (delivered && !note && !confirm('Mark as delivered without a note? A short line about what you covered helps the director report to parents and sponsors.')) return;
    a.disabled = true;
    try { await sb.rpc('tutor_log_lesson', { b: id, note, delivered }); if (delivered && !(b && b.delivered_at)) ADV.notify(id, 'delivered'); state.tLog = null; await reload(); toast(delivered ? 'Logged as delivered – thank you' : 'Saved'); }
    catch (e) { a.disabled = false; toast(ADV.errMsg(e), 5000); }
  };
  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    if (e.target.id !== 'f-tmeet') return; e.preventDefault();
    const link = $('#tm-link').value.trim(); if (!/^https:\/\/\S{6,}$/.test(link)) return toast('Paste the full meeting link, starting with https://', 4000);
    await ADV.tutorApplyLink(link);
  };
})();
