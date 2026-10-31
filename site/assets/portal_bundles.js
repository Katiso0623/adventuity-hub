/* Adventuity portal – lesson bundles: prepaid lesson hours (e.g. 5 hours for R1 100). Learners request a bundle, the director
   accepts it, the learner pays by EFT and uploads proof, and every lesson they book draws from the bundle automatically. */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, esc, fmt, pill, ICON, state, sb, toast } = ADV; const now = ADV.now;
  const hrs = (h) => String(Math.round(Number(h || 0) * 10) / 10).replace('.', ',') + ' h';
  const lessonH = (b) => (new Date(b.ends_at) - new Date(b.starts_at)) / 36e5;
  const OFFER = () => { const o = ADV.setting('bundles', [{ hours: 5, price: 1100 }, { hours: 10, price: 2000 }]); return Array.isArray(o) ? o.filter((x) => Number(x.hours) > 0) : []; };
  const rate = () => { const f = ADV.setting('fees', {}); return Number(f.maths) || 250; };

  /* hours still open on a bundle: requested, booked and done lessons count; declined and cancelled ones give the hours back */
  const used = (bu) => (state.bookings || []).filter((b) => b.bundle_id === bu.id && ['pending', 'accepted', 'completed'].includes(b.status)).reduce((n, b) => n + lessonH(b), 0);
  const left = ADV.bundleLeft = (bu) => Math.max(0, Number(bu.hours) - used(bu));
  ADV.bundleHoursFor = (learnerId) => (state.bundles || []).filter((bu) => bu.learner_id === learnerId && bu.status === 'accepted').reduce((n, bu) => n + left(bu), 0);
  ADV.loadBundles = async () => { try { state.bundles = await sb.select('bundles', { order: 'created_at.desc' }); } catch (e) { state.bundles = state.bundles || []; } };
  ADV.notifyBundle = async (id, event) => { try { await sb.fn('notify', { bundle_id: id, event }); } catch (e) { console.warn('notify failed', e); } };
  const offerLine = (o) => { const per = Number(o.price) / Number(o.hours); const save = rate() * Number(o.hours) - Number(o.price); return fmt.rand(per) + ' per hour' + (save > 0 ? ' · save ' + fmt.rand(save) : ''); };

  /* ---------------------------------------------------------------- learner */
  ADV.bundleCard = function (compact) {
    if (state.isAdmin || state.isTutor || (state.profile && state.profile.sponsor_id)) return '';
    const mine = (state.bundles || []).filter((bu) => ['requested', 'accepted'].includes(bu.status));
    const open = mine.filter((bu) => bu.status === 'accepted' && (left(bu) > 0.01 || !bu.paid));
    const waiting = mine.filter((bu) => bu.status === 'requested');
    const row = (bu) => {
      const l = left(bu); const pct = Math.round(100 * (Number(bu.hours) - l) / Number(bu.hours));
      if (bu.status === 'requested') return '<div class="bundle-row"><div><b>' + hrs(bu.hours) + ' bundle · ' + fmt.rand(bu.price) + '</b> ' + pill('warn', 'Waiting for the tutor') + '<p class="small muted">Ref <span class="mono">' + esc(bu.ref) + '</span> · you get a notification when it is accepted, with the payment details.</p></div><button class="btn sm ghost" data-action="bundle-cancel" data-id="' + bu.id + '">Cancel request</button></div>';
      return '<div class="bundle-row"><div style="min-width:0;flex:1"><b>' + hrs(l) + ' of ' + hrs(bu.hours) + ' left</b> ' + (bu.paid ? pill('good', 'Paid') : bu.pop_path ? pill('accent', 'Proof sent') : pill('warn', 'Payment due ' + fmt.rand(bu.price))) +
        '<div class="bar" style="margin-top:8px" aria-label="' + pct + '% used"><i style="width:' + pct + '%"></i></div><p class="small muted" style="margin-top:6px">Lessons you book now come from this bundle – no fee per lesson. Ref <span class="mono">' + esc(bu.ref) + '</span></p>' +
        (state.bundlePay === bu.id ? '<div class="paybox"><b>Pay ' + fmt.rand(bu.price) + '</b><p style="white-space:pre-line;margin-top:4px">' + esc((state.priv.payment || {}).text || 'The tutor will send payment details.') + '</p><p class="small">Use reference <b class="mono">' + esc(bu.ref) + '</b>. Then upload your proof of payment.</p>' + ((state.priv.payment || {}).link ? '<a class="btn sm primary" href="' + esc(state.priv.payment.link) + '" target="_blank" rel="noopener">Pay online</a>' : '') + '</div>' : '') +
        (bu.paid ? '' : '<div class="row" style="margin-top:8px"><button class="btn sm" data-action="bundle-pay" data-id="' + bu.id + '">How to pay</button><label class="btn sm file-btn">' + (bu.pop_path ? 'Replace proof of payment' : 'Upload proof of payment') + '<input type="file" accept="image/*,application/pdf" data-action="bundle-pop" data-id="' + bu.id + '" hidden></label></div>') + '</div></div>';
    };
    if (open.length || waiting.length) return '<div class="card bundle-card"><span class="eyebrow">Your lesson bundle</span>' + open.concat(waiting).map(row).join('') + '</div>';
    if (compact) return '';
    const offer = OFFER(); if (!offer.length) return '';
    return '<div class="card bundle-card"><div><span class="eyebrow">Save with a bundle</span><h3 style="margin-top:4px">Pay once, book lessons as you need them</h3><p class="small muted">Buy lesson hours upfront at a lower rate. Every lesson you book is then taken from your bundle – any subject, 60, 90 or 120 minutes.</p></div>' +
      '<div class="grid cols-2" style="margin-top:10px">' + offer.map((o) => '<div class="bundle-offer"><div class="row" style="justify-content:space-between;align-items:baseline"><b>' + esc(String(o.hours)) + ' lesson hours</b><span class="price">' + fmt.rand(o.price) + '</span></div><p class="small muted">' + esc(offerLine(o)) + '</p><button class="btn sm primary" data-action="bundle-req" data-h="' + esc(String(o.hours)) + '">Request this bundle</button></div>').join('') + '</div>' +
      '<p class="small muted" style="margin-top:8px">Nothing to pay yet: the tutor accepts your request first, then you pay by EFT with your bundle reference.</p></div>';
  };
  /* the lesson fee line on the booking page */
  ADV.bundleCovers = (mins) => { if (!state.profile || state.profile.sponsor_id) return null; const h = ADV.bundleHoursFor(state.profile.id); return h >= mins / 60 - 0.001 ? h : null; };

  ADV.actions['bundle-req'] = async (a) => {
    const o = OFFER().find((x) => String(x.hours) === a.dataset.h); if (!o) return;
    if (!confirm('Request a bundle of ' + o.hours + ' lesson hours for ' + fmt.rand(o.price) + '? You pay only after the tutor accepts it.')) return;
    a.disabled = true;
    try { const r = await sb.insert('bundles', [{ learner_id: sb.user.id, hours: Number(o.hours), price: Number(o.price) }]); if (r[0]) ADV.notifyBundle(r[0].id, 'bundle-requested'); await ADV.loadBundles(); ADV.render(); toast('Bundle requested – you get a notification when the tutor accepts it', 5000); }
    catch (err) { a.disabled = false; toast(ADV.errMsg(err), 5000); }
  };
  ADV.actions['bundle-cancel'] = async (a) => { if (!confirm('Cancel this bundle request?')) return; try { await sb.rpc('cancel_bundle', { b: a.dataset.id }); await ADV.loadBundles(); ADV.render(); toast('Request cancelled'); } catch (err) { toast(ADV.errMsg(err)); } };
  ADV.actions['bundle-pay'] = async (a) => { state.bundlePay = state.bundlePay === a.dataset.id ? null : a.dataset.id; if (!(state.priv && state.priv.payment) && ADV.loadPrivate) await ADV.loadPrivate(); ADV.render(); };

  /* ---------------------------------------------------------------- director */
  const nameOf = (id) => { const p = (state.learners || []).find((l) => l.id === id); return (p && (p.full_name || p.email)) || 'Learner'; };
  ADV.bundleRequests = function () {
    const req = (state.bundles || []).filter((bu) => bu.status === 'requested'); if (!req.length) return '';
    return '<h2>Bundle requests</h2>' + req.map((bu) => '<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="row" style="gap:6px">' + pill('warn', 'New bundle request') + '<span class="mono small muted">Ref ' + esc(bu.ref) + '</span></div><h3 style="margin-top:6px">' + esc(nameOf(bu.learner_id)) + ' · ' + hrs(bu.hours) + ' for ' + fmt.rand(bu.price) + '</h3><p class="small muted">Requested ' + esc(fmt.date(bu.created_at)) + '. Accepting shows the learner your payment details; their lessons then come from the bundle.</p></div></div>' +
      '<div class="decide"><div class="field"><label for="bm-' + bu.id + '">Message to the learner (optional)</label><input id="bm-' + bu.id + '" placeholder="e.g. Welcome! Pay within 3 days, please."></div><div class="row"><button class="btn primary" data-action="bundle-accept" data-id="' + bu.id + '">' + ICON.check + 'Accept</button><button class="btn ghost" data-action="bundle-decline" data-id="' + bu.id + '">Decline</button></div></div></div>').join('');
  };
  async function setBundle(id, patch, event, msg) {
    try { await sb.update('bundles', { id: 'eq.' + id }, patch); if (event) ADV.notifyBundle(id, event); await ADV.loadBundles(); ADV.render(); toast(msg); } catch (err) { toast(ADV.errMsg(err), 5000); }
  }
  ADV.actions['bundle-accept'] = (a) => setBundle(a.dataset.id, { status: 'accepted', admin_message: (($('#bm-' + a.dataset.id) || {}).value || '').trim() }, 'bundle-accepted', 'Bundle accepted – the learner sees the payment details now');
  ADV.actions['bundle-decline'] = (a) => { const m = prompt('Decline this bundle request? Optional message to the learner:', (($('#bm-' + a.dataset.id) || {}).value || '')); if (m === null) return; setBundle(a.dataset.id, { status: 'declined', admin_message: m.trim() }, 'bundle-declined', 'Declined'); };
  ADV.actions['bundle-paid'] = (a) => { const bu = (state.bundles || []).find((x) => x.id === a.dataset.id); setBundle(bu.id, { paid: !bu.paid }, bu.paid ? null : 'bundle-paid', bu.paid ? 'Marked unpaid' : 'Marked paid – the learner is notified'); };
  ADV.actions['bundle-proof'] = async (a) => { const bu = (state.bundles || []).find((x) => x.id === a.dataset.id); const w = window.open('', '_blank'); try { const u = await sb.signedUrl('pop', bu.pop_path, 300); w.location = u; } catch (err) { if (w) w.close(); toast(ADV.errMsg(err)); } };

  ADV.bundlesCard = function () {
    const list = (state.bundles || []).filter((bu) => ['accepted', 'requested'].includes(bu.status)).sort((a, b) => (a.status === 'requested' ? -1 : 0) - (b.status === 'requested' ? -1 : 0) || new Date(b.created_at) - new Date(a.created_at));
    const offer = OFFER();
    const row = (bu) => '<tr><td>' + esc(nameOf(bu.learner_id)) + ' <span class="mono small muted">' + esc(bu.ref) + '</span></td><td class="mono" style="text-align:right">' + hrs(bu.hours) + '</td><td class="mono" style="text-align:right">' + (bu.status === 'accepted' ? hrs(left(bu)) : '–') + '</td><td class="mono" style="text-align:right">' + fmt.rand(bu.price) + '</td><td>' + (bu.status === 'requested' ? pill('warn', 'Request – accept on the Dashboard') : bu.paid ? pill('good', 'Paid' + (bu.paid_at ? ' ' + fmt.date(bu.paid_at) : '')) : bu.pop_path ? pill('accent', 'Proof sent') : pill('warn', 'Unpaid')) + '</td><td><div class="row" style="gap:4px;flex-wrap:nowrap">' + (bu.pop_path ? '<button class="chipbtn" data-action="bundle-proof" data-id="' + bu.id + '">Proof</button>' : '') + (bu.status === 'accepted' ? '<button class="chipbtn" data-action="bundle-paid" data-id="' + bu.id + '">' + (bu.paid ? 'Mark unpaid' : 'Mark paid') + '</button>' : '') + '</div></td></tr>';
    return '<div class="card"><div><h3>Lesson bundles</h3><p class="small muted">Prepaid lesson hours. Lessons of a learner with an accepted bundle are taken from it automatically (fee R0) – their own requests, tutors\' lessons and the lessons you schedule without a fee.</p></div>' +
      '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Learner</th><th style="text-align:right">Hours</th><th style="text-align:right">Left</th><th style="text-align:right">Price</th><th>Status</th><th></th></tr></thead><tbody>' + (list.length ? list.map(row).join('') : '<tr><td colspan="6" class="muted">No bundles yet.</td></tr>') + '</tbody></table></div>' +
      '<form id="f-bundles" class="stack" style="margin-top:14px"><b>Bundles on offer</b><p class="small muted">Shown on the website and in the portal. Leave a row empty to remove it.</p><div class="grid cols-3">' +
      [0, 1, 2].map((i) => { const o = offer[i] || {}; return '<div class="row" style="gap:6px;flex-wrap:nowrap"><input id="bo-h-' + i + '" type="number" min="1" max="100" step="0.5" placeholder="Hours" value="' + esc(o.hours != null ? String(o.hours) : '') + '" aria-label="Hours in bundle ' + (i + 1) + '"><span class="small muted">h for R</span><input id="bo-p-' + i + '" type="number" min="0" step="10" placeholder="Price" value="' + esc(o.price != null ? String(o.price) : '') + '" aria-label="Price of bundle ' + (i + 1) + '"></div>'; }).join('') +
      '</div><div class="row"><button class="btn primary" type="submit">Save bundles</button></div></form></div>';
  };
  async function saveOffer(e) {
    e.preventDefault(); const out = [];
    for (let i = 0; i < 3; i++) { const h = Number(($('#bo-h-' + i) || {}).value), p = Number(($('#bo-p-' + i) || {}).value); if (h > 0 && p >= 0 && ($('#bo-p-' + i) || {}).value !== '') out.push({ hours: h, price: p }); }
    out.sort((a, b) => a.hours - b.hours);
    try { await sb.upsert('public_settings', [{ key: 'bundles', value: out, updated_at: new Date().toISOString() }], 'key'); state.settings.bundles = out; toast('Saved'); ADV.render(); } catch (err) { toast(ADV.errMsg(err)); }
  }
  /* "3 of 5 h left" for the Learners page */
  ADV.bundleSummary = (learnerId) => { const open = (state.bundles || []).filter((bu) => bu.learner_id === learnerId && bu.status === 'accepted'); if (!open.length) return ''; const l = open.reduce((n, bu) => n + left(bu), 0), h = open.reduce((n, bu) => n + Number(bu.hours), 0); const unpaid = open.filter((bu) => !bu.paid).reduce((n, bu) => n + Number(bu.price), 0); return ' · bundle ' + hrs(l) + ' of ' + hrs(h) + ' left' + (unpaid ? ' (' + fmt.rand(unpaid) + ' unpaid)' : ''); };

  /* proof of payment for a bundle */
  document.addEventListener('change', async (e) => {
    const inp = e.target; if (!(inp.dataset && inp.dataset.action === 'bundle-pop' && inp.files && inp.files[0])) return;
    const f = inp.files[0]; if (f.size > 5 * 1024 * 1024) return toast('Use a file smaller than 5 MB');
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = sb.user.id + '/bundle-' + inp.dataset.id + '-' + Date.now() + '.' + ext;
    try { toast('Uploading…'); await sb.upload('pop', path, f); await sb.rpc('attach_bundle_pop', { b: inp.dataset.id, path }); ADV.notifyBundle(inp.dataset.id, 'bundle-pop'); await ADV.loadBundles(); toast('Proof of payment sent'); ADV.render(); } catch (err) { toast(ADV.errMsg(err)); }
  });
  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) { if (prevSubmit) prevSubmit(e); if (e.target.id === 'f-bundles') return saveOffer(e); };
})();
