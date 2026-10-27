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
  await L.page.goto(BASE + '#t-calculus'); await L.page.reload();
  await L.page.waitForSelector('#topic-root .steps', { timeout: 20000 });
  await mjDone(L.page);
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
  const soon = await A.page.evaluate(() => { const z = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(Date.now() + 5 * 60000)); const g = (t) => z.find((x) => x.type === t).value; return { date: g('year') + '-' + g('month') + '-' + g('day'), time: g('hour') + ':' + g('minute') }; });
  await A.page.fill('#sc-date', soon.date); await A.page.$eval('#sc-time', (e) => e.removeAttribute('step')); await A.page.fill('#sc-time', soon.time);
  await A.page.selectOption('#sc-rep', '2'); await A.page.fill('#sc-msg', 'Exam prep for Paper 1');
  await A.page.click('#f-sched button[type=submit]');
  await A.page.waitForSelector('text=Scheduled ✔');
  ok(await A.page.isVisible('text=WhatsApp Patience (tutor)'), 'WhatsApp buttons for the tutor and the learner');
  const twa = decodeURIComponent(await A.page.getAttribute('a:has-text("WhatsApp Patience (tutor)")', 'href')); ok(/Thabo Mokoena – Maths/.test(twa) && /Join the lesson/.test(twa), 'tutor message lists the lessons');
  await shot(A.page, '22-admin-scheduled', true);

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
  await PL.page.waitForSelector('#f-newpass'); await PL.page.fill('#np-1', 'priscilla-pass1'); await PL.page.fill('#np-2', 'priscilla-pass1'); await PL.page.click('#f-newpass button[type=submit]'); await PL.page.waitForSelector('text=Hi Priscilla');
  ok(true, 'new learner chooses her own password and lands on her home page');

  step = 'tutor-mobile';
  const PM = await mk('tutorMobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await PM.page.goto(BASE); await PM.page.fill('#a-email', 'patience@example.com'); await PM.page.fill('#a-pass', 'patience-pass1'); await PM.page.click('#f-signin button[type=submit]'); await PM.page.waitForSelector('text=Good');
  await shot(PM.page, '32-tutor-mobile-today', true);
  ok((await PM.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'tutor portal fits a phone');
  await PM.page.click('.tabbar [data-id="board"]'); await PM.page.waitForSelector('#wb-cv'); await shot(PM.page, '33-tutor-mobile-board');
  ok((await PM.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'board fits a phone');

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch(async (e) => { console.error(e.message, '\nstep:', step, '\nerrors:', errors.join('\n')); process.exit(1); });
