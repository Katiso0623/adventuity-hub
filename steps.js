/* Adventuity step/memo layout: worked steps and marking memos laid out line by line.
   Step formats:  "plain string with \\( inline \\) maths"  (auto-split at ⇒)
                  { say: "what we do", calc: ["LaTeX line", "a &= b"], note: "small print", fig: {...} }   */
(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const comma = (m) => m.replace(/(\d),(\d)/g, '$1{,}$2');
  const mj = (s) => String(s == null ? '' : s).replace(/\\\((.*?)\\\)/g, (m, inner) => '\\(' + comma(inner) + '\\)');
  const T = (s) => esc(mj(s));

  /* split text on a separator but never inside \( ... \) */
  function splitOutsideMath(str, seps) {
    const out = []; let cur = ''; let i = 0; let inMath = false;
    while (i < str.length) {
      if (str.startsWith('\\(', i)) { inMath = true; cur += '\\('; i += 2; continue; }
      if (str.startsWith('\\)', i)) { inMath = false; cur += '\\)'; i += 2; continue; }
      if (!inMath) {
        const sep = seps.find((sp) => str.startsWith(sp, i));
        if (sep) { out.push({ text: cur, sep }); cur = ''; i += sep.length; continue; }
      }
      cur += str[i]; i++;
    }
    out.push({ text: cur, sep: null });
    return out;
  }
  const onlyMath = (s) => /^\s*\\\((?:(?!\\\)).)*\\\)\s*[.,;]?\s*$/.test(s);
  function piece(s, displayable) {
    const t = s.trim(); if (!t) return '';
    if (displayable && onlyMath(t) && /\\dfrac|\\frac|\\sqrt|\^|\\sum|\\lim/.test(t)) {
      const inner = t.replace(/^\s*\\\(/, '').replace(/\\\)\s*[.,;]?\s*$/, '');
      return '<div class="m-disp">' + esc('\\[' + comma(inner) + '\\]') + '</div>';
    }
    return '<div class="m-line">' + T(t) + '</div>';
  }
  function calcBlock(lines) {
    if (!lines || !lines.length) return '';
    const aligned = lines.some((l) => l.includes('&'));
    if (aligned) return '<div class="m-disp">' + esc('\\[\\begin{aligned}' + lines.map(comma).join('\\\\[4pt]') + '\\end{aligned}\\]') + '</div>';
    return lines.map((l) => '<div class="m-disp">' + esc('\\[' + comma(l) + '\\]') + '</div>').join('');
  }
  function renderStep(st, figRender) {
    if (st && typeof st === 'object') {
      return '<li class="st">' + (st.say ? '<div class="st-say">' + T(st.say) + '</div>' : '') + calcBlock(st.calc) + (st.note ? '<div class="st-note">' + T(st.note) + '</div>' : '') + (st.fig && figRender ? figRender(st.fig) : '') + '</li>';
    }
    const parts = splitOutsideMath(String(st), [' ⇒ ', ' ⇒', '⇒ ']);
    return '<li class="st">' + parts.map((p, k) => (k > 0 ? '<div class="m-then">⇒</div>' : '') + piece(p.text, true)).join('') + '</li>';
  }
  function renderSteps(steps, figRender) { return '<ol class="steps">' + (steps || []).map((s) => renderStep(s, figRender)).join('') + '</ol>'; }

  /* marking memo: "3.1  working ✓ ; more ✓ ⇒ answer ✓"  →  label | lines with ticks in a right column */
  function memoLine(line) {
    const str = String(line);
    const m = str.match(/^(\S{1,14})\s{2,}([\s\S]*)$/);
    const label = m ? m[1] : ''; const body = m ? m[2] : str;
    const parts = splitOutsideMath(body, [' ; ', ' ⇒ ']);
    const rows = parts.map((p, k) => {
      const ticks = (p.text.match(/✓/g) || []).length;
      const text = p.text.replace(/\s*✓\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!text && !ticks) return '';
      const lead = k > 0 && parts[k - 1].sep === ' ⇒ ' ? '<span class="m-arrow">⇒</span> ' : '';
      return '<div class="mm-row"><div class="mm-text">' + lead + T(text) + '</div><div class="mm-ticks" aria-label="' + ticks + ' marks">' + '✓'.repeat(ticks) + '</div></div>';
    }).join('');
    return '<li class="mm"><div class="mm-label">' + esc(label) + '</div><div class="mm-body">' + rows + '</div></li>';
  }
  function renderMemo(lines) { return '<ol class="memo-lines">' + (lines || []).map(memoLine).join('') + '</ol>'; }

  /* question text: sub-questions on their own lines, mark allocations right-aligned */
  function renderQuestion(q) {
    const parts = String(q).split(/\s{2,}/);
    return parts.map((p) => {
      const mk = p.match(/^(.*?)\s*\((\d{1,2})\)\s*$/);
      const num = p.match(/^(\d+(?:\.\d+){1,3})\s+([\s\S]*)$/);
      let body = mk ? mk[1] : p; let label = '';
      const nm = body.match(/^(\d+(?:\.\d+){1,3})\s+([\s\S]*)$/); if (nm) { label = nm[1]; body = nm[2]; }
      return '<div class="q-row' + (label ? ' q-sub' : ' q-stem') + '">' + (label ? '<span class="q-num">' + esc(label) + '</span>' : '') + '<span class="q-txt">' + T(body) + '</span>' + (mk ? '<span class="q-mk">(' + mk[2] + ')</span>' : '') + '</div>';
    }).join('');
  }
  root.ADV_STEPS = { renderSteps, renderMemo, renderQuestion, T, esc, mj };
})(typeof window !== 'undefined' ? window : globalThis);
