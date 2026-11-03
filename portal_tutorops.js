/* Adventuity portal – running the tutors: hire from accepted applications (by subject, standard R150 per hour), tutor contracts,
   the learner allocation sheet (upload → assign to a tutor → the tutor is told to contact the learner), and tutor pay
   (monthly statement from delivered lessons, tutor bank details and invoices, a payment list for the bank). */
(function () {
  'use strict';
  const ADV = window.ADV; const { $, $$, esc, fmt, pill, ICON, state, sb, SUBJ, toast } = ADV; const now = ADV.now;
  const STD = () => ADV.STD_RATE || 150;
  const hrs = (h) => String(Math.round(Number(h || 0) * 100) / 100).replace('.', ',') + ' h';
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const firstName = (n) => String(n || '').trim().split(' ')[0];
  const GROUPS = [['maths', 'Mathematics'], ['phys', 'Physical Sciences'], ['life', 'Life Sciences']];
  const groupName = ADV.allocSubjectName = (k) => (GROUPS.find((g) => g[0] === k) || [k, k])[1];
  const APP_GROUP = { maths: 'maths', phys: 'phys', chem: 'phys', lifesci: 'life', life: 'life' };
  const tutorsAll = () => (state.learners || []).filter((p) => p.role === 'tutor');
  const profileOf = (id) => (state.learners || []).find((p) => p.id === id) || null;
  const teaches = (t, g) => { const s = String(t.tutor_subjects || '').split(','); return g === 'phys' ? s.includes('phys') || s.includes('chem') : s.includes(g); };
  const monthKey = (d) => fmt.key(d).slice(0, 7);
  const monthName = (k) => new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(k + '-15T12:00:00+02:00'));
  const lastMonths = (n) => { const out = []; for (let i = 0; i < n; i++) { const d = new Date(now()); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i); out.push(monthKey(d)); } return out; };
  const delivered = (b) => b.status === 'completed' || (b.status === 'accepted' && !!b.delivered_at);
  const lessonH = (b) => (new Date(b.ends_at) - new Date(b.starts_at)) / 36e5;
  const BANKS = [['Capitec', '470010'], ['FNB', '250655'], ['Standard Bank', '051001'], ['Absa', '632005'], ['Nedbank', '198765'], ['Investec', '580105'], ['TymeBank', '678910'], ['African Bank', '430000'], ['Discovery Bank', '679000'], ['Bank Zero', '888000'], ['Other bank', '']];

  ADV.subjectChips = (key) => '<div class="row chips" style="gap:6px">' + [['', 'All subjects']].concat(GROUPS).map(([k, l]) => '<button class="chipbtn ' + ((state[key] || '') === k ? 'maths' : '') + '" data-action="subj-chip" data-k="' + key + '" data-v="' + k + '">' + l + '</button>').join('') + '</div>';
  ADV.actions['subj-chip'] = (a) => { state[a.dataset.k] = a.dataset.v; ADV.render(); };

  /* ================================================================ director: data */
  async function loadOps() {
    const q = async (t, o) => { try { return await sb.select(t, o || {}); } catch (e) { return []; } };
    const [al, bank, months] = await Promise.all([q('allocations', { order: 'created_at.asc' }), q('tutor_bank'), q('tutor_months', { order: 'month.desc' })]);
    state.allocs = al; state.tutorBank = {}; bank.forEach((b) => { state.tutorBank[b.tutor_id] = b; }); state.tutorMonths = months;
  }
  ADV.loadOps = loadOps;
  const prevInit = ADV.adminInit;
  ADV.adminInit = async function () { await Promise.all([prevInit ? prevInit() : null, loadOps()]); };

  ADV.tutorViews = {
    hire: { label: () => { const n = readyApps().filter((a) => !tutorByEmail(a.email)).length; return 'Ready to hire' + (n ? ' (' + n + ')' : ''); }, view: () => hireView() },
    alloc: { label: () => { const n = (state.allocs || []).filter((x) => x.status === 'new').length; return 'Learner allocations' + (n ? ' (' + n + ' new)' : ''); }, view: () => allocView() },
    pay: { label: () => 'Tutor pay', view: () => payView() },
  };

  /* ================================================================ hire: accepted applications by subject */
  const readyApps = () => (state.apps || []).filter((a) => a.status === 'accepted');
  const tutorByEmail = (email) => tutorsAll().find((t) => String(t.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
  function hireView() {
    const apps = readyApps(); const g = state.hSubj || '';
    const inGroup = (a, k) => (a.subjects || []).some((s) => APP_GROUP[s] === k);
    const card = (a) => {
      const t = tutorByEmail(a.email); const first = firstName(a.full_name);
      return '<div class="card hire-card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><div class="row" style="gap:6px">' +
        GROUPS.filter(([k]) => inGroup(a, k)).map(([k, l]) => pill(k, l)).join('') + (t ? pill('good', 'Tutor login created') : pill('', 'No login yet')) + '</div>' +
        '<h3 style="margin-top:6px">' + esc(a.full_name) + '</h3><p class="small muted">' + esc([a.qualification, a.institution, (a.experience_years || 0) + ' yrs experience', [a.town, a.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) + '</p>' +
        (a.availability ? '<p class="small" style="margin-top:4px"><b>Available:</b> ' + esc(a.availability) + '</p>' : '') +
        '<p class="small" style="margin-top:4px"><b>Rate:</b> ' + fmt.rand(t ? t.tutor_rate : STD()) + ' per hour' + (t ? '' : ' (standard)') + '</p></div></div>' +
        '<div class="row" style="margin-top:10px">' + (t ? '<button class="btn sm" data-action="t-view" data-id="team">Open in Team</button>' : '<button class="btn sm primary" data-action="hire-login" data-id="' + a.id + '">' + ICON.plus + 'Create tutor login (' + fmt.rand(STD()) + '/h)</button>') +
        ADV.contractButton(t ? 'tutor' : 'app', t ? t.id : a.id) + (a.cv_path ? '<button class="btn sm" data-action="a-cv" data-id="' + a.id + '">' + ICON.ext + 'CV</button>' : '') +
        (a.phone ? '<a class="btn sm" href="' + esc(ADV.wa(a.phone, 'Hi ' + first + ', this is Adventuity about your tutor application (' + a.ref + ').')) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') + '</div></div>';
    };
    const list = apps.filter((a) => !g || inGroup(a, g));
    const counts = GROUPS.map(([k, l]) => l + ': ' + apps.filter((a) => inGroup(a, k)).length).join(' · ');
    return '<div class="stack"><p class="small muted">Applicants you accepted, by subject (' + esc(counts) + '). Create a login at the standard ' + fmt.rand(STD()) + ' per hour, print the contract, then give them learners under Learner allocations.</p>' +
      ADV.subjectChips('hSubj') + (list.length ? list.map(card).join('') : '<div class="card"><p class="muted">No accepted applications' + (g ? ' for ' + esc(groupName(g)) : '') + ' yet. Accept applicants under Applications.</p></div>') + contractSettings() + '</div>';
  }
  ADV.actions['hire-login'] = (a) => {
    const ap = readyApps().find((x) => x.id === a.dataset.id); if (!ap) return;
    const subjects = Array.from(new Set((ap.subjects || []).flatMap((s) => (s === 'lifesci' ? ['life'] : SUBJ[s] ? [s] : []))));
    state.accForm = { role: 'tutor', name: ap.full_name, email: ap.email, phone: ap.phone, rate: STD(), subjects: subjects.length ? subjects : null };
    state.creds = null; state.tView = 'team'; ADV.render(); window.scrollTo({ top: 0 });
  };

  /* ================================================================ contracts */
  const DEFAULT_CONTRACT = [
    '# Independent Tutor Agreement',
    'This agreement is between **{{company}}** (“Adventuity”), represented by {{director}}, and **{{tutor}}** (“the Tutor”), e-mail {{email}}, phone {{phone}}.',
    '## 1. Services',
    'The Tutor gives live online lessons in {{subjects}} to learners in {{grades}} whom Adventuity allocates to the Tutor, using the Adventuity portal for scheduling, joining lessons and the lesson log.',
    '## 2. Independent contractor',
    'The Tutor works as an independent contractor and not as an employee. The Tutor is responsible for their own income tax with SARS and for their own equipment, internet and data.',
    '## 3. Rate',
    'Adventuity pays the Tutor **{{rate}} per hour** of lessons delivered. A lesson counts once the Tutor has marked it as delivered in the portal with a short note of what was covered. Lessons that do not take place are not paid.',
    '## 4. Invoices and payment',
    'By the 3rd working day of each month, the Tutor submits an invoice for the previous month in the portal (or accepts the portal statement as the invoice). Adventuity pays by EFT into the bank account the Tutor saved in the portal, within 7 days of receiving the invoice.',
    '## 5. Allocated learners',
    'When Adventuity allocates a learner, the Tutor contacts the learner (or parent) within 2 days, agrees the lesson times, sets up the learner’s login if needed and schedules the lessons in the portal. The Tutor stays within the hours allocated unless Adventuity agrees otherwise.',
    '## 6. Conduct and safeguarding',
    'Most learners are minors. The Tutor behaves professionally at all times, teaches only through the lesson links in the portal, contacts learners and parents only to arrange and give lessons, and reports any concern about a learner’s safety to Adventuity immediately.',
    '## 7. Personal information (POPIA)',
    'The Tutor uses learners’ and parents’ personal information only to give the lessons, keeps it confidential, does not share it, and deletes it when the tutoring ends.',
    '## 8. Learners and materials',
    'Learners allocated by Adventuity remain Adventuity’s clients: the Tutor does not tutor them privately outside Adventuity during this agreement and for 6 months after it. Adventuity’s notes, questions and other materials remain Adventuity’s property and are used only for Adventuity lessons.',
    '## 9. Start and end',
    'This agreement starts on {{start}}. Either party may end it with 7 days’ written notice (WhatsApp or e-mail is enough). Adventuity may end it immediately for misconduct. Lessons delivered before the end are paid.',
    '## Signatures',
    '{{signatures}}',
  ].join('\n\n');
  const fill = (tpl, d) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (d[k] != null ? d[k] : m));
  function mdToHtml(text) {   // the template: '# Title', '## Heading', paragraphs, **bold**
    return String(text).split(/\n{2,}/).map((p) => {
      const t = p.trim(); if (!t) return '';
      if (t === '{{signatures}}' || t === '@@SIG@@') return '@@SIG@@';
      const inl = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
      if (t.startsWith('## ')) return '<h2>' + inl(t.slice(3)) + '</h2>'; if (t.startsWith('# ')) return '<h1>' + inl(t.slice(2)) + '</h1>';
      return '<p>' + inl(t) + '</p>';
    }).join('');
  }
  ADV.contractButton = (kind, id, primary) => '<button class="btn sm' + (primary ? ' primary' : '') + '" data-action="contract-open" data-kind="' + kind + '" data-id="' + id + '">' + ICON.note + 'Contract</button>';
  ADV.actions['contract-open'] = (a) => {
    const t = a.dataset.kind === 'tutor' ? profileOf(a.dataset.id) : null; const ap = a.dataset.kind === 'app' ? (state.apps || []).find((x) => x.id === a.dataset.id) : null;
    const who = t || ap; if (!who) return;
    const subjList = t ? String(t.tutor_subjects || '').split(',').filter((k) => SUBJ[k]).map((k) => SUBJ[k].name) : Array.from(new Set((ap.subjects || []).map((s) => ({ maths: 'Mathematics', phys: 'Physical Sciences', chem: 'Physical Sciences', lifesci: 'Life Sciences' })[s]).filter(Boolean)));
    const grades = ap && ap.grades && ap.grades.length ? 'Grade ' + ap.grades.join(', ') : 'Grades 10 to 12';
    const inv = (state.priv && state.priv.invoice) || {};
    const d = { company: inv.company || 'Adventuity (Pty) Ltd', director: (inv.issuer || ((state.profile.full_name || '') + ', Director')).replace(/, Adventuity \(Pty\) Ltd$/, ''), tutor: who.full_name || '', email: who.email || '', phone: who.phone || '',
      subjects: subjList.length ? subjList.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'the agreed subjects', grades, rate: fmt.rand(t ? (Number(t.tutor_rate) || STD()) : STD()),
      start: new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(now()) };
    const tpl = ((state.priv && state.priv.contract && state.priv.contract.text) || DEFAULT_CONTRACT);
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups for this site to open the contract', 5000);
    w.document.open(); w.document.write(contractHtml(fill(tpl.replace('{{signatures}}', '@@SIG@@'), d), d)); w.document.close();
    const pb = w.document.getElementById('c-print'); if (pb) pb.addEventListener('click', () => w.print());
  };
  function contractHtml(text, d) {
    const logo = new URL('assets/invoice-logo.png', location.href).href;
    const sig = (who, name) => '<div class="sig"><div class="line"></div><b>' + esc(who) + '</b><span>' + esc(name) + '</span><span>Date: ____________________</span><span>Place: ____________________</span></div>';
    const body = mdToHtml(text).replace('@@SIG@@', '<div class="sigs">' + sig('For ' + d.company, d.director) + sig('The Tutor', d.tutor + ' · ID number: ______________________') + '</div>');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tutor agreement – ' + esc(d.tutor) + '</title><style>' +
      '@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;background:#e9edf1;font:10.5pt/1.5 Helvetica,Arial,sans-serif;color:#111}' +
      '.bar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;align-items:center;padding:10px;background:#1c3246;color:#fff;font-size:13px}.bar button{font:600 14px Helvetica,Arial,sans-serif;padding:9px 16px;border-radius:8px;border:0;background:#fff;color:#1c3246;cursor:pointer}' +
      '.page{width:210mm;max-width:100%;margin:12px auto;background:#fff;padding:18mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:1.2pt solid #1c3246;padding-bottom:8px;margin-bottom:14px}.head img{width:32mm}.head span{color:#1c3246;font-weight:700;font-size:9pt}' +
      'h1{font-size:17pt;color:#1c3246;margin:4px 0 10px}h2{font-size:11pt;color:#1c3246;margin:14px 0 4px}p{margin:0 0 6px}[contenteditable]:focus{outline:2px dashed #9aa6b2}' +
      '.sigs{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:30px}.sig{display:grid;gap:3px;font-size:9.5pt}.sig .line{border-bottom:1pt solid #111;height:34px}.sig span{color:#444}' +
      '@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;padding:0;width:auto}}</style></head><body>' +
      '<div class="bar"><button id="c-print" type="button">Print / save as PDF</button><span>You can click into the text to change anything before printing.</span></div>' +
      '<div class="page"><div class="head"><img src="' + esc(logo) + '" alt="Adventuity"><span>' + esc(d.company) + '</span></div><div contenteditable="true">' + body + '</div></div></body></html>';
  }
  function contractSettings() {
    const cur = (state.priv && state.priv.contract && state.priv.contract.text) || DEFAULT_CONTRACT;
    return '<details class="card"><summary><b>Contract template</b> <span class="small muted">– the wording every tutor contract uses (only you can see it)</span></summary><form id="f-contract" class="stack" style="margin-top:10px">' +
      '<p class="small muted">Placeholders filled in for each tutor: {{tutor}}, {{email}}, {{phone}}, {{subjects}}, {{grades}}, {{rate}}, {{start}}, {{company}}, {{director}}; {{signatures}} places the signature lines. “#” starts the title, “##” a heading, **bold**. This is a starting point, not legal advice – have it checked before you rely on it.</p>' +
      '<textarea id="ct-text" rows="16" style="font-family:var(--mono);font-size:.82rem">' + esc(cur) + '</textarea><div class="row"><button class="btn primary" type="submit">Save template</button><button class="btn ghost" type="button" data-action="contract-reset">Back to the standard wording</button></div></form></details>';
  }
  async function saveContract(e, text) {
    if (e) e.preventDefault();
    try { await sb.upsert('private_settings', [{ key: 'contract', value: { text: text != null ? text : val('ct-text') }, updated_at: new Date().toISOString() }], 'key'); state.priv.contract = { text: text != null ? text : val('ct-text') }; toast('Contract template saved'); ADV.render(); } catch (err) { toast(ADV.errMsg(err)); }
  }
  ADV.actions['contract-reset'] = () => { if (confirm('Go back to the standard contract wording?')) saveContract(null, DEFAULT_CONTRACT); };

  /* ================================================================ learner allocation sheet */
  /* Reading .xlsx without a library: an .xlsx file is a zip of XML files. */
  async function inflate(bytes) { const ds = new DecompressionStream('deflate-raw'); const s = new Blob([bytes]).stream().pipeThrough(ds); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), files = {}; let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.');
    let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true); const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      files[name] = async () => { const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true); const data = u8.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize); return dec.decode(method === 8 ? await inflate(data) : data); };
    }
    return files;
  }
  async function readXlsx(buf) {
    const z = await unzip(buf); const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    let sheetPath = 'xl/worksheets/sheet1.xml';
    try {   // the first sheet in the workbook
      const wb = xml(await z['xl/workbook.xml']()); const first = wb.getElementsByTagName('sheet')[0]; const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rels = xml(await z['xl/_rels/workbook.xml.rels']()); const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
      if (rel) { const t = rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, ''); sheetPath = 'xl/' + t; }
    } catch (e) { /* use sheet1 */ }
    const shared = z['xl/sharedStrings.xml'] ? Array.from(xml(await z['xl/sharedStrings.xml']()).getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join('')) : [];
    if (!z[sheetPath]) throw new Error('Could not find the first sheet in this file.');
    const sh = xml(await z[sheetPath]()); const rows = [];
    Array.from(sh.getElementsByTagName('row')).forEach((r) => {
      const row = [];
      Array.from(r.getElementsByTagName('c')).forEach((c) => {
        const ref = c.getAttribute('r') || ''; const col = ref.replace(/\d+/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0];
        let x = t === 's' ? shared[Number(v && v.textContent)] : t === 'inlineStr' ? Array.from(c.getElementsByTagName('t')).map((e) => e.textContent).join('') : v ? v.textContent : '';
        row[col >= 0 ? col : row.length] = x == null ? '' : String(x);
      });
      rows.push(Array.from(row, (x) => (x == null ? '' : x)));
    });
    return rows;
  }
  function readCsv(text) {
    const first = text.split(/\r?\n/)[0] || ''; const d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === d) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim()));
  }
  const FIELDS = [['name', 'Learner name', /^(learner|student|full)?\s*name|^name|learner$|^names?$/i], ['surname', 'Surname', /surname|last ?name/i], ['school', 'School', /school/i], ['grade', 'Grade', /grade|gr\b/i],
    ['subject', 'Subject(s)', /subject/i], ['hours', 'Hours', /^(total )?(hours?|hrs)( allocated)?$/i], ['mathsHours', 'Maths hours', /math.*(hour|hrs)|(hour|hrs).*math/i], ['physHours', 'Physical Sciences hours', /(phys|science|chem).*(hour|hrs)|(hour|hrs).*(phys|science)/i],
    ['lifeHours', 'Life Sciences hours', /(life|bio).*(hour|hrs)|(hour|hrs).*(life|bio)/i], ['phone', 'Learner phone', /^(learner'?s? )?(cell|phone|mobile|contact|whats ?app)/i], ['gphone', 'Parent phone', /parent|guardian|mother|father/i], ['email', 'E-mail', /mail/i], ['note', 'Notes', /note|comment|remark|topic/i]];
  function autoMap(head) {
    const m = {}; const used = new Set();
    FIELDS.forEach(([k, , re]) => { const i = head.findIndex((h, j) => !used.has(j) && re.test(String(h).trim())); if (i >= 0) { m[k] = i; used.add(i); } });
    if (m.name == null) { const i = head.findIndex((h, j) => !used.has(j) && /name|learner|student/i.test(h)); if (i >= 0) m.name = i; }
    return m;
  }
  const subjOf = (s) => { const t = String(s || '').toLowerCase(); const out = []; if (/math/.test(t) && !/lit/.test(t)) out.push('maths'); if (/phys|chem|physical/.test(t)) out.push('phys'); if (/life|bio/.test(t)) out.push('life'); return out; };
  const num = (x) => { const v = Number(String(x == null ? '' : x).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(v) ? v : 0; };
  function toAllocs(imp) {
    const { rows, hi, map } = imp; const out = []; const cell = (r, k) => (map[k] != null && map[k] !== '' ? String(r[map[k]] == null ? '' : r[map[k]]).trim() : '');
    rows.slice(hi + 1).forEach((r, ri) => {
      const name = [cell(r, 'name'), cell(r, 'surname')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); if (name.length < 2) return;
      const base = { learner_name: name.slice(0, 120), school: cell(r, 'school').slice(0, 120), grade: (cell(r, 'grade').match(/\d{1,2}/) || [])[0] ? Number(cell(r, 'grade').match(/\d{1,2}/)[0]) : null, learner_phone: cell(r, 'phone').slice(0, 30), guardian_phone: cell(r, 'gphone').slice(0, 30), email: cell(r, 'email').toLowerCase().slice(0, 200), note: cell(r, 'note').slice(0, 500), row: ri + hi + 2 };
      if (base.grade && (base.grade < 8 || base.grade > 12)) base.grade = null;
      const per = [['maths', 'mathsHours'], ['phys', 'physHours'], ['life', 'lifeHours']].filter(([, k]) => map[k] != null && map[k] !== '' && num(cell(r, k)) > 0).map(([s, k]) => [s, num(cell(r, k))]);
      if (per.length) per.forEach(([s, h]) => out.push(Object.assign({ subject: s, hours: h }, base)));
      else { const subs = subjOf(cell(r, 'subject')); (subs.length ? subs : [imp.defSubj || 'maths']).forEach((s) => out.push(Object.assign({ subject: s, hours: num(cell(r, 'hours')) }, base))); }
    });
    // an existing login: the same e-mail links it; the same name only when the director ticks it (two learners can share a name)
    const L = (state.learners || []).filter((p) => p.role === 'learner'); const link = imp.link || {};
    out.forEach((a) => {
      const m = a.email && L.find((p) => String(p.email || '').toLowerCase() === a.email);
      const k = a.learner_name.toLowerCase(); const same = m ? [] : L.filter((p) => String(p.full_name || '').trim().toLowerCase() === k);
      a.nameKey = k; a.nameMatch = same.length === 1 ? (same[0].email || same[0].full_name) : same.length > 1 ? same.length + ' learners' : '';
      a.learner_id = m ? m.id : same.length === 1 && link[k] ? same[0].id : null; a.match = m ? (m.full_name || m.email) : '';
    });
    return out;
  }
  const allocProgress = (al) => { if (!al.learner_id) return 0; const subs = al.subject === 'phys' ? ['phys', 'chem'] : [al.subject]; return (state.bookings || []).filter((b) => b.learner_id === al.learner_id && subs.includes(b.subject) && delivered(b) && new Date(b.starts_at) >= new Date(al.created_at) - 864e5 * 30).reduce((n, b) => n + lessonH(b), 0); };
  function loadOf(tid) { return (state.allocs || []).filter((x) => x.tutor_id === tid && ['assigned', 'active'].includes(x.status)).length + (state.assign || []).filter((x) => x.tutor_id === tid && x.active && !x.allocation_id).length; }
  function suggest(al, extra) { const c = tutorsAll().filter((t) => !t.blocked && teaches(t, al.subject)); if (!c.length) return null; c.sort((a, b) => (loadOf(a.id) + ((extra || {})[a.id] || 0)) - (loadOf(b.id) + ((extra || {})[b.id] || 0)) || String(a.full_name).localeCompare(String(b.full_name))); return c[0]; }

  function allocView() {
    const imp = state.allocImport; const list = state.allocs || []; const f = state.aStat || 'new'; const g = state.aSubj || '';
    const sets = { new: list.filter((x) => x.status === 'new'), working: list.filter((x) => ['assigned', 'active'].includes(x.status)), done: list.filter((x) => ['done', 'cancelled'].includes(x.status)) };
    const seg = (k, l) => '<button class="' + (f === k ? 'on' : '') + '" data-action="al-stat" data-id="' + k + '">' + l + ' (' + sets[k].length + ')</button>';
    const tsel = (al, sel) => '<select id="alt-' + al.id + '" aria-label="Tutor for ' + esc(al.learner_name) + '"><option value="">Choose a tutor…</option>' + tutorsAll().filter((t) => !t.blocked).sort((a, b) => teaches(b, al.subject) - teaches(a, al.subject) || String(a.full_name).localeCompare(String(b.full_name))).map((t) => '<option value="' + t.id + '"' + (sel === t.id ? ' selected' : '') + '>' + esc(t.full_name || t.email) + ' · ' + loadOf(t.id) + ' learner' + (loadOf(t.id) === 1 ? '' : 's') + (teaches(t, al.subject) ? '' : ' – not their subject') + '</option>').join('') + '</select>';
    const sp = (id) => ((state.sponsors || []).find((s) => s.id === id) || {}).name;
    const row = (al) => {
      const t = al.tutor_id ? profileOf(al.tutor_id) : null; const s = al.status === 'new' ? suggest(al) : null; const done = allocProgress(al);
      return '<div class="alloc-row" id="al-' + al.id + '"><div style="min-width:0;flex:1"><div class="row" style="gap:6px">' + pill(al.subject, groupName(al.subject)) + (Number(al.hours) ? pill('', hrs(al.hours)) : '') + (sp(al.sponsor_id) ? pill('accent', sp(al.sponsor_id).split(' ')[0]) : '') + (al.learner_id ? pill('good', 'Has a login') : '') +
        (al.status === 'assigned' ? pill('warn', 'Tutor to contact and set up login') : al.status === 'active' ? pill('good', 'Active' + (Number(al.hours) ? ' · ' + hrs(done) + ' of ' + hrs(al.hours) + ' taught' : '')) : al.status === 'done' ? pill('', 'Done') : al.status === 'cancelled' ? pill('', 'Cancelled') : '') + '</div>' +
        '<b>' + esc(al.learner_name) + '</b> <span class="small muted">' + esc([al.grade ? 'Grade ' + al.grade : '', al.school, al.learner_phone, al.guardian_phone ? 'parent ' + al.guardian_phone : '', al.email].filter(Boolean).join(' · ')) + '</span>' + (al.note ? '<p class="small muted">' + esc(al.note) + '</p>' : '') +
        (t ? '<p class="small">' + ICON.user + ' Tutor: <b>' + esc(t.full_name || t.email) + '</b>' + (al.assigned_at ? ' <span class="muted">since ' + esc(fmt.date(al.assigned_at)) + '</span>' : '') + '</p>' : '') + '</div>' +
        '<div class="row" style="gap:6px;align-items:center">' + (['new', 'assigned', 'active'].includes(al.status) ? tsel(al, t ? t.id : s ? s.id : '') + '<button class="btn sm ' + (al.status === 'new' ? 'primary' : '') + '" data-action="al-assign" data-id="' + al.id + '">' + (al.status === 'new' ? 'Assign & tell the tutor' : 'Reassign') + '</button>' : '') +
        (al.status === 'active' ? '<button class="btn sm ghost" data-action="al-set" data-id="' + al.id + '" data-v="done">Mark done</button>' : '') + (al.status === 'new' ? '<button class="btn sm ghost" data-action="al-del" data-id="' + al.id + '" aria-label="Remove ' + esc(al.learner_name) + '">✕</button>' : al.status === 'done' || al.status === 'cancelled' ? '<button class="btn sm ghost" data-action="al-set" data-id="' + al.id + '" data-v="' + (al.tutor_id ? 'active' : 'new') + '">Reopen</button>' : '') + '</div></div>';
    };
    const shown = (sets[f] || []).filter((x) => !g || x.subject === g);
    const sent = state.allocSent;
    return '<div class="stack">' +
      (sent ? '<div class="card creds"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="eyebrow">Assigned ✔</span><h3 style="margin-top:4px">' + sent.length + ' learner' + (sent.length === 1 ? '' : 's') + ' handed to ' + (new Set(sent.map((x) => x.tutor)).size === 1 ? esc(firstName((profileOf(sent[0].tutor) || {}).full_name)) : 'tutors') + '</h3><p class="small muted">Each tutor got a message in their portal (and a notification) to contact the learner. Send it on WhatsApp too:</p></div><button class="btn sm ghost" data-action="al-sent-done">Done</button></div>' +
        '<div class="row" style="margin-top:8px">' + sent.map((x) => { const t = profileOf(x.tutor) || {}; return '<a class="btn sm' + (sent.length === 1 ? ' primary' : '') + '" href="' + esc(t.phone ? ADV.wa(t.phone, x.msg) : 'https://wa.me/?text=' + encodeURIComponent(x.msg)) + '" target="_blank" rel="noopener">WhatsApp ' + esc(firstName(t.full_name)) + ' about ' + esc(firstName(x.name)) + '</a>'; }).join('') + '</div></div>' : '') +
      (imp ? importPreview(imp) : '<div class="card stack"><div><h3>Upload an allocation sheet</h3><p class="small muted">Excel (.xlsx) or CSV, one row per learner – for example the SAILI allocation. Columns are recognised automatically (name, school, grade, subject or hours per subject, phone numbers, e-mail); you check them before anything is saved.</p></div><div class="row"><label class="btn primary file-btn">' + ICON.plus + 'Choose the sheet<input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-action="al-file" hidden></label></div></div>') +
      '<div class="row" style="justify-content:space-between"><div class="seg">' + seg('new', 'To assign') + seg('working', 'With a tutor') + seg('done', 'Done') + '</div>' + (f === 'new' && sets.new.length ? '<button class="btn primary" data-action="al-assign-all">' + ICON.check + 'Assign all to the suggested tutors</button>' : '') + '</div>' +
      ADV.subjectChips('aSubj') + (shown.length ? '<div class="card alloc-list">' + shown.map(row).join('') + '</div>' : '<div class="card"><p class="muted">' + (f === 'new' ? 'No learners waiting for a tutor. Upload a sheet above.' : 'Nothing here yet.') + '</p></div>') + '</div>';
  }
  function importPreview(imp) {
    const head = imp.rows[imp.hi] || []; const allocs = toAllocs(imp); imp.allocs = allocs;
    const opt = (k) => '<select data-action="al-map" data-k="' + k + '" aria-label="Column for ' + k + '"><option value="">–</option>' + head.map((h, i) => '<option value="' + i + '"' + (String(imp.map[k]) === String(i) ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>').join('') + '</select>';
    return '<div class="card stack"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="eyebrow">Check before saving</span><h3 style="margin-top:4px">' + esc(imp.file) + ' · ' + allocs.length + ' learner–subject row' + (allocs.length === 1 ? '' : 's') + '</h3></div><button class="btn sm ghost" data-action="al-cancel">Cancel</button></div>' +
      '<details' + (allocs.length ? '' : ' open') + '><summary class="small"><b>Columns</b> – change one if it was recognised wrongly</summary><div class="grid cols-4" style="margin-top:8px">' + FIELDS.map(([k, l]) => '<div class="field"><label>' + esc(l) + '</label>' + opt(k) + '</div>').join('') + '<div class="field"><label>Header row</label><select data-action="al-hi">' + imp.rows.slice(0, 15).map((r, i) => '<option value="' + i + '"' + (i === imp.hi ? ' selected' : '') + '>Row ' + (i + 1) + ': ' + esc(r.filter(Boolean).slice(0, 3).join(', ').slice(0, 40)) + '</option>').join('') + '</select></div></div></details>' +
      '<div class="table-wrap"><table class="an-table"><thead><tr><th>Learner</th><th>Subject</th><th>Hours</th><th>Grade · school</th><th>Contacts</th><th>Login</th></tr></thead><tbody>' + allocs.slice(0, 200).map((a) => '<tr><td class="name">' + esc(a.learner_name) + '</td><td class="left">' + esc(groupName(a.subject)) + '</td><td>' + (a.hours ? hrs(a.hours) : '–') + '</td><td class="left">' + esc([a.grade ? 'Gr ' + a.grade : '', a.school].filter(Boolean).join(' · ')) + '</td><td class="left small">' + esc([a.learner_phone, a.guardian_phone && 'parent ' + a.guardian_phone, a.email].filter(Boolean).join(' · ')) + '</td><td class="left">' + (a.match ? pill('good', 'Has one') : a.nameMatch && /@/.test(a.nameMatch) ? '<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-keep data-action="al-link" data-k="' + esc(a.nameKey) + '"' + (a.learner_id ? ' checked' : '') + '> Same name as ' + esc(a.nameMatch) + ' – it’s them</label>' : a.nameMatch ? '<span class="small muted">' + esc(a.nameMatch) + ' with this name – add their e-mail to the sheet to link</span>' : '–') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="grid cols-3"><div class="field"><label for="al-sponsor">Who pays for these learners</label><select id="al-sponsor"><option value="">The learners themselves</option>' + (state.sponsors || []).map((s) => '<option value="' + s.id + '"' + (imp.sponsor === s.id || (!imp.sponsor && /saili/i.test(imp.file) && /saili/i.test(s.name)) ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div><div class="field"><label for="al-batch">Name for this sheet</label><input id="al-batch" value="' + esc(imp.batch) + '"></div>' +
      '<div class="field"><label for="al-def">Subject when the sheet has none</label><select id="al-def" data-action="al-defsubj">' + GROUPS.map(([k, l]) => '<option value="' + k + '"' + ((imp.defSubj || 'maths') === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div>' +
      '<div class="row"><button class="btn primary" data-action="al-import"' + (allocs.length ? '' : ' disabled') + '>' + ICON.check + 'Save ' + allocs.length + ' to assign</button></div></div>';
  }
  ADV.actions['al-stat'] = (a) => { state.aStat = a.dataset.id; ADV.render(); };
  ADV.actions['al-cancel'] = () => { state.allocImport = null; ADV.render(); };
  ADV.actions['al-sent-done'] = () => { state.allocSent = null; ADV.render(); };
  ADV.actions['al-import'] = async (a) => {
    const imp = state.allocImport; if (!imp || !imp.allocs || !imp.allocs.length) return;
    const sponsor = val('al-sponsor') || null; const batch = val('al-batch').trim();
    const rows = imp.allocs.map((x) => ({ batch, sponsor_id: sponsor, learner_name: x.learner_name, school: x.school, grade: x.grade, subject: x.subject, hours: Math.min(500, x.hours || 0), learner_phone: x.learner_phone, guardian_phone: x.guardian_phone, email: x.email, note: x.note, learner_id: x.learner_id }));
    a.disabled = true;
    try { await sb.insert('allocations', rows); state.allocImport = null; state.aStat = 'new'; await loadOps(); ADV.render(); toast(rows.length + ' learner–subject rows saved – assign them to tutors below', 6000); }
    catch (err) { a.disabled = false; toast(ADV.errMsg(err), 6000); }
  };
  async function assignOne(id, tutorId) {
    const al = (state.allocs || []).find((x) => x.id === id);
    const msg = await sb.rpc('assign_allocation', { p_alloc: id, p_tutor: tutorId });
    try { await sb.fn('notify', { event: 'message', learner_id: tutorId }); } catch (e) { /* the message is in the portal anyway */ }
    return { tutor: tutorId, msg: String(msg || ''), name: al ? al.learner_name : '' };
  }
  ADV.actions['al-assign'] = async (a) => {
    const tid = val('alt-' + a.dataset.id); if (!tid) return toast('Choose the tutor');
    a.disabled = true;
    try { const r = await assignOne(a.dataset.id, tid); state.allocSent = [r]; await Promise.all([loadOps(), ADV.loadAssign ? ADV.loadAssign() : null]); ADV.render(); window.scrollTo({ top: 0 }); }
    catch (err) { a.disabled = false; toast(ADV.errMsg(err), 6000); }
  };
  ADV.actions['al-assign-all'] = async (a) => {
    const open = (state.allocs || []).filter((x) => x.status === 'new' && (!state.aSubj || x.subject === state.aSubj)); const extra = {}; const plan = [];
    open.forEach((al) => { const sel = val('alt-' + al.id); const t = sel ? profileOf(sel) : suggest(al, extra); if (t) { plan.push([al, t]); extra[t.id] = (extra[t.id] || 0) + 1; } });
    if (!plan.length) return toast('No tutor teaches these subjects yet – add tutors first', 5000);
    const skipped = open.length - plan.length;
    if (!confirm('Assign ' + plan.length + ' learner' + (plan.length === 1 ? '' : 's') + ' and message the tutors?\n\n' + plan.slice(0, 12).map(([al, t]) => al.learner_name + ' (' + groupName(al.subject) + ') → ' + t.full_name).join('\n') + (plan.length > 12 ? '\n…' : '') + (skipped ? '\n\n' + skipped + ' without a suitable tutor stay open.' : ''))) return;
    a.disabled = true; const sent = [];
    for (const [al, t] of plan) { try { sent.push(await assignOne(al.id, t.id)); } catch (err) { toast(al.learner_name + ': ' + ADV.errMsg(err), 5000); } }
    state.allocSent = sent; await Promise.all([loadOps(), ADV.loadAssign ? ADV.loadAssign() : null]); ADV.render(); window.scrollTo({ top: 0 });
  };
  ADV.actions['al-set'] = async (a) => { try { await sb.update('allocations', { id: 'eq.' + a.dataset.id }, { status: a.dataset.v }); await loadOps(); ADV.render(); } catch (err) { toast(ADV.errMsg(err)); } };
  ADV.actions['al-del'] = async (a) => { const al = (state.allocs || []).find((x) => x.id === a.dataset.id); if (!confirm('Remove ' + al.learner_name + ' (' + groupName(al.subject) + ') from the list?')) return; try { await sb.remove('allocations', { id: 'eq.' + al.id }); await loadOps(); ADV.render(); } catch (err) { toast(ADV.errMsg(err)); } };

  /* ================================================================ tutor pay (director) */
  function payData(mk) {
    const rows = (state.bookings || []).filter((b) => b.tutor_id && delivered(b) && monthKey(b.starts_at) === mk);
    const months = (state.tutorMonths || []).filter((m) => m.month === mk);
    const ids = Array.from(new Set(rows.map((b) => b.tutor_id).concat(months.map((m) => m.tutor_id))));
    return ids.map((id) => { const t = profileOf(id) || { id, full_name: 'Tutor' }; const list = rows.filter((b) => b.tutor_id === id); const h = list.reduce((n, b) => n + lessonH(b), 0); const rate = Number(t.tutor_rate) || 0; const m = months.find((x) => x.tutor_id === id) || null; const bank = (state.tutorBank || {})[id] || null;
      return { t, n: list.length, h, rate, amount: Math.round(h * rate * 100) / 100, m, bank, bankOk: !!(bank && bank.account_number && bank.branch_code && bank.account_holder) }; }).filter((x) => x.n || x.m).sort((a, b) => String(a.t.full_name).localeCompare(String(b.t.full_name)));
  }
  const refClean = (s) => String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  const payRef = (mk) => refClean('ADV TUTOR ' + new Intl.DateTimeFormat('en-ZA', { month: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(mk + '-15T12:00:00+02:00')) + mk.slice(2, 4));
  function payView() {
    const months = lastMonths(6); const mk = state.tpMonth || months[1] || months[0]; const data = payData(mk);
    const tot = data.reduce((n, x) => n + x.amount, 0); const unpaid = data.filter((x) => !(x.m && x.m.paid) && x.amount > 0);
    const inv = (x) => (x.m && x.m.invoice_path ? '<button class="chipbtn" data-action="tp-inv" data-id="' + x.m.id + '">' + ICON.ext + ' Invoice' + (x.m.invoice_amount != null ? ' ' + fmt.rand(x.m.invoice_amount) : '') + '</button>' + (x.m.invoice_amount != null && Math.abs(Number(x.m.invoice_amount) - x.amount) > 1 ? ' ' + pill('warn', 'Differs') : '') : x.m && x.m.use_statement ? pill('good', 'Statement accepted') : pill('warn', 'No invoice yet'));
    return '<div class="stack"><div class="row" style="justify-content:space-between"><div><p class="small muted">Every lesson a tutor marked as delivered, at their hourly rate. Tutors save their bank details and send their invoice in their own portal (My pay).</p></div><select id="tp-month" aria-label="Month">' + months.map((k) => '<option value="' + k + '"' + (k === mk ? ' selected' : '') + '>' + esc(monthName(k)) + '</option>').join('') + '</select></div>' +
      '<div class="table-wrap card"><table class="an-table"><thead><tr><th>Tutor</th><th>Lessons</th><th>Hours</th><th>Rate</th><th>To pay</th><th>Invoice</th><th>Bank details</th><th>Paid</th></tr></thead><tbody>' +
      (data.length ? data.map((x) => '<tr><td class="name">' + esc(x.t.full_name || x.t.email) + '</td><td>' + x.n + '</td><td>' + hrs(x.h) + '</td><td>' + fmt.rand(x.rate) + '</td><td><b>' + fmt.rand(x.amount) + '</b></td><td class="left">' + inv(x) + '</td><td class="left">' + (x.bankOk ? pill('good', esc(x.bank.bank || 'Saved')) : pill('bad', 'Missing')) + '</td><td class="left">' + (x.m && x.m.paid ? pill('good', 'Paid ' + fmt.rand(x.m.paid_amount != null ? x.m.paid_amount : x.amount) + (x.m.paid_at ? ' · ' + fmt.date(x.m.paid_at) : '')) + ' <button class="chipbtn" data-action="tp-paid" data-id="' + x.t.id + '" data-v="0">Undo</button>' : x.amount > 0 ? '<button class="chipbtn" data-action="tp-paid" data-id="' + x.t.id + '" data-v="1">Mark paid</button>' : '') + '</td></tr>').join('') +
        '<tr><td class="name">Total</td><td></td><td></td><td></td><td><b>' + fmt.rand(tot) + '</b></td><td></td><td></td><td></td></tr>' : '<tr><td colspan="8" class="muted left">No delivered tutor lessons in ' + esc(monthName(mk)) + '.</td></tr>') + '</tbody></table></div>' +
      (unpaid.length ? '<div class="card stack"><h3>Payment list · ' + esc(monthName(mk)) + '</h3><p class="small muted">' + unpaid.filter((x) => x.bankOk).length + ' tutor' + (unpaid.filter((x) => x.bankOk).length === 1 ? '' : 's') + ' ready to pay, ' + fmt.rand(unpaid.filter((x) => x.bankOk).reduce((n, x) => n + x.amount, 0)) + ' in total. References use only letters and numbers (' + esc(payRef(mk)) + '), as banks require.' +
        (unpaid.some((x) => !x.bankOk) ? ' <b>Left out until they save bank details:</b> ' + esc(unpaid.filter((x) => !x.bankOk).map((x) => x.t.full_name).join(', ')) + '.' : '') + '</p>' +
        '<div class="row"><button class="btn primary" data-action="tp-csv">' + ICON.money + 'Download payment list (CSV)</button><button class="btn" data-action="tp-print">Print payment list</button><button class="btn ghost" data-action="tp-paid-all">Mark all as paid</button></div>' +
        '<p class="small muted">In Capitec Business, add the tutors as beneficiaries once (the list has their bank, branch code and account number) and pay them together as a batch. Upload the CSV to the bank as it is: opening and saving it in Excel drops the leading 0 of branch codes such as 051001. If Capitec Business has its own upload template, the list can be changed to match that layout.</p></div>' : '') + '</div>';
  }
  function payRows(mk) { return payData(mk).filter((x) => !(x.m && x.m.paid) && x.amount > 0 && x.bankOk); }
  ADV.actions['tp-csv'] = () => {
    const mk = state.tpMonth || lastMonths(6)[1]; const rows = payRows(mk); if (!rows.length) return toast('Nobody to pay with bank details saved');
    const head = ['Beneficiary name', 'Bank', 'Branch code', 'Account number', 'Account type', 'Amount', 'Your reference', 'Beneficiary reference'];
    const safe = (x) => { const v = String(x == null ? '' : x); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };   // no spreadsheet formulas from typed-in names
    const line = (r) => r.map((x) => '"' + safe(x).replace(/"/g, '""') + '"').join(',');
    const text = [line(head)].concat(rows.map((x) => line([x.bank.account_holder, x.bank.bank, x.bank.branch_code, x.bank.account_number, x.bank.account_type, x.amount.toFixed(2), refClean(firstName(x.t.full_name) + ' ' + payRef(mk)), refClean('ADVENTUITY ' + payRef(mk).replace('ADV TUTOR ', ''))]))).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = 'adventuity-tutor-payments-' + mk + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
  ADV.actions['tp-print'] = () => {
    const mk = state.tpMonth || lastMonths(6)[1]; const rows = payRows(mk); const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups for this site', 5000);
    const tot = rows.reduce((n, x) => n + x.amount, 0);
    w.document.open(); w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Tutor payments – ' + esc(monthName(mk)) + '</title><style>body{font:11pt Helvetica,Arial,sans-serif;margin:24px;color:#111}h1{font-size:16pt;color:#1c3246}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#1c3246;color:#fff}td.r,th.r{text-align:right}.bar{margin-bottom:12px}@media print{.bar{display:none}}</style></head><body><div class="bar"><button id="pp">Print</button></div><h1>Adventuity tutor payments · ' + esc(monthName(mk)) + '</h1><table><thead><tr><th>Tutor</th><th>Bank</th><th>Branch</th><th>Account</th><th>Type</th><th class="r">Hours</th><th class="r">Amount</th><th>Reference</th></tr></thead><tbody>' +
      rows.map((x) => '<tr><td>' + esc(x.bank.account_holder) + '</td><td>' + esc(x.bank.bank) + '</td><td>' + esc(x.bank.branch_code) + '</td><td>' + esc(x.bank.account_number) + '</td><td>' + esc(x.bank.account_type) + '</td><td class="r">' + esc(hrs(x.h)) + '</td><td class="r">' + esc(fmt.rand(x.amount)) + '</td><td>' + esc(refClean(firstName(x.t.full_name) + ' ' + payRef(mk))) + '</td></tr>').join('') + '<tr><td colspan="6"><b>Total</b></td><td class="r"><b>' + esc(fmt.rand(tot)) + '</b></td><td></td></tr></tbody></table></body></html>');
    w.document.close(); const b = w.document.getElementById('pp'); if (b) b.addEventListener('click', () => w.print());
  };
  async function setPaid(tid, mk, paid, amount) {
    const m = (state.tutorMonths || []).find((x) => x.tutor_id === tid && x.month === mk);
    if (m) await sb.update('tutor_months', { id: 'eq.' + m.id }, { paid, paid_amount: paid ? amount : null });
    else await sb.insert('tutor_months', [{ tutor_id: tid, month: mk, paid, paid_amount: paid ? amount : null }]);
  }
  ADV.actions['tp-paid'] = async (a) => {
    const mk = state.tpMonth || lastMonths(6)[1]; const x = payData(mk).find((r) => r.t.id === a.dataset.id); if (!x) return;
    try { await setPaid(x.t.id, mk, a.dataset.v === '1', x.amount); await loadOps(); ADV.render(); toast(a.dataset.v === '1' ? 'Marked paid' : 'Marked unpaid'); } catch (err) { toast(ADV.errMsg(err)); }
  };
  ADV.actions['tp-paid-all'] = async () => {
    const mk = state.tpMonth || lastMonths(6)[1]; const rows = payRows(mk); if (!rows.length) return;
    if (!confirm('Mark ' + rows.length + ' tutor payment' + (rows.length === 1 ? '' : 's') + ' (' + fmt.rand(rows.reduce((n, x) => n + x.amount, 0)) + ') as paid? Do this after the bank has made the payments.')) return;
    for (const x of rows) { try { await setPaid(x.t.id, mk, true, x.amount); } catch (err) { toast(ADV.errMsg(err)); } }
    await loadOps(); ADV.render(); toast('Marked paid');
  };
  ADV.actions['tp-inv'] = async (a) => { const m = (state.tutorMonths || []).find((x) => x.id === a.dataset.id); const w = window.open('', '_blank'); try { const u = await sb.signedUrl('tutor-invoices', m.invoice_path, 600); if (w) w.location = u; else location.href = u; } catch (err) { if (w) w.close(); toast(ADV.errMsg(err)); } };

  /* ================================================================ tutors: new learners to contact */
  ADV.loadMyAllocs = async () => { try { state.myAllocs = await sb.select('allocations', { status: 'eq.assigned', order: 'assigned_at.asc' }); } catch (e) { state.myAllocs = []; } };
  ADV.loadMyPay = async () => {
    try { const r = await sb.select('tutor_bank', { tutor_id: 'eq.' + sb.user.id }); state.myBank = r[0] || null; } catch (e) { state.myBank = null; }
    try { state.myMonths = await sb.select('tutor_months', { tutor_id: 'eq.' + sb.user.id }); } catch (e) { state.myMonths = []; }
  };
  const prevTutorInit = ADV.tutorInit;
  ADV.tutorInit = async function () { await Promise.all([prevTutorInit ? prevTutorInit() : null, ADV.loadMyAllocs(), ADV.loadMyPay()]); };
  ADV.newLearnersCard = function (compact) {
    const list = state.myAllocs || []; if (!list.length) return '';
    if (compact) return '<div class="card callout-warn row" style="justify-content:space-between"><div><b>' + list.length + ' new learner' + (list.length === 1 ? '' : 's') + ' to contact</b><p class="small muted">From the director – arrange the lesson times with them.</p></div><button class="btn primary" data-go="tab" data-id="tlearners">Open</button></div>';
    const me = state.profile.full_name || 'your tutor';
    return '<h2>New learners to contact</h2><p class="small muted" style="margin-top:-6px">The director allocated these learners to you. Contact them within 2 days, agree the lesson times, then set up their login and schedule the lessons.</p>' + list.map((al) => {
      const hi = 'Hi ' + (firstName(al.learner_name) || 'there') + ', this is ' + me + ' from Adventuity. I will be your ' + groupName(al.subject) + ' tutor' + (Number(al.hours) ? ' for ' + String(al.hours).replace('.', ',') + ' hours of online lessons' : '') + '. Which days and times suit you for the lessons? Please also send me your e-mail address so I can set up your login.';
      const hp = 'Hello, this is ' + me + ' from Adventuity. I will be ' + (firstName(al.learner_name) || 'your child') + '\'s ' + groupName(al.subject) + ' tutor' + (Number(al.hours) ? ' for ' + String(al.hours).replace('.', ',') + ' hours of online lessons' : '') + '. Which days and times suit for the lessons?';
      return '<div class="card"><div class="row" style="gap:6px">' + pill(al.subject, groupName(al.subject)) + (Number(al.hours) ? pill('', hrs(al.hours)) : '') + pill('warn', 'To contact') + '</div><h3 style="margin-top:6px">' + esc(al.learner_name) + '</h3><p class="small muted">' + esc([al.grade ? 'Grade ' + al.grade : '', al.school].filter(Boolean).join(' · ')) + '</p>' +
        '<p class="small" style="margin-top:4px">' + esc([al.learner_phone && 'Learner ' + al.learner_phone, al.guardian_phone && 'Parent ' + al.guardian_phone, al.email].filter(Boolean).join(' · ') || 'No contact details on the sheet – ask the director.') + '</p>' + (al.note ? '<p class="tutor-msg"><b>Note:</b> ' + esc(al.note) + '</p>' : '') +
        '<div class="row" style="margin-top:10px">' + (al.learner_phone ? '<a class="btn sm primary" href="' + esc(ADV.wa(al.learner_phone, hi)) + '" target="_blank" rel="noopener">WhatsApp ' + esc(firstName(al.learner_name)) + '</a>' : '') + (al.guardian_phone ? '<a class="btn sm" href="' + esc(ADV.wa(al.guardian_phone, hp)) + '" target="_blank" rel="noopener">WhatsApp the parent</a>' : '') +
        '<button class="btn sm" data-action="al-login" data-id="' + al.id + '">' + ICON.user + 'Set up login</button></div></div>';
    }).join('');
  };
  ADV.actions['al-login'] = (a) => {
    const al = (state.myAllocs || []).find((x) => x.id === a.dataset.id); if (!al) return;
    state.taForm = { allocation_id: al.id, name: al.learner_name, email: al.email, phone: al.learner_phone, gphone: al.guardian_phone, school: al.school, grade: al.grade };
    state.tCreds = null; if (state.tab !== 'tlearners') ADV.go('tlearners'); else { ADV.render(); window.scrollTo({ top: 0 }); } const el = $('#ta-email'); if (el && !el.value) el.focus();
  };

  /* ================================================================ tutors: my pay */
  ADV.views.tpay = function () {
    const months = lastMonths(6); const mk = state.myPayMonth || months[0];
    const list = (state.bookings || []).filter((b) => delivered(b) && monthKey(b.starts_at) === mk).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const h = list.reduce((n, b) => n + lessonH(b), 0); const rate = Number(state.profile.tutor_rate) || 0; const amount = Math.round(h * rate * 100) / 100;
    const m = (state.myMonths || []).find((x) => x.month === mk); const bank = state.myBank || {};
    const status = m && m.paid ? pill('good', 'Paid ' + fmt.rand(m.paid_amount != null ? m.paid_amount : amount) + (m.paid_at ? ' on ' + fmt.date(m.paid_at) : '')) : m && (m.invoice_path || m.use_statement) ? pill('accent', 'Invoice sent ' + (m.submitted_at ? fmt.date(m.submitted_at) : '')) : pill('warn', 'No invoice sent yet');
    const bsel = '<select id="tb-bank">' + BANKS.map(([n]) => '<option' + (bank.bank === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + (bank.bank && !BANKS.some(([n]) => n === bank.bank) ? '<option selected>' + esc(bank.bank) + '</option>' : '') + '</select>';
    return '<div class="stack"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="eyebrow">My pay</span><h1>My pay</h1><p class="small muted">Lessons you marked as delivered, at ' + fmt.rand(rate) + ' per hour. Send your invoice here after each month.</p></div><select id="mp-month" aria-label="Month">' + months.map((k) => '<option value="' + k + '"' + (k === mk ? ' selected' : '') + '>' + esc(monthName(k)) + '</option>').join('') + '</select></div>' +
      '<div class="grid cols-3"><div class="cd"><span class="eyebrow">Lessons delivered</span><div class="big">' + list.length + '</div></div><div class="cd"><span class="eyebrow">Hours</span><div class="big">' + esc(hrs(h)) + '</div></div><div class="cd"><span class="eyebrow">Amount</span><div class="big">' + fmt.rand(amount) + '</div>' + status + '</div></div>' +
      '<div class="card"><h3>Statement · ' + esc(monthName(mk)) + '</h3><div class="table-wrap" style="margin-top:8px"><table class="an-table"><thead><tr><th>Date</th><th>Learner</th><th>Subject</th><th>Time</th><th>Hours</th><th>Amount</th></tr></thead><tbody>' +
      (list.length ? list.map((b) => '<tr><td class="left">' + esc(fmt.date(b.starts_at)) + '</td><td class="left">' + esc(b.learner_name || 'Learner') + '</td><td class="left">' + esc(SUBJ[b.subject] ? SUBJ[b.subject].short : b.subject) + '</td><td class="left">' + esc(fmt.time(b.starts_at) + '–' + fmt.time(b.ends_at)) + '</td><td>' + esc(hrs(lessonH(b))) + '</td><td>' + fmt.rand(lessonH(b) * rate) + '</td></tr>').join('') + '<tr><td class="name" colspan="4">Total</td><td>' + esc(hrs(h)) + '</td><td><b>' + fmt.rand(amount) + '</b></td></tr>' : '<tr><td colspan="6" class="left muted">No delivered lessons in this month. Mark lessons as delivered under My lessons.</td></tr>') + '</tbody></table></div></div>' +
      (m && m.paid ? '' : '<div class="card stack"><div><h3>Send your invoice</h3><p class="small muted">Upload your own invoice (PDF or photo), or use this statement as your invoice. You can replace it until the director has paid.</p></div>' +
        (m && m.invoice_path ? '<p class="small">' + ICON.check + ' Sent: <b>' + esc(m.invoice_name || 'invoice') + '</b>' + (m.invoice_amount != null ? ' · ' + fmt.rand(m.invoice_amount) : '') + '</p>' : m && m.use_statement ? '<p class="small">' + ICON.check + ' You accepted the statement (' + fmt.rand(amount) + ') as your invoice.</p>' : '') +
        '<div class="grid cols-3"><div class="field"><label for="mp-amt">Amount on your invoice (R)</label><input id="mp-amt" type="number" min="0" step="0.01" value="' + esc(m && m.invoice_amount != null ? m.invoice_amount : amount ? amount.toFixed(2) : '') + '"></div></div>' +
        '<div class="row"><label class="btn primary file-btn">' + ICON.plus + (m && m.invoice_path ? 'Replace my invoice' : 'Upload my invoice') + '<input type="file" accept="application/pdf,image/*" data-action="mp-upload" data-m="' + mk + '" hidden></label>' + (amount > 0 ? '<button class="btn" data-action="mp-statement" data-m="' + mk + '">Use the statement as my invoice</button>' : '') + '</div></div>') +
      '<form id="f-tbank" class="card stack"><div><h3>Bank details for payment</h3><p class="small muted">Only you and the director can see these.</p></div><div class="grid cols-2">' +
      '<div class="field"><label for="tb-bank">Bank</label>' + bsel + '</div><div class="field"><label for="tb-branch">Branch code</label><input id="tb-branch" inputmode="numeric" value="' + esc(bank.branch_code || '') + '" placeholder="Filled in for the bank you choose"></div>' +
      '<div class="field"><label for="tb-holder">Account holder</label><input id="tb-holder" value="' + esc(bank.account_holder || state.profile.full_name || '') + '"></div><div class="field"><label for="tb-number">Account number</label><input id="tb-number" inputmode="numeric" value="' + esc(bank.account_number || '') + '"></div>' +
      '<div class="field"><label for="tb-type">Account type</label><select id="tb-type">' + [['savings', 'Savings'], ['current', 'Current / cheque'], ['transmission', 'Transmission']].map(([k, l]) => '<option value="' + k + '"' + (bank.account_type === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div>' +
      '<div class="row"><button class="btn primary" type="submit">Save bank details</button>' + (bank.account_number ? pill('good', 'Saved') : pill('warn', 'Needed to pay you')) + '</div></form></div>';
  };
  async function submitMonth(mk, patch) {
    const m = (state.myMonths || []).find((x) => x.month === mk);
    if (m) await sb.update('tutor_months', { id: 'eq.' + m.id }, patch); else await sb.insert('tutor_months', [Object.assign({ tutor_id: sb.user.id, month: mk }, patch)]);
    try {   // tell the director in the portal
      await sb.insert('messages', [{ learner_id: sb.user.id, sender: sb.user.id, body: 'I sent my invoice for ' + monthName(mk) + (patch.invoice_amount != null ? ' (' + fmt.rand(patch.invoice_amount) + ')' : '') + ' – see Tutors → Tutor pay.' }]);
      await sb.fn('notify', { event: 'message', learner_id: sb.user.id });
    } catch (e) { /* the invoice is saved anyway */ }
    await ADV.loadMyPay(); ADV.render();
  }
  ADV.actions['mp-statement'] = async (a) => { try { await submitMonth(a.dataset.m, { use_statement: true, invoice_amount: Number(val('mp-amt')) || null }); toast('Sent – the statement is your invoice'); } catch (err) { toast(ADV.errMsg(err)); } };
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.action === 'mp-upload' && t.files && t.files[0]) {
      const f = t.files[0]; if (f.size > 5 * 1024 * 1024) return toast('Use a file smaller than 5 MB');
      const ext = (f.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, ''); const path = sb.user.id + '/' + t.dataset.m + '-' + Date.now() + '.' + ext;
      try { toast('Uploading…'); await sb.upload('tutor-invoices', path, f); await submitMonth(t.dataset.m, { invoice_path: path, invoice_name: f.name.slice(0, 120), invoice_amount: Number(val('mp-amt')) || null, use_statement: false }); toast('Invoice sent to the director'); } catch (err) { toast(ADV.errMsg(err)); }
    }
    if (t.id === 'mp-month') { state.myPayMonth = t.value; ADV.render(); }
    if (t.id === 'tp-month') { state.tpMonth = t.value; ADV.render(); }
    if (t.id === 'tb-bank') { const b = BANKS.find(([n]) => n === t.value); const br = $('#tb-branch'); if (b && br && b[1]) br.value = b[1]; }
    if (t.dataset && t.dataset.action === 'al-file' && t.files && t.files[0]) {
      const f = t.files[0];
      try {
        const rows = /\.csv$/i.test(f.name) ? readCsv(await f.text()) : await readXlsx(await f.arrayBuffer());
        if (!rows.length) throw new Error('The sheet is empty.');
        // the header row: the one (of the first 15) whose cells look most like column names
        const score = (r) => r.filter((c) => String(c).trim() && String(c).length < 40 && FIELDS.some(([, , re]) => re.test(String(c).trim()))).length;
        let hi = 0, best = -1; rows.slice(0, 15).forEach((r, i) => { const sc = score(r); if (sc > best) { best = sc; hi = i; } });
        state.allocImport = { file: f.name, rows, hi, map: autoMap(rows[hi].map(String)), batch: f.name.replace(/\.(xlsx|csv)$/i, '') + ' · ' + fmt.date(now()), defSubj: 'maths' }; ADV.render();
      } catch (err) { toast(ADV.errMsg(err), 6000); }
      t.value = '';
    }
    if (t.dataset && t.dataset.action === 'al-map' && state.allocImport) { state.allocImport.map[t.dataset.k] = t.value === '' ? '' : Number(t.value); ADV.render(); }
    if (t.dataset && t.dataset.action === 'al-hi' && state.allocImport) { const imp = state.allocImport; imp.hi = Number(t.value); imp.map = autoMap((imp.rows[imp.hi] || []).map(String)); ADV.render(); }
    if (t.dataset && t.dataset.action === 'al-defsubj' && state.allocImport) { state.allocImport.defSubj = t.value; ADV.render(); }
    if (t.dataset && t.dataset.action === 'al-link' && state.allocImport) { const imp = state.allocImport; imp.link = imp.link || {}; imp.link[t.dataset.k] = t.checked; ADV.render(); }
  });
  const prevSubmit = ADV.onSubmit;
  ADV.onSubmit = async function (e) {
    if (prevSubmit) prevSubmit(e);
    if (e.target.id === 'f-contract') return saveContract(e);
    if (e.target.id === 'f-tbank') {
      e.preventDefault();
      const row = { tutor_id: sb.user.id, bank: val('tb-bank'), branch_code: val('tb-branch').replace(/\D/g, ''), account_holder: val('tb-holder').trim(), account_number: val('tb-number').replace(/\D/g, ''), account_type: val('tb-type'), updated_at: new Date().toISOString() };
      if (!row.account_number || !row.branch_code || !row.account_holder) return toast('Fill in the account holder, account number and branch code');
      try { await sb.upsert('tutor_bank', [row], 'tutor_id'); await ADV.loadMyPay(); ADV.render(); toast('Bank details saved'); } catch (err) { toast(ADV.errMsg(err)); }
    }
  };
})();
