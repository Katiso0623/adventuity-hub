/* Adventuity Floodline: download a quotation as a PDF (A4), built in the browser with jsPDF.
   Used by pricing.html (administrator) and pay.html (client).
   FLQuotePdf.download(q) where q = { ref, date, service, lines, optional, total, deposit, deposit_pct, balance, turnaround, valid_until,
     assumptions, exclusions, client: { name, company, email, phone }, site, purpose, invoice, link, bank: { bank, holder, number, branch, type },
     contact: { phone, email }, draft } */
(function () {
  'use strict';
  const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
  const NAVY = [28, 50, 70], RED = [196, 61, 48], MUTED = [96, 108, 120], RULE = [210, 216, 222];
  let lib = null, logo = null;

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF tool. Check your connection and try again.')); document.head.appendChild(s); }); }
  async function jsPDF() {
    if (!lib) { if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(JSPDF); lib = window.jspdf.jsPDF; }
    return lib;
  }
  async function loadLogo() {
    if (logo !== null) return logo;
    try {
      const r = await fetch(new URL('assets/icon-192.png', document.baseURI)); if (!r.ok) throw 0;
      const b = await r.blob();
      logo = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });
    } catch (_) { logo = ''; }
    return logo;
  }
  // jsPDF's standard fonts are Latin-1 only: replace the few characters our text uses that fall outside it.
  const clean = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ | /g, ' ').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');
  const R = v => 'R ' + Number(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fmtDate = d => { const t = d ? new Date(d) : new Date(); return isNaN(t) ? clean(d) : t.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }); };

  async function build(q) {
    const J = await jsPDF(), img = await loadLogo();
    const doc = new J({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, L = 18, Rx = W - 18, CW = Rx - L;
    let y = 0;
    const font = (size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || [20, 34, 49]); };
    const lineH = size => size * 0.42;
    function footer() {
      doc.setDrawColor.apply(doc, RULE); doc.line(L, H - 16, Rx, H - 16);
      font(8, 'normal', MUTED);
      const c = q.contact || {};
      doc.text(clean(['Adventuity (Pty) Ltd', c.email, c.phone, /adventuity\./.test(location.hostname) ? location.hostname : 'www.adventuity.co.za'].filter(Boolean).join('  |  ')), L, H - 11);
      doc.text('Page ' + doc.getCurrentPageInfo().pageNumber, Rx, H - 11, { align: 'right' });
    }
    function need(h) { if (y + h > H - 22) { footer(); doc.addPage(); y = 20; } }
    function para(text, size, style, color, indent) {
      font(size, style, color);
      const x = L + (indent || 0), lines = doc.splitTextToSize(clean(text), CW - (indent || 0));
      for (const ln of lines) { need(lineH(size) + 1); doc.text(ln, x, y); y += lineH(size) + 1; }
    }
    function heading(t) { need(12); y += 3; font(11, 'bold', NAVY); doc.text(clean(t).toUpperCase(), L, y); y += 2; doc.setDrawColor.apply(doc, RED); doc.setLineWidth(0.6); doc.line(L, y, L + 14, y); doc.setLineWidth(0.2); y += 5; }

    // header band
    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 34, 'F');
    if (img) { try { doc.addImage(img, 'PNG', L, 8, 18, 18); } catch (_) { /* logo optional */ } }
    font(20, 'bold', [255, 255, 255]); doc.text('Adventuity', L + (img ? 22 : 0), 17);
    font(10, 'normal', [200, 214, 226]); doc.text('Floodline  |  Adventuity (Pty) Ltd', L + (img ? 22 : 0), 23);
    font(22, 'bold', [255, 255, 255]); doc.text(q.draft ? 'DRAFT QUOTATION' : 'QUOTATION', Rx, 17, { align: 'right' });
    font(10, 'normal', [200, 214, 226]); doc.text(clean(q.ref || ''), Rx, 23, { align: 'right' });
    y = 44;

    // meta: client (left) and quotation details (right)
    const c = q.client || {};
    const left = [['Prepared for', [c.name, c.company, c.email, c.phone].filter(Boolean).join('\n')]];
    if (q.site) left.push(['Site', q.site]);
    if (q.purpose) left.push(['Purpose', q.purpose]);
    const right = [['Quotation', q.ref], ['Date', fmtDate(q.date)], ['Valid until', q.valid_until ? fmtDate(q.valid_until) : ''], ['Invoice (payment reference)', q.invoice || '']].filter(r => r[1]);
    const colW = CW / 2 - 6;
    function block(rows, x, w) {
      let yy = y;
      for (const [k, v] of rows) {
        font(8, 'bold', MUTED); doc.text(clean(k).toUpperCase(), x, yy); yy += 4.2;
        font(10.5, 'normal'); const ls = doc.splitTextToSize(clean(v), w); doc.text(ls, x, yy); yy += ls.length * 4.6 + 2.5;
      }
      return yy;
    }
    y = Math.max(block(left, L, colW), block(right, L + CW / 2 + 6, colW)) + 2;

    if (q.service) { font(14, 'bold', NAVY); const ls = doc.splitTextToSize(clean(q.service), CW); need(ls.length * 6 + 4); doc.text(ls, L, y); y += ls.length * 6 + 2; }

    // price table
    const amtW = 34, descW = CW - amtW - 4;
    need(12);
    doc.setFillColor(238, 242, 246); doc.rect(L, y - 4.5, CW, 7.5, 'F');
    font(9, 'bold', NAVY); doc.text('DESCRIPTION', L + 2, y); doc.text('AMOUNT', Rx - 2, y, { align: 'right' }); y += 6;
    for (const l of q.lines || []) {
      font(10.5, 'normal'); const ls = doc.splitTextToSize(clean(l.label), descW);
      const ns = l.note ? (font(8.5, 'normal', MUTED), doc.splitTextToSize(clean(l.note), descW)) : [];
      const h = ls.length * 4.6 + ns.length * 3.8 + 3.5;
      need(h);
      font(10.5, 'normal'); doc.text(ls, L + 2, y); doc.text(R(l.amount), Rx - 2, y, { align: 'right' });
      if (ns.length) { font(8.5, 'normal', MUTED); doc.text(ns, L + 2, y + ls.length * 4.6 - 0.6); }
      y += h - 1.5; doc.setDrawColor.apply(doc, RULE); doc.line(L, y - 2, Rx, y - 2); y += 2;
    }
    need(10);
    doc.setDrawColor.apply(doc, NAVY); doc.setLineWidth(0.5); doc.line(L, y - 2, Rx, y - 2); doc.setLineWidth(0.2); y += 3;
    font(12, 'bold', NAVY); doc.text('TOTAL', L + 2, y); doc.text(R(q.total), Rx - 2, y, { align: 'right' }); y += 4.5;
    font(8.5, 'normal', MUTED); doc.text('No VAT: Adventuity (Pty) Ltd is not registered for VAT.', L + 2, y); y += 6;
    for (const o of q.optional || []) { need(6); font(9.5, 'italic', MUTED); const ls = doc.splitTextToSize(clean('Optional: ' + o.label), descW); doc.text(ls, L + 2, y); doc.text(R(o.amount), Rx - 2, y, { align: 'right' }); y += ls.length * 4.3 + 1.5; }

    // payment
    heading('Payment and turnaround');
    if (q.deposit_pct >= 100) para(`Payable in full to start: ${R(q.deposit)}.`, 10.5, 'bold');
    else { para(`Deposit to start (${q.deposit_pct}%): ${R(q.deposit)}.`, 10.5, 'bold'); para(`Balance of ${R(q.balance != null ? q.balance : q.total - q.deposit)} is due when the final report is delivered.`, 10.5); }
    if (q.turnaround) para(`Turnaround: ${q.turnaround}.`, 10.5);
    if (q.link) { y += 1; para('Pay online by card:', 10, 'bold'); font(9, 'normal', [44, 110, 160]); const ls = doc.splitTextToSize(q.link, CW); need(ls.length * 4); doc.textWithLink(ls[0], L, y, { url: q.link }); y += 4; for (const s of ls.slice(1)) { doc.text(s, L, y); y += 4; } }
    const b = q.bank || {};
    const bankRows = [['Bank', b.bank], ['Account holder', b.holder], ['Account number', b.number], ['Branch code', b.branch], ['Account type', b.type]].filter(r => r[1]);
    if (bankRows.length) {
      y += 2; para('Or pay by EFT:', 10, 'bold');
      for (const [k, v] of bankRows.concat(q.invoice ? [['Reference', q.invoice]] : [])) { need(5); font(9.5, 'normal', MUTED); doc.text(clean(k), L + 2, y); font(9.5, 'bold'); doc.text(clean(v), L + 40, y); y += 4.6; }
    } else if (q.invoice) para(`Or pay by EFT using ${q.invoice} as the reference (banking details are on the payment page).`, 10);

    if (q.assumptions && q.assumptions.length) { heading('Based on the details you gave us'); for (const a of q.assumptions) para('-  ' + a, 9.5, 'normal', null, 2); }
    if (q.exclusions && q.exclusions.length) { heading('Not included'); for (const e of q.exclusions) para('-  ' + e, 9.5, 'normal', null, 2); }
    heading('Terms');
    para(`This quotation is valid${q.valid_until ? ' until ' + fmtDate(q.valid_until) : ''}. It is based on the details you supplied; if the site or the scope turns out to be materially different, we will confirm a revised price before any work starts. Work starts once the ${q.deposit_pct >= 100 ? 'payment' : 'deposit'} reflects. Reports are certified by a registered professional engineer where the service includes certification.`, 9.5, 'normal', MUTED);
    const ct = q.contact || {};
    if (ct.phone || ct.email) { y += 2; para(`Questions? ${[ct.email ? 'E-mail ' + ct.email : '', ct.phone ? 'call or WhatsApp ' + ct.phone : ''].filter(Boolean).join(' or ')}.`, 9.5); }
    footer();
    return doc;
  }

  async function download(q) {
    const doc = await build(q);
    doc.save(clean('Adventuity-quotation-' + (q.ref || 'draft') + (q.draft ? '-draft' : '') + '.pdf').replace(/[^\w.-]+/g, '-'));
  }
  window.FLQuotePdf = { download, build };
})();
