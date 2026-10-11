"""Decrypts site/content.bin (gzip + AES-256-GCM, 12-byte IV first) back to the study bundle JSON.
python3 tools/decrypt_content.py site/content.bin out/bundle.json [--key secrets/content_key.b64]
The key is also stored in Supabase: table content_keys, id 'v1' (readable by the tutor account)."""
import base64, gzip, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
src, dst = sys.argv[1], sys.argv[2]
kp = sys.argv[sys.argv.index('--key') + 1] if '--key' in sys.argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'secrets', 'content_key.b64')
key = base64.b64decode(open(kp).read().strip()); blob = open(src, 'rb').read()
open(dst, 'wb').write(gzip.decompress(AESGCM(key).decrypt(blob[:12], blob[12:], None)))
print('decrypted', dst)
