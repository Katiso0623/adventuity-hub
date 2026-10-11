"""Local stand-in for the Supabase APIs the portal uses (auth, PostgREST subset, RPC, functions, storage),
backed by a real Postgres database with the real schema and row-level security. Also serves the built site.
python3 tools/mock_supabase.py --port 54321 --db t3 --pghost <socket dir> --pgport 5499 --site dist"""
import argparse, json, os, re, secrets as rnd, subprocess, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qsl, unquote

ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=54321); ap.add_argument('--db'); ap.add_argument('--pghost'); ap.add_argument('--pgport', default='5499'); ap.add_argument('--site'); ap.add_argument('--config', default='')
A = ap.parse_args()
LOG = []; LOCK = threading.Lock()
SETOF = {'busy_slots', 'class_seats'}
EMBED = {('bookings', 'profiles'): ('profiles', 'id', 'learner_id'), ('bookings', 'classes'): ('classes', 'id', 'class_id')}
IDENT = re.compile(r'^[a-z_][a-z0-9_]*$')

def lit(v):
    if v is None: return 'null'
    s = str(v); tag = 'q' + rnd.token_hex(4)
    while tag in s: tag = 'q' + rnd.token_hex(4)
    return '$' + tag + '$' + s + '$' + tag + '$'

def run(sql, uid=None):
    role = 'authenticated' if uid else 'anon'
    if uid == 'service': pre = 'begin;\n'
    else: pre = 'begin;\nset local role %s;\nset local "request.jwt.claim.sub" = %s;\n' % (role, lit(uid or ''))
    script = pre + sql.rstrip().rstrip(';') + ';\ncommit;\n'
    p = subprocess.run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', A.pghost, '-p', A.pgport, '-U', 'postgres', '-d', A.db], input=script, capture_output=True, text=True)
    if p.returncode != 0:
        m = re.search(r'ERROR:\s+(.*)', p.stderr); raise DBError(m.group(1).strip() if m else p.stderr.strip())
    return p.stdout.strip()

class DBError(Exception): pass

def where(table, params):
    conds = []
    for k, v in params:
        if k in ('select', 'order', 'limit', 'on_conflict', 'offset'): continue
        if not IDENT.match(k): raise DBError('bad column ' + k)
        op, _, val = v.partition('.')
        if op == 'eq': conds.append('%s.%s = %s' % (table, k, lit(val)))
        elif op == 'neq': conds.append('%s.%s <> %s' % (table, k, lit(val)))
        elif op in ('gt', 'gte', 'lt', 'lte'): conds.append('%s.%s %s %s' % (table, k, {'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<='}[op], lit(val)))
        elif op == 'is': conds.append('%s.%s is %s' % (table, k, {'null': 'null', 'true': 'true', 'false': 'false'}[val]))
        elif op == 'in': conds.append('%s.%s in (%s)' % (table, k, ','.join(lit(x) for x in val.strip('()').split(',') if x)))
        else: raise DBError('unsupported filter ' + v)
    return (' where ' + ' and '.join(conds)) if conds else ''

def cols(table, sel):
    out = []; parts = re.findall(r'[a-z_]+\([^)]*\)|[^,]+', sel or '*')
    for p in parts:
        p = p.strip()
        m = re.match(r'^([a-z_]+)\(([^)]*)\)$', p)
        if m:
            name, inner = m.group(1), m.group(2)
            ft, fk, lk = EMBED[(table, name)]
            ic = ', '.join(('e.' + c.strip()) if c.strip() != '*' else 'e.*' for c in inner.split(','))
            out.append('(select row_to_json(x) from (select %s from public.%s e where e.%s = %s.%s) x) as %s' % (ic, ft, fk, table, lk, name))
        elif p == '*': out.append(table + '.*')
        elif IDENT.match(p): out.append(table + '.' + p)
        else: raise DBError('bad select ' + p)
    return ', '.join(out)

def order(table, o):
    if not o: return ''
    items = []
    for part in o.split(','):
        c, _, d = part.partition('.')
        if not IDENT.match(c): raise DBError('bad order')
        items.append('%s.%s %s' % (table, c, 'desc' if d.startswith('desc') else 'asc'))
    return ' order by ' + ', '.join(items)

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=A.site, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*'); self.send_header('Access-Control-Allow-Methods', '*'); self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_OPTIONS(self): self.send_response(200); self.end_headers()
    def body(self):
        n = int(self.headers.get('Content-Length') or 0); return self.rfile.read(n) if n else b''
    def reply(self, code, obj=None, raw=None, ctype='application/json'):
        data = raw if raw is not None else (b'' if obj is None else json.dumps(obj).encode())
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def uid(self):
        a = self.headers.get('Authorization', '')
        m = re.match(r'Bearer tok\.([0-9a-f-]{36})$', a); return m.group(1) if m else None
    def api(self, method):
        u = urlparse(self.path); path = u.path; params = parse_qsl(u.query, keep_blank_values=True); q = dict(params)
        try:
            if path.startswith('/auth/v1/'): return self.auth(method, path, q)
            if path.startswith('/functions/v1/'): return self.fn(path.split('/')[-1])
            if path.startswith('/storage/v1/'): return self.storage(method, path)
            m = re.match(r'^/rest/v1/rpc/([a-z_]+)$', path)
            if m: return self.rpc(m.group(1))
            m = re.match(r'^/rest/v1/([a-z_]+)$', path)
            if not m: return self.reply(404, {'message': 'not found'})
            t = m.group(1); uid = self.uid()
            if method == 'GET':
                sql = 'select coalesce(json_agg(t), \'[]\') from (select %s from public.%s%s%s%s) t' % (cols(t, q.get('select')), t, where(t, params), order(t, q.get('order')), (' limit %d' % int(q['limit'])) if 'limit' in q else '')
                return self.reply(200, raw=(run(sql, uid) or '[]').encode())
            if method == 'POST':
                rows = json.loads(self.body() or b'[]'); rows = rows if isinstance(rows, list) else [rows]
                keys = sorted({k for r in rows for k in r});
                for k in keys:
                    if not IDENT.match(k): raise DBError('bad column')
                conflict = ''
                if 'merge-duplicates' in self.headers.get('Prefer', ''):
                    oc = q.get('on_conflict') or 'id'
                    conflict = ' on conflict (%s) do update set %s' % (oc, ', '.join('%s = excluded.%s' % (k, k) for k in keys if k != oc) or (oc + ' = excluded.' + oc))
                sql = 'with ins as (insert into public.%s (%s) select %s from json_populate_recordset(null::public.%s, %s)%s returning *) select coalesce(json_agg(ins), \'[]\') from ins' % (t, ', '.join(keys), ', '.join(keys), t, lit(json.dumps(rows)), conflict)
                return self.reply(201, raw=run(sql, uid).encode())
            if method == 'PATCH':
                patch = json.loads(self.body() or b'{}')
                for k in patch:
                    if not IDENT.match(k): raise DBError('bad column')
                sets = ', '.join('%s = r.%s' % (k, k) for k in patch)
                sql = 'with up as (update public.%s set %s from json_populate_record(null::public.%s, %s) r%s returning public.%s.*) select coalesce(json_agg(up), \'[]\') from up' % (t, sets, t, lit(json.dumps(patch)), where(t, params), t)
                return self.reply(200, raw=run(sql, uid).encode())
            if method == 'DELETE':
                run('delete from public.%s%s' % (t, where(t, params)), uid); return self.reply(204)
        except DBError as e:
            msg = str(e); code = 403 if 'row-level security' in msg else 400
            return self.reply(code, {'message': msg, 'code': '42501' if code == 403 else 'P0001'})
    def rpc(self, name):
        args = json.loads(self.body() or b'{}'); a = ', '.join('%s := %s' % (k, lit(v)) for k, v in args.items() if IDENT.match(k))
        if name in SETOF: out = run('select coalesce(json_agg(t), \'[]\') from public.%s(%s) t' % (name, a), self.uid()); return self.reply(200, raw=out.encode())
        run('select public.%s(%s)' % (name, a), self.uid()); return self.reply(200, raw=b'null')
    def auth(self, method, path, q):
        if path == '/auth/v1/token':
            b = json.loads(self.body() or b'{}')
            if q.get('grant_type') == 'refresh_token':
                uid = b.get('refresh_token', '')[2:]
                out = run("select json_build_object('id', id, 'email', email) from auth.users where id = %s" % lit(uid), 'service')
            else:
                out = run("select json_build_object('id', id, 'email', email) from auth.users where lower(email) = lower(%s) and raw_user_meta_data->>'pw' = %s" % (lit(b.get('email')), lit(b.get('password'))), 'service')
            if not out: return self.reply(400, {'error_description': 'Invalid login credentials'})
            u = json.loads(out); return self.reply(200, {'access_token': 'tok.' + u['id'], 'refresh_token': 'r.' + u['id'], 'expires_in': 3600, 'user': u})
        uid = self.uid()
        if path == '/auth/v1/user':
            if not uid: return self.reply(401, {'message': 'not signed in'})
            if method == 'PUT':
                b = json.loads(self.body() or b'{}'); run("update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('pw', %s) where id = %s" % (lit(b.get('password')), lit(uid)), 'service')
            return self.reply(200, json.loads(run("select json_build_object('id', id, 'email', email) from auth.users where id = %s" % lit(uid), 'service')))
        if path == '/auth/v1/logout': return self.reply(204)
        return self.reply(404, {'message': 'no'})
    def fn(self, name):
        b = json.loads(self.body() or b'{}'); uid = self.uid()
        with LOCK: LOG.append({'fn': name, 'body': b, 'uid': uid})
        if name == 'signup':
            if b.get('website'): return self.reply(200, {'ok': True})
            if len(b.get('password') or '') < 8: return self.reply(400, {'error': 'Use a password of at least 8 characters'})
            if run('select 1 from auth.users where lower(email) = lower(%s)' % lit(b.get('email')), 'service'): return self.reply(400, {'error': 'An account with this e-mail already exists – sign in instead'})
            meta = {k: b.get(k, '') for k in ('full_name', 'phone', 'school', 'guardian_phone')}; meta['pw'] = b['password']
            run('insert into auth.users (email, raw_user_meta_data) values (%s, %s::jsonb)' % (lit(b['email']), lit(json.dumps(meta))), 'service'); return self.reply(200, {'ok': True})
        if name == 'notify': return self.reply(200, {'sent': 0, 'devices': 0})
        if name == 'admin-users':
            role = run("select role from public.profiles where id = %s" % lit(uid or '00000000-0000-0000-0000-000000000000'), 'service')
            if role != 'admin': return self.reply(403, {'error': 'Only the tutor can do this'})
            if b.get('action') == 'reset_password': run("update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('pw', %s) where id = %s" % (lit(b['password']), lit(b['user_id'])), 'service')
            if b.get('action') == 'delete': run('delete from auth.users where id = %s' % lit(b['user_id']), 'service')
            return self.reply(200, {'ok': True})
        return self.reply(404, {'error': 'no function'})
    def storage(self, method, path):
        uid = self.uid()
        m = re.match(r'^/storage/v1/object/sign/([a-z]+)/(.+)$', path)
        if m:
            ok = run("select count(*) from storage.objects where bucket_id = %s and name = %s" % (lit(m.group(1)), lit(unquote(m.group(2)))), uid)
            if ok != '1': return self.reply(400, {'message': 'Object not found'})
            return self.reply(200, {'signedURL': '/object/sign/%s/%s?token=test' % (m.group(1), m.group(2))})
        m = re.match(r'^/storage/v1/object/([a-z]+)/(.+)$', path)
        if m and method == 'POST':
            self.body(); run('insert into storage.objects (bucket_id, name) values (%s, %s)' % (lit(m.group(1)), lit(unquote(m.group(2)))), uid); return self.reply(200, {'Key': m.group(1) + '/' + m.group(2)})
        return self.reply(404, {'message': 'no'})
    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/__log': return self.reply(200, LOG)
        if p == '/config.js' and A.config: return self.reply(200, raw=open(A.config, 'rb').read(), ctype='application/javascript')
        if re.match(r'^/(rest|auth|functions|storage)/', p): return self.api('GET')
        return super().do_GET()
    def do_POST(self): return self.api('POST')
    def do_PATCH(self): return self.api('PATCH')
    def do_PUT(self): return self.api('PUT')
    def do_DELETE(self): return self.api('DELETE')

ThreadingHTTPServer(('127.0.0.1', A.port), H).serve_forever()
