/* Adventuity portal – core: helpers, sign-in, navigation, learner booking and lessons. */
(function () {
  'use strict';
  const CFG = window.ADV_CONFIG || {};
  const ADV = window.ADV = { cfg: CFG, views: {}, actions: {}, after: [] };
  const $ = ADV.$ = (s, r) => (r || document).querySelector(s);
  const $$ = ADV.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = ADV.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = ADV.T = (s) => window.ADV_STEPS.T(s);
  const enc = encodeURIComponent;
  const TZ = 'Africa/Johannesburg';
  const SUBJ = ADV.SUBJ = { maths: { name: 'Mathematics', short: 'Maths' }, phys: { name: 'Physical Sciences – Physics', short: 'Physics' }, chem: { name: 'Physical Sciences – Chemistry', short: 'Chemistry' } };
  const ICON = ADV.ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    maths: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L20 4M5 8h6M8 5v6M13 16h6"/></svg>',
    sci: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-6 10a2 2 0 002 2h12a2 2 0 002-2L14 9V3"/></svg>',
    papers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.6c1.9.7 3 2.5 3.5 5.4"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.3-6 8-6s7 2 8 6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v6H5V6h6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l12 8-12 8z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h10l4 4v14H5z"/><path d="M8 11h8M8 15h5"/></svg>'
  };

  /* ---------------------------------------------------------------- dates & money */
  const now = ADV.now = () => new Date();
  const F = (o) => new Intl.DateTimeFormat('en-ZA', Object.assign({ timeZone: TZ }, o));
  const fmt = ADV.fmt = {
    date: (d) => F({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d)),
    long: (d) => F({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d)),
    time: (d) => F({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)),
    day: (d) => F({ day: 'numeric' }).format(new Date(d)),
    mon: (d) => F({ month: 'short' }).format(new Date(d)),
    wd: (d) => F({ weekday: 'short' }).format(new Date(d)),
    key: (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d)),
    rand: (v) => 'R' + Number(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ','),
    mins: (m) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; }
  };
  const sast = ADV.sast = (key, hhmm) => new Date(key + 'T' + hhmm + ':00+02:00');
  ADV.countdown = (when) => { const ms = new Date(when) - now(); if (ms < 0) return null; return { d: Math.floor(ms / 864e5), h: Math.floor((ms % 864e5) / 36e5), m: Math.floor((ms % 36e5) / 6e4) }; };

  /* ---------------------------------------------------------------- UI bits */
  ADV.toast = function (msg, ms) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(ADV.toast._t); ADV.toast._t = setTimeout(() => { t.hidden = true; }, ms || 3000);
  };
  const toast = ADV.toast;
  const pill = ADV.pill = (cls, txt) => '<span class="pill ' + (cls || '') + '">' + esc(txt) + '</span>';
  ADV.btnLink = (href, label, cls, icon) => href ? '<a class="btn ' + (cls || '') + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + (icon || '') + esc(label) + '</a>' : '';
  /* shrink display maths that is wider than the screen (phones) instead of cutting it off */
  ADV.fitMath = function (root) {
    $$('.m-disp, .mm-text, .q-txt', root || document).forEach((box) => {
      if (!box.querySelector('mjx-container')) return; box.style.fontSize = '';
      const bl = box.getBoundingClientRect().left; const avail = box.clientWidth - 6; let need = box.scrollWidth;
      $$('mjx-container > svg', box).forEach((s) => { const r = s.getBoundingClientRect(); need = Math.max(need, r.right - bl); });
      if (avail > 0 && need > avail + 1) box.style.fontSize = Math.max(0.6, avail / need).toFixed(3) + 'em';
    });
  };
  let fitT = null; window.addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => ADV.fitMath(), 200); });
  ADV.typeset = function (el) { if (!el) return; if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([el]).then(() => ADV.fitMath(el)).catch(() => { }); else ADV._pendingTypeset = el; };
  window.__onMathJaxReady = () => { if (ADV._pendingTypeset) { const e = ADV._pendingTypeset; ADV._pendingTypeset = null; ADV.typeset(e); } };
  ADV.wa = (num, msg) => { const n = String(num || '').replace(/\D/g, '').replace(/^0/, '27'); return n ? 'https://wa.me/' + n + (msg ? '?text=' + enc(msg) : '') : ''; };
  ADV.copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e2) { toast('Select the text and copy it'); } ta.remove(); } };
  ADV.errMsg = (e) => (e && e.message) ? e.message.replace(/^JWT expired$/, 'Your session expired – sign in again.') : 'Something went wrong – try again.';
  ADV.roomUrl = (room, name) => /^https?:\/\//.test(room || '') ? room : 'https://meet.jit.si/' + enc(room) + '#config.prejoinConfig.enabled=true&config.startWithAudioMuted=true' + (name ? '&userInfo.displayName=' + enc(JSON.stringify(name)) : '');
  ADV.gcal = (title, start, end, details, loc) => { const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + enc(title) + '&dates=' + z(start) + '/' + z(end) + '&details=' + enc(details || '') + (loc ? '&location=' + enc(loc) : ''); };

  /* ---------------------------------------------------------------- state */
  const state = ADV.state = { tab: null, topic: null, profile: null, isAdmin: false, approved: false, settings: {}, priv: {}, bookings: [], classes: [], loading: true, contentReady: false, contentError: '' };
  const sb = ADV.sb = window.SBMini(CFG.supabaseUrl, CFG.supabaseKey);
  ADV.setting = (k, d) => (state.settings[k] !== undefined ? state.settings[k] : d);

  /* ---------------------------------------------------------------- tabs */
  const LEARNER_TABS = [['home', 'Home', 'home'], ['book', 'Book', 'plus'], ['lessons', 'My lessons', 'cal'], ['maths', 'Maths', 'maths'], ['sci', 'Sciences', 'sci'], ['papers', 'Papers', 'papers'], ['progress', 'Progress', 'chart'], ['messages', 'Messages', 'chat'], ['account', 'Account', 'user']];
  const ADMIN_TABS = [['dash', 'Dashboard', 'home'], ['bookings', 'Bookings', 'cal'], ['messages', 'Messages', 'chat'], ['learners', 'Learners', 'users'], ['classes', 'Classes', 'video'], ['money', 'Money', 'money'], ['maths', 'Maths', 'maths'], ['sci', 'Sciences', 'sci'], ['papers', 'Papers', 'papers'], ['settings', 'Settings', 'gear'], ['account', 'Account', 'user']];
  const tabs = () => (state.isAdmin ? ADMIN_TABS : LEARNER_TABS);
  const MOBILE = () => (state.isAdmin ? ['dash', 'bookings', 'messages', 'maths'] : ['home', 'book', 'lessons', 'maths']);
  ADV.go = function (tab, topic, opts) {
    state.tab = tab; state.topic = topic || null; state.quiz = null;
    const hash = topic ? '#t-' + topic : '#' + tab;
    if (location.hash !== hash) { try { history.pushState(null, '', hash); } catch (e) { location.hash = hash; } }
    $('#sheet') && ($('#sheet').hidden = true);
    render(); if (!(opts && opts.keepScroll)) window.scrollTo({ top: 0 });
  };
  function readHash() {
    const h = (location.hash || '').slice(1);
    if (h.startsWith('t-')) { state.topic = h.slice(2); state.tab = 'study'; return; }
    state.topic = null; state.tab = tabs().some((t) => t[0] === h) ? h : tabs()[0][0];
  }
  window.addEventListener('popstate', () => { readHash(); render(); });

  /* ---------------------------------------------------------------- shell */
  function shell() {
    const brand = (state.settings.site && state.settings.site.brand) || 'Adventuity';
    const nav = tabs().map(([id, label]) => '<button data-go="tab" data-id="' + id + '">' + esc(label) + '<i class="badge" data-badge="' + id + '" hidden></i></button>').join('');
    const mob = MOBILE().map((id) => { const t = tabs().find((x) => x[0] === id); return '<button data-go="tab" data-id="' + id + '">' + ICON[t[2]] + esc(t[1]) + '<i class="badge" data-badge="' + id + '" hidden></i></button>'; }).join('') + '<button data-action="sheet">' + ICON.more + 'More<i class="badge" data-badge="more" hidden></i></button>';
    return '<header class="topbar"><div class="wrap"><a class="brand" href="index.html"><span class="mark" aria-hidden="true"></span><span><b>' + esc(brand) + '</b><small>' + (state.isAdmin ? 'Tutor dashboard' : 'Learner portal') + '</small></span></a>' +
      (state.profile ? '<nav class="nav" aria-label="Sections">' + nav + '</nav>' : '') + '</div></header>' +
      '<main><div class="wrap" id="view"></div></main>' +
      (state.profile ? '<nav class="tabbar" aria-label="Sections">' + mob + '</nav>' +
        '<div class="sheet" id="sheet" hidden><div class="sheet-in"><div class="row" style="justify-content:space-between"><b>Menu</b><button class="btn sm ghost" data-action="sheet-close">Close</button></div><div class="sheet-grid">' + tabs().map(([id, label, ic]) => '<button data-go="tab" data-id="' + id + '">' + ICON[ic] + '<span>' + esc(label) + '</span></button>').join('') + '</div></div></div>' : '') +
      '<div id="overlay-root"></div>';
  }
  ADV.badges = function () {
    const b = state.badges || {}; let hidden = 0;
    $$('[data-badge]').forEach((el) => { const id = el.dataset.badge; const n = id === 'more' ? 0 : (b[id] || 0); el.textContent = n > 9 ? '9+' : n || ''; el.hidden = !n; });
    tabs().forEach(([id]) => { if (!MOBILE().includes(id)) hidden += b[id] || 0; }); const m = $('[data-badge="more"]'); if (m) { m.hidden = !hidden; m.textContent = hidden || ''; }
    const total = Object.values(b).reduce((n, x) => n + (x || 0), 0); const base = document.title.replace(/^\(\d+\+?\) /, ''); document.title = (total ? '(' + total + ') ' : '') + base;
  };
  function markNav() {
    const cur = state.topic ? (ADV.topicTab ? ADV.topicTab(state.topic) : 'maths') : state.tab;
    $$('.nav button, .tabbar button, .sheet-grid button').forEach((b) => { if (b.dataset.id === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    const app = $('#app');
    if (!app.dataset.shell || app.dataset.shell !== String(!!state.profile) + state.isAdmin) { app.innerHTML = shell(); app.dataset.shell = String(!!state.profile) + state.isAdmin; }
    markNav(); ADV.badges();
    const view = $('#view');
    if (state.loading) { view.innerHTML = '<div class="card"><p class="muted">Loading…</p></div>'; return; }
    if (!state.profile) { view.innerHTML = viewAuth(); return; }
    let html;
    try {
      if (state.topic && ADV.views.topic) html = ADV.views.topic(state.topic);
      else html = (ADV.views[state.tab] || ADV.views[tabs()[0][0]])();
    } catch (e) { console.error(e); html = '<div class="card"><p>Something went wrong showing this page. ' + esc(e.message) + '</p></div>'; }
    view.innerHTML = html;
    document.body.classList.toggle('learner', !state.isAdmin);
    ADV.after.forEach((f) => { try { f(view); } catch (e) { console.error(e); } });
    if (ADV.renderOverlay) ADV.renderOverlay();
  }
  ADV.render = render;

  /* ---------------------------------------------------------------- auth */
  function viewAuth() {
    const mode = state.authMode || 'signin';
    const brand = (state.settings.site && state.settings.site.brand) || 'Adventuity';
    const tabsHtml = '<div class="seg"><button class="' + (mode === 'signin' ? 'on' : '') + '" data-action="auth-mode" data-id="signin">Sign in</button><button class="' + (mode === 'signup' ? 'on' : '') + '" data-action="auth-mode" data-id="signup">Create an account</button></div>';
    const f = (id, label, type, ph, ac, extra) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph || '') + '" autocomplete="' + (ac || 'off') + '"' + (extra || '') + '></div>';
    const body = mode === 'signin'
      ? '<form id="f-signin" class="stack" style="gap:12px">' + f('a-email', 'E-mail', 'email', 'you@example.com', 'email', ' required') + f('a-pass', 'Password', 'password', '', 'current-password', ' required') + '<button class="btn primary" type="submit">Sign in</button><p class="small muted">Forgot your password? ' + (state.settings.site && state.settings.site.whatsapp ? '<a href="' + esc(ADV.wa(state.settings.site.whatsapp, 'Hi, I forgot my password for the Adventuity portal. My e-mail is: ')) + '" target="_blank" rel="noopener">Ask the tutor on WhatsApp</a> to reset it.' : 'Ask your tutor to reset it.') + '</p></form>'
      : '<form id="f-signup" class="stack" style="gap:12px"><div class="grid cols-2">' + f('s-name', 'Name and surname', 'text', 'Thabo Mokoena', 'name', ' required') + f('s-phone', 'WhatsApp number', 'tel', '082 123 4567', 'tel', ' required') + f('s-email', 'E-mail', 'email', 'you@example.com', 'email', ' required') + f('s-pass', 'Password (8+ characters)', 'password', '', 'new-password', ' required minlength="8"') + f('s-school', 'School (optional)', 'text', '', 'organization') + f('s-guardian', 'Parent/guardian number (optional)', 'tel', '', 'off') + '</div><input id="s-web" type="text" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><label class="check"><input id="s-terms" type="checkbox" required> I agree that the tutor may contact me about lessons, and I will keep the study material for my own use.</label><button class="btn primary" type="submit">Create account</button></form>';
    return '<div class="auth"><div class="auth-card card"><div class="auth-head"><span class="mark big" aria-hidden="true"></span><div><h1>' + esc(brand) + '</h1><p class="muted">Grade 12 Mathematics & Physical Sciences – book lessons and study online.</p></div></div>' + tabsHtml + '<div id="auth-msg" class="small" role="alert"></div>' + body + '<p class="small muted" style="margin-top:12px"><a href="index.html">← Back to the website</a></p></div></div>';
  }
  async function doSignIn(email, pass) {
    const msg = $('#auth-msg'); if (msg) msg.textContent = 'Signing in…';
    try { await sb.auth.signIn(email, pass); await afterLogin(); }
    catch (e) { if (msg) msg.textContent = /invalid/i.test(e.message) ? 'Wrong e-mail or password.' : ADV.errMsg(e); }
  }
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'f-signin') { e.preventDefault(); await doSignIn($('#a-email').value.trim(), $('#a-pass').value); }
    if (e.target.id === 'f-signup') {
      e.preventDefault(); const msg = $('#auth-msg'); msg.textContent = 'Creating your account…';
      const body = { email: $('#s-email').value.trim(), password: $('#s-pass').value, full_name: $('#s-name').value.trim(), phone: $('#s-phone').value.trim(), school: $('#s-school').value.trim(), guardian_phone: $('#s-guardian').value.trim(), website: $('#s-web').value };
      try { await sb.fn('signup', body); await doSignIn(body.email, body.password); }
      catch (err) { msg.textContent = ADV.errMsg(err); }
    }
    if (ADV.onSubmit) ADV.onSubmit(e);
  });

  async function loadSettings() {
    try { const rows = await sb.select('public_settings', { select: 'key,value' }); rows.forEach((r) => { state.settings[r.key] = r.value; }); } catch (e) { /* offline */ }
  }
  async function loadPrivate() {
    try { const rows = await sb.select('private_settings', { select: 'key,value' }); state.priv = {}; rows.forEach((r) => { state.priv[r.key] = r.value; }); } catch (e) { /* ignore */ }
  }
  async function afterLogin() {
    state.loading = true; render();
    try {
      const u = sb.user; const rows = await sb.select('profiles', { id: 'eq.' + u.id });
      state.profile = rows[0] || null;
      if (!state.profile) throw new Error('Your profile could not be loaded.');
      if (state.profile.blocked) { await sb.auth.signOut(); state.profile = null; state.loading = false; render(); toast('This account has been disabled. Contact the tutor.', 5000); return; }
      state.isAdmin = state.profile.role === 'admin';
      await Promise.all([loadSettings(), loadPrivate(), ADV.loadBookings()]);
      state.approved = state.isAdmin || state.profile.approved || !!(state.settings.access && state.settings.access.open);
      if (ADV.loadProgress) await ADV.loadProgress();
      if (state.isAdmin && ADV.adminInit) await ADV.adminInit();
    } catch (e) { console.error(e); toast(ADV.errMsg(e), 5000); if (e.status === 401) { await sb.auth.signOut(); state.profile = null; } }
    state.loading = false; readHash(); render();
    if (state.profile && state.approved && ADV.loadContent) ADV.loadContent().then(() => render());
  }
  ADV.signOut = async () => { await sb.auth.signOut(); state.profile = null; state.isAdmin = false; state.approved = false; state.contentReady = false; location.hash = ''; render(); };

  /* ---------------------------------------------------------------- bookings (shared) */
  ADV.loadBookings = async function () {
    if (!sb.user) return;
    try {
      const q = state.isAdmin ? { select: '*,profiles(full_name,phone,email,school)', order: 'starts_at.desc', limit: 3000 } : { select: '*,classes(title)', learner_id: 'eq.' + sb.user.id, order: 'starts_at.desc' };
      state.bookings = await sb.select('bookings', q);
      state.classes = await sb.select('classes', { order: 'starts_at.asc', starts_at: 'gte.' + new Date(Date.now() - 864e5).toISOString() });
    } catch (e) { console.error(e); }
  };
  const STATUS = ADV.STATUS = { pending: ['warn', 'Waiting for the tutor'], accepted: ['good', 'Confirmed'], declined: ['bad', 'Not accepted'], cancelled: ['', 'Cancelled'], completed: ['', 'Completed'] };
  ADV.statusPill = (b) => pill((STATUS[b.status] || ['', b.status])[0], (STATUS[b.status] || ['', b.status])[1]);
  ADV.notify = async (bookingId, event) => { try { await sb.fn('notify', { booking_id: bookingId, event }); } catch (e) { console.warn('notify failed', e); } };
  ADV.emailTutor = async (subject, lines) => {
    const to = state.priv.notify && state.priv.notify.email; if (!to) return;
    try { await fetch('https://formsubmit.co/ajax/' + enc(to), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(Object.assign({ _subject: subject, _template: 'table', _captcha: 'false' }, lines)) }); } catch (e) { /* e-mail is best effort */ }
  };
  ADV.joinWindow = (b) => { const s = new Date(b.starts_at), e = new Date(b.ends_at); const t = now(); return { open: t >= new Date(s - 15 * 6e4) && t <= new Date(+e + 30 * 6e4), soon: t < new Date(s - 15 * 6e4), over: t > new Date(+e + 30 * 6e4) }; };
  ADV.bookingRoom = (b) => b.room || '';

  /* ---------------------------------------------------------------- availability */
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  ADV.parseAvailability = function (text) {
    const out = {};
    String(text || '').split(';').map((x) => x.trim()).filter(Boolean).forEach((rule) => {
      const m = rule.match(/^([A-Za-z,\-\s]+?)\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/); if (!m) return;
      const a = +m[2] * 60 + +m[3], b = +m[4] * 60 + +m[5]; const idx = (n) => DAYS.indexOf(n.trim().slice(0, 3).toLowerCase());
      m[1].split(',').forEach((part) => { const r = part.split(/[-–]/); if (r.length === 2) { let i = idx(r[0]); const j = idx(r[1]); if (i < 0 || j < 0) return; for (; ; i = (i + 1) % 7) { (out[i] = out[i] || []).push([a, b]); if (i === j) break; } } else { const i = idx(part); if (i >= 0) (out[i] = out[i] || []).push([a, b]); } });
    });
    return out;
  };
  ADV.slotsFor = function (dayKey, minutes, busy) {
    const bk = ADV.setting('booking', {}); const av = ADV.parseAvailability(ADV.setting('availability', 'Mon-Fri 16:00-20:00; Sat 09:00-13:00'));
    const step = Number(bk.slotMinutes) || 30; const notice = (Number(bk.minNoticeHours) || 3) * 36e5;
    const wd = new Date(dayKey + 'T12:00:00+02:00').getUTCDay(); const out = [];
    if ((bk.blocked || []).includes(dayKey)) return out;
    (av[wd] || []).forEach(([a, b]) => { for (let t = a; t + minutes <= b; t += step) { const hh = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); const s = sast(dayKey, hh), e = new Date(+s + minutes * 6e4); if (s - now() < notice) continue; if ((busy || []).some((x) => new Date(x.starts_at) < e && new Date(x.ends_at) > s)) continue; out.push({ hh, s, e }); } });
    return out;
  };

  /* ---------------------------------------------------------------- LEARNER: home */
  ADV.views.home = function () {
    const p = state.profile; const first = (p.full_name || '').split(' ')[0] || 'there';
    const up = state.bookings.filter((b) => b.status === 'accepted' && new Date(b.ends_at) > now()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const pend = state.bookings.filter((b) => b.status === 'pending' && new Date(b.starts_at) > now());
    const next = up[0];
    const exams = (CFG.exams || []).map((e) => { const c = ADV.countdown(e.when); return '<div class="cd' + (c ? '' : ' past') + '"><span class="eyebrow">' + esc(e.subject) + '</span><strong>' + esc(e.paper) + '</strong>' + (c ? '<div class="big">' + c.d + '<small>days</small></div>' : '<div class="big" style="font-size:1rem">Written</div>') + '<span class="small muted">' + esc(fmt.date(e.when)) + ' · 09:00</span></div>'; }).join('');
    const notice = state.settings.site && state.settings.site.notice;
    return '<div class="stack"><section class="hero"><span class="eyebrow">Welcome back</span><h1 style="margin-top:4px">Hi ' + esc(first) + '</h1><p class="muted" style="margin-top:6px">Book lessons, join your class and study for the finals – all in one place.</p>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary" data-go="tab" data-id="book">' + ICON.plus + 'Book a lesson</button><button class="btn" data-go="tab" data-id="lessons">' + ICON.cal + 'My lessons</button>' + (ADV.installButton ? ADV.installButton() : '') + '</div><div class="countdown">' + exams + '</div></section>' +
      (notice ? '<div class="callout"><span class="eyebrow">From your tutor</span><p style="margin-top:4px;white-space:pre-line">' + esc(notice) + '</p></div>' : '') +
      '<div class="grid cols-2">' + (next ? lessonCard(next, true) : '<div class="card"><span class="eyebrow">Next lesson</span><h3 style="margin-top:6px">No confirmed lesson yet</h3><p class="small muted" style="margin-top:4px">' + (pend.length ? pend.length + ' request' + (pend.length > 1 ? 's are' : ' is') + ' waiting for the tutor to accept.' : 'Request a one-on-one or a seat in a group class.') + '</p><div class="row" style="margin-top:10px"><button class="btn primary" data-go="tab" data-id="book">Book a lesson</button></div></div>') +
      (ADV.studyTodayCard ? ADV.studyTodayCard() : '') + '</div>' +
      (!state.approved ? '<div class="card"><div class="row">' + ICON.lock + '<div><b>Study notes open once the tutor approves your account</b><p class="small muted">This usually happens with your first confirmed lesson. You can already see every topic and how long it takes to study.</p></div></div></div>' : '') +
      (ADV.pushCard ? ADV.pushCard('Get a notification on this device when the tutor confirms your lesson.') : '') + reviewCard() + shareCard() + '</div>';
  };
  function shareCard() {
    const site = (CFG.siteUrl || (location.origin + location.pathname.replace(/portal\.html$/, '')));
    const msg = 'I use Adventuity for Grade 12 Maths and Physical Sciences – online lessons, notes and exam questions with memos. Have a look: ' + site;
    return '<div class="card row" style="justify-content:space-between"><div><b>Know someone writing matric?</b><p class="small muted">Send them the link – they can book their own lessons.</p></div><a class="btn" href="https://wa.me/?text=' + enc(msg) + '" target="_blank" rel="noopener">Share on WhatsApp</a></div>';
  }
  function reviewCard() {
    const url = state.settings.site && state.settings.site.reviewUrl;
    if (!url || !/^https:\/\//.test(url) || !state.bookings.some((b) => b.status === 'completed')) return '';
    return '<div class="card row" style="justify-content:space-between"><div><b>Enjoying your lessons?</b><p class="small muted">A short Google review helps other matric learners find the tutor.</p></div><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">★ Leave a review</a></div>';
  }

  /* ---------------------------------------------------------------- LEARNER: book */
  ADV.views.book = function () {
    const bs = state.book || (state.book = { kind: 'one', subj: 'maths', mins: 60, day: null, hh: null, topics: [], note: '' });
    const fees = ADV.setting('fees', { maths: 250, phys: 250, chem: 250 });
    const bk = ADV.setting('booking', {}); const durs = bk.durations || [60, 90, 120];
    const seg = (key, val, label) => '<button class="' + (bs[key] === val ? 'on' : '') + '" data-action="book-set" data-k="' + key + '" data-v="' + esc(val) + '">' + esc(label) + '</button>';
    let html = '<div class="stack"><div><span class="eyebrow">Book</span><h1>Book a lesson</h1><p class="muted small">Choose a time that suits you. The tutor accepts or suggests another time – you get a notification and see it under My lessons.</p></div>' +
      '<div class="seg big">' + seg('kind', 'one', 'One-on-one lesson') + seg('kind', 'group', 'Group class') + '</div>';
    if (bs.kind === 'group') {
      const up = state.classes.filter((c) => c.published && new Date(c.starts_at) > now());
      const mine = new Set(state.bookings.filter((b) => b.class_id && ['pending', 'accepted'].includes(b.status)).map((b) => b.class_id));
      html += up.length ? up.map((c) => { const taken = (state.seats || {})[c.id] || 0; const left = Math.max(0, c.capacity - taken); return '<div class="card lesson"><div class="date"><span>' + esc(fmt.wd(c.starts_at)) + '</span><b>' + esc(fmt.day(c.starts_at)) + '</b><span>' + esc(fmt.mon(c.starts_at)) + '</span></div><div style="min-width:0"><div class="row" style="gap:6px">' + pill(c.subject, SUBJ[c.subject].short) + pill('', fmt.rand(c.fee)) + pill(left ? '' : 'bad', left ? left + ' seats left' : 'Full') + '</div><h3 style="margin-top:6px">' + esc(c.title) + '</h3><p class="small muted">' + esc(fmt.time(c.starts_at)) + ' · ' + c.minutes + ' min' + (c.notes ? ' · ' + esc(c.notes) : '') + '</p><div class="row" style="margin-top:10px">' + (mine.has(c.id) ? pill('good', 'You have requested this class') : '<button class="btn primary sm" data-action="book-class" data-id="' + c.id + '"' + (left ? '' : ' disabled') + '>Request a seat</button>') + '</div></div></div>'; }).join('') : '<div class="card"><p class="muted">No group classes are scheduled right now. Book a one-on-one instead, or check again later.</p></div>';
      return html + '</div>';
    }
    // one-on-one
    const days = []; const ahead = Number(bk.daysAhead) || 21;
    for (let i = 0; i < ahead; i++) { const key = fmt.key(Date.now() + i * 864e5); const slots = ADV.slotsFor(key, bs.mins, state.busy || []); if (slots.length) days.push({ key, slots }); }
    if (!bs.day || !days.find((d) => d.key === bs.day)) { bs.day = days[0] ? days[0].key : null; bs.hh = null; }
    const day = days.find((d) => d.key === bs.day);
    const rate = Number(fees[bs.subj] != null ? fees[bs.subj] : fees.default || 0); const cost = rate * bs.mins / 60;
    const topicOpts = (ADV.outlineTopics ? ADV.outlineTopics(bs.subj) : []).map((t) => '<button type="button" class="chipbtn ' + (bs.topics.includes(t.id) ? bs.subj : '') + '" data-action="book-topic" data-id="' + esc(t.id) + '">' + esc(t.title) + '</button>').join('');
    html += '<div class="card stack" style="gap:16px"><div><label>Subject</label><div class="seg">' + seg('subj', 'maths', 'Mathematics') + seg('subj', 'phys', 'Physics') + seg('subj', 'chem', 'Chemistry') + '</div></div>' +
      '<div><label>Length</label><div class="seg">' + durs.map((d) => seg('mins', d, fmt.mins(d))).join('') + '</div></div>' +
      '<div><label>Day</label><div class="row chips">' + (days.length ? days.map((d) => '<button class="chipbtn ' + (d.key === bs.day ? 'maths' : '') + '" data-action="book-day" data-id="' + d.key + '">' + esc(fmt.wd(d.key + 'T12:00:00+02:00') + ' ' + fmt.day(d.key + 'T12:00:00+02:00') + ' ' + fmt.mon(d.key + 'T12:00:00+02:00')) + '</button>').join('') : '<span class="small muted">No open times in the next ' + ahead + ' days. Message the tutor.</span>') + '</div></div>' +
      (day ? '<div><label>Start time</label><div class="row chips">' + day.slots.map((s) => '<button class="chipbtn ' + (bs.hh === s.hh ? 'maths' : '') + '" data-action="book-time" data-id="' + s.hh + '">' + s.hh + '</button>').join('') + '</div></div>' : '') +
      '<div><label>What do you want to cover? (optional)</label><div class="row chips">' + topicOpts + '</div></div>' +
      '<div class="field"><label for="b-note">Note for the tutor (optional)</label><textarea id="b-note" placeholder="e.g. I struggle with the tangent questions in 2024 Paper 1">' + esc(bs.note || '') + '</textarea></div>' +
      '<div class="pricebar"><div><span class="eyebrow">Fee</span><div class="price">' + fmt.rand(cost) + '</div><span class="small muted">' + fmt.rand(rate) + ' per hour · pay after the tutor confirms</span></div><button class="btn primary" data-action="book-send"' + (bs.hh ? '' : ' disabled') + '>' + (bs.hh ? 'Request ' + esc(fmt.date(bs.day + 'T12:00:00+02:00')) + ' at ' + bs.hh : 'Choose a day and time') + '</button></div></div>';
    return html + '</div>';
  };
  ADV.refreshBusy = async function () {
    try { state.busy = await sb.rpc('busy_slots', { from_ts: new Date().toISOString(), to_ts: new Date(Date.now() + 60 * 864e5).toISOString() }); } catch (e) { state.busy = []; }
    try { const s = await sb.rpc('class_seats', {}); state.seats = {}; s.forEach((r) => { state.seats[r.class_id] = Number(r.taken); }); } catch (e) { state.seats = {}; }
  };

  /* ---------------------------------------------------------------- LEARNER: lessons */
  function lessonCard(b, big) {
    const s = new Date(b.starts_at); const jw = ADV.joinWindow(b); const room = ADV.bookingRoom(b);
    const title = b.class_id ? (b.classes && b.classes.title) || 'Group class' : SUBJ[b.subject].name + ' – one-on-one';
    const pay = b.status === 'accepted' || b.status === 'completed' ? (b.paid ? pill('good', 'Paid') : pill('warn', 'Payment due ' + fmt.rand(b.fee))) : '';
    let actions = '';
    if (b.status === 'accepted' && !jw.over) {
      actions += jw.open && room ? '<a class="btn primary" href="' + esc(ADV.roomUrl(room, state.profile.full_name)) + '" target="_blank" rel="noopener">' + ICON.video + 'Join the lesson</a>' : '<span class="small muted">' + ICON.clock + ' Join opens 15 minutes before the start</span>';
      actions += '<a class="btn sm" href="' + esc(ADV.gcal((state.settings.site && state.settings.site.brand || 'Adventuity') + ' lesson', b.starts_at, b.ends_at, 'Join from the Adventuity portal: ' + location.origin + location.pathname, '')) + '" target="_blank" rel="noopener">Add to calendar</a>';
    }
    if (b.status === 'pending' && new Date(b.starts_at) > now()) actions += '<button class="btn sm" data-action="b-cancel" data-id="' + b.id + '">Cancel request</button>';
    if (b.status === 'accepted' && new Date(b.starts_at) - now() > 24 * 36e5) actions += '<button class="btn sm ghost" data-action="b-cancel" data-id="' + b.id + '" data-confirm="1">Cancel lesson</button>';
    const review = state.settings.site && state.settings.site.reviewUrl;
    if (b.status === 'completed' && review && /^https:\/\//.test(review)) actions += '<a class="btn sm" href="' + esc(review) + '" target="_blank" rel="noopener">★ Leave a Google review</a>';
    if ((b.status === 'accepted' || b.status === 'completed') && !b.paid) actions += '<button class="btn sm" data-action="b-pay" data-id="' + b.id + '">How to pay</button>' + '<label class="btn sm file-btn">' + (b.pop_path ? 'Replace proof of payment' : 'Upload proof of payment') + '<input type="file" accept="image/*,application/pdf" data-action="b-pop" data-id="' + b.id + '" hidden></label>';
    return '<div class="card lesson' + (['declined', 'cancelled', 'completed'].includes(b.status) || jw.over ? ' past' : '') + '"><div class="date"><span>' + esc(fmt.wd(s)) + '</span><b>' + esc(fmt.day(s)) + '</b><span>' + esc(fmt.mon(s)) + '</span></div><div style="min-width:0">' +
      '<div class="row" style="gap:6px">' + ADV.statusPill(b) + pill(b.subject, SUBJ[b.subject].short) + pay + (b.pop_path && !b.paid ? pill('', 'Proof sent') : '') + '<span class="mono small muted">Ref ' + esc(b.ref) + '</span></div>' +
      '<h3 style="margin-top:6px">' + esc(title) + '</h3><p class="small muted">' + esc(fmt.long(s)) + ' · ' + esc(fmt.time(s)) + '–' + esc(fmt.time(b.ends_at)) + (b.topics ? ' · ' + esc(ADV.topicNames ? ADV.topicNames(b.topics) : b.topics) : '') + '</p>' +
      (b.admin_message ? '<p class="tutor-msg"><b>Tutor:</b> ' + esc(b.admin_message) + '</p>' : '') +
      (state.payOpen === b.id ? payBox(b) : '') +
      (actions ? '<div class="row" style="margin-top:10px">' + actions + '</div>' : '') + '</div></div>';
  }
  ADV.lessonCard = lessonCard;
  function payBox(b) {
    const p = state.priv.payment || {};
    return '<div class="paybox"><b>Pay ' + fmt.rand(b.fee) + '</b><p style="white-space:pre-line;margin-top:4px">' + esc(p.text || 'The tutor will send payment details.') + '</p><p class="small">Use reference <b class="mono">' + esc(b.ref) + '</b>. Then upload your proof of payment below.</p>' + (p.link ? '<a class="btn sm primary" href="' + esc(p.link) + '" target="_blank" rel="noopener">Pay online</a>' : '') + '</div>';
  }
  ADV.views.lessons = function () {
    const list = state.bookings.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const up = list.filter((b) => ['pending', 'accepted'].includes(b.status) && new Date(b.ends_at) > now());
    const past = list.filter((b) => !up.includes(b)).reverse();
    return '<div class="stack"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="eyebrow">Lessons</span><h1>My lessons</h1></div><button class="btn primary" data-go="tab" data-id="book">' + ICON.plus + 'Book a lesson</button></div>' +
      '<div class="callout small">Confirmed lessons run in a private online classroom (video, screen share, whiteboard and chat). Tap <b>Join the lesson</b> when it opens – it starts in a new window. On a phone you may be asked to install the free Jitsi Meet app the first time.</div>' +
      (up.length ? up.map((b) => lessonCard(b)).join('') : '<div class="card"><p class="muted">No upcoming lessons. Book one and it shows up here.</p></div>') +
      (past.length ? '<h2>Earlier</h2>' + past.map((b) => lessonCard(b)).join('') : '') + '</div>';
  };

  /* ---------------------------------------------------------------- ACCOUNT */
  ADV.views.account = function () {
    const p = state.profile;
    const f = (id, label, val, type) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '"></div>';
    return '<div class="stack"><div><span class="eyebrow">Account</span><h1>' + esc(p.full_name || 'Your account') + '</h1><p class="small muted">' + esc(p.email || '') + (state.isAdmin ? ' · tutor (administrator)' : state.approved ? ' · study notes unlocked' : ' · waiting for approval') + '</p></div>' +
      '<form id="f-profile" class="card stack"><h3>Your details</h3><div class="grid cols-2">' + f('p-name', 'Name and surname', p.full_name) + f('p-phone', 'WhatsApp number', p.phone, 'tel') + f('p-school', 'School', p.school) + f('p-guardian', 'Parent/guardian number', p.guardian_phone, 'tel') + '</div><div class="row"><button class="btn primary" type="submit">Save details</button></div></form>' +
      '<form id="f-pass" class="card stack"><h3>Change password</h3><div class="grid cols-2">' + f('p-pass1', 'New password (8+ characters)', '', 'password') + f('p-pass2', 'Repeat the new password', '', 'password') + '</div><div class="row"><button class="btn" type="submit">Change password</button></div></form>' +
      (ADV.pushCard ? ADV.pushCard(state.isAdmin ? 'Get an alert on this device for every new booking request.' : 'Get an alert when the tutor confirms or changes a lesson.') : '') +
      '<div class="card row" style="justify-content:space-between"><div><b>Install the app</b><p class="small muted">Put the portal on your home screen for one-tap access.</p></div>' + (ADV.installButton ? ADV.installButton(true) : '') + '</div>' +
      '<div class="card row" style="justify-content:space-between"><b>Sign out of this device</b><button class="btn" data-action="signout">Sign out</button></div></div>';
  };
  ADV.onSubmitCore = async function (e) {
    if (e.target.id === 'f-profile') {
      e.preventDefault(); const patch = { full_name: $('#p-name').value.trim(), phone: $('#p-phone').value.trim(), school: $('#p-school').value.trim(), guardian_phone: $('#p-guardian').value.trim() };
      try { const r = await sb.update('profiles', { id: 'eq.' + state.profile.id }, patch); state.profile = r[0] || state.profile; toast('Saved'); } catch (err) { toast(ADV.errMsg(err)); }
    }
    if (e.target.id === 'f-pass') {
      e.preventDefault(); const a = $('#p-pass1').value, b = $('#p-pass2').value;
      if (a.length < 8) return toast('Use at least 8 characters'); if (a !== b) return toast('The two passwords differ');
      try { await sb.auth.updatePassword(a); toast('Password changed'); $('#p-pass1').value = ''; $('#p-pass2').value = ''; } catch (err) { toast(ADV.errMsg(err)); }
    }
  };

  /* ---------------------------------------------------------------- push notifications */
  const b64ToBytes = (b) => { const p = '='.repeat((4 - b.length % 4) % 4); const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  ADV.pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  ADV.pushCard = function (text) {
    if (!ADV.pushSupported()) return '<div class="card row">' + ICON.bell + '<div><b>Notifications</b><p class="small muted">This browser cannot show notifications. On iPhone, install the app first (Share → Add to Home Screen), then open it from the home screen.</p></div></div>';
    const on = Notification.permission === 'granted' && state.pushOn;
    return '<div class="card row" style="justify-content:space-between"><div class="row" style="flex-wrap:nowrap">' + ICON.bell + '<div><b>Notifications on this device</b><p class="small muted">' + esc(text) + '</p></div></div><div class="row">' + (on ? pill('good', 'On') + '<button class="btn sm" data-action="push-test">Send a test</button>' : '<button class="btn primary sm" data-action="push-on">Turn on</button>') + '</div></div>';
  };
  ADV.checkPush = async function () {
    if (!ADV.pushSupported()) return; try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); state.pushOn = !!sub; } catch (e) { state.pushOn = false; }
  };
  ADV.enablePush = async function () {
    try {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') return toast('Notifications are blocked in this browser\'s settings.', 4000);
      const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapidPublic) });
      const j = sub.toJSON(); await sb.upsert('push_subs', [{ user_id: sb.user.id, endpoint: j.endpoint, sub: j }], 'endpoint');
      state.pushOn = true; toast('Notifications are on'); render();
    } catch (e) { console.error(e); toast('Could not turn on notifications: ' + ADV.errMsg(e), 5000); }
  };

  /* ---------------------------------------------------------------- install */
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvt = e; });
  ADV.installButton = function (always) {
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) return always ? pill('good', 'Installed') : '';
    return '<button class="btn' + (always ? ' sm' : '') + '" data-action="install">' + ICON.ext + 'Install the app</button>';
  };

  /* ---------------------------------------------------------------- events */
  document.addEventListener('submit', (e) => { ADV.onSubmitCore(e); });
  document.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); if (g.dataset.go === 'tab') ADV.go(g.dataset.id); else if (g.dataset.go === 'topic') ADV.go('study', g.dataset.id); return; }
    const a = e.target.closest('[data-action]'); if (!a || a.tagName === 'INPUT') return;
    const act = a.dataset.action, id = a.dataset.id; const bs = state.book;
    const H = ADV.actions[act]; if (H) { await H(a, e); return; }
    switch (act) {
      case 'auth-mode': state.authMode = id; render(); break;
      case 'sheet': $('#sheet').hidden = false; break;
      case 'sheet-close': $('#sheet').hidden = true; break;
      case 'signout': ADV.signOut(); break;
      case 'push-on': ADV.enablePush(); break;
      case 'push-test': try { const r = await sb.fn('notify', { event: 'test' }); toast(r.sent ? 'Test sent – check this device' : 'No device registered yet'); } catch (err) { toast(ADV.errMsg(err)); } break;
      case 'install': if (state.installEvt) { try { await state.installEvt.prompt(); } catch (err) { /* dismissed */ } state.installEvt = null; } else toast(/iPhone|iPad/.test(navigator.userAgent) ? 'In Safari: Share → Add to Home Screen' : 'Browser menu → Install app / Add to Home screen', 5000); break;
      case 'book-set': { const k = a.dataset.k; let v = a.dataset.v; if (k === 'mins') v = Number(v); bs[k] = v; if (k === 'subj') bs.topics = []; if (k === 'mins' || k === 'kind') bs.hh = null; if (k === 'kind' && v === 'group') await ADV.refreshBusy(); render(); break; }
      case 'book-day': bs.day = id; bs.hh = null; render(); break;
      case 'book-time': bs.hh = id; render(); break;
      case 'book-topic': { const i = bs.topics.indexOf(id); if (i >= 0) bs.topics.splice(i, 1); else bs.topics.push(id); bs.note = ($('#b-note') || { value: bs.note }).value; render(); break; }
      case 'book-send': {
        bs.note = ($('#b-note') || { value: '' }).value.trim(); const s = sast(bs.day, bs.hh); const e2 = new Date(+s + bs.mins * 6e4); a.disabled = true;
        try {
          const r = await sb.insert('bookings', [{ learner_id: sb.user.id, subject: bs.subj, topics: bs.topics.join(','), learner_note: bs.note, starts_at: s.toISOString(), ends_at: e2.toISOString(), status: 'pending', paid: false }]);
          const nb = r[0]; ADV.notify(nb.id, 'requested');
          ADV.emailTutor('New lesson request – ' + state.profile.full_name, { Learner: state.profile.full_name, Phone: state.profile.phone, Subject: SUBJ[bs.subj].name, When: fmt.long(s) + ' ' + fmt.time(s) + '–' + fmt.time(e2), Topics: ADV.topicNames ? ADV.topicNames(nb.topics) : nb.topics, Note: bs.note || '-', Fee: fmt.rand(nb.fee), Open: location.origin + location.pathname + '#dash' });
          state.book = null; await ADV.loadBookings(); await ADV.refreshBusy(); ADV.go('lessons'); toast('Request sent – the tutor will confirm', 4500);
        } catch (err) { a.disabled = false; toast(/row-level|violates/.test(err.message) ? 'That time is no longer available – pick another.' : ADV.errMsg(err), 5000); await ADV.refreshBusy(); render(); }
        break;
      }
      case 'book-class': {
        const c = state.classes.find((x) => x.id === id); a.disabled = true;
        try { const r = await sb.insert('bookings', [{ learner_id: sb.user.id, class_id: id, subject: c.subject, starts_at: c.starts_at, ends_at: new Date(+new Date(c.starts_at) + c.minutes * 6e4).toISOString(), status: 'pending', paid: false }]); ADV.notify(r[0].id, 'requested'); ADV.emailTutor('Group class seat request – ' + state.profile.full_name, { Learner: state.profile.full_name, Class: c.title, When: fmt.long(c.starts_at) + ' ' + fmt.time(c.starts_at), Fee: fmt.rand(r[0].fee) }); await ADV.loadBookings(); await ADV.refreshBusy(); toast('Seat requested – the tutor will confirm'); render(); }
        catch (err) { a.disabled = false; toast(ADV.errMsg(err)); }
        break;
      }
      case 'b-cancel': if (a.dataset.confirm && !confirm('Cancel this confirmed lesson? The tutor is notified.')) break; try { await sb.rpc('cancel_booking', { b: id }); ADV.notify(id, 'cancelled'); await ADV.loadBookings(); toast('Request cancelled'); render(); } catch (err) { toast(ADV.errMsg(err)); } break;
      case 'b-pay': state.payOpen = state.payOpen === id ? null : id; if (!state.priv.payment) await loadPrivate(); render(); break;
      default: break;
    }
  });
  document.addEventListener('change', async (e) => {
    const inp = e.target; if (inp.dataset && inp.dataset.action === 'b-pop' && inp.files && inp.files[0]) {
      const f = inp.files[0]; if (f.size > 5 * 1024 * 1024) return toast('Use a file smaller than 5 MB');
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = sb.user.id + '/' + inp.dataset.id + '-' + Date.now() + '.' + ext;
      try { toast('Uploading…'); await sb.upload('pop', path, f); await sb.rpc('attach_pop', { b: inp.dataset.id, path }); ADV.notify(inp.dataset.id, 'pop'); await ADV.loadBookings(); toast('Proof of payment sent'); render(); } catch (err) { toast(ADV.errMsg(err)); }
    }
    if (ADV.onChange) ADV.onChange(e);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'b-note' && state.book) state.book.note = e.target.value; if (ADV.onInput) ADV.onInput(e); });

  /* ---------------------------------------------------------------- boot */
  ADV.boot = async function () {
    if (!CFG.supabaseUrl) {   // back office not connected yet: friendly holding page instead of errors
      $('#app').innerHTML = '<main><div class="wrap"><div class="auth"><div class="auth-card card"><div class="auth-head"><span class="mark big" aria-hidden="true"></span><div><h1>Adventuity</h1><p class="muted">Grade 12 Mathematics & Physical Sciences</p></div></div><p>Online booking opens in the next few days. Until then, contact the tutor to book a lesson.</p><p class="small muted"><a href="index.html">← Back to the website</a></p></div></div></div></main>';
      return;
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(() => ADV.checkPush()).catch(() => { });
    await loadSettings();
    if (sb.session) { await afterLogin(); }
    else { state.loading = false; state.authMode = /signup/.test(location.hash) ? 'signup' : 'signin'; render(); }
    if (state.tab === 'book') await ADV.refreshBusy();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.profile) ADV.loadBookings().then(() => { if (!document.querySelector('input:focus,textarea:focus,select:focus')) render(); }); });
  };
  ADV.after.push(async () => { if (state.tab === 'book' && !state.busy && state.profile) { await ADV.refreshBusy(); render(); } });
})();
