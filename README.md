# Adventuity – Grade 12 Maths & Physical Sciences

Live site: https://katiso0623.github.io/adventuity-hub/  
Learner and tutor portal: https://katiso0623.github.io/adventuity-hub/portal.html

## What is where

| Folder / file | What it is |
|---|---|
| `site/` | The published website (GitHub Pages deploys only this folder). |
| `site/index.html`, `maths.html`, `physical-sciences.html` | Public pages that search engines index. They show topics and study times, but no notes. |
| `site/portal.html` | The portal app for learners and the tutor: bookings, lessons, messages and study. |
| `site/content.bin` | The study notes, encrypted (gzip + AES-256-GCM). The key is stored in Supabase (`content_keys`). Only the tutor and learners the tutor has unlocked can read it. |
| `portal_*.js`, `sbmini.js`, `steps.js`, `figlib.js`, `*.css`, `app_head.html` | Source code of the portal. |
| `backend/schema.sql` | Database tables, row-level security and functions (Supabase project `sxbpjowkcpysoxurfqzo`). |
| `backend/functions/` | Edge functions: `signup`, `notify` (push alerts) and `admin-users` (tutor-only password reset and delete). |
| `tools/` | Build, decrypt and test scripts. |
| `floodline/` | The Adventuity Floodline website (flood line quotes, free flood check) and the protected Floodline Studio, live at `/floodline/`. Built by the separate Floodline project; only the deploy files are here. The Studio ships encrypted (`floodline/js/studio.bundle.enc`); its key is in Supabase (`floodline_private_assets`, admins only). `build_portal.py` copies this folder into `site/floodline/`. The public address is https://www.adventuity.co.za (Azure Static Web Apps, deployed from this folder by `.github/workflows/floodline-azure.yml`); the GitHub Pages copy carries canonical links to it. |
| `floodline-com/` | The international Floodline website for https://www.adventuity.com (worldwide flood studies, country pages, the same protected Studio). Deployed to its own Azure Static Web App by the same workflow; previewable at `/floodline-com/`. Both sites have `pay.html` for paying accepted quotes online (Supabase function `floodline-pay`, Yoco). |

## How it works

- **Learners** create an account and request a lesson time (one-on-one or a seat in a group class). The server sets the fee from the tutor's fee table.
- **The tutor** gets a push notification and an e-mail. They then accept the request, change the time, or decline it in the Dashboard. Accepting gives the lesson its own private online room, which opens in a new window. The learner is notified.
- **Payment details** are shown only to learners who have an accepted lesson. They upload a proof of payment, and the tutor marks the lesson as paid under Money.
- **Study notes** open only for learners the tutor unlocks (under Learners), or for everyone if the tutor switches that on in Settings. For learners, the notes carry a watermark with the learner's name, and copying and printing are switched off.
- **Tutor notes** can be added to any section or exam question, for all learners or for one learner. The tutor also has a pen to draw on the page or in teach mode.

## Rebuild after changing code or settings

```bash
python3 build_portal.py          # writes site/  (needs secrets/content_key.b64 – never commit it)
node tools/e2e.js out/e2e        # end-to-end test against tools/mock_supabase.py (local Postgres)
```

The plain source files for the notes are not in this repository. Without them, the build decrypts the current `site/content.bin` and builds from that. You can also run that step yourself:

```bash
python3 tools/decrypt_content.py site/content.bin bundle.json --key secrets/content_key.b64
python3 build_portal.py --bundle bundle.json
```

The key is also in Supabase, in table `content_keys` (id `v1`), and the tutor's account can read it.
