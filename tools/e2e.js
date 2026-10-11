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
  const shot = async (page, n, full) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: !!full }); };
  const mjDone = (page) => page.waitForFunction(() => window.MathJax && MathJax.startup && MathJax.startup.promise).then(() => page.evaluate(() => MathJax.startup.promise)).then(() => page.waitForTimeout(600));

  /* 1. learner signs up */
  step = 'signup';
  const L = await mk('learner');
  await L.page.goto(BASE + '#signup');
  await L.page.fill('#s-name', 'Thabo Mokoena'); await L.page.fill('#s-phone', '082 555 1234'); await L.page.fill('#s-email', 'thabo@example.com'); await L.page.fill('#s-pass', 'thabopass1'); await L.page.fill('#s-school', 'Pretoria High'); await L.page.check('#s-terms');
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

  /* 8. a second learner who is not approved: outline only, no key */
  step = 'learner-b';
  const B = await mk('learnerB', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await B.page.goto(BASE + '#signup');
  await B.page.fill('#s-name', 'Lerato Dlamini'); await B.page.fill('#s-phone', '071 000 0000'); await B.page.fill('#s-email', 'lerato@example.com'); await B.page.fill('#s-pass', 'leratopass1'); await B.page.check('#s-terms'); await B.page.click('#f-signup button[type=submit]');
  await B.page.waitForSelector('text=Hi Lerato'); await shot(B.page, '14-mobile-home', true);
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

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch(async (e) => { console.error(e.message, '\nstep:', step, '\nerrors:', errors.join('\n')); process.exit(1); });
