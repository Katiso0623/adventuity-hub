/* End-to-end test of the portal against the local API stand-in (tools/mock_supabase.py on :54321).
   node tools/e2e.js <screenshot dir> */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:54321/portal.html';
const MJ = '/tmp/claude-0/-home-claude-adventuity-hub/5e26bb2f-2370-5bf4-8e73-f65a897a0f53/scratchpad/mathjax-dist/es5/';
const OUT = process.argv[2] || '/tmp/e2e'; fs.mkdirSync(OUT, { recursive: true });
const errors = [], mail = []; let step = '';
const log = (...a) => console.log('·', ...a);
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); log('ok', m); };

(async () => {
  const browser = await chromium.launch();
  async function mk(name, opts) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, timezoneId: 'Africa/Johannesburg', locale: 'en-ZA' }, opts || {}));
    await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/**', (r) => { const f = MJ + r.request().url().split('/es5/')[1].split('?')[0]; fs.existsSync(f) ? r.fulfill({ path: f }) : r.abort(); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route('https://formsubmit.co/**', (r) => { mail.push(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' }); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ' [' + step + '] pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|fonts|Failed to load resource/.test(m.text())) errors.push(name + ' [' + step + '] console: ' + m.text()); });
    page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (d.defaultValue() || '') : undefined));
    return { ctx, page };
  }
  const L2Check = async () => { const r = await L.page.evaluate(async () => { try { return (await ADV.sb.select('tutor_applications', {})).length; } catch (e) { return -1; } }); return r; };
  const shot = async (page, n, full) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: !!full }); };
  const mjDone = (page) => page.waitForFunction(() => window.MathJax && MathJax.startup && MathJax.startup.promise).then(() => page.evaluate(() => MathJax.startup.promise)).then(() => page.waitForTimeout(600));

  /* 1. learner signs up */
  step = 'signup';
  const L = await mk('learner');
  await L.page.goto(BASE + '#signup');
  await L.page.fill('#s-name', 'Thabo Mokoena'); await L.page.fill('#s-phone', '082 555 1234'); await L.page.fill('#s-email', 'thabo@example.com'); await L.page.fill('#s-pass', 'thabopass1'); await L.page.fill('#s-school', 'Pretoria High'); await L.page.selectOption('#s-grade', '12'); await L.page.check('#s-terms');
  await L.page.click('#f-signup button[type=submit]');
  await L.page.waitForSelector('text=Hi Thabo');
  ok(true, 'learner account created and signed in');
  await shot(L.page, '01-learner-home');

  /* 2. learner books a lesson */
  step = 'book';
  await L.page.click('.nav [data-id="book"]');
  await L.page.waitForSelector('[data-action="book-day"]');
  await L.page.click('[data-action="book-topic"][data-id="calculus"]');
  await L.page.click('[data-action="book-time"]');
  await L.page.fill('#b-note', 'I struggle with cubic graphs and optimisation');
  await shot(L.page, '02-learner-book', true);
  const price = await L.page.textContent('.price'); ok(/R250,00/.test(price), 'price shown for 60 min maths: ' + price);
  await L.page.click('[data-action="book-send"]');
  await L.page.waitForSelector('text=Waiting for the tutor');
  ok(mail.some((m) => /New lesson request/.test(m)), 'tutor e-mail alert sent');
  await shot(L.page, '03-learner-lessons');

  /* 3. tutor signs in and accepts */
  step = 'admin';
  const A = await mk('admin');
  await A.page.goto(BASE);
  await A.page.fill('#a-email', 'kaytkayt5@gmail.com'); await A.page.fill('#a-pass', 'tutorpass1'); await A.page.click('#f-signin button[type=submit]');
  await A.page.waitForSelector('text=Waiting for your answer');
  ok(await A.page.isVisible('text=Thabo Mokoena'), 'request visible on the dashboard');
  await shot(A.page, '04-admin-dashboard', true);
  const bid = await A.page.getAttribute('[data-action="b-accept"]', 'data-id');
  await A.page.fill('#msg-' + bid, 'See you then – bring your 2024 P1');
  await A.page.click('[data-action="b-accept"]');
  await A.page.waitForSelector('text=Coming up');
  await A.page.waitForSelector('text=Start lesson');
  ok(true, 'booking accepted, Start lesson shown');

  /* 4. tutor unlocks the notes for the learner and adds a tutor note */
  step = 'admin-learners';
  await A.page.click('.nav [data-id="learners"]');
  await A.page.waitForSelector('text=Unlock the notes');
  await A.page.click('[data-action="l-set"][data-k="approved"]');
  await A.page.waitForSelector('text=Notes unlocked');
  await shot(A.page, '05-admin-learners');
  step = 'admin-topic';
  await A.page.goto(BASE + '#t-calculus'); await A.page.waitForSelector('#topic-root .steps');
  await A.page.click('#topic-root details.section[open] [data-action="note-add"]');
  await A.page.fill('#n-body', 'Watch the sign when you take \\(f\'(x) = 0\\) – most learners lose a mark here.');
  await A.page.click('#f-note button[type=submit]');
  await A.page.waitForSelector('.tnote');
  ok(true, 'tutor note saved');

  /* 5. learner sees confirmation, payment details and the unlocked notes */
  step = 'learner-confirmed';
  await L.page.goto(BASE + '#lessons'); await L.page.reload();
  await L.page.waitForSelector('text=Confirmed');
  await L.page.click('[data-action="b-pay"]');
  await L.page.waitForSelector('text=TEST BANK');
  ok(true, 'payment instructions visible only after acceptance');
  await shot(L.page, '06-learner-confirmed');
  step = 'learner-topic';
  const bins = []; L.page.on('request', (r) => { const m = /\/(content(?:-\d+)?\.bin)/.exec(r.url()); if (m) bins.push(m[1]); });
  await L.page.goto(BASE + '#t-calculus'); await L.page.reload();
  await L.page.waitForSelector('#topic-root .steps', { timeout: 20000 });
  await mjDone(L.page);
  ok(bins.length === 1 && bins[0] === 'content.bin', 'Grade 12 learner downloads only the Grade 12 notes: ' + bins.join(', '));
  ok(await L.page.isVisible('.tnote'), 'learner sees the tutor note');
  ok(await L.page.$('#wm') !== null, 'watermark present for learner');
  const figs = await L.page.$$eval('svg.fig', (x) => x.length); ok(figs > 0, figs + ' diagrams rendered on the topic page');
  await shot(L.page, '07-learner-topic', true);
  await L.page.click('#practice details.section >> nth=0'); await L.page.click('#practice [data-action="memo-toggle"] >> nth=0'); await mjDone(L.page);
  const pq = await L.page.$('#practice details.section'); await pq.screenshot({ path: path.join(OUT, '08-practice-memo.png') });
  step = 'teach';
  await L.page.click('[data-action="teach"] >> nth=0'); await L.page.waitForSelector('.overlay');
  for (let i = 0; i < 3; i++) await L.page.keyboard.press('ArrowRight');
  await mjDone(L.page);
  await L.page.click('[data-action="pen-teach"]');
  const box = await L.page.$eval('#teach-inner', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await L.page.mouse.move(box.x + 200, box.y + 260); await L.page.mouse.down(); for (let i = 0; i < 20; i++) await L.page.mouse.move(box.x + 200 + i * 12, box.y + 260 + Math.sin(i / 3) * 20); await L.page.mouse.up();
  await shot(L.page, '09-teach-pen');
  await L.page.click('[data-pen="stop"]'); await L.page.keyboard.press('Escape');
  step = 'progress';
  await L.page.click('#topic-root [data-action="sec-done"] >> nth=0');
  await L.page.waitForTimeout(2200);
  await L.page.goto(BASE + '#progress'); await L.page.waitForSelector('text=Your progress'); await shot(L.page, '10-learner-progress', true);
  step = 'other-grades';
  await L.page.goto(BASE + '#t-ls10-cells'); await L.page.waitForSelector('#topic-root .steps', { timeout: 20000, state: 'attached' }); await mjDone(L.page);
  ok(bins.includes('content-10.bin') && !bins.includes('content-11.bin'), 'Grade 10 notes load when a Grade 10 topic is opened: ' + bins.join(', '));
  ok(await L.page.isVisible('text=Life Sciences · Grade 10'), 'Grade 10 Life Sciences topic page');
  const lsFigs = await L.page.$$eval('#topic-root svg.fig, #topic-root .fig-table', (x) => x.length); ok(lsFigs > 0, lsFigs + ' Life Sciences diagrams and tables');
  await shot(L.page, '36-ls10-topic', true);
  await L.page.goto(BASE + '#t-ls12-dna'); await L.page.waitForSelector('#topic-root .steps', { timeout: 20000, state: 'attached' }); await mjDone(L.page);
  ok(bins.filter((b) => b === 'content.bin').length === 1, 'Grade 12 Life Sciences comes from the Grade 12 file already loaded');
  await shot(L.page, '37-ls12-topic', true);
  await L.page.goto(BASE + '#papers'); await L.page.waitForSelector('[data-action="gr-set"][data-id="11"]'); await L.page.click('[data-action="gr-set"][data-id="11"]');
  await L.page.waitForSelector('[data-action="mock"][data-id="11:life:P2"]', { timeout: 20000 });
  ok(bins.includes('content-11.bin'), 'Grade 11 notes load for the Grade 11 mock papers');
  await L.page.click('[data-action="mock"][data-id="11:life:P2"]'); await L.page.waitForSelector('#mock .mockq'); await mjDone(L.page);
  const mq = await L.page.$$eval('#mock .mockq', (x) => x.length); ok(mq >= 5, 'Grade 11 Life Sciences mock paper with ' + mq + ' questions');
  await shot(L.page, '38-gr11-mock');
  await L.page.click('[data-action="gr-set"][data-id="12"]');

  /* 6. messages both ways */
  step = 'messages';
  await L.page.click('.nav [data-id="messages"]'); await L.page.waitForSelector('#m-body');
  await L.page.fill('#m-body', 'Hi Sir, can we also do trig next week?'); await L.page.click('#f-msg button[type=submit]');
  await L.page.waitForSelector('.msg.me');
  await A.page.goto(BASE + '#messages'); await A.page.reload(); await A.page.waitForSelector('text=can we also do trig');
  await A.page.fill('#m-body', 'Yes – book a 90 min slot on Thursday.'); await A.page.click('#f-msg button[type=submit]'); await A.page.waitForSelector('.msg.me');
  await shot(A.page, '11-admin-messages');
  await L.page.reload(); await L.page.waitForSelector('text=book a 90 min slot'); await shot(L.page, '12-learner-messages');
  ok(true, 'messages delivered both ways');

  /* 7. tutor money + settings pages */
  step = 'admin-pages';
  for (const t of ['money', 'settings', 'classes', 'bookings']) { await A.page.goto(BASE + '#' + t); await A.page.reload(); await A.page.waitForSelector('h1'); await shot(A.page, '13-admin-' + t, true); }
  await A.page.goto(BASE + '#classes'); await A.page.click('[data-action="class-new"]'); await A.page.fill('#c-title', 'Calculus crash course'); await A.page.click('#f-class button[type=submit]'); await A.page.waitForSelector('text=Calculus crash course');
  ok(true, 'group class created');
  await A.page.goto(BASE + '#money'); await A.page.fill('#fee-maths', '300'); await A.page.click('#f-fees button[type=submit]'); await A.page.waitForSelector('text=Saved');
  ok(true, 'fees saved');

  /* 7b. a tutor applies with a CV; the tutor reviews it */
  step = 'tutor-apply';
  const T = await mk('applicant', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await T.page.goto('http://127.0.0.1:54321/tutor-apply.html');
  await T.page.fill('#in-full_name', 'Naledi Khumalo'); await T.page.fill('#in-email', 'naledi@example.com'); await T.page.fill('#in-phone', '072 555 0101');
  await T.page.selectOption('#in-province', 'Free State'); await T.page.fill('#in-town', 'Bloemfontein');
  await T.page.check('input[name=subjects][value=maths]'); await T.page.check('input[name=subjects][value=phys]'); await T.page.check('input[name=grades][value="12"]');
  await T.page.fill('#in-qualification', 'BSc Mathematics and Physics (2024)'); await T.page.fill('#in-institution', 'University of the Free State'); await T.page.fill('#in-experience_years', '3');
  await T.page.fill('#in-availability', 'Mon–Thu 16:00–20:00, Sat mornings'); await T.page.check('input[name=mode][value=both]');
  await T.page.fill('#in-about', 'I tutor because I enjoy seeing a learner finally get it. For optimisation I start with a sketch and a table of values before any calculus.');
  await T.page.setInputFiles('#in-cv', { name: 'Naledi-Khumalo-CV.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
  await T.page.check('#in-consent');
  await T.page.click('form button[type=submit]');
  await T.page.waitForSelector('text=/T-[0-9A-F]{6}/');
  ok(true, 'tutor application sent with CV');
  await shot(T.page, '19-tutor-applied', true);
  await A.page.goto(BASE + '#tutors'); await A.page.reload(); await A.page.click('[data-action="t-view"][data-id="apps"]'); await A.page.waitForSelector('text=Naledi Khumalo');
  await shot(A.page, '20-admin-tutors', true);
  const [pop] = await Promise.all([A.page.waitForEvent('popup'), A.page.click('[data-action="a-cv"]')]);
  await pop.waitForURL(/storage\/v1\/object\/sign\/cvs\//, { timeout: 10000 }).catch(() => { });
  ok(/\/storage\/v1\/object\/sign\/cvs\//.test(pop.url()), 'CV opens through a short-lived signed link'); await pop.close();
  await A.page.waitForSelector('text=Shortlisted');
  await A.page.selectOption('select[data-action="a-status"]', 'interview'); await A.page.waitForSelector('text=Saved');
  ok(true, 'application status changed');
  const leak = await L2Check(); ok(leak === 0, 'learners cannot read tutor applications');
  await A.page.click('[data-action="a-del"]'); await A.page.waitForSelector('text=Application and CV deleted');
  ok(true, 'application and CV deleted on request');

  /* 8. a second learner who is not approved: outline only, no key */
  step = 'learner-b';
  const B = await mk('learnerB', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await B.page.goto(BASE + '#signup');
  await B.page.fill('#s-name', 'Lerato Dlamini'); await B.page.fill('#s-phone', '071 000 0000'); await B.page.fill('#s-email', 'lerato@example.com'); await B.page.fill('#s-pass', 'leratopass1'); await B.page.selectOption('#s-grade', '11'); await B.page.check('#s-terms'); await B.page.click('#f-signup button[type=submit]');
  await B.page.waitForSelector('text=Hi Lerato'); await shot(B.page, '14-mobile-home', true);
  ok(await B.page.evaluate(() => ADV.state.profile.grade) === 11, 'grade saved at sign-up');
  await B.page.goto(BASE + '#maths'); await B.page.reload(); await B.page.waitForSelector('h1:has-text("Grade 11")'); ok(true, 'Grade 11 learner sees Grade 11 Maths by default');
  await B.page.click('[data-action="gr-set"][data-id="12"]'); await B.page.waitForSelector('h1:has-text("Grade 12")'); ok(await B.page.isVisible('text=Paper 1'), 'grade switcher shows Grade 12');
  await B.page.goto(BASE + '#life'); await B.page.reload(); await B.page.waitForSelector('h1:has-text("Life Sciences")'); await shot(B.page, '35-mobile-life', true);
  await B.page.goto(BASE + '#book'); await B.page.reload(); await B.page.waitForSelector('.price'); ok(/R300,00/.test(await B.page.textContent('.price')), 'new fee R300 applies to new bookings');
  await B.page.click('[data-action="book-set"][data-v="group"]'); await B.page.waitForSelector('text=Calculus crash course'); await shot(B.page, '15-mobile-group', true);
  await B.page.goto(BASE + '#t-calculus'); await B.page.reload(); await B.page.waitForSelector('text=Book a lesson on this topic');
  ok(!(await B.page.$('#topic-root .steps')), 'unapproved learner cannot see the notes');
  const keyRes = await B.page.evaluate(async () => { const r = await ADV.sb.select('content_keys', {}); return r.length; }); ok(keyRes === 0, 'content key hidden from unapproved learner');
  const others = await B.page.evaluate(async () => (await ADV.sb.select('bookings', {})).length); ok(others === 0, 'learner B cannot see learner A\'s bookings');
  const pay = await B.page.evaluate(async () => (await ADV.sb.select('private_settings', { key: 'eq.payment' })).length); ok(pay === 0, 'payment details hidden before an accepted booking');
  await shot(B.page, '16-mobile-locked', true);
  await L.ctx.close(); const L2 = await mk('learnerMobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  step = 'mobile-topic';
  await L2.page.goto(BASE); await L2.page.fill('#a-email', 'thabo@example.com'); await L2.page.fill('#a-pass', 'thabopass1'); await L2.page.click('#f-signin button[type=submit]'); await L2.page.waitForSelector('text=Hi Thabo');
  await L2.page.goto(BASE + '#t-sequences'); await L2.page.waitForSelector('#topic-root .steps', { timeout: 20000 }); await mjDone(L2.page); await shot(L2.page, '17-mobile-topic', false);
  const ex = await L2.page.$('#topic-root .example'); await ex.screenshot({ path: path.join(OUT, '18-mobile-example.png') });
  const hs = await L2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(hs <= 1, 'no horizontal scroll on phone (' + hs + ')');
  await L2.page.goto(BASE + '#t-ls11-excretion'); await L2.page.waitForSelector('#topic-root .fg-fig svg.fig', { timeout: 20000, state: 'attached' });
  await L2.page.click('#topic-root details.section >> nth=0').catch(() => {});
  const lsSvg = L2.page.locator('#topic-root .fg-fig svg.fig:visible').first(); await lsSvg.scrollIntoViewIfNeeded(); await lsSvg.click();
  await L2.page.waitForSelector('.figzoom svg.fig'); await shot(L2.page, '39-mobile-figure-zoom');
  const zw = await L2.page.$eval('.figzoom svg.fig', (s) => s.getBoundingClientRect().width); ok(zw >= 700, 'tapping a diagram on a phone opens it large (' + Math.round(zw) + ' px wide)');
  await L2.page.click('.figzoom-x'); ok(await L2.page.$('.figzoom') === null, 'enlarged diagram closes');

  /* 9. tutors: the admin creates a tutor login, assigns a learner and schedules lessons; the tutor sets a password, joins, uses the board and logs the lesson */
  step = 'tutor-create';
  await A.page.goto(BASE + '#tutors'); await A.page.reload(); await A.page.click('[data-action="t-view"][data-id="team"]');
  await A.page.click('[data-action="acc-new"][data-role="tutor"]');
  await A.page.fill('#ac-name', 'Patience Mazibuko'); await A.page.fill('#ac-email', 'Patience@example.com'); await A.page.fill('#ac-phone', '073 123 4567'); await A.page.fill('#ac-rate', '160');
  await A.page.click('#f-acc button[type=submit]');
  await A.page.waitForSelector('text=Tutor account created');
  const tpw = await A.page.$eval('.creds code', (e) => (e.textContent.match(/Password: (\S+)/) || [])[1]);
  ok(/^Adv-[a-z0-9]{6}$/.test(tpw || ''), 'temporary password shown once: ' + tpw);
  const waHref = await A.page.getAttribute('.creds a.btn.primary', 'href'); ok(/wa\.me\/27731234567\?text=/.test(waHref) && /Temporary%20password/.test(waHref) && /patience%40example\.com/.test(waHref), 'WhatsApp message carries the login details');
  await shot(A.page, '21-admin-tutor-created', true);
  await A.page.click('[data-action="creds-done"]');
  step = 'tutor-assign';
  const thaboId = await A.page.evaluate(() => ADV.state.learners.find((l) => l.full_name === 'Thabo Mokoena').id);
  await A.page.click('[data-action="asg-open"] >> nth=0');
  await A.page.selectOption('#as-learner', thaboId); await A.page.selectOption('#as-subj', 'maths'); await A.page.fill('#as-hours', '10'); await A.page.fill('#as-note', 'Writes P1 on Friday – focus on calculus');
  await A.page.click('#f-asg button[type=submit]'); await A.page.waitForSelector('text=sees this learner now');
  ok(await A.page.isVisible('.asg:has-text("Thabo Mokoena")'), 'learner assigned to the tutor');
  step = 'tutor-schedule';
  await A.page.click('[data-action="sched-go"][data-tutor]'); await A.page.waitForSelector('#f-sched');
  await A.page.selectOption('#sc-learner', thaboId); await A.page.waitForTimeout(300);
  ok((await A.page.$eval('#sc-tutor', (e) => e.options[e.selectedIndex].text)) === 'Patience Mazibuko', 'assigned tutor preselected for the learner');
  await A.page.click('[data-action="slot-now"][data-p="sc"]');   // "Now": a lesson agreed on WhatsApp that starts straight away
  const picked = await A.page.evaluate(() => { const r = document.querySelector('#sc-slots .slot-row'); const sel = r.querySelectorAll('select'); return { d: sel[0].value, t: sel[1].value + ':' + sel[2].value, today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date()) }; });
  ok(picked.d === picked.today && /^\d\d:\d\d$/.test(picked.t), 'Now fills in today and the current time: ' + picked.d + ' ' + picked.t);
  await A.page.selectOption('#sc-rep', '2'); await A.page.fill('#sc-msg', 'Exam prep for Paper 1'); await A.page.waitForTimeout(200);
  ok(/2 lessons/.test(await A.page.textContent('#sc-sum')), 'summary counts the weekly repeat: ' + (await A.page.textContent('#sc-sum')).slice(0, 60));
  await A.page.click('#f-sched button[type=submit]');
  await A.page.waitForSelector('text=Scheduled ✔');
  ok(await A.page.isVisible('text=WhatsApp Patience (tutor)'), 'WhatsApp buttons for the tutor and the learner');
  const twa = decodeURIComponent(await A.page.getAttribute('a:has-text("WhatsApp Patience (tutor)")', 'href')); ok(/Thabo Mokoena – Maths/.test(twa) && /Join the lesson/.test(twa) && (twa.match(/• /g) || []).length === 2, 'tutor message lists both lessons');
  await shot(A.page, '22-admin-scheduled', true);
  const dateLabel = await A.page.$eval('#sc-slots .slot-row select', (e) => e.options[e.selectedIndex].text); ok(/^((Today|Tomorrow) · )?[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}( 20\d\d)?$/.test(dateLabel), 'date shown the South African way: ' + dateLabel);
  ok(await A.page.$$eval('#sc-slots .slot-row select[id$="-h"] option', (o) => o.length) === 24, '24-hour clock for the start time');
  // several days at once from the director's form: add a day, remove it again
  await A.page.click('[data-action="slot-add"][data-p="sc"]'); ok(await A.page.$$eval('#sc-slots .slot-row', (r) => r.length) === 2, 'director adds a second day');
  await A.page.click('[data-action="slot-del"][data-p="sc"] >> nth=1'); ok(await A.page.$$eval('#sc-slots .slot-row', (r) => r.length) === 1, 'and removes it');

  step = 'tutor-login';
  const P = await mk('tutor');
  await P.page.goto(BASE); await P.page.fill('#a-email', 'patience@example.com'); await P.page.fill('#a-pass', tpw); await P.page.click('#f-signin button[type=submit]');
  await P.page.waitForSelector('#f-newpass'); await shot(P.page, '23-tutor-new-password');
  await P.page.fill('#np-1', 'patience-pass1'); await P.page.fill('#np-2', 'patience-pass1'); await P.page.click('#f-newpass button[type=submit]');
  await P.page.waitForSelector('text=Add your Google Meet link');
  ok(await P.page.isVisible('h3:has-text("Thabo Mokoena")'), 'tutor sees the scheduled lesson');
  await P.page.fill('#tm-link', 'https://meet.google.com/abc-defg-hij'); await P.page.click('#f-tmeet button[type=submit]');
  await P.page.waitForSelector('text=Meet link saved');
  const join = await P.page.getAttribute('a:has-text("Join the lesson")', 'href'); ok(join === 'https://meet.google.com/abc-defg-hij', 'tutor joins with their own Meet link');
  const tTimer = await P.page.textContent('.lesson-timer'); ok(/left · ends \d\d:\d\d/.test(tTimer), 'tutor sees the time left in the lesson: ' + tTimer.trim());
  await shot(P.page, '24-tutor-today', true);
  const tLeak = await P.page.evaluate(async () => ({ b: (await ADV.sb.select('bookings', {})).length, p: (await ADV.sb.select('profiles', {})).length, pay: (await ADV.sb.select('private_settings', { key: 'eq.payment' })).length, apps: await ADV.sb.select('tutor_applications', {}).then((r) => r.length, () => -1) }));
  ok(tLeak.b === 0 && tLeak.p === 1 && tLeak.pay === 0 && tLeak.apps <= 0, 'tutor cannot read bookings, other profiles, payment details or applications directly ' + JSON.stringify(tLeak));
  const relogin = await P.page.evaluate(async () => (await ADV.sb.select('profiles', {}))[0].must_change_password); ok(relogin === false, 'temporary password replaced');
  await P.page.click('.nav [data-id="tlearners"]'); await P.page.waitForSelector('text=focus on calculus'); await shot(P.page, '25-tutor-learners');

  step = 'learner-tutor';
  await L2.page.goto(BASE + '#lessons'); await L2.page.reload(); await L2.page.waitForSelector('text=Your tutor:');
  ok(await L2.page.isVisible('b:has-text("Patience Mazibuko")'), 'learner sees the tutor\'s name');
  const ljoin = await L2.page.getAttribute('a:has-text("Join the lesson")', 'href'); ok(ljoin === 'https://meet.google.com/abc-defg-hij', 'learner joins the same Meet');
  await shot(L2.page, '26-learner-tutor-lesson', true);

  step = 'board';
  await P.page.click('.nav [data-id="board"]'); await P.page.waitForSelector('#wb-cv'); await mjDone(P.page);
  const cb = await P.page.$eval('#wb-cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await P.page.mouse.move(cb.x + 60, cb.y + 70); await P.page.mouse.down(); for (let i = 0; i < 30; i++) await P.page.mouse.move(cb.x + 60 + i * 9, cb.y + 70 + Math.sin(i / 4) * 25); await P.page.mouse.up();
  await P.page.click('[data-wb="tool"][data-v="rect"]'); await P.page.mouse.move(cb.x + 420, cb.y + 50); await P.page.mouse.down(); await P.page.mouse.move(cb.x + 560, cb.y + 140, { steps: 6 }); await P.page.mouse.up();
  await P.page.click('[data-wb="col"][data-v="#c2362e"]'); await P.page.click('[data-wb="tool"][data-v="arrow"]'); await P.page.mouse.move(cb.x + 600, cb.y + 200); await P.page.mouse.down(); await P.page.mouse.move(cb.x + 700, cb.y + 120, { steps: 6 }); await P.page.mouse.up();
  await P.page.click('[data-wb="col"][data-v="#1c2733"]'); await P.page.click('[data-wb="tool"][data-v="text"]'); await P.page.mouse.click(cb.x + 60, cb.y + 200); await P.page.keyboard.type('Turning points: f\'(x) = 0'); await P.page.keyboard.press('Enter');
  await P.page.click('[data-wb="col"][data-v="#2b63a8"]'); await P.page.click('[data-wb="tool"][data-v="math"]'); await P.page.mouse.click(cb.x + 60, cb.y + 290); await P.page.keyboard.type('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'); await P.page.keyboard.press('Enter');
  await P.page.waitForFunction(() => ADV.board.pages[ADV.board.cur].items.some((i) => i.t === 'img'), null, { timeout: 8000 });
  await P.page.selectOption('#wb-bg', 'axes');
  const items = await P.page.evaluate(() => ADV.board.pages[0].items.map((i) => i.t + (i.t === 'img' ? ':' + i.src.slice(0, 14) + ':' + Math.round(i.w) + 'x' + Math.round(i.h) : ''))); log(items.join(' | '));
  ok(items.length === 5 && /^img:data:image\/png/.test(items[4]), 'board holds pen, shape, arrow, text and typed maths');
  await shot(P.page, '27-tutor-board');
  await P.page.click('[data-wb="undo"]'); ok((await P.page.evaluate(() => ADV.board.pages[0].items.length)) === 4, 'undo'); await P.page.keyboard.press('Control+y'); ok((await P.page.evaluate(() => ADV.board.pages[0].items.length)) === 5, 'redo');
  await P.page.click('[data-wb="tool"][data-v="move"]'); await P.page.mouse.move(cb.x + 490, cb.y + 52); await P.page.mouse.down(); await P.page.mouse.move(cb.x + 520, cb.y + 300, { steps: 5 }); await P.page.mouse.up();
  ok((await P.page.evaluate(() => { const r = ADV.board.pages[0].items[1]; return r.y1; })) > 150, 'shape moved with the select tool');
  await P.page.click('[data-wb="add"]'); ok((await P.page.textContent('#wb-page')).trim() === '2 / 2', 'second page');
  await P.page.reload(); await P.page.waitForSelector('#wb-cv'); ok((await P.page.evaluate(() => ADV.board.pages.length)) === 2 && (await P.page.evaluate(() => ADV.board.pages[0].items.length)) === 5, 'board kept after a refresh');
  await P.page.click('[data-wb="prev"]'); await shot(P.page, '28-tutor-board-reloaded');

  step = 'tutor-log';
  await P.page.click('.nav [data-id="tdash"]'); await P.page.waitForSelector('[data-action="t-log"][data-d="1"]');
  const lid = await P.page.getAttribute('[data-action="t-log"][data-d="1"]', 'data-id');
  await P.page.fill('#tn-' + lid, 'Covered cubic graphs and 2023 P1 Q6. Homework: Q7.'); await P.page.click('[data-action="t-log"][data-d="1"]');
  await P.page.waitForSelector('text=Logged as delivered');
  ok(await P.page.isVisible('text=Covered cubic graphs'), 'lesson logged by the tutor');
  await shot(P.page, '29-tutor-logged', true);

  step = 'admin-tutor-pay';
  await A.page.goto(BASE + '#money'); await A.page.reload(); await A.page.waitForSelector('text=Tutor pay');
  ok(await A.page.isVisible('td:has-text("Patience Mazibuko")'), 'tutor pay lists the delivered lesson');
  await shot(A.page, '30-admin-tutor-pay', true);
  await A.page.goto(BASE + '#tutors'); await A.page.reload(); await A.page.click('[data-action="t-view"][data-id="team"]'); await A.page.waitForSelector('text=Has not signed in yet', { state: 'detached' }).catch(() => { });
  await shot(A.page, '31-admin-team', true);
  await A.page.goto(BASE + '#bookings'); await A.page.reload(); await A.page.waitForSelector('text=Covered cubic graphs'); ok(true, 'admin sees the tutor\'s log on the booking');

  step = 'admin-add-learner';
  await A.page.goto(BASE + '#learners'); await A.page.reload(); await A.page.click('[data-action="acc-new"][data-role="learner"]');
  await A.page.fill('#ac-name', 'Priscilla Ngoie'); await A.page.fill('#ac-email', 'priscilla@example.com'); await A.page.fill('#ac-phone', '061 000 1111'); await A.page.fill('#ac-school', 'The Settlers High School');
  await A.page.click('#f-acc button[type=submit]'); await A.page.waitForSelector('text=Learner account created');
  const lpw = await A.page.$eval('.creds code', (e) => (e.textContent.match(/Password: (\S+)/) || [])[1]);
  ok(await A.page.isVisible('h3:has-text("Priscilla Ngoie")') && /^Adv-/.test(lpw || ''), 'admin adds a sponsored learner with a temporary password');
  await shot(A.page, '34-admin-add-learner', true);
  const PL = await mk('priscilla'); await PL.page.goto(BASE); await PL.page.fill('#a-email', 'priscilla@example.com'); await PL.page.fill('#a-pass', lpw); await PL.page.click('#f-signin button[type=submit]');
  await PL.page.waitForSelector('#f-newpass'); await PL.page.fill('#np-1', 'priscilla-pass1'); await PL.page.fill('#np-2', 'priscilla-pass1'); await PL.page.click('#f-newpass button[type=submit]'); await PL.page.waitForSelector('text=Hi Priscilla').catch(async (e) => { await shot(PL.page, 'fail-priscilla', true); throw e; });
  ok(true, 'new learner chooses her own password and lands on her home page');

  step = 'tutor-adds-learner';
  await P.page.click('.nav [data-id="tlearners"]'); await P.page.click('[data-action="ta-open"]');
  await P.page.fill('#ta-name', 'Lindiwe Dube'); await P.page.fill('#ta-email', 'lindiwe@example.com'); await P.page.fill('#ta-phone', '082 111 2222'); await P.page.fill('#ta-gphone', '083 333 4444'); await P.page.fill('#ta-school', 'Eunice High School'); await P.page.selectOption('#ta-grade', '11');
  await P.page.click('#f-tadd button[type=submit]'); await P.page.waitForSelector('text=Login created');
  const dpw = await P.page.$eval('.creds code', (e) => (e.textContent.match(/Password: (\S+)/) || [])[1]);
  ok(/^Adv-[a-z0-9]{6}$/.test(dpw || ''), 'tutor creates a learner login with a temporary password');
  ok((await P.page.$eval('#ts-who', (e) => e.options[e.selectedIndex].text)).startsWith('Lindiwe Dube – Maths'), 'the new learner is ready to schedule');
  await P.page.click('[data-action="slot-add"][data-p="ts"]'); await P.page.click('[data-action="slot-add"][data-p="ts"]'); await P.page.selectOption('#ts-rep', '2'); await P.page.waitForTimeout(200);
  ok(/^6 lessons · 6 h/.test(await P.page.textContent('#ts-sum')), 'three days a week for two weeks = 6 lessons');
  await shot(P.page, '35-tutor-schedule-form', true);
  await P.page.click('#f-tsched button[type=submit]'); await P.page.waitForSelector('text=Scheduled ✔');
  ok(await P.page.isVisible('h3:has-text("6 lessons for Lindiwe Dube")'), 'tutor schedules six lessons at once');
  const dwa = decodeURIComponent(await P.page.getAttribute('.creds a.btn.primary', 'href'));
  ok(/^https:\/\/wa\.me\/27821112222\?text=/.test(dwa) && dwa.includes('Temporary password: ' + dpw) && (dwa.match(/• /g) || []).length === 6, 'one WhatsApp to the learner with the six times and the login');
  ok(/wa\.me\/27833334444/.test(await P.page.getAttribute('a:has-text("WhatsApp the parent")', 'href')), 'and one for the parent');
  await shot(P.page, '36-tutor-scheduled', true);
  await P.page.click('[data-action="ts-done"]'); await P.page.click('#f-tsched button[type=submit]');
  await P.page.waitForSelector('text=already have a lesson'); ok(true, 'a clash with a booked lesson is refused');
  // beyond the 10 hours the director allocated for Thabo: allowed, with a warning
  await P.page.selectOption('#ts-who', { label: 'Thabo Mokoena – Maths (Pretoria High)' }); await P.page.waitForSelector('#ts-hours .cd');
  await P.page.click('[data-action="slot-add"][data-p="ts"]'); await P.page.click('[data-action="slot-add"][data-p="ts"]');
  for (const h of await P.page.$$('#ts-slots select[id$="-h"]')) await h.selectOption('18');
  await P.page.selectOption('#ts-rep', '4'); await P.page.waitForTimeout(200);
  ok(/over/.test(await P.page.textContent('#ts-hours')), 'hours panel warns before going over the allocation: ' + (await P.page.textContent('#ts-hours .slot-warn')).trim().slice(0, 50));
  await P.page.click('#f-tsched button[type=submit]'); await P.page.waitForSelector('h3:has-text("12 lessons for Thabo Mokoena")'); ok(true, 'tutor may still schedule beyond the allocation');
  await P.page.click('[data-action="ts-done"]');
  // a new temporary password while Lindiwe has not signed in yet
  await P.page.click('.nav [data-id="tlearners"]'); await P.page.click('[data-action="t-pass"]'); await P.page.waitForSelector('.creds:has-text("New temporary password") code');
  const dpw2 = await P.page.$eval('.creds code', (e) => (e.textContent.match(/Password: (\S+)/) || [])[1]); ok(dpw2 && dpw2 !== dpw, 'tutor makes a new temporary password');
  await shot(P.page, '37-tutor-learners', true);
  const LD = await mk('lindiwe'); await LD.page.goto(BASE); await LD.page.fill('#a-email', 'lindiwe@example.com'); await LD.page.fill('#a-pass', dpw2); await LD.page.click('#f-signin button[type=submit]');
  await LD.page.waitForSelector('#f-newpass'); await LD.page.fill('#np-1', 'lindiwe-pass1'); await LD.page.fill('#np-2', 'lindiwe-pass1'); await LD.page.click('#f-newpass button[type=submit]'); await LD.page.waitForSelector('text=Hi Lindiwe');
  const ld = await LD.page.evaluate(() => ({ n: ADV.state.bookings.filter((b) => b.status === 'accepted').length, fee: ADV.state.bookings.reduce((n, b) => n + Number(b.fee), 0), approved: ADV.state.approved }));
  ok(ld.n === 6 && ld.approved, 'Lindiwe signs in with her own password and sees her six lessons ' + JSON.stringify(ld));
  const old = await LD.page.evaluate(async () => { try { await ADV.sb.update('profiles', { id: 'eq.' + ADV.sb.user.id }, { sponsor_id: null, created_by: null, role: 'admin' }); } catch (e) { /* refused */ } return (await ADV.sb.select('profiles', { id: 'eq.' + ADV.sb.user.id }))[0]; });
  ok(old.role === 'learner' && old.created_by, 'a learner cannot change who added them or their role');
  await P.page.reload(); await P.page.click('.nav [data-id="tlearners"]'); await P.page.waitForSelector('h3:has-text("Lindiwe Dube")');
  ok(!(await P.page.isVisible('[data-action="t-pass"]')), 'no tutor password reset once the learner has chosen her own');
  const tRes = await P.page.evaluate(async (id) => { try { await ADV.sb.fn('admin-users', { action: 'reset_password', user_id: id, password: 'Adv-zzzzzz' }); return 'allowed'; } catch (e) { return e.message; } }, thaboId);
  ok(/director/.test(tRes), 'tutor cannot reset a director\'s learner\'s password: ' + tRes);

  step = 'director-analysis';
  await A.page.goto(BASE + '#analysis'); await A.page.reload(); await A.page.waitForSelector('h1:has-text("Analysis")');
  await A.page.click('[data-action="an-p"][data-id="next"]'); await A.page.waitForTimeout(200);   // Lindiwe's lessons start tomorrow, which may be next month
  ok(await A.page.isVisible('.an-table td.name:has-text("Patience Mazibuko")') && await A.page.isVisible('.an-table td.name:has-text("Lindiwe Dube")'), 'lessons per tutor and per learner');
  await A.page.click('[data-action="an-p"][data-id="month"]'); await A.page.waitForTimeout(200);
  ok(await A.page.isVisible('.an-flags:has-text("Thabo Mokoena")') && /over/.test(await A.page.textContent('.an-flags')), 'flag: Thabo is booked beyond his allocated hours');
  await A.page.selectOption('select[data-action="sp-link"]', thaboId); await A.page.waitForSelector('text=/Billed to Test Sponsor Trust from now on – \\d+ lessons moved/');
  const spRows = await A.page.evaluate(() => ADV.state.bookings.filter((b) => b.learner_id === ADV.state.learners.find((l) => l.full_name === 'Thabo Mokoena').id && b.sponsor_id).map((b) => Number(b.fee))); ok(spRows.length >= 13 && spRows.every((f) => f === 0), 'Thabo\'s unpaid lessons move to the sponsor with no learner fee (' + spRows.length + ')');
  await A.page.waitForSelector('[data-action="inv-make"]'); await A.page.click('[data-action="inv-make"]'); await A.page.waitForSelector('.inv-row.new');
  const inum = (await A.page.textContent('.inv-row.new b.mono')).trim(); ok(/^\d{9}$/.test(inum), 'invoice made from the delivered lesson: ' + inum);
  const [ipop] = await Promise.all([A.page.waitForEvent('popup'), A.page.click('.inv-row.new [data-action="inv-open"]')]);
  await ipop.waitForLoadState('load'); const itxt = await ipop.textContent('body');
  ok(itxt.includes('Invoice no.: ' + inum) && /Mathematics – one-hour online lesson for Thabo Mokoena \(Pretoria High\), tutor Patience Mazibuko/.test(itxt) && /TEST BANK/.test(itxt) && /TOTAL/.test(itxt), 'printable invoice with the line, total and banking details');
  await ipop.screenshot({ path: path.join(OUT, '38-invoice.png'), fullPage: true });   // (request routing in this test context stalls images in written pop-ups; the logo itself is checked below)
  const logo = await ipop.$eval('.logo img', (i) => i.getAttribute('src')); ok(/\/assets\/invoice-logo\.png$/.test(logo) && await A.page.evaluate(async (u) => (await fetch(u)).headers.get('content-type') === 'image/png', logo), 'logo on the invoice: ' + logo);
  await ipop.close();
  await A.page.click('.inv-row.new [data-action="inv-st"][data-v="sent"]'); await A.page.waitForSelector('text=Marked sent');
  ok(!(await A.page.isVisible('[data-action="inv-make"]')), 'invoiced lessons are not offered again');
  await shot(A.page, '39-director-analysis', true);
  const tFin = await P.page.evaluate(async () => ({ inv: await ADV.sb.select('invoices', {}).then((r) => r.length, () => -1), sp: await ADV.sb.select('sponsors', {}).then((r) => r.length, () => -1), set: (await ADV.sb.select('private_settings', { key: 'eq.invoice' })).length, tab: !!document.querySelector('[data-id="analysis"]') }));
  ok(tFin.inv <= 0 && tFin.sp <= 0 && tFin.set === 0 && !tFin.tab, 'tutors see no Analysis, invoices, sponsors or banking details ' + JSON.stringify(tFin));
  const lFin = await LD.page.evaluate(async () => ({ inv: await ADV.sb.select('invoices', {}).then((r) => r.length, () => -1), set: (await ADV.sb.select('private_settings', { key: 'eq.invoice' })).length }));
  ok(lFin.inv <= 0 && lFin.set === 0, 'learners neither ' + JSON.stringify(lFin));

  step = 'bundles';
  await LD.page.click('.nav [data-id="book"]'); await LD.page.waitForSelector('.bundle-card');
  ok(/R1 100,00/.test(await LD.page.textContent('.bundle-card')) && /R220,00 per hour/.test(await LD.page.textContent('.bundle-card')), 'learner sees the 5- and 10-hour bundles with the hourly saving');
  await shot(LD.page, '42-learner-bundle-offer', true);
  await LD.page.click('[data-action="bundle-req"][data-h="5"]'); await LD.page.waitForSelector('.bundle-card:has-text("Waiting for the tutor")');
  const fake = await LD.page.evaluate(async () => { try { const r = await ADV.sb.insert('bundles', [{ learner_id: ADV.sb.user.id, hours: 10, price: 1 }]); return Number(r[0].price); } catch (e) { return e.message; } });
  ok(fake === 2000, 'the server sets the bundle price, not the learner (' + fake + ')');
  await LD.page.evaluate(async () => { const b = ADV.state.bundles || []; await ADV.sb.rpc('cancel_bundle', { b: (await ADV.sb.select('bundles', { hours: 'eq.10' }))[0].id }); });
  await A.page.goto(BASE + '#dash'); await A.page.reload(); await A.page.waitForSelector('h2:has-text("Bundle requests")');
  ok(await A.page.isVisible('h3:has-text("Lindiwe Dube · 5 h for R1 100,00")'), 'director sees the bundle request on the Dashboard');
  await A.page.fill('[id^="bm-"]', 'Welcome – pay within 3 days, please.'); await A.page.click('[data-action="bundle-accept"]'); await A.page.waitForSelector('text=Bundle accepted');
  await LD.page.reload(); await LD.page.click('.nav [data-id="book"]'); await LD.page.waitForSelector('.bundle-card:has-text("5 h of 5 h left")');
  await LD.page.click('[data-action="book-time"]'); const bprice = await LD.page.textContent('.pricebar');
  ok(/R0/.test(bprice) && /From your bundle · 5 h left/.test(bprice), 'booking page shows the lesson comes from the bundle: ' + bprice.replace(/\s+/g, ' ').trim().slice(0, 60));
  await LD.page.click('[data-action="book-send"]'); await LD.page.waitForSelector('.lesson .pill:has-text("From your bundle")');
  const lb = await LD.page.evaluate(() => ADV.state.bookings.filter((b) => b.bundle_id).map((b) => Number(b.fee)));
  ok(lb.length === 1 && lb[0] === 0, 'the lesson is taken from the bundle with no fee');
  await LD.page.click('.nav [data-id="book"]'); await LD.page.waitForSelector('.bundle-card:has-text("4 h of 5 h left")'); ok(true, 'bundle shows 4 h left');
  await LD.page.click('[data-action="bundle-pay"]'); await LD.page.waitForSelector('.bundle-card .paybox'); ok(/TEST BANK/.test(await LD.page.textContent('.bundle-card .paybox')), 'payment details with the bundle reference');
  await LD.page.setInputFiles('input[data-action="bundle-pop"]', { name: 'pop.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }); await LD.page.waitForSelector('.bundle-card:has-text("Proof sent")');
  ok(true, 'learner uploads proof of payment for the bundle'); await shot(LD.page, '43-learner-bundle', true);
  await A.page.goto(BASE + '#money'); await A.page.reload(); await A.page.waitForSelector('h3:has-text("Lesson bundles")');
  ok(await A.page.isVisible('tr:has-text("Lindiwe Dube") >> text=Proof sent'), 'director sees the bundle and the proof');
  await A.page.click('[data-action="bundle-paid"]'); await A.page.waitForSelector('text=Marked paid');
  await shot(A.page, '44-director-bundles', true);
  await A.page.goto(BASE + '#analysis'); await A.page.reload(); await A.page.waitForSelector('h1:has-text("Analysis")');
  ok(/R1 100,00 from bundles/.test(await A.page.textContent('.stack')), 'Analysis counts the bundle payment');

  step = 'tutor-mobile';
  const PM = await mk('tutorMobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await PM.page.goto(BASE); await PM.page.fill('#a-email', 'patience@example.com'); await PM.page.fill('#a-pass', 'patience-pass1'); await PM.page.click('#f-signin button[type=submit]'); await PM.page.waitForSelector('text=Good');
  await shot(PM.page, '32-tutor-mobile-today', true);
  ok((await PM.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'tutor portal fits a phone');
  await PM.page.click('.tabbar [data-id="tsched"]'); await PM.page.waitForSelector('#f-tsched'); await PM.page.click('[data-action="slot-add"][data-p="ts"]'); await shot(PM.page, '40-tutor-mobile-schedule', true);
  ok((await PM.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'schedule form fits a phone');
  const AM = await mk('directorMobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await AM.page.goto(BASE); await AM.page.fill('#a-email', 'kaytkayt5@gmail.com'); await AM.page.fill('#a-pass', 'tutorpass1'); await AM.page.click('#f-signin button[type=submit]'); await AM.page.waitForSelector('.tabbar');
  await AM.page.goto(BASE + '#analysis'); await AM.page.waitForSelector('h1:has-text("Analysis")'); await shot(AM.page, '41-director-mobile-analysis', true);
  ok((await AM.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'Analysis fits a phone (tables scroll inside their card)');
  await PM.page.click('.tabbar [data-id="board"]'); await PM.page.waitForSelector('#wb-cv'); await shot(PM.page, '33-tutor-mobile-board');
  ok((await PM.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'board fits a phone');

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch(async (e) => { console.error(e.message, '\nstep:', step, '\nerrors:', errors.join('\n')); process.exit(1); });
