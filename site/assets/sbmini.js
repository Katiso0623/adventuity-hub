/* Minimal Supabase client (auth, REST, RPC, functions, storage) – no external library. */
(function (root) {
  'use strict';
  root.SBMini = function (URL, KEY) {
    const LS = 'adv_sb_session';
    let session = null; try { session = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { session = null; }
    const listeners = [];
    const persist = () => { try { if (session) localStorage.setItem(LS, JSON.stringify(session)); else localStorage.removeItem(LS); } catch (e) { /* storage blocked */ } listeners.forEach((f) => { try { f(session); } catch (e) { /* ignore */ } }); };
    const setSession = (d) => { session = d ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user } : null; persist(); };
    class SBError extends Error { constructor(msg, status, body) { super(msg); this.status = status; this.body = body; } }
    async function parse(r) {
      const txt = await r.text(); let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = txt; }
      if (!r.ok) { const msg = (body && (body.msg || body.message || body.error_description || body.error)) || ('Request failed (' + r.status + ')'); throw new SBError(typeof msg === 'string' ? msg : JSON.stringify(msg), r.status, body); }
      return body;
    }
    let refreshing = null;
    async function refresh() {
      if (!session || !session.refresh_token) return null;
      if (!refreshing) refreshing = (async () => {
        try {
          const r = await fetch(URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
          if (r.status === 400 || r.status === 401) { setSession(null); return null; }
          setSession(await parse(r)); return session;
        } finally { refreshing = null; }
      })();
      return refreshing;
    }
    async function token() {
      if (session && session.expires_at - 60 < Date.now() / 1000) { try { await refresh(); } catch (e) { /* offline: keep old token */ } }
      return session ? session.access_token : null;
    }
    async function call(path, opts, retry) {
      opts = opts || {};
      const tk = await token();   // signed out: send only the apikey (publishable keys are not JWTs)
      const headers = Object.assign({ apikey: KEY }, tk ? { Authorization: 'Bearer ' + tk } : {}, opts.headers || {});
      if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
      const r = await fetch(URL + path, { method: opts.method || 'GET', headers, body: opts.body });
      if (r.status === 401 && !retry && session) { await refresh(); return call(path, opts, true); }
      return parse(r);
    }
    const qs = (o) => Object.keys(o || {}).filter((k) => o[k] !== undefined && o[k] !== null).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
    return {
      SBError,
      get session() { return session; },
      get user() { return session && session.user; },
      onAuth(f) { listeners.push(f); },
      auth: {
        async signIn(email, password) { const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); setSession(await parse(r)); return session; },
        async signOut() { try { if (session) await fetch(URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token } }); } catch (e) { /* offline */ } setSession(null); },
        async updatePassword(password) { return call('/auth/v1/user', { method: 'PUT', json: { password } }); },
        refresh
      },
      /* table helpers – q is an object of PostgREST query params, e.g. { select: '*', status: 'eq.pending', order: 'starts_at.asc' } */
      select(table, q) { return call('/rest/v1/' + table + '?' + qs(Object.assign({ select: '*' }, q))); },
      insert(table, rows, q) { return call('/rest/v1/' + table + (q ? '?' + qs(q) : ''), { method: 'POST', json: rows, headers: { Prefer: 'return=representation' } }); },
      upsert(table, rows, onConflict) { return call('/rest/v1/' + table + (onConflict ? '?on_conflict=' + onConflict : ''), { method: 'POST', json: rows, headers: { Prefer: 'return=representation,resolution=merge-duplicates' } }); },
      update(table, q, patch) { return call('/rest/v1/' + table + '?' + qs(q), { method: 'PATCH', json: patch, headers: { Prefer: 'return=representation' } }); },
      remove(table, q) { return call('/rest/v1/' + table + '?' + qs(q), { method: 'DELETE' }); },
      rpc(fn, args) { return call('/rest/v1/rpc/' + fn, { method: 'POST', json: args || {} }); },
      fn(name, body) { return call('/functions/v1/' + name, { method: 'POST', json: body || {} }); },
      async upload(bucket, path, file) { return call('/storage/v1/object/' + bucket + '/' + path, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); },
      async signedUrl(bucket, path, seconds) { const r = await call('/storage/v1/object/sign/' + bucket + '/' + path, { method: 'POST', json: { expiresIn: seconds || 600 } }); return URL + '/storage/v1' + (r.signedURL || r.signedUrl); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
