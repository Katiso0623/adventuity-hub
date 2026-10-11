/* Adventuity portal – messages between the tutor and each learner, plus background checks (new requests, replies). */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, $$, esc, fmt, ICON, state, sb } = ADV;
  state.msgs = []; state.unread = 0; state.badges = state.badges || {};

  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const when = (d) => (fmt.key(d) === fmt.key(ADV.now()) ? fmt.time(d) : fmt.date(d) + ' ' + fmt.time(d));
  const nameOf = (id) => { const l = (state.learners || []).find((x) => x.id === id); return l ? (l.full_name || l.email) : 'Learner'; };

  async function loadThread(learnerId) {
    const q = { order: 'created_at.asc', limit: 300 }; if (learnerId) q.learner_id = 'eq.' + learnerId;
    try { state.msgs = await sb.select('messages', q); } catch (e) { state.msgs = []; }
  }
  async function loadUnread() {
    if (!sb.user) return;
    try { const r = await sb.select('messages', { select: 'id,learner_id', read_at: 'is.null', sender: 'neq.' + sb.user.id }); state.unreadBy = {}; r.forEach((m) => { state.unreadBy[m.learner_id] = (state.unreadBy[m.learner_id] || 0) + 1; }); state.badges.messages = r.length; }
    catch (e) { /* offline */ }
  }
  ADV.loadUnread = loadUnread;
  async function loadInbox() {
    try { const r = await sb.select('messages', { select: 'learner_id,body,created_at,sender,read_at', order: 'created_at.desc', limit: 500 }); const seen = {}; state.inbox = []; r.forEach((m) => { if (!seen[m.learner_id]) { seen[m.learner_id] = 1; state.inbox.push(m); } }); }
    catch (e) { state.inbox = []; }
  }

  function bubbles() {
    if (!state.msgs.length) return '<p class="small muted" style="text-align:center;padding:24px 0">No messages yet. Say hello 👋</p>';
    let lastDay = '';
    return state.msgs.map((m) => {
      const mine = m.sender === sb.user.id; const day = fmt.key(m.created_at); const sep = day !== lastDay ? '<div class="msg-day">' + esc(fmt.long(m.created_at)) + '</div>' : ''; lastDay = day;
      return sep + '<div class="msg ' + (mine ? 'me' : 'them') + '"><div class="bubble">' + linkify(m.body) + '</div><span class="msg-meta">' + esc(fmt.time(m.created_at)) + (mine && m.read_at ? ' · seen' : '') + '</span></div>';
    }).join('');
  }
  const composer = (to) => '<form id="f-msg" class="composer" data-to="' + esc(to) + '"><label for="m-body" class="sr">Message</label><textarea id="m-body" rows="2" placeholder="Write a message…" required maxlength="4000"></textarea><button class="btn primary" type="submit">Send</button></form>';

  ADV.views.messages = function () {
    if (!state.isAdmin) {
      return '<div class="stack"><div><span class="eyebrow">Messages</span><h1>Message your tutor</h1><p class="small muted">Ask about a lesson, a payment or a question you are stuck on. You get a notification when the tutor replies.</p></div>' +
        '<div class="card chat"><div class="thread" id="thread">' + bubbles() + '</div>' + composer(sb.user.id) + '</div></div>';
    }
    const cur = state.thread;
    const learners = (state.learners || []).filter((l) => l.role !== 'admin');
    const items = (state.inbox || []).map((m) => { const n = (state.unreadBy || {})[m.learner_id] || 0; return '<button class="conv' + (cur === m.learner_id ? ' on' : '') + '" data-action="thread" data-id="' + m.learner_id + '"><span class="conv-top"><b>' + esc(nameOf(m.learner_id)) + '</b><span class="small muted">' + esc(when(m.created_at)) + '</span></span><span class="small muted conv-last">' + (m.sender === sb.user.id ? 'You: ' : '') + esc(m.body.slice(0, 80)) + '</span>' + (n ? '<i class="badge">' + n + '</i>' : '') + '</button>'; }).join('');
    const pick = '<div class="field"><label for="m-new">Start a conversation</label><select id="m-new"><option value="">Choose a learner…</option>' + learners.map((l) => '<option value="' + l.id + '">' + esc(l.full_name || l.email) + '</option>').join('') + '</select></div>';
    const l = learners.find((x) => x.id === cur);
    return '<div class="stack"><div><span class="eyebrow">Messages</span><h1>Messages</h1></div><div class="inbox"><div class="card inbox-list">' + pick + '<div class="stack" style="gap:6px;margin-top:10px">' + (items || '<p class="small muted">No conversations yet.</p>') + '</div></div>' +
      '<div class="card chat">' + (cur ? '<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:10px"><div><b>' + esc(nameOf(cur)) + '</b><div class="small muted">' + esc(l ? [l.phone, l.school].filter(Boolean).join(' · ') : '') + '</div></div>' + (l && l.phone ? '<a class="btn sm" href="' + esc(ADV.wa(l.phone)) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '</div><div class="thread" id="thread">' + bubbles() + '</div>' + composer(cur) : '<p class="muted" style="padding:24px 0;text-align:center">Choose a conversation.</p>') + '</div></div></div>';
  };
  ADV.openThread = function (id) { state.thread = id; state.msgs = []; ADV.go('messages'); };
  ADV.actions.thread = (a) => ADV.openThread(a.dataset.id);

  const prevChange = ADV.onChange;
  ADV.onChange = function (e) { if (prevChange) prevChange(e); if (e.target.id === 'm-new' && e.target.value) ADV.openThread(e.target.value); };
  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    if (e.target.id !== 'f-msg') return; e.preventDefault();
    const ta = $('#m-body'); const body = ta.value.trim(); if (!body) return; const to = e.target.dataset.to;
    ta.disabled = true;
    try {
      const r = await sb.insert('messages', [{ learner_id: to, sender: sb.user.id, body }]); state.msgs.push(r[0]); ta.value = '';
      sb.fn('notify', { event: 'message', learner_id: to }).catch(() => { });
      if (!state.isAdmin) ADV.emailTutor('New message from ' + state.profile.full_name, { From: state.profile.full_name, Phone: state.profile.phone || '-', Message: body, Reply: location.origin + location.pathname + '#messages' });
      const th = $('#thread'); if (th) { th.innerHTML = bubbles(); th.scrollTop = th.scrollHeight; }
      if (state.isAdmin) loadInbox();
    } catch (err) { ADV.toast(ADV.errMsg(err)); }
    ta.disabled = false; ta.focus();
  };
  document.addEventListener('keydown', (e) => { if (e.target && e.target.id === 'm-body' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.target.form.requestSubmit(); } });

  ADV.after.push(async () => {
    if (state.tab !== 'messages' || state.topic) return;
    const th = $('#thread'); if (th) th.scrollTop = th.scrollHeight;
    if (state._msgFresh) return; state._msgFresh = true;
    if (state.isAdmin) { await loadInbox(); if (!state.thread && state.inbox[0]) state.thread = state.inbox[0].learner_id; if (state.thread) await loadThread(state.thread); }
    else await loadThread(null);
    const id = state.isAdmin ? state.thread : sb.user.id; if (id) { try { await sb.rpc('mark_read', { thread: id }); } catch (e) { /* ignore */ } }
    await loadUnread();
    if (state.tab === 'messages' && !document.querySelector('#m-body:focus')) ADV.render(); else ADV.badges();
  });
  const origGo = ADV.go; ADV.go = function (tab, topic, opts) { if (tab === 'messages') state._msgFresh = false; return origGo(tab, topic, opts); };

  /* ---------------------------------------------------------------- background checks */
  function beep() { try { const C = window.AudioContext || window.webkitAudioContext; const c = new C(); const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5); o.start(); o.stop(c.currentTime + 0.55); } catch (e) { /* no audio */ } }
  ADV.alert = async function (title, body) {
    ADV.toast(title + (body ? ' – ' + body : ''), 6000); beep();
    if (document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'adv-' + title }); } catch (e) { /* ignore */ }
  };
  let timer = null;
  async function tick() {
    if (!state.profile) return;
    const before = new Map(state.bookings.map((b) => [b.id, b.status]));
    await ADV.loadBookings(); const unreadBefore = state.badges.messages || 0; await loadUnread();
    if (state.isAdmin) {
      const pend = state.bookings.filter((b) => b.status === 'pending' && new Date(b.starts_at) > ADV.now());
      state.badges.dash = pend.length;
      const fresh = pend.filter((b) => !before.has(b.id));
      if (state.ticked && fresh.length) ADV.alert(fresh.length === 1 ? 'New booking request' : fresh.length + ' new booking requests', fresh.map((b) => (b.profiles && b.profiles.full_name || 'Learner') + ' · ' + fmt.date(b.starts_at) + ' ' + fmt.time(b.starts_at)).join('; '));
    } else {
      const changed = state.bookings.filter((b) => before.has(b.id) && before.get(b.id) !== b.status && ['accepted', 'declined'].includes(b.status));
      if (state.ticked) changed.forEach((b) => ADV.alert(b.status === 'accepted' ? 'Lesson confirmed ✔' : 'Booking not accepted', fmt.date(b.starts_at) + ' ' + fmt.time(b.starts_at)));
      state.badges.lessons = state.bookings.filter((b) => b.status === 'accepted' && ADV.joinWindow(b).open).length;
    }
    if (state.ticked && (state.badges.messages || 0) > unreadBefore && state.tab !== 'messages') ADV.alert('New message', state.isAdmin ? 'A learner sent you a message' : 'Your tutor replied');
    if (state.tab === 'messages' && !state.topic && $('#thread')) {
      const id = state.isAdmin ? state.thread : sb.user.id;
      if (id) { await loadThread(state.isAdmin ? id : null); const th = $('#thread'); if (th) { th.innerHTML = bubbles(); th.scrollTop = th.scrollHeight; } try { await sb.rpc('mark_read', { thread: id }); } catch (e) { /* ignore */ } await loadUnread(); }
      if (state.isAdmin) await loadInbox();
      ADV.badges(); state.ticked = true; return;
    }
    state.ticked = true;
    const busy = document.querySelector('input:focus,textarea:focus,select:focus,.overlay') || (ADV.pen && ADV.pen.active);
    if (!busy) { const y = window.scrollY; ADV.render(); window.scrollTo(0, y); } else ADV.badges();
  }
  ADV.startPolling = function () { clearInterval(timer); tick(); timer = setInterval(() => { if (document.visibilityState === 'visible') tick(); }, state.isAdmin ? 30000 : 60000); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.profile) tick(); });
})();
