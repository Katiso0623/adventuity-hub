"""Local stand-in for the Supabase APIs the portal uses (auth, PostgREST subset, RPC, functions, storage),
backed by a real Postgres database with the real schema and row-level security. Also serves the built site.
python3 tools/mock_supabase.py --port 54321 --db t3 --pghost <socket dir> --pgport 5499 --site dist"""
import argparse, json, os, re, secrets as rnd, subprocess, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qsl, unquote

ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=54321); ap.add_argument('--db'); ap.add_argument('--pghost'); ap.add_argument('--pgport', default='5499'); ap.add_argument('--site'); ap.add_argument('--config', default='')
A = ap.parse_args()
LOG = []; LOCK = threading.Lock()
SETOF = {'busy_slots', 'class_seats', 'tutor_lessons', 'tutor_learners', 'my_tutors', 'tutor_schedule'}
EMBED = {('bundles', 'profiles'): ('profiles', 'id', 'learner_id'), ('bookings', 'profiles'): ('profiles', 'id', 'learner_id'), ('bookings', 'classes'): ('classes', 'id', 'class_id')}
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
    out = []; parts = re.findall(r'[a-z_]+(?:![a-z_]+)?\([^)]*\)|[^,]+', sel or '*')
    for p in parts:
        p = p.strip()
        m = re.match(r'^([a-z_]+)(?:![a-z_]+)?\(([^)]*)\)$', p)
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
        args = json.loads(self.body() or b'{}'); a = ', '.join('%s := %s' % (k, lit(json.dumps(v) if isinstance(v, (list, dict)) else v)) for k, v in args.items() if IDENT.match(k))
        if name in SETOF: out = run('select coalesce(json_agg(t), \'[]\') from public.%s(%s) t' % (name, a), self.uid()); return self.reply(200, raw=out.encode())
        out = run('select to_json(public.%s(%s))' % (name, a), self.uid()); return self.reply(200, raw=(out or 'null').encode())
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
        if name == 'tutor-apply': return self.tutor_apply()
        b = json.loads(self.body() or b'{}'); uid = self.uid()
        with LOCK: LOG.append({'fn': name, 'body': b, 'uid': uid})
        if name == 'signup':
            if b.get('website'): return self.reply(200, {'ok': True})
            if len(b.get('password') or '') < 8: return self.reply(400, {'error': 'Use a password of at least 8 characters'})
            if run('select 1 from auth.users where lower(email) = lower(%s)' % lit(b.get('email')), 'service'): return self.reply(400, {'error': 'An account with this e-mail already exists – sign in instead'})
            meta = {k: b.get(k, '') for k in ('full_name', 'phone', 'school', 'guardian_phone')}; meta['pw'] = b['password']
            if str(b.get('grade') or '') in ('10', '11', '12'): meta['grade'] = str(b['grade'])
            run('insert into auth.users (email, raw_user_meta_data) values (%s, %s::jsonb)' % (lit(b['email']), lit(json.dumps(meta))), 'service'); return self.reply(200, {'ok': True})
        if name == 'notify': return self.reply(200, {'sent': 0, 'devices': 0})
        if name == 'admin-users':
            role = run("select role from public.profiles where id = %s" % lit(uid or '00000000-0000-0000-0000-000000000000'), 'service')
            if role == 'tutor':   # mirrors the tutor rules in backend/functions/admin-users
                if b.get('action') == 'create_account':
                    subs = [x for x in (b.get('subjects') or []) if x in ('maths', 'phys', 'chem', 'life')]
                    if not subs: return self.reply(400, {'error': 'Choose the subject(s) you will teach this learner'})
                    if run('select 1 from auth.users where lower(email) = lower(%s)' % lit(b.get('email')), 'service'): return self.reply(409, {'error': 'That e-mail already has an account – ask the director to assign this learner to you.'})
                    meta = {'full_name': b.get('full_name', ''), 'phone': b.get('phone', ''), 'school': b.get('school', ''), 'pw': b['password']}
                    nid = run('insert into auth.users (email, raw_user_meta_data) values (%s, %s::jsonb) returning id' % (lit(b['email'].lower()), lit(json.dumps(meta))), 'service').splitlines()[0]
                    run("update public.profiles set approved = true, must_change_password = true, guardian_phone = %s, grade = %s, created_by = %s where id = %s" % (lit(b.get('guardian_phone', '')), int(b['grade']) if str(b.get('grade') or '') in ('10', '11', '12') else 'null', lit(uid), lit(nid)), 'service')
                    run('insert into public.assignments (learner_id, tutor_id, subject) values ' + ', '.join('(%s, %s, %s)' % (lit(nid), lit(uid), lit(x)) for x in subs) + ' on conflict do nothing', 'service')
                    return self.reply(200, {'ok': True, 'user_id': nid, 'subjects': subs})
                if b.get('action') == 'reset_password':
                    ok = run("select 1 from public.profiles p where p.id = %s and p.role = 'learner' and p.created_by = %s and p.must_change_password and exists (select 1 from public.assignments a where a.learner_id = p.id and a.tutor_id = %s and a.active)" % (lit(b['user_id']), lit(uid), lit(uid)), 'service')
                    if not ok: return self.reply(403, {'error': 'Ask the director to reset this password'})
                    run("update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('pw', %s) where id = %s" % (lit(b['password']), lit(b['user_id'])), 'service')
                    return self.reply(200, {'ok': True})
                return self.reply(403, {'error': 'Only the director can do this'})
            if role != 'admin': return self.reply(403, {'error': 'Only the director can do this'})
            if b.get('action') == 'create_account':
                if run('select 1 from auth.users where lower(email) = lower(%s)' % lit(b.get('email')), 'service'): return self.reply(409, {'error': 'That e-mail already has an account.'})
                meta = {'full_name': b.get('full_name', ''), 'phone': b.get('phone', ''), 'school': b.get('school', ''), 'pw': b['password']}
                nid = run('insert into auth.users (email, raw_user_meta_data) values (%s, %s::jsonb) returning id' % (lit(b['email'].lower()), lit(json.dumps(meta))), 'service').splitlines()[0]
                if b.get('role') == 'tutor': patch = "role = 'tutor', approved = true, must_change_password = true, meet_link = %s, tutor_rate = %s, tutor_subjects = %s" % (lit(b.get('meet_link', '')), float(b.get('tutor_rate') or 0), lit(b.get('tutor_subjects', '')))
                else: patch = 'approved = %s, must_change_password = true, grade = %s' % ('false' if b.get('approved') is False else 'true', int(b['grade']) if str(b.get('grade') or '') in ('10', '11', '12') else 'null')
                prof = run('with p as (update public.profiles set %s where id = %s returning *) select row_to_json(p) from p' % (patch, lit(nid)), 'service')
                return self.reply(200, {'ok': True, 'user_id': nid, 'profile': json.loads(prof)})
            if b.get('action') == 'reset_password': run("update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('pw', %s) where id = %s; update public.profiles set must_change_password = true where id = %s" % (lit(b['password']), lit(b['user_id']), lit(b['user_id'])), 'service')
            if b.get('action') == 'delete': run('delete from auth.users where id = %s' % lit(b['user_id']), 'service')
            return self.reply(200, {'ok': True})
        return self.reply(404, {'error': 'no function'})
    def tutor_apply(self):
        from email.parser import BytesParser
        from email.policy import default as pol
        ctype = self.headers.get('Content-Type', ''); raw = self.body()
        if 'multipart/form-data' not in ctype: return self.reply(400, {'error': 'Use the form on the website to apply.'})
        msg = BytesParser(policy=pol).parsebytes(b'Content-Type: ' + ctype.encode() + b'\r\nMIME-Version: 1.0\r\n\r\n' + raw)
        f, lists, cv = {}, {'subjects': [], 'grades': []}, None
        for part in msg.iter_parts():
            n = part.get_param('name', header='content-disposition'); fn = part.get_filename(); data = part.get_payload(decode=True) or b''
            if fn is not None: cv = (fn, part.get_content_type(), data)
            elif n in lists: lists[n].append(data.decode())
            else: f[n] = data.decode()
        with LOCK: LOG.append({'fn': 'tutor-apply', 'fields': f, 'lists': lists, 'cv': cv and (cv[0], len(cv[2]))})
        if f.get('website'): return self.reply(200, {'ok': True, 'ref': 'T-BOT000'})
        for k, m in (('full_name', 'Please enter your name and surname.'), ('email', 'Please enter a valid e-mail address.'), ('phone', 'Please enter a phone number.'), ('qualification', 'Please tell us your qualification.')):
            if len(f.get(k, '').strip()) < 2: return self.reply(400, {'error': m})
        if not lists['subjects']: return self.reply(400, {'error': 'Please tick at least one subject you can teach.'})
        if f.get('consent') != 'yes': return self.reply(400, {'error': 'Please tick the consent box.'})
        if not cv or not cv[2] or cv[0].rsplit('.', 1)[-1].lower() not in ('pdf', 'doc', 'docx'): return self.reply(400, {'error': 'Please attach your CV (PDF or Word).'})
        path = '2026-10/' + rnd.token_hex(8) + '.' + cv[0].rsplit('.', 1)[-1].lower()
        run('insert into storage.objects (bucket_id, name) values (%s, %s)' % (lit('cvs'), lit(path)), 'service')
        arr = lambda xs: 'array[%s]::text[]' % ','.join(lit(x) for x in xs) if xs else "'{}'::text[]"
        out = run('insert into public.tutor_applications (full_name, email, phone, province, town, subjects, grades, qualification, institution, experience_years, mode, availability, about, referral, cv_path, cv_name, cv_size) values (%s) returning ref' % ', '.join([
            lit(f['full_name']), lit(f['email']), lit(f['phone']), lit(f.get('province', '')), lit(f.get('town', '')), arr(lists['subjects']), arr(lists['grades']), lit(f['qualification']), lit(f.get('institution', '')),
            str(int(f.get('experience_years') or 0)), lit(f.get('mode') or 'online'), lit(f.get('availability', '')), lit(f.get('about', '')), lit(f.get('referral', '')), lit(path), lit(cv[0]), str(len(cv[2]))]), 'service')
        return self.reply(200, {'ok': True, 'ref': out.strip()})
    def storage(self, method, path):
        uid = self.uid()
        m = re.match(r'^/storage/v1/object/sign/([a-z]+)/(.+)$', path)
        if m:
            ok = run("select count(*) from storage.objects where bucket_id = %s and name = %s" % (lit(m.group(1)), lit(unquote(m.group(2)))), uid)
            if ok != '1': return self.reply(400, {'message': 'Object not found'})
            return self.reply(200, {'signedURL': '/object/sign/%s/%s?token=test' % (m.group(1), m.group(2))})
        m = re.match(r'^/storage/v1/object/([a-z]+)/(.+)$', path)
        if m and method == 'DELETE':
            run('delete from storage.objects where bucket_id = %s and name = %s' % (lit(m.group(1)), lit(unquote(m.group(2)))), uid); return self.reply(200, {'message': 'deleted'})
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
