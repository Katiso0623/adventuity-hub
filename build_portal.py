"""Builds the deployable site into site/: public landing pages + protected learner/tutor portal.
The study notes go out only as content.bin (gzip + AES-256-GCM). The key lives in Supabase (content_keys),
readable only by approved learners and the tutor.   python3 build_portal.py [--dev] [--bundle bundle.json]
--dev also writes out/dev/dev-content.js for local tests. Without the plain source files (maths_a.js …) the build
decrypts the current site/content.bin with secrets/content_key.b64 (tools/decrypt_content.py) and rebuilds from that."""
import base64, gzip, json, os, re, shutil, subprocess, sys, time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'site')
SEC = os.path.join(D, 'secrets')
DEV = '--dev' in sys.argv
rd = lambda n: open(os.path.join(D, n), encoding='utf-8').read()
wr = lambda n, s: open(os.path.join(OUT, n), 'w', encoding='utf-8').write(s)
BUILD = time.strftime('%Y%m%d%H%M%S')
backend = json.load(open(os.path.join(SEC, 'backend.json')))
cfg = json.load(open(os.path.join(D, 'cfg.json'), encoding='utf-8'))

tmp = os.path.join(D, 'out', 'dump'); os.makedirs(tmp, exist_ok=True)
key = base64.b64decode(open(os.path.join(SEC, 'content_key.b64')).read().strip())
SOURCES = ['maths_a.js', 'maths_b.js', 'maths_c.js', 'maths_d.js', 'physics.js', 'chem.js']
if '--bundle' in sys.argv: bundle_path = sys.argv[sys.argv.index('--bundle') + 1]
elif all(os.path.exists(os.path.join(D, f)) for f in SOURCES):
    subprocess.run(['node', os.path.join(D, 'tools', 'dump_content.js'), tmp], check=True); bundle_path = os.path.join(tmp, 'bundle.json')
else:
    subprocess.run([sys.executable, os.path.join(D, 'tools', 'decrypt_content.py'), os.path.join(OUT, 'content.bin'), os.path.join(tmp, 'bundle.json')], check=True); bundle_path = os.path.join(tmp, 'bundle.json')
bundle = open(bundle_path, 'rb').read()
B = json.loads(bundle)

shutil.rmtree(OUT, ignore_errors=True); os.makedirs(os.path.join(OUT, 'icons')); os.makedirs(os.path.join(OUT, 'assets'))

# ---- content: private bundle (encrypted) + public outline (titles, study-time estimates, question ids and marks only)
outline = []
for sj in ('maths', 'phys', 'chem'):
    for t in B['topics'][sj]:
        pq = [[q['id'], int(q.get('marks') or 0)] for q in B['practice'].get(t['id'], [])]
        outline.append({'id': t['id'], 'subj': sj, 'title': t['title'], 'paper': t['paper'], 'weight': t.get('weight', ''), 'grade': t.get('grade', ''),
                        'book': {'chapter': t['book']['chapter'], 'pages': t['book']['pages']} if t.get('book') else None,
                        'sections': [{'id': s['id'], 'title': s['title'], 'est': s.get('est') or 20} for s in t['sections']],
                        'pc': len(pq), 'pm': sum(m for _, m in pq), 'pq': pq, 'qc': len(t.get('quiz') or [])})
outline = json.dumps(outline, ensure_ascii=False)
iv = os.urandom(12)
blob = iv + AESGCM(key).encrypt(iv, gzip.compress(bundle, 9), None)
open(os.path.join(OUT, 'content.bin'), 'wb').write(blob)
content_version = BUILD
print('content.bin', round(len(blob) / 1024), 'KB (plain', round(len(bundle) / 1024), 'KB)')
wr('assets/outline.js', 'window.ADV_OUTLINE = ' + outline + ';\n')
if DEV:
    shutil.rmtree(os.path.join(D, 'out', 'dev'), ignore_errors=True); os.makedirs(os.path.join(D, 'out', 'dev'))
    open(os.path.join(D, 'out', 'dev', 'dev-content.js'), 'w', encoding='utf-8').write('window.ADV_DEV_CONTENT = ' + bundle.decode('utf-8') + ';\n')

# ---- CSS: theme from app_head.html + steps + figures + portal
head = rd('app_head.html')
theme = re.search(r'<style id="theme"[^>]*>(.*?)</style>', head, re.S).group(1)
mark = open(os.path.join(D, 'brand', 'mark_mask.b64')).read().strip()
css = ':root{--mark-mask:url(data:image/png;base64,' + mark + ')}\n' + theme + '\n' + rd('steps.css') + '\n' + rd('fig.css') + '\n' + rd('portal_extra.css')
wr('assets/app.css', css)

# ---- scripts
for f in ['sbmini.js', 'steps.js', 'figlib.js', 'portal_core.js', 'portal_msgs.js', 'portal_study.js', 'portal_admin.js']:
    shutil.copy(os.path.join(D, f), os.path.join(OUT, 'assets', f))
wr('assets/mj-config.js', 'window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"]],displayMath:[["\\\\[","\\\\]"]]},svg:{fontCache:"global"},options:{enableMenu:false},startup:{typeset:false,ready:function(){MathJax.startup.defaultReady();MathJax.startup.promise.then(function(){if(window.__onMathJaxReady)window.__onMathJaxReady();});}}};\n')
wr('assets/boot.js', 'window.ADV.boot();\n')
site_url = backend.get('site_url') or 'https://katiso0623.github.io/adventuity-hub/'
config = {'supabaseUrl': backend.get('supabaseUrl', ''), 'supabaseKey': backend.get('supabaseKey', ''), 'vapidPublic': backend['vapid_public'], 'contentVersion': content_version, 'siteUrl': site_url, 'exams': cfg['exams']}
wr('config.js', '/* Public settings for the Adventuity portal (no secrets here: the anon key is public by design; row-level security protects the data). */\nwindow.ADV_CONFIG = ' + json.dumps(config, indent=1, ensure_ascii=False) + ';\n')

# ---- portal.html
v = '?v=' + BUILD
sb_origin = (backend.get('supabaseUrl') or 'https://*.supabase.co').rstrip('/')
csp = ("default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob:; "
       "connect-src 'self' " + sb_origin + " https://formsubmit.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'")
portal = '''<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="%(csp)s">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Adventuity – learner portal</title>
<meta name="description" content="Sign in to book Grade 12 Maths and Physical Sciences lessons, join your online class and study for the NSC finals.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#1c3246">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Adventuity">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
<link rel="stylesheet" href="assets/app.css%(v)s">
</head>
<body>
<noscript><p style="padding:24px">Turn on JavaScript to use the Adventuity portal.</p></noscript>
<div id="app"></div>
<script src="config.js%(v)s"></script>
<script src="assets/mj-config.js%(v)s"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.js" async></script>
<script src="assets/sbmini.js%(v)s"></script>
<script src="assets/steps.js%(v)s"></script>
<script src="assets/figlib.js%(v)s"></script>
<script src="assets/outline.js%(v)s"></script>
<script src="assets/portal_core.js%(v)s"></script>
<script src="assets/portal_msgs.js%(v)s"></script>
<script src="assets/portal_study.js%(v)s"></script>
<script src="assets/portal_admin.js%(v)s"></script>
<script src="assets/boot.js%(v)s"></script>
</body>
</html>
''' % {'csp': csp, 'v': v}
wr('portal.html', portal)

# ---- PWA: manifest + service worker (offline shell, push notifications)
manifest = {"name": "Adventuity – Grade 12 lessons", "short_name": "Adventuity", "description": "Book Grade 12 Maths and Physical Sciences lessons, join your online class and study for the finals.",
            "id": "./portal.html", "start_url": "./portal.html?source=pwa", "scope": "./", "display": "standalone", "background_color": "#f3f5f8", "theme_color": "#1c3246", "lang": "en-ZA", "categories": ["education"],
            "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"}, {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
            "shortcuts": [{"name": "Book a lesson", "url": "./portal.html#book"}, {"name": "My lessons", "url": "./portal.html#lessons"}, {"name": "Messages", "url": "./portal.html#messages"}]}
json.dump(manifest, open(os.path.join(OUT, 'manifest.webmanifest'), 'w'), indent=2)
shell = ['./portal.html', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/favicon-32.png'] + ['./assets/' + f + v for f in ['app.css', 'mj-config.js', 'sbmini.js', 'steps.js', 'figlib.js', 'outline.js', 'portal_core.js', 'portal_msgs.js', 'portal_study.js', 'portal_admin.js', 'boot.js']]
sw = '''/* Adventuity service worker: offline app shell, encrypted notes cache, push notifications. */
const CACHE = 'adv-%(b)s';
const SHELL = %(shell)s;
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (/\\.(html|webmanifest)$|\\/$|config\\.js$/.test(u.pathname)) {   // network first: always the newest version when online
      e.respondWith(fetch(r).then((res) => { const c = res.clone(); if (res.ok) caches.open(CACHE).then((ca) => ca.put(r, c)); return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match('./portal.html'))));
      return;
    }
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(r, c)); } return res; })));
    return;
  }
  if (/(^|\\.)cdnjs\\.cloudflare\\.com$|fonts\\.(googleapis|gstatic)\\.com$/.test(u.host)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(r, c)); } return res; })));
  }
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Adventuity', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Adventuity', { body: d.body || '', tag: d.tag || 'adv', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', data: { url: d.url || './portal.html' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './portal.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) { if (c.url.indexOf('portal.html') >= 0 && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
''' % {'b': BUILD, 'shell': json.dumps(shell)}
wr('sw.js', sw)
for f in os.listdir(os.path.join(D, 'brand', 'icons')):
    shutil.copy(os.path.join(D, 'brand', 'icons', f), os.path.join(OUT, 'icons', f))
open(os.path.join(OUT, '.nojekyll'), 'w').write('')

# ---- public landing pages (SEO)
subprocess.run(['node', os.path.join(D, 'tools', 'build_public.js'), '--no-og', '--bundle', bundle_path, '--out', os.path.join(OUT)], check=True)
idx = open(os.path.join(OUT, 'index.html'), encoding='utf-8').read()
if 'source=pwa' not in idx: open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(idx.replace('</head>', '<script>if(/[?&]source=pwa/.test(location.search))location.replace("portal.html");</script>\n</head>', 1))
og = os.path.join(D, 'brand', 'og.png')
if os.path.exists(og): shutil.copy(og, os.path.join(OUT, 'og.png'))

# ---- safety: no plain study text in the deploy
plain = [p for p in ['maths_a.js', 'physics.js', 'practice_chem.js'] if os.path.exists(os.path.join(OUT, p))]
assert not plain, plain
sample = B['topics']['maths'][0]['sections'][0]['know'][0][:40]
for root, _, files in os.walk(OUT):
    for f in files:
        if f.endswith(('.html', '.js', '.json', '.xml', '.txt', '.css')):
            assert sample not in open(os.path.join(root, f), encoding='utf-8', errors='ignore').read(), 'plain notes leaked into ' + f
print('built', OUT, 'build', BUILD)
print('content key (store in Supabase content_keys id v1):', 'secrets/content_key.b64')
