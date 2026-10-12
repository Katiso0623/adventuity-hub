 
(function () {
  'use strict';
  const CFG = window.FL_CONFIG || {}, SB = CFG.supabase || {}, ST = CFG.studio || {};
  const root = document.getElementById('fl-studio');
  const $ = s => root.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let sb = null;
  function view(inner) {
    root.innerHTML = `<div class="gate"><div class="gate-card"><div class="gate-brand"><b>${esc((CFG.brand || {}).short || 'Adventuity')}</b><span>Floodline Studio</span></div>${inner}</div></div>`;
  }
  function busy(msg) { view(`<p class="gate-msg" role="status">${esc(msg)}</p><div class="gate-bar"><i></i></div>`); }
  function fail(msg) { view(`<h1>Studio unavailable</h1><p class="gate-msg err" role="alert">${esc(msg)}</p><p class="gate-foot"><button class="gbtn" type="button" id="g-retry">Try again</button> <a href="index.html">Public website</a></p>`); $('#g-retry').addEventListener('click', boot); }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
  function fromB64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function login(msg) {
    view(`<h1>Sign in</h1><p>The flood line analysis Studio is for Adventuity administrators. Sign in with your Adventuity portal account.</p>
      <form id="g-form" novalidate><label for="g-email">E-mail</label><input id="g-email" type="email" autocomplete="username" required>
      <label for="g-pass">Password</label><input id="g-pass" type="password" autocomplete="current-password" required>
      <button class="gbtn" type="submit" id="g-go">Sign in</button><p class="gate-msg err" id="g-msg" role="alert">${esc(msg || '')}</p></form>
      <p class="gate-foot"><a href="index.html">Back to the public website</a> · <a href="#" id="g-reset">Forgot password</a></p>`);
    $('#g-form').addEventListener('submit', async e => {
      e.preventDefault(); const email = $('#g-email').value.trim(), password = $('#g-pass').value;
      if (!email || !password) { $('#g-msg').textContent = 'Enter your e-mail address and password.'; return; }
      $('#g-go').disabled = true; $('#g-msg').textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { $('#g-go').disabled = false; $('#g-msg').textContent = error.message === 'Invalid login credentials' ? 'The e-mail address or password is incorrect.' : error.message; return; }
      unlock().catch(err => fail(err.message || String(err)));
    });
    $('#g-reset').addEventListener('click', async e => {
      e.preventDefault(); const email = $('#g-email').value.trim();
      if (!email) { $('#g-msg').textContent = 'Enter your e-mail address first, then click “Forgot password”.'; return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
      $('#g-msg').textContent = error ? error.message : 'If that address has an account, a reset link has been sent.';
    });
  }
  async function unlock() {
    busy('Checking your access…');
    const { data, error } = await sb.from('floodline_private_assets').select('body').eq('name', 'studio-key').maybeSingle();
    if (error) throw new Error('Could not reach the Studio key: ' + error.message);
    if (!data) { await sb.auth.signOut(); login('This account is not a Floodline Studio administrator.'); return; }
    busy('Opening the Studio…');
    const res = await fetch(ST.bundle || 'js/studio.bundle.enc', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not download the Studio (HTTP ' + res.status + ').');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!window.DecompressionStream) throw new Error('This browser is too old for the Studio. Use a current version of Chrome, Edge, Firefox or Safari.');
    const key = await crypto.subtle.importKey('raw', fromB64(data.body), 'AES-GCM', false, ['decrypt']);
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)); }
    catch (e) { throw new Error('The Studio files were encrypted with a different key from the one in Supabase. Publish the matching key (README, “Updating the Studio”).'); }
    const code = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    window.FL_LAZY_STUDIO = true; window.FL_SB = sb;
    const s = document.createElement('script'); s.textContent = code + '\n//# sourceURL=floodline-studio.js'; document.head.appendChild(s);
    if (!window.FL || !window.FL.studio) throw new Error('The Studio did not start.');
    root.innerHTML = ''; window.FL.studio.start();
  }
  async function boot() {
    if (!SB.url || !SB.key) { fail('Supabase is not configured in config.js.'); return; }
    if (!window.crypto || !crypto.subtle) { fail('The Studio needs a secure (https) connection.'); return; }
    busy('Loading…');
    try {
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
      if (!sb) sb = window.supabase.createClient(SB.url, SB.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data: { session } } = await sb.auth.getSession();
      if (session) await unlock(); else login();
    } catch (err) { fail(err.message || String(err)); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
