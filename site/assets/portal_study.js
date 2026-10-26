/* Adventuity portal – study material: decrypts the notes, topic pages with diagrams and step-by-step working,
   study-time estimates, exam practice with memos, quizzes, mock papers, plan, progress, tutor notes, teach mode + pen. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, $$, esc, T, fmt, pill, ICON, state, sb, SUBJ } = ADV; const CFG = ADV.cfg;
  const S = window.ADV_STEPS;
  const OUT = window.ADV_OUTLINE || []; const OT = {}; OUT.forEach((t) => { OT[t.id] = t; });
  const D = ADV.D = { TOPIC: {}, SECTION: {}, QUESTION: {}, figs: {}, list: [] };
  const ORDER = { P1: ['cubic', 'sequences', 'functions', 'finance', 'calculus', 'counting'], P2: ['stats', 'analytical', 'trig', 'trig3d', 'euclid'] };
  const PRACTICE_RATE = 1.2, QUIZ_MIN = 10;
  const LEVELS = { 1: 'Knowledge', 2: 'Routine', 3: 'Complex', 4: 'Problem solving' };

  /* ---------------------------------------------------------------- outline helpers (public data) */
  const subjTopics = (sj) => {
    if (sj === 'maths') return ORDER.P1.concat(ORDER.P2).map((id) => OT[id]).filter(Boolean).concat(OUT.filter((t) => t.subj === 'maths' && !ORDER.P1.includes(t.id) && !ORDER.P2.includes(t.id)));
    return OUT.filter((t) => t.subj === sj);
  };
  const paperTopics = (sj, pp) => (sj === 'maths' ? (ORDER[pp] || []).map((id) => OT[id]).filter(Boolean) : OUT.filter((t) => t.subj === sj));
  ADV.outlineTopics = (sj) => subjTopics(sj).map((t) => ({ id: t.id, title: t.title }));
  ADV.topicNames = (csv) => String(csv || '').split(',').filter(Boolean).map((id) => (OT[id] ? OT[id].title : id)).join(', ');
  ADV.topicTab = (id) => ((OT[id] || {}).subj === 'maths' ? 'maths' : 'sci');
  const examOf = (t) => { const id = t.subj === 'maths' ? (t.paper === 'P2' ? 'mp2' : 'mp1') : t.subj === 'phys' ? 'pp1' : 'pp2'; return (CFG.exams || []).find((e) => e.id === id); };
  const daysTo = (when) => { const a = new Date(fmt.key(ADV.now()) + 'T00:00:00+02:00'), b = new Date(fmt.key(when) + 'T00:00:00+02:00'); return Math.round((b - a) / 864e5); };

  /* ---------------------------------------------------------------- progress (synced to the account) */
  const P = state.P = { topics: {}, secs: {}, quiz: {}, practice: {}, plan: {} };
  const LSK = () => 'adv_prog_' + (sb.user ? sb.user.id : 'anon');
  const merge = (a, b) => { ['topics', 'secs', 'quiz', 'practice', 'plan'].forEach((k) => { P[k] = Object.assign({}, (a && a[k]) || {}, (b && b[k]) || {}); }); };
  ADV.loadProgress = async function () {
    let local = null; try { local = JSON.parse(localStorage.getItem(LSK()) || 'null'); } catch (e) { local = null; }
    let remote = null; try { const r = await sb.select('progress', { user_id: 'eq.' + sb.user.id }); remote = r[0] && r[0].data; } catch (e) { remote = null; }
    merge(local, remote);
  };
  let saveT = null;
  const save = ADV.saveProgress = function () {
    try { localStorage.setItem(LSK(), JSON.stringify(P)); } catch (e) { /* storage blocked */ }
    clearTimeout(saveT); saveT = setTimeout(() => { if (sb.user) sb.upsert('progress', [{ user_id: sb.user.id, data: P, updated_at: new Date().toISOString() }], 'user_id').catch(() => { }); }, 1500);
  };

  /* ---------------------------------------------------------------- study-time estimates */
  const est = ADV.est = function (t, data) {
    const p = data || P; const o = OT[t.id] || t; const done = p.topics[o.id] === 'done';
    const notes = o.sections.reduce((n, s) => n + (s.est || 0), 0);
    const prac = Math.round((o.pm || 0) * PRACTICE_RATE); const quiz = o.qc ? QUIZ_MIN : 0;
    const notesLeft = done ? 0 : o.sections.filter((s) => !p.secs[s.id]).reduce((n, s) => n + (s.est || 0), 0);
    const pracLeft = done ? 0 : Math.round((o.pq || []).filter(([id]) => !p.practice[id]).reduce((n, q) => n + q[1], 0) * PRACTICE_RATE);
    const quizLeft = done || p.quiz[o.id] ? 0 : quiz;
    const total = notes + prac + quiz, left = notesLeft + pracLeft + quizLeft;
    return { notes, prac, quiz, total, left, pct: total ? Math.round(100 * (1 - left / total)) : 0, secsDone: o.sections.filter((s) => p.secs[s.id]).length };
  };
  const paperLoad = ADV.paperLoad = function (data) {
    return (CFG.exams || []).map((e) => {
      const ts = e.subj === 'maths' ? paperTopics('maths', /2/.test(e.paper) ? 'P2' : 'P1') : paperTopics(e.subj);
      const left = ts.reduce((n, t) => n + est(t, data).left, 0), total = ts.reduce((n, t) => n + est(t, data).total, 0);
      const days = daysTo(e.when); return { e, ts, left, total, days, perDay: days > 0 ? left / days : null };
    });
  };
  const barHtml = (pct) => '<div class="progress-bar" role="img" aria-label="' + pct + '% done"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';

  /* ---------------------------------------------------------------- decrypt and index the notes */
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function index(data) {
    D.figs = data.figs || {}; D.list = [];
    ['maths', 'phys', 'chem'].forEach((sj) => (data.topics[sj] || []).forEach((t) => { t.subj = sj; t.practice = (data.practice || {})[t.id] || []; D.list.push(t); D.TOPIC[t.id] = t; t.sections.forEach((s, i) => { D.SECTION[s.id] = { topic: t, sec: s, idx: i }; }); t.practice.forEach((q) => { D.QUESTION[q.id] = { topic: t, q }; }); }));
  }
  ADV.loadContent = async function () {
    if (state.contentReady || state.contentLoading) return; state.contentLoading = true; state.contentError = '';
    try {
      if (window.ADV_DEV_CONTENT) index(window.ADV_DEV_CONTENT);
      else {
        if (!window.crypto || !crypto.subtle || typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to open the notes. Update Chrome or Safari, or use another browser.');
        const [rows, buf] = await Promise.all([
          sb.select('content_keys', { select: 'k', id: 'eq.' + (CFG.contentKeyId || 'v1') }),
          fetch(CFG.contentUrl || ('content.bin?v=' + (CFG.contentVersion || '1'))).then((r) => { if (!r.ok) throw new Error('The notes could not be downloaded (' + r.status + ').'); return r.arrayBuffer(); })
        ]);
        if (!rows.length) throw new Error('locked');
        const key = await crypto.subtle.importKey('raw', b64(rows[0].k), 'AES-GCM', false, ['decrypt']);
        const bytes = new Uint8Array(buf);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
        const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        index(JSON.parse(text));
      }
      state.contentReady = true;
      ADV.loadNotes();
    } catch (e) {
      console.error(e);
      state.contentError = e.message === 'locked' ? 'locked' : (navigator.onLine === false ? 'You are offline – connect to the internet to open the notes.' : ADV.errMsg(e));
      if (e.message === 'locked') state.approved = false;
    }
    state.contentLoading = false;
  };
  const ready = () => state.approved && state.contentReady;
  const waitCard = () => state.contentError && state.contentError !== 'locked'
    ? '<div class="card"><b>The notes did not open</b><p class="small muted" style="margin-top:4px">' + esc(state.contentError) + '</p><div class="row" style="margin-top:10px"><button class="btn sm" data-action="content-retry">Try again</button></div></div>'
    : '<div class="card"><p class="muted">Opening your study notes…</p></div>';
  ADV.actions['content-retry'] = async () => { state.contentReady = false; await ADV.loadContent(); ADV.render(); };

  /* ---------------------------------------------------------------- tutor notes (annotations) */
  state.notes = [];
  ADV.loadNotes = async function () { try { state.notes = await sb.select('annotations', { order: 'pinned.desc,created_at.asc' }); } catch (e) { state.notes = []; } if (state.topic) ADV.render(); };
  const notesFor = (target) => state.notes.filter((n) => n.target === target);
  const learnerName = (id) => { const l = (state.learners || []).find((x) => x.id === id); return l ? l.full_name || l.email : 'one learner'; };
  function notesHtml(target) {
    const list = notesFor(target);
    let h = list.map((n) => '<div class="tnote"><div class="row" style="justify-content:space-between;gap:6px"><span class="eyebrow">' + ICON.note + ' Tutor note' + (state.isAdmin ? ' · ' + esc(n.audience ? 'for ' + learnerName(n.audience) : 'all learners') : '') + '</span>' +
      (state.isAdmin ? '<span class="row" style="gap:4px"><button class="btn sm ghost" data-action="note-edit" data-id="' + n.id + '">Edit</button><button class="btn sm ghost" data-action="note-del" data-id="' + n.id + '">Delete</button></span>' : '') + '</div><div class="tnote-body">' + T(n.body) + '</div></div>').join('');
    if (state.isAdmin) {
      const f = state.noteForm;
      if (f && f.target === target) {
        const opts = '<option value="">All learners</option>' + (state.learners || []).filter((l) => l.role !== 'admin').map((l) => '<option value="' + l.id + '"' + (f.audience === l.id ? ' selected' : '') + '>' + esc(l.full_name || l.email) + '</option>').join('');
        h += '<form class="tnote-form card" data-target="' + esc(target) + '" id="f-note"><label for="n-body">Tutor note (use \\( … \\) for maths)</label><textarea id="n-body" required>' + esc(f.body || '') + '</textarea><div class="grid cols-2"><div class="field"><label for="n-aud">Who sees it</label><select id="n-aud">' + opts + '</select></div><label class="check" style="align-self:end"><input id="n-pin" type="checkbox"' + (f.pinned ? ' checked' : '') + '> Pin to the top</label></div><div class="row"><button class="btn primary sm" type="submit">Save note</button><button class="btn sm" type="button" data-action="note-cancel">Cancel</button></div></form>';
      } else h += '<button class="btn sm ghost note-add" data-action="note-add" data-id="' + esc(target) + '">' + ICON.pen + 'Add tutor note</button>';
    }
    return h;
  }
  ADV.actions['note-add'] = (a) => { state.noteForm = { target: a.dataset.id }; ADV.render(); setTimeout(() => { const t = $('#n-body'); if (t) t.focus(); }, 30); };
  ADV.actions['note-cancel'] = () => { state.noteForm = null; ADV.render(); };
  ADV.actions['note-edit'] = (a) => { const n = state.notes.find((x) => x.id === a.dataset.id); state.noteForm = { id: n.id, target: n.target, body: n.body, audience: n.audience, pinned: n.pinned }; ADV.render(); };
  ADV.actions['note-del'] = async (a) => { if (!confirm('Delete this tutor note?')) return; try { await sb.remove('annotations', { id: 'eq.' + a.dataset.id }); state.notes = state.notes.filter((n) => n.id !== a.dataset.id); ADV.render(); } catch (e) { ADV.toast(ADV.errMsg(e)); } };
  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    if (e.target.id !== 'f-note') return; e.preventDefault();
    const f = state.noteForm; const row = { target: e.target.dataset.target, body: $('#n-body').value.trim(), audience: $('#n-aud').value || null, pinned: $('#n-pin').checked, updated_at: new Date().toISOString() };
    if (!row.body) return;
    try {
      if (f && f.id) { const r = await sb.update('annotations', { id: 'eq.' + f.id }, row); state.notes = state.notes.map((n) => (n.id === f.id ? r[0] : n)); }
      else { const r = await sb.insert('annotations', [row]); state.notes.push(r[0]); }
      state.noteForm = null; ADV.toast('Note saved – learners see it on this page'); ADV.render();
    } catch (err) { ADV.toast(ADV.errMsg(err)); }
  };

  /* ---------------------------------------------------------------- subject lists */
  const WEIGHT = {
    maths: { P1: [['Algebra, equations & inequalities', 25], ['Number patterns', 25], ['Functions & graphs', 35], ['Finance, growth & decay', 15], ['Differential calculus', 35], ['Counting & probability', 15]], P2: [['Statistics & regression', 20], ['Analytical geometry', 40], ['Trigonometry', 50], ['Euclidean geometry', 40]] },
    phys: { P1: [['Mechanics', 65], ['Waves, sound & light (Doppler)', 15], ['Electricity & magnetism', 55], ['Matter & materials (photoelectric effect, spectra)', 15]] },
    chem: { P2: [['Chemical change (rate, equilibrium, acids & bases, electrochemistry, stoichiometry)', 92], ['Matter & materials (organic chemistry)', 58]] }
  };
  const statusPill = (id) => (P.topics[id] === 'done' ? pill('good', 'Done') : P.topics[id] === 'review' ? pill('warn', 'Needs work') : '');
  function topicCard(t) {
    const e = est(t);
    return '<button class="topic-card" data-go="topic" data-id="' + esc(t.id) + '"><span class="status">' + (state.approved ? statusPill(t.id) : ICON.lock) + '</span><span class="row" style="gap:6px">' + pill(t.subj, t.paper) + (t.grade && /11/.test(t.grade) ? pill('', 'Gr 11 work') : '') + '</span><span class="t">' + esc(t.title) + '</span><span class="meta">' + esc(t.weight) + '</span>' +
      '<span class="est-line">' + ICON.clock + '<span>≈ ' + fmt.mins(e.total) + ' to master' + (state.approved && e.left < e.total ? ' · <b>' + fmt.mins(e.left) + ' left</b>' : '') + '</span></span>' +
      (state.approved ? barHtml(e.pct) : '') + '<span class="meta">' + t.sections.length + ' sections · ' + (t.pc || 0) + ' exam questions · ' + (t.qc || 0) + ' quiz questions</span></button>';
  }
  function loadBanner(papers) {
    return '<div class="grid cols-2">' + papers.map((L) => {
      const e = L.e; const written = L.days < 0;
      return '<div class="card load"><div class="row" style="justify-content:space-between"><span class="eyebrow">' + esc(e.subject + ' ' + e.paper) + '</span>' + pill(written ? '' : L.days <= 3 ? 'bad' : L.days <= 7 ? 'warn' : 'accent', written ? 'Written' : L.days === 0 ? 'Today' : L.days + ' days') + '</div>' +
        '<div class="row" style="margin-top:6px;align-items:baseline;gap:6px"><b class="big">' + fmt.mins(L.left) + '</b><span class="small muted">of study left (of ' + fmt.mins(L.total) + ')</span></div>' + barHtml(L.total ? Math.round(100 * (1 - L.left / L.total)) : 0) +
        (L.perDay && !written ? '<p class="small" style="margin-top:6px">' + ICON.clock + ' About <b>' + fmt.mins(Math.ceil(L.perDay / 5) * 5) + ' a day</b> until ' + esc(fmt.date(e.when)) + '</p>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function viewSubject(tab) {
    const subs = tab === 'maths' ? ['maths'] : ['phys', 'chem'];
    const loads = paperLoad().filter((L) => subs.includes(L.e.subj));
    let out = '<div class="stack"><div><span class="eyebrow">' + (tab === 'maths' ? 'Mathematics · Paper 1 and Paper 2' : 'Physical Sciences · Paper 1 (Physics) and Paper 2 (Chemistry)') + '</span><h1>' + (tab === 'maths' ? 'Mathematics' : 'Physical Sciences') + '</h1>' +
      '<p class="small muted" style="margin-top:4px">Study time per topic = reading the notes and redoing the worked examples + the exam questions at exam pace (about 1,2 minutes per mark) + the quiz.' + (state.approved ? ' Tick sections off as you go and the time left updates.' : '') + '</p></div>';
    if (!state.approved) out += '<div class="callout row">' + ICON.lock + '<span>The notes open once the tutor approves your account (usually with your first confirmed lesson). <button class="btn sm primary" data-go="tab" data-id="book">Book a lesson</button></span></div>';
    out += loadBanner(loads);
    out += '<div class="card search"><input id="q" type="search" placeholder="Find a topic or section (e.g. tangent, Doppler, Kc)" value="' + esc(state.q || '') + '" aria-label="Search topics"></div><div id="subj-list">' + subjectList(subs) + '</div>';
    return out + '</div>';
  }
  function subjectList(subs) {
    const q = (state.q || '').trim().toLowerCase(); const match = (t) => !q || (t.title + ' ' + t.sections.map((s) => s.title).join(' ')).toLowerCase().includes(q);
    let out = '';
    subs.forEach((sj) => (sj === 'maths' ? ['P1', 'P2'] : sj === 'phys' ? ['P1'] : ['P2']).forEach((pp) => {
      const list = paperTopics(sj, pp).filter(match); if (!list.length) return;
      const w = (WEIGHT[sj] || {})[pp] || [];
      out += '<section class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between">' + '<div class="row">' + pill(sj, SUBJ[sj].short) + '<h2>' + esc(sj === 'maths' ? 'Paper ' + pp.slice(1) : pp === 'P1' ? 'Paper 1 · Physics' : 'Paper 2 · Chemistry') + '</h2></div></div>' +
        '<p class="small muted" style="margin-top:6px">Mark weighting: ' + w.map(([n, m]) => esc(n) + ' <b>' + m + '</b>').join(' · ') + ' · total 150.</p>' +
        '<div class="grid cols-3" style="margin-top:14px">' + list.map(topicCard).join('') + '</div></section>';
    }));
    return out || '<div class="card"><p class="muted">No topic matches “' + esc(q) + '”.</p></div>';
  }
  ADV.views.maths = () => viewSubject('maths');
  ADV.views.sci = () => viewSubject('sci');
  const prevInput = ADV.onInput;
  ADV.onInput = function (e) { if (prevInput) prevInput(e); if (e.target.id === 'q') { state.q = e.target.value; const box = $('#subj-list'); if (box) box.innerHTML = subjectList(state.tab === 'maths' ? ['maths'] : ['phys', 'chem']); } };

  /* ---------------------------------------------------------------- topic page */
  const safeFig = (x) => { try { return window.renderFig(x); } catch (e) { return ''; } };
  const FIG = (f) => (f ? (Array.isArray(f) ? f : [f]).map((x) => '<figure class="fg-fig">' + safeFig(x) + (x.caption ? '<figcaption>' + esc(x.caption) + '</figcaption>' : '') + '</figure>').join('') : '');
  const list = (arr) => (arr && arr.length ? '<ul>' + arr.map((x) => '<li>' + T(x) + '</li>').join('') + '</ul>' : '');
  function lockedTopic(o) {
    const e = est(o);
    return '<div class="stack"><div><button class="btn sm ghost" data-go="tab" data-id="' + ADV.topicTab(o.id) + '">← Back</button></div>' +
      '<div class="card"><div class="row" style="gap:6px">' + pill(o.subj, SUBJ[o.subj].short + ' · ' + o.paper) + pill('warn', 'Locked') + '</div><h1 style="margin-top:8px">' + esc(o.title) + '</h1><p class="small muted" style="margin-top:6px">' + esc(o.weight) + '</p>' +
      '<p style="margin-top:10px">' + ICON.clock + ' About <b>' + fmt.mins(e.total) + '</b> to master: notes and worked examples ' + fmt.mins(e.notes) + ' · ' + (o.pc || 0) + ' exam questions ' + fmt.mins(e.prac) + ' · quiz ' + fmt.mins(e.quiz) + '.</p>' +
      '<div class="callout" style="margin-top:12px">' + (state.contentError && state.contentError !== 'locked' ? esc(state.contentError) : 'The full notes, worked examples with diagrams, exam questions and memos open once the tutor approves your account.') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" data-action="book-topic-go" data-id="' + esc(o.id) + '">' + ICON.plus + 'Book a lesson on this topic</button></div></div>' +
      '<div class="card"><h3>What this topic covers</h3><ol class="outline">' + o.sections.map((s) => '<li><div class="ol-row"><span>' + esc(s.title) + '</span><span class="mono small muted">' + s.est + ' min</span></div></li>').join('') + '</ol></div></div>';
  }
  ADV.actions['book-topic-go'] = (a) => { const o = OT[a.dataset.id]; state.book = { kind: 'one', subj: o.subj, mins: 60, day: null, hh: null, topics: [o.id], note: '' }; ADV.go('book'); };
  function secHtml(t, s, i) {
    const done = !!P.secs[s.id]; const ex = s.example || {};
    const open = state.openSec ? state.openSec === s.id : i === 0;
    return '<details class="section" ' + (open ? 'open' : '') + ' id="sec-' + esc(s.id) + '"><summary><span class="mono small muted">' + (i + 1) + '</span><span>' + esc(s.title) + '</span><span class="row" style="gap:6px;flex:none">' + pill('', '≈ ' + (s.est || 20) + ' min') + (done ? pill('good', 'Studied') : '') + (notesFor(s.id).length ? pill('accent', 'Tutor note') : '') + '</span>' + ICON.chev + '</summary><div class="body protect">' +
      notesHtml(s.id) +
      (s.book ? '<div class="bookref">' + ICON.book + '<div><b>Textbook:</b> ' + esc(s.book) + '</div></div>' : '') +
      '<div class="block"><h4><span class="dot"></span>Must know</h4>' + list(s.know) + '</div>' +
      (s.definitions && s.definitions.length ? '<div class="block"><h4><span class="dot"></span>Definitions (exam wording)</h4><div class="defs">' + s.definitions.map((d) => '<div class="def"><b>' + T(d.term) + '</b>' + T(d.def) + '</div>').join('') + '</div></div>' : '') +
      (s.method && s.method.length ? '<div class="block"><h4><span class="dot"></span>Method</h4><ol class="step-list">' + s.method.map((x) => '<li><span>' + T(x) + '</span></li>').join('') + '</ol></div>' : '') +
      (ex.q ? '<div class="block"><h4><span class="dot"></span>Worked example</h4><div class="example"><div class="q">' + S.renderQuestion(ex.q) + '</div>' + FIG(D.figs['sec:' + s.id]) + FIG(ex.fig) + S.renderSteps(ex.steps, FIG) + '<div class="ans"><span class="eyebrow">Answer</span><div>' + T(ex.answer) + '</div></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn sm primary" data-action="teach" data-id="' + esc(s.id) + '">' + ICON.play + 'Teach mode – one step at a time</button></div></div></div>' : '') +
      '<div class="grid cols-2"><div class="block"><h4><span class="dot" style="background:var(--bad)"></span>Common mistakes</h4>' + list(s.pitfalls) + '</div><div class="block"><h4><span class="dot" style="background:var(--good)"></span>Exam tips</h4>' + list(s.examTips) + '</div></div>' +
      '<div class="row"><button class="btn sm ' + (done ? '' : 'primary') + '" data-action="sec-done" data-id="' + esc(s.id) + '">' + (done ? 'Mark as not studied' : ICON.check + 'I have studied this section') + '</button></div>' +
      '</div></details>';
  }
  ADV.views.topic = function (id) {
    const o = OT[id]; if (!o) return '<div class="card"><p>Topic not found.</p></div>';
    if (!state.approved) return lockedTopic(o);
    if (!state.contentReady) { if (!state.contentLoading && !state.contentError) ADV.loadContent().then(() => ADV.render()); return state.contentError === 'locked' ? lockedTopic(o) : waitCard(); }
    const t = D.TOPIC[id]; if (!t) return lockedTopic(o);
    const e = est(o); const st = P.topics[id] || '';
    return '<div class="stack" id="topic-root">' +
      '<div class="row" style="justify-content:space-between"><button class="btn sm ghost" data-go="tab" data-id="' + ADV.topicTab(id) + '">← ' + (t.subj === 'maths' ? 'Mathematics' : 'Physical Sciences') + '</button>' + (state.isAdmin || state.isTutor ? '<button class="btn sm" data-action="pen-page">' + ICON.pen + 'Pen on this page</button>' : '') + '</div>' +
      '<div class="card protect"><div class="row" style="gap:6px">' + pill(t.subj, SUBJ[t.subj].short + ' · ' + t.paper) + (t.grade ? pill('', t.grade) : '') + statusPill(id) + '</div><h1 style="margin-top:8px">' + esc(t.title) + '</h1>' +
      '<p style="margin-top:8px;max-width:75ch">' + T(t.overview) + '</p>' +
      '<div class="row" style="margin-top:12px"><span class="pill accent wrap">' + esc(t.weight) + '</span>' + (t.book ? '<span class="pill">Textbook ' + esc(t.book.chapter) + ' · p. ' + esc(t.book.pages) + '</span>' : '') + '</div>' +
      '<div class="est-box"><div><span class="eyebrow">Study time</span><b>≈ ' + fmt.mins(e.total) + '</b></div><div><span class="eyebrow">Notes & examples</span>' + fmt.mins(e.notes) + '</div><div><span class="eyebrow">Exam questions</span>' + fmt.mins(e.prac) + '</div><div><span class="eyebrow">Quiz</span>' + fmt.mins(e.quiz) + '</div><div><span class="eyebrow">Left</span><b>' + fmt.mins(e.left) + '</b></div></div>' + barHtml(e.pct) +
      '<div class="row" style="margin-top:14px"><button class="btn sm ' + (st === 'done' ? 'primary' : '') + '" data-action="status" data-id="' + esc(id) + '" data-val="done">' + ICON.check + 'Topic done</button><button class="btn sm ' + (st === 'review' ? 'primary' : '') + '" data-action="status" data-id="' + esc(id) + '" data-val="review">Needs work</button>' + (t.ref ? ADV.btnLink(t.ref.url, t.ref.label, 'sm ghost', ICON.ext) : '') + (t.practice.length ? '<button class="btn sm ghost" data-action="scroll" data-id="practice">' + t.practice.length + ' exam questions</button>' : '') + '<button class="btn sm ghost" data-action="scroll" data-id="quiz">Quiz</button>' + (state.isAdmin || state.isTutor ? '' : '<button class="btn sm ghost" data-action="book-topic-go" data-id="' + esc(id) + '">Book a lesson on this</button>') + '</div>' +
      '<div style="margin-top:12px">' + notesHtml(id) + '</div></div>' +
      '<div class="stack">' + t.sections.map((s, i) => secHtml(t, s, i)).join('') + '</div>' +
      practiceHtml(t) +
      '<div class="card protect" id="quiz"><span class="eyebrow">Self-check</span><h2 style="margin-top:4px">Quiz: ' + esc(t.title) + '</h2><div id="quiz-body" style="margin-top:10px"></div></div></div>';
  };
  function practiceHtml(t) {
    const qs = t.practice || []; if (!qs.length) return '';
    const lv = state.pLevel || 0; const shown = qs.filter((q) => !lv || Number(q.level) === lv);
    const done = qs.filter((q) => P.practice[q.id]).length; const marks = qs.reduce((n, q) => n + (Number(q.marks) || 0), 0);
    const chip = (v, label) => '<button class="chipbtn ' + (lv === v ? 'maths' : '') + '" data-action="p-level" data-id="' + v + '">' + label + '</button>';
    const card = (q, i) => '<details class="section" id="pq-' + esc(q.id) + '"' + (state.openQ === q.id ? ' open' : '') + '><summary><span class="mono small muted">Q' + (i + 1) + '</span><span>' + esc(q.type) + '</span><span class="row" style="gap:6px;flex:none">' + pill('', q.marks + ' marks · ≈ ' + Math.round(q.marks * PRACTICE_RATE) + ' min') + pill(Number(q.level) >= 4 ? 'warn' : '', LEVELS[q.level] || 'Level ' + q.level) + (P.practice[q.id] ? pill('good', 'Done') : '') + (notesFor(q.id).length ? pill('accent', 'Tutor note') : '') + '</span>' + ICON.chev + '</summary><div class="body protect">' +
      notesHtml(q.id) + '<p class="small muted">' + esc(q.seen) + '</p>' + FIG(D.figs[q.id]) + FIG(q.fig) + '<div class="pq">' + S.renderQuestion(q.q) + '</div>' +
      '<div class="row"><button class="btn sm primary" data-action="memo-toggle" data-id="' + esc(q.id) + '">' + (state.memoOpen && state.memoOpen[q.id] ? 'Hide memo' : 'Show memo') + '</button><button class="btn sm" data-action="teach-practice" data-id="' + esc(q.id) + '">' + ICON.play + 'Teach step by step</button><button class="btn sm ' + (P.practice[q.id] ? 'ghost' : '') + '" data-action="pq-done" data-id="' + esc(q.id) + '">' + (P.practice[q.id] ? 'Mark not done' : ICON.check + 'Mark done') + '</button></div>' +
      '<div class="memo' + (state.memoOpen && state.memoOpen[q.id] ? '' : ' hidden') + '" id="memo-' + esc(q.id) + '"><span class="eyebrow">Marking guideline</span>' + S.renderMemo(q.memo) + '<div class="ans"><span class="eyebrow">Answer</span><div>' + S.renderQuestion(q.answer) + '</div></div></div></div></details>';
    return '<div class="card" id="practice"><div class="row" style="justify-content:space-between"><div><span class="eyebrow">Exam practice · every question type from the NSC papers</span><h2 style="margin-top:4px">' + qs.length + ' exam-style questions · ' + marks + ' marks</h2></div><span class="pill ' + (done === qs.length ? 'good' : '') + '">' + done + ' of ' + qs.length + ' done</span></div>' +
      '<p class="small muted" style="margin-top:6px">Original questions in the style and mark allocation of the NSC papers, with marking-guideline memos. Allow about 1,2 minutes per mark. Work each one on paper first, then open the memo.</p>' +
      '<div class="row" style="margin-top:10px;gap:6px">' + chip(0, 'All') + chip(2, 'Routine') + chip(3, 'Complex') + chip(4, 'Problem solving') + '<button class="chipbtn" data-action="memo-all">Show all memos</button></div>' +
      '<div class="stack" style="margin-top:12px;gap:10px">' + shown.map((q) => card(q, qs.indexOf(q))).join('') + (shown.length ? '' : '<p class="small muted">No questions at this level for this topic.</p>') + '</div></div>';
  }

  /* ---------------------------------------------------------------- quiz */
  function renderQuiz() {
    const root = $('#quiz-body'); const t = D.TOPIC[state.topic]; if (!root || !t) return;
    const q = state.quiz || (state.quiz = { i: 0, score: 0, answered: null, done: false });
    if (q.done) {
      const best = P.quiz[t.id];
      root.innerHTML = '<p><strong>' + q.score + ' / ' + t.quiz.length + '</strong> correct' + (best ? ' · your best ' + best.best + '/' + best.total : '') + '</p><div class="row" style="margin-top:10px"><button class="btn sm" data-action="quiz-restart">Try again</button>' + (q.score < t.quiz.length ? '<span class="small muted">Re-read the sections for the ones you missed.</span>' : '') + '</div>';
      return;
    }
    const item = t.quiz[q.i];
    root.innerHTML = '<p class="small muted">Question ' + (q.i + 1) + ' of ' + t.quiz.length + ' · score ' + q.score + '</p><p style="margin-top:6px;font-weight:500">' + T(item.q) + '</p>' +
      item.options.map((o, k) => '<button class="quiz-opt' + (q.answered == null ? '' : k === item.answer ? ' correct' : k === q.answered ? ' wrong' : '') + '" data-action="quiz-answer" data-k="' + k + '"' + (q.answered != null ? ' disabled' : '') + '>' + String.fromCharCode(65 + k) + '. ' + T(o) + '</button>').join('') +
      (q.answered != null ? '<div class="why"><b>' + (q.answered === item.answer ? 'Correct. ' : 'Not quite. ') + '</b>' + T(item.why) + '</div><div class="row" style="margin-top:10px"><button class="btn sm primary" data-action="quiz-next">' + (q.i + 1 < t.quiz.length ? 'Next question' : 'See result') + '</button></div>' : '');
    ADV.typeset(root);
  }
  ADV.actions['quiz-answer'] = (a) => { const t = D.TOPIC[state.topic]; const q = state.quiz; const k = Number(a.dataset.k); q.answered = k; if (k === t.quiz[q.i].answer) q.score++; renderQuiz(); };
  ADV.actions['quiz-next'] = () => { const t = D.TOPIC[state.topic]; const q = state.quiz; if (q.i + 1 < t.quiz.length) { q.i++; q.answered = null; } else { q.done = true; const b = P.quiz[t.id]; if (!b || q.score > b.best) P.quiz[t.id] = { best: q.score, total: t.quiz.length }; save(); } renderQuiz(); };
  ADV.actions['quiz-restart'] = () => { state.quiz = null; renderQuiz(); };

  /* ---------------------------------------------------------------- topic actions */
  const reRender = () => { const y = window.scrollY; ADV.render(); window.scrollTo(0, y); };
  ADV.actions.status = (a) => { const id = a.dataset.id, v = a.dataset.val; P.topics[id] = P.topics[id] === v ? '' : v; save(); reRender(); };
  ADV.actions['sec-done'] = (a) => { const id = a.dataset.id; if (P.secs[id]) delete P.secs[id]; else P.secs[id] = 1; state.openSec = id; save(); reRender(); };
  ADV.actions['pq-done'] = (a) => { const id = a.dataset.id; if (P.practice[id]) delete P.practice[id]; else P.practice[id] = 1; state.openQ = id; save(); reRender(); };
  ADV.actions['p-level'] = (a) => { state.pLevel = Number(a.dataset.id); reRender(); };
  ADV.actions['memo-toggle'] = (a) => { const id = a.dataset.id; state.memoOpen = state.memoOpen || {}; state.memoOpen[id] = !state.memoOpen[id]; const m = $('#memo-' + CSS.escape(id)); if (m) { m.classList.toggle('hidden', !state.memoOpen[id]); a.textContent = state.memoOpen[id] ? 'Hide memo' : 'Show memo'; } };
  ADV.actions['memo-all'] = () => { state.memoOpen = state.memoOpen || {}; $$('.memo').forEach((m) => { m.classList.remove('hidden'); state.memoOpen[m.id.slice(5)] = true; }); $$('#practice details').forEach((d) => { d.open = true; }); };
  ADV.actions.scroll = (a) => { const el = $('#' + a.dataset.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  document.addEventListener('toggle', (e) => { const d = e.target; if (d.tagName === 'DETAILS' && d.open) { if (d.id.startsWith('sec-')) state.openSec = d.id.slice(4); if (d.id.startsWith('pq-')) state.openQ = d.id.slice(3); } }, true);

  /* ---------------------------------------------------------------- teach mode (+ pen) */
  ADV.actions.teach = (a) => { state.teach = { kind: 'example', id: a.dataset.id, step: 0 }; renderTeach(true); };
  ADV.actions['teach-practice'] = (a) => { state.teach = { kind: 'practice', id: a.dataset.id, step: 0 }; renderTeach(true); };
  ADV.actions['teach-next'] = () => teachStep(1);
  ADV.actions['teach-prev'] = () => teachStep(-1);
  ADV.actions['teach-all'] = () => { state.teach.step = teachData().steps.length + 1; showSteps(); };
  ADV.actions['teach-close'] = () => { state.teach = null; renderTeach(true); };
  function teachData() {
    if (state.teach.kind === 'practice') { const { topic, q } = D.QUESTION[state.teach.id]; return { kind: 'practice', topicTitle: topic.title, title: q.type, marks: q.marks, q: q.q, steps: q.memo, answer: q.answer, fig: FIG(D.figs[q.id]) + FIG(q.fig) }; }
    const { topic, sec } = D.SECTION[state.teach.id]; const ex = sec.example; return { kind: 'example', topicTitle: topic.title, title: sec.title, q: ex.q, steps: ex.steps, answer: ex.answer, know: sec.know, fig: FIG(D.figs['sec:' + sec.id]) + FIG(ex.fig) };
  }
  function renderTeach(full) {
    const root = $('#overlay-root'); if (!root) return;
    if (!state.teach) { if (ADV.pen) ADV.pen.detach('teach'); root.innerHTML = ''; document.body.style.overflow = ''; return; }
    if (!full && $('.overlay', root)) { showSteps(); return; }
    const d = teachData();
    document.body.style.overflow = 'hidden';
    root.innerHTML = '<div class="overlay" role="dialog" aria-label="Teach mode"><div class="inner" id="teach-inner">' +
      '<div class="row teach-head" style="justify-content:space-between"><div><span class="eyebrow">Teach mode · ' + esc(d.topicTitle) + (d.marks ? ' · ' + d.marks + ' marks' : '') + '</span><h2>' + esc(d.title) + '</h2></div><div class="row"><span class="small muted hide-sm">Space / → next · ← back · P pen · Esc close</span><button class="btn" data-action="pen-teach">' + ICON.pen + 'Pen</button><button class="btn" data-action="teach-close">Close</button></div></div>' +
      '<div class="board protect"><div class="q">' + S.renderQuestion(d.q) + '</div>' + d.fig +
      (d.kind === 'practice' ? '<div class="memo board-memo"><span class="eyebrow">Marking guideline</span>' + S.renderMemo(d.steps) + '</div>' : S.renderSteps(d.steps, FIG)) +
      '<div class="step answer" id="teach-ans"><span class="eyebrow">Answer</span><div>' + (d.kind === 'practice' ? S.renderQuestion(d.answer) : T(d.answer)) + '</div></div></div>' +
      '<div class="row teach-ctl"><button class="btn primary" data-action="teach-next" id="teach-next"></button><button class="btn" data-action="teach-prev" id="teach-prev">Back</button><button class="btn ghost" data-action="teach-all">Show all</button></div>' +
      (d.know ? '<details class="section"><summary><span>Must-know for this section</span>' + ICON.chev + '</summary><div class="body"><ul>' + d.know.map((k) => '<li>' + T(k) + '</li>').join('') + '</ul></div></details>' : '') +
      '</div></div>';
    showSteps(); ADV.typeset(root);
  }
  function showSteps() {
    const d = teachData(); const n = state.teach.step; const total = d.steps.length;
    $$('#teach-inner .steps > li, #teach-inner .memo-lines > li').forEach((li, i) => { li.hidden = i >= n; });
    const memo = $('#teach-inner .board-memo'); if (memo) memo.hidden = n === 0;
    const ans = $('#teach-ans'); if (ans) ans.hidden = n <= total;
    const nx = $('#teach-next'); if (nx) { nx.disabled = n > total; nx.textContent = n < total ? 'Next step (' + n + '/' + total + ')' : n === total ? 'Show answer' : 'Done'; }
    const pv = $('#teach-prev'); if (pv) pv.disabled = n === 0;
    const last = $$('#teach-inner .steps > li:not([hidden]), #teach-inner .memo-lines > li:not([hidden])').pop();
    if (last && n > 0 && n <= total) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); else if (ans && !ans.hidden) ans.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (ADV.pen) ADV.pen.resize();
  }
  function teachStep(dir) { const d = teachData(); state.teach.step = Math.max(0, Math.min(d.steps.length + 1, state.teach.step + dir)); showSteps(); }
  document.addEventListener('keydown', (e) => {
    if (!state.teach || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
    if (e.key === 'Escape') { if (ADV.pen && ADV.pen.active) ADV.pen.stop(); else { state.teach = null; renderTeach(true); } }
    else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); teachStep(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); teachStep(-1); }
    else if (e.key === 'p' || e.key === 'P') { ADV.actions['pen-teach'](); }
  });
  ADV.renderOverlay = () => { if (state.teach && !$('#overlay-root .overlay')) renderTeach(true); };

  /* pen: draw over the teach board or over the topic page while screen-sharing */
  ADV.pen = (function () {
    let host = null, cv = null, ctx = null, bar = null, strokes = [], cur = null, key = '', colour = '#c2362e', width = 3, hl = false;
    const COLS = ['#c2362e', '#1c3246', '#1f7a4d', '#d9661e', '#2b63a8'];
    function draw() {
      if (!ctx) return; const r = window.devicePixelRatio || 1; ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      strokes.concat(cur ? [cur] : []).forEach((s) => { if (s.pts.length < 1) return; ctx.globalAlpha = s.hl ? 0.28 : 1; ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]); s.pts.forEach((p) => ctx.lineTo(p[0], p[1])); if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    function resize() { if (!cv || !host) return; const w = host.scrollWidth, h = host.scrollHeight, r = window.devicePixelRatio || 1; if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); cv.style.width = w + 'px'; cv.style.height = h + 'px'; } draw(); }
    const pos = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    function down(e) { if (!api.active) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { c: colour, w: hl ? 18 : width * (e.pointerType === 'pen' && e.pressure ? 0.6 + e.pressure : 1), hl, pts: [pos(e)] }; draw(); }
    function move(e) { if (!cur) return; e.preventDefault(); cur.pts.push(pos(e)); draw(); }
    function up() { if (cur) { strokes.push(cur); cur = null; draw(); } }
    function toolbar() {
      if (bar) bar.remove(); bar = document.createElement('div'); bar.className = 'pen-bar' + (host && host.id === 'teach-inner' ? ' in-teach' : ''); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Pen');
      bar.innerHTML = COLS.map((c) => '<button class="pen-col' + (c === colour && !hl ? ' on' : '') + '" data-pen="col" data-c="' + c + '" style="--c:' + c + '" aria-label="Colour"></button>').join('') +
        '<button class="pen-btn' + (hl ? ' on' : '') + '" data-pen="hl">Highlighter</button><button class="pen-btn' + (width > 3 ? ' on' : '') + '" data-pen="thick">Thick</button><button class="pen-btn" data-pen="undo">Undo</button><button class="pen-btn" data-pen="clear">Clear</button><button class="pen-btn done" data-pen="stop">Done</button>';
      document.body.appendChild(bar);
    }
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pen]'); if (!b) return; const k = b.dataset.pen;
      if (k === 'col') { colour = b.dataset.c; hl = false; } if (k === 'hl') { hl = !hl; colour = hl ? '#f0c419' : COLS[0]; } if (k === 'thick') width = width > 3 ? 3 : 6;
      if (k === 'undo') strokes.pop(); if (k === 'clear') strokes = []; if (k === 'stop') { api.stop(); return; }
      toolbar(); draw();
    });
    const store = {};
    const api = {
      active: false,
      start(el, k) {
        if (key !== k || host !== el) { this.detach(); host = el; key = k; strokes = store[k] || (store[k] = []); host.classList.add('pen-host');
          cv = document.createElement('canvas'); cv.className = 'pen-canvas'; host.appendChild(cv); ctx = cv.getContext('2d');
          cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); }
        this.active = true; cv.classList.add('on'); toolbar(); resize();
      },
      stop() { this.active = false; if (cv) cv.classList.remove('on'); if (bar) { bar.remove(); bar = null; } },
      detach(k) { if (k && k !== key) return; this.stop(); if (cv) cv.remove(); if (host) host.classList.remove('pen-host'); cv = null; ctx = null; host = null; key = ''; },
      resize,
      reattach() {
        if (!host || document.contains(host)) return;
        const k = key, was = this.active; this.detach();
        const el = k.startsWith('page:') && state.topic === k.slice(5) ? $('#topic-root') : null;
        if (el) { this.start(el, k); if (!was) this.stop(); }
      }
    };
    window.addEventListener('resize', resize);
    return api;
  })();
  ADV.actions['pen-teach'] = () => { const el = $('#teach-inner'); if (!el) return; if (ADV.pen.active) ADV.pen.stop(); else ADV.pen.start(el, 'teach:' + state.teach.id); };
  ADV.actions['pen-page'] = () => { const el = $('#topic-root'); if (!el) return; if (ADV.pen.active) ADV.pen.stop(); else { ADV.pen.start(el, 'page:' + state.topic); ADV.toast('Draw on the page · Done to stop · drawings stay until you leave', 3500); } };
  document.addEventListener('toggle', () => { if (ADV.pen && ADV.pen.active) setTimeout(ADV.pen.resize, 30); }, true);

  /* ---------------------------------------------------------------- papers, mock paper and plan */
  const RESOURCES = [
    { g: 'Past papers and memos (official, free)', items: [
      ['DBE: all NSC past papers by session', 'https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations/NSCPastExaminationpapers.aspx', 'Every subject, with marking guidelines (memos). Start here.'],
      ['November 2025 papers', 'https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations/2025NovemberExamPapers.aspx', 'The most recent final papers – do these first, under timed conditions.'],
      ['May/June 2026 papers', 'https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations/2026MayJuneExamPapers.aspx', 'Newest papers available (supplementary/SC session).'],
      ['November 2024 papers', 'https://www.education.gov.za/2024NSCNovemberpastpapers.aspx', ''],
      ['November 2023 papers', 'https://www.education.gov.za/2023NSCNovemberpastpapers.aspx', ''],
      ['WCED ePortal', 'https://wcedeportal.co.za/', 'Search e.g. "NSC Nov 2024 Mathematics P1" for papers and memos, including the Western Cape September prelims.']] },
    { g: 'Free study guides', items: [
      ['Mind the Gap: Mathematics (DBE)', 'https://www.education.gov.za/LinkClick.aspx?fileticket=qcrl4lQ-Q5w%3d&tabid=670&portalid=0&mid=2498&forcedownload=true', 'Official DBE guide – worked examples per topic.'],
      ['Siyavula Mathematics Grade 12 (open textbook)', 'https://www.siyavula.com/read/za/mathematics/grade-12', ''],
      ['Siyavula Physical Sciences Grade 12 (open textbook)', 'https://www.siyavula.com/read/za/physical-sciences/grade-12', '']] },
    { g: 'What the examiners use', items: [
      ['Mathematics examination guidelines (DBE, 2021)', 'https://www.education.gov.za/Portals/0/CD/2021%20Exam%20Guidelines/Mathematics%20GR%2012%20Exam%20Guidelines%202021%20Eng.pdf', 'Weighting per topic, examinable proofs, what is excluded.'],
      ['Physical Sciences examination guidelines (DBE, 2021)', 'https://www.education.gov.za/Portals/0/CD/2021%20Exam%20Guidelines/Physical%20Sciences%20GR%2012%20Exam%20Guidelines%202021%20Eng.pdf', 'Definitions markers look for, data sheet, weighting.']] }
  ];
  const PLAN = [
    { d: '2026-10-12', f: ['cubic', 'sequences', 'newton'], note: 'Start with the two P1 topics that open the paper.' }, { d: '2026-10-13', f: ['functions', 'momentum'] },
    { d: '2026-10-14', f: ['calculus', 'projectiles'], note: 'Calculus is 35 marks – give it two sittings.' }, { d: '2026-10-15', f: ['calculus', 'finance', 'wep'] },
    { d: '2026-10-16', f: ['counting', 'organic-structure'], note: 'Evening: Maths P1 Nov 2025 under exam conditions (3 h).' }, { d: '2026-10-17', f: ['trig', 'analytical', 'organic-props', 'organic-reactions'] },
    { d: '2026-10-18', f: ['euclid', 'doppler'], note: 'Mark Friday\'s paper with the memo; redo every lost mark.' }, { d: '2026-10-19', f: ['sequences', 'functions', 'calculus'], note: 'P1 weak spots only. Second P1 paper (Nov 2024).' },
    { d: '2026-10-20', f: ['cubic', 'finance', 'counting', 'electrostatics'] }, { d: '2026-10-21', f: ['calculus', 'circuits'], note: 'Third P1 paper – time yourself strictly.' },
    { d: '2026-10-22', f: ['sequences', 'functions'], note: 'Light revision: formula sheet, common mistakes. Sleep early.' }, { d: '2026-10-23', exam: 'mp1', f: [], note: 'Mathematics Paper 1, 09:00.' },
    { d: '2026-10-24', f: ['trig', 'trig3d', 'stats'], note: 'Maths P2 Nov 2025 under exam conditions.' }, { d: '2026-10-25', f: ['analytical', 'euclid'], note: 'Euclidean geometry proofs from memory; second P2 paper.' },
    { d: '2026-10-26', exam: 'mp2', f: [], note: 'Mathematics Paper 2, 09:00.' }, { d: '2026-10-27', f: ['newton', 'momentum', 'projectiles'], note: 'Physics P1 Nov 2025 under exam conditions.' },
    { d: '2026-10-28', f: ['wep', 'doppler', 'electrostatics'] }, { d: '2026-10-29', f: ['circuits', 'electrodynamics', 'photoelectric'], note: 'Definitions test: write every P1 definition from memory.' },
    { d: '2026-10-30', exam: 'pp1', f: [], note: 'Physical Sciences Paper 1 (Physics), 09:00.' }, { d: '2026-10-31', f: ['organic-structure', 'organic-reactions', 'rate', 'equilibrium'], note: 'Chemistry P2 Nov 2025 under exam conditions.' },
    { d: '2026-11-01', f: ['acids', 'galvanic', 'electrolytic', 'stoich'], note: 'Organic reaction conditions and electrochemistry definitions from memory.' }, { d: '2026-11-02', exam: 'pp2', f: [], note: 'Physical Sciences Paper 2 (Chemistry), 09:00.' }
  ];
  const TIPS = ['Read the whole paper in the first 5 minutes and mark the questions you are sure of; do those first.', 'Budget about 1 minute per mark (150 marks in 180 minutes leaves 30 minutes to check).', 'Write the formula first, then substitute: a correct formula earns the method mark even if the arithmetic slips.', 'Never leave a question blank – a partly correct attempt scores; a blank scores zero.', 'Round only at the end; keep full calculator precision in between.', 'Units and directions on every physical answer; "n ∈ ℕ" when you reject a root in patterns.', 'Redraw diagrams in your answer book and mark every given angle, length and tangent.', 'Check your calculator is in DEGREE mode before the trig questions.'];
  const topicChip = (id) => { const o = OT[id]; return o ? '<button class="chipbtn ' + o.subj + '" data-go="topic" data-id="' + esc(id) + '">' + esc(o.title) + '</button>' : ''; };
  const PAPER_TOPICS = () => ({ mp1: ORDER.P1, mp2: ORDER.P2, pp1: OUT.filter((t) => t.subj === 'phys').map((t) => t.id), pp2: OUT.filter((t) => t.subj === 'chem').map((t) => t.id) });
  function buildMock(examId) {
    const ids = PAPER_TOPICS()[examId] || []; const exam = (CFG.exams || []).find((e) => e.id === examId); const picks = [];
    ids.forEach((id) => { const t = D.TOPIC[id]; if (!t || !t.practice.length) return; const pool = t.practice.slice().sort(() => Math.random() - 0.5); const share = Math.round(150 / ids.length); let m = 0; for (const q of pool) { if (m >= share) break; picks.push(q.id); m += Number(q.marks) || 0; } });
    state.mock = { examId, title: exam ? exam.subject + ' ' + exam.paper : examId, qids: picks };
  }
  function mockHtml() {
    const m = state.mock; if (!m) return '';
    const qs = m.qids.map((id) => D.QUESTION[id]).filter(Boolean); const marks = qs.reduce((n, x) => n + Number(x.q.marks), 0);
    return '<div class="card protect" id="mock"><div class="row" style="justify-content:space-between"><div><span class="eyebrow">Mock paper</span><h2 style="margin-top:4px">' + esc(m.title) + ' · ' + qs.length + ' questions · ' + marks + ' marks</h2><p class="small muted">Allow ' + fmt.mins(marks * PRACTICE_RATE) + ' (about 1,2 minutes per mark). Work on paper; reveal the memos when you are done.</p></div><div class="row"><button class="btn" data-action="mock-reveal">Reveal all memos</button><button class="btn ghost" data-action="mock-close">Close</button></div></div>' +
      qs.map((x, i) => '<div class="mockq"><div class="row" style="justify-content:space-between"><b>Question ' + (i + 1) + '</b><span class="row" style="gap:6px">' + pill(x.topic.subj, x.topic.title) + pill('', x.q.marks + ' marks') + '</span></div>' + FIG(D.figs[x.q.id]) + FIG(x.q.fig) + '<div class="pq" style="margin-top:6px">' + S.renderQuestion(x.q.q) + '</div><div class="memo hidden" style="margin-top:8px"><span class="eyebrow">Marking guideline</span>' + S.renderMemo(x.q.memo) + '<div class="ans"><span class="eyebrow">Answer</span><div>' + S.renderQuestion(x.q.answer) + '</div></div></div></div>').join('') + '</div>';
  }
  ADV.actions.mock = (a) => { buildMock(a.dataset.id); ADV.render(); setTimeout(() => { const m = $('#mock'); if (m) m.scrollIntoView({ behavior: 'smooth' }); }, 60); };
  ADV.actions['mock-reveal'] = () => $$('#mock .memo').forEach((m) => m.classList.remove('hidden'));
  ADV.actions['mock-close'] = () => { state.mock = null; ADV.render(); };
  ADV.actions.plan = (a) => { const id = a.dataset.id; if (P.plan[id]) delete P.plan[id]; else P.plan[id] = 1; save(); reRender(); };
  ADV.views.papers = function () {
    const exams = CFG.exams || [];
    const timetable = '<div class="card"><span class="eyebrow">Final exam timetable (DBE, Oct/Nov 2026)</span><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Paper</th><th>Date</th><th>Time</th><th>Length</th><th>Marks</th></tr></thead><tbody>' +
      exams.map((e) => '<tr><td>' + esc(e.subject + ' ' + e.paper) + '</td><td>' + esc(fmt.long(e.when)) + '</td><td class="mono">' + esc(fmt.time(e.when)) + '</td><td>' + e.hours + ' h</td><td>' + e.marks + '</td></tr>').join('') + '</tbody></table></div><p class="small muted" style="margin-top:8px">Confirm with the school; the DBE can amend the timetable.</p></div>';
    const total = OUT.reduce((n, t) => n + (t.pc || 0), 0);
    const mock = '<div class="card"><span class="eyebrow">Practice under exam conditions</span><h3 style="margin-top:4px">Generate a mock paper</h3><p class="small muted" style="margin-top:4px">Builds a fresh 150-mark paper from the ' + total + ' exam-style questions, spread over the paper\'s topics. New questions every time.</p><div class="row" style="margin-top:10px">' +
      (ready() ? exams.map((e) => '<button class="btn" data-action="mock" data-id="' + e.id + '">' + esc(e.subject + ' ' + e.paper) + '</button>').join('') : '<span class="small muted">' + ICON.lock + ' Opens once the tutor approves your account.</span>') + '</div></div>' + (ready() ? mockHtml() : '');
    const todayKey = fmt.key(ADV.now());
    const plan = '<div class="card"><span class="eyebrow">Study plan</span><h3 style="margin-top:4px">From today to the last paper</h3><p class="small muted" style="margin-top:4px">Highest-weight topics first, a full past paper every second day, light revision the day before each exam. Tick days off as you finish them.</p><div style="margin-top:12px">' +
      PLAN.filter((p) => p.d >= todayKey || P.plan[p.d]).map((p) => { const ex = exams.find((e) => e.id === p.exam); const done = !!P.plan[p.d]; const mins = p.f.reduce((n, id) => n + (OT[id] ? est(OT[id]).total : 0), 0); return '<div class="plan-day ' + (p.exam ? 'exam' : '') + '"><div class="d">' + (p.d === todayKey ? '<span class="pill accent">Today</span><br>' : '') + esc(fmt.date(p.d + 'T12:00:00+02:00')) + '</div><div style="min-width:0"><div class="row" style="gap:6px">' + (p.exam ? '<strong>' + esc(ex ? ex.subject + ' ' + ex.paper : '') + ' – exam day</strong>' : p.f.map(topicChip).join('') + '<button class="chipbtn ' + (done ? 'chem' : '') + '" data-action="plan" data-id="' + p.d + '">' + (done ? 'Done' : 'Mark done') + '</button>') + '</div>' + (p.note ? '<p class="small muted" style="margin-top:4px">' + esc(p.note) + '</p>' : '') + '</div></div>'; }).join('') + '</div></div>';
    const res = RESOURCES.map((g) => '<div class="card"><h3>' + esc(g.g) + '</h3><div class="stack" style="margin-top:10px;gap:10px">' + g.items.map(([n, u, d]) => '<div><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(n) + '</a>' + (d ? '<div class="small muted">' + esc(d) + '</div>' : '') + '</div>').join('') + '</div></div>').join('');
    const drive = state.priv.class && state.priv.class.drive ? '<div class="card row" style="justify-content:space-between"><div><span class="eyebrow">Class materials</span><h3 style="margin-top:4px">Shared class folder</h3><p class="small muted">Papers, lesson notes and recordings the tutor shares.</p></div>' + ADV.btnLink(state.priv.class.drive, 'Open the class folder', 'primary', ICON.ext) + '</div>' : '';
    const tips = '<div class="card"><span class="eyebrow">Exam technique</span><ul style="margin:8px 0 0;padding-left:20px;display:grid;gap:6px">' + TIPS.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>';
    return '<div class="stack"><div><span class="eyebrow">Papers</span><h1>Exam papers, plan and resources</h1></div>' + timetable + loadBanner(paperLoad()) + mock + '<h2>Study plan</h2>' + plan + '<h2>Past papers and free resources</h2>' + drive + res + tips + '</div>';
  };

  /* ---------------------------------------------------------------- progress */
  ADV.progressTable = function (data, interactive) {
    const p = data || P;
    return '<div class="table-wrap"><table><thead><tr><th>Topic</th><th>Status</th><th>Sections</th><th>Exam questions</th><th>Quiz</th><th>Time left</th></tr></thead><tbody>' +
      OUT.map((t) => { const e = est(t, p); const st = p.topics[t.id]; const pd = (t.pq || []).filter(([id]) => p.practice[id]).length; return '<tr><td>' + pill(t.subj, SUBJ[t.subj].short) + ' ' + (interactive ? '<button class="chipbtn" data-go="topic" data-id="' + esc(t.id) + '">' + esc(t.title) + '</button>' : esc(t.title)) + '</td><td>' + (st === 'done' ? pill('good', 'Done') : st === 'review' ? pill('warn', 'Needs work') : '<span class="small muted">–</span>') + '</td><td class="mono">' + e.secsDone + '/' + t.sections.length + '</td><td class="mono">' + pd + '/' + (t.pc || 0) + '</td><td class="mono">' + (p.quiz[t.id] ? p.quiz[t.id].best + '/' + p.quiz[t.id].total : '–') + '</td><td class="mono">' + fmt.mins(e.left) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  };
  ADV.views.progress = function () {
    const loads = paperLoad(); const left = loads.reduce((n, L) => n + (L.days >= 0 ? L.left : 0), 0);
    const done = OUT.filter((t) => P.topics[t.id] === 'done').length; const secs = Object.keys(P.secs).length; const pq = Object.keys(P.practice).length;
    return '<div class="stack"><div><span class="eyebrow">Progress</span><h1>Your progress</h1><p class="small muted">Saved to your account, so it follows you to any device. Your tutor sees it too and uses it to plan your lessons.</p></div>' +
      '<div class="grid cols-4"><div class="cd"><span class="eyebrow">Topics done</span><div class="big">' + done + '<small>/ ' + OUT.length + '</small></div></div><div class="cd"><span class="eyebrow">Sections studied</span><div class="big">' + secs + '</div></div><div class="cd"><span class="eyebrow">Exam questions done</span><div class="big">' + pq + '</div></div><div class="cd"><span class="eyebrow">Study time left</span><div class="big">' + Math.round(left / 60) + '<small>h</small></div></div></div>' +
      loadBanner(loads) + '<div class="card">' + ADV.progressTable(P, true) + '</div></div>';
  };

  /* ---------------------------------------------------------------- home: study-today card */
  ADV.studyTodayCard = function () {
    const loads = paperLoad().filter((L) => L.days >= 0 && L.left > 0); if (!loads.length) return '';
    const perDay = loads.reduce((n, L) => n + (L.perDay || 0), 0); const nextL = loads.slice().sort((a, b) => a.days - b.days)[0];
    const nextSecs = []; nextL.ts.forEach((t) => t.sections.forEach((s) => { if (!P.secs[s.id] && P.topics[t.id] !== 'done' && nextSecs.length < 3) nextSecs.push({ t, s }); }));
    return '<div class="card"><span class="eyebrow">Study today</span><h3 style="margin-top:6px">About ' + fmt.mins(Math.ceil(perDay / 15) * 15) + ' a day</h3><p class="small muted" style="margin-top:4px">That covers every topic before each paper (' + loads.map((L) => esc(L.e.paper.replace(/ \(.*\)/, '')) + ' ' + esc(SUBJ[L.e.subj].short) + ': ' + fmt.mins(L.left) + ' in ' + L.days + ' days').join(' · ') + ').</p>' +
      '<div class="stack" style="gap:6px;margin-top:10px">' + nextSecs.map(({ t, s }) => '<button class="next-sec" data-action="open-sec" data-id="' + esc(s.id) + '" data-t="' + esc(t.id) + '">' + (state.approved ? ICON.book : ICON.lock) + '<span><b>' + esc(s.title) + '</b><small>' + esc(t.title) + '</small></span><span class="mono small">' + s.est + ' min</span></button>').join('') + '</div></div>';
  };
  ADV.actions['open-sec'] = (a) => { state.openSec = a.dataset.id; ADV.go('study', a.dataset.t); setTimeout(() => { const el = $('#sec-' + CSS.escape(a.dataset.id)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); };

  /* ---------------------------------------------------------------- after each render: maths, quiz, watermark */
  ADV.after.push((view) => {
    if (state.topic && ready()) renderQuiz();
    if (/\\\(|\\\[/.test(view.innerHTML)) ADV.typeset(view);
    if (ADV.pen) ADV.pen.reattach();
    watermark();
  });

  /* ---------------------------------------------------------------- protection for learners */
  function watermark() {
    let wm = $('#wm');
    if (state.isAdmin || !state.profile || !state.approved || !(state.topic || (state.tab === 'papers' && state.mock))) { if (wm) wm.remove(); return; }
    if (!wm) { wm = document.createElement('div'); wm.id = 'wm'; wm.setAttribute('aria-hidden', 'true'); document.body.appendChild(wm); }
    const label = (state.profile.full_name || '') + ' · ' + (state.profile.email || '') + ' · ' + fmt.key(ADV.now());
    if (wm.dataset.l === label) return; wm.dataset.l = label;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="10" y="120" transform="rotate(-24 210 110)" font-family="sans-serif" font-size="15" fill="#808080">' + esc(label) + '</text></svg>';
    wm.style.backgroundImage = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  }
  const guarded = (e) => !state.isAdmin && state.profile && e.target && e.target.closest && e.target.closest('.protect, .overlay') && !e.target.closest('input, textarea');
  ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach((ev) => document.addEventListener(ev, (e) => { if (guarded(e)) { e.preventDefault(); if (ev === 'copy' || ev === 'cut') ADV.toast('The notes are for your own study – copying is switched off.'); } }));
  document.addEventListener('keydown', (e) => { if (state.isAdmin || !state.profile) return; if ((e.ctrlKey || e.metaKey) && /^[psu]$/i.test(e.key)) { e.preventDefault(); ADV.toast('Printing and saving the notes is switched off.'); } });
})();
