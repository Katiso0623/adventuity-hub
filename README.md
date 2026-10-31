# Adventuity – Grades 10–12 Maths, Physical Sciences and Life Sciences

Live site: https://learn.adventuity.co.za/ (GitHub Pages with a custom domain; the old katiso0623.github.io/adventuity-hub/ address forwards here)  
Learner and tutor portal: https://learn.adventuity.co.za/portal.html

## What is where

| Folder / file | What it is |
|---|---|
| `site/` | The published website (GitHub Pages deploys only this folder). The address is set in `cfg.json` (`siteUrl`) and in the repository's Pages settings (custom domain learn.adventuity.co.za, DNS CNAME `learn` → `katiso0623.github.io` at Afrihost). |
| `site/index.html`, `maths.html`, `physical-sciences.html`, `life-sciences.html`, `grade-10.html`, `grade-11.html` | Public pages that search engines index. They show topics and study times, but no notes. |
| `site/portal.html` | The portal app for learners and the tutor: bookings, lessons, messages and study. |
| `site/content.bin`, `content-10.bin`, `content-11.bin` | The study notes for Grade 12, 10 and 11, encrypted (gzip + AES-256-GCM). One file per grade, so a learner downloads only the grade they open. The key is stored in Supabase (`content_keys`). Only the tutor and learners the tutor has unlocked can read them. |
| `portal_*.js`, `sbmini.js`, `steps.js`, `figlib.js`, `*.css`, `app_head.html` | Source code of the portal. |
| `backend/schema.sql` | Database tables, row-level security and functions (Supabase project `sxbpjowkcpysoxurfqzo`). |
| `backend/functions/` | Edge functions: `signup`, `notify` (push alerts) and `admin-users` (the director: create tutor and learner logins with temporary passwords, password reset, delete; tutors: add learners they teach, and give them a new temporary password until they first sign in). |
| `backend/migrations/` | Changes to apply to the live database in date order (each one is also folded into `schema.sql`). |
| `tools/` | Build, decrypt and test scripts. |
| `floodline/` | The Adventuity Floodline website (flood line quotes, free flood check) and the protected Floodline Studio, live at `/floodline/`. Built by the separate Floodline project; only the deploy files are here. The Studio ships encrypted (`floodline/js/studio.bundle.enc`); its key is in Supabase (`floodline_private_assets`, admins only). `build_portal.py` copies this folder into `site/floodline/`. The public address https://www.adventuity.co.za is served by GitHub Pages from the separate repository `adventuity-co-za`; its publish job copies this folder every 30 minutes and republishes when anything changed, so update the Floodline files here. `.github/workflows/floodline-azure.yml` would deploy to Azure instead but stays idle without its token. The copy under learn.adventuity.co.za/floodline/ carries canonical links to www. |
| `floodline-com/` | The international Floodline website for https://www.adventuity.com (worldwide flood studies, country pages, the same protected Studio). Deployed to its own Azure Static Web App by the same workflow; previewable at `/floodline-com/`. Both sites have `pay.html` for paying accepted quotes online (Supabase function `floodline-pay`, Yoco). |

## How it works

- **Learners** create an account and request a lesson time (one-on-one or a seat in a group class). The server sets the fee from the tutor's fee table.
- **The tutor** gets a push notification and an e-mail. They then accept the request, change the time, or decline it in the Dashboard. Accepting gives the lesson its own private online room, which opens in a new window. The learner is notified.
- **Payment details** are shown only to learners who have an accepted lesson. They upload a proof of payment, and the tutor marks the lesson as paid under Money.
- **Study notes** open only for learners the tutor unlocks (under Learners), or for everyone if the tutor switches that on in Settings. For learners, the notes carry a watermark with the learner's name, and copying and printing are switched off.
- **Tutor notes** can be added to any section or exam question, for all learners or for one learner. The tutor also has a pen to draw on the page or in teach mode.
- **Tutors** (other than the director) see their lessons and learners, join with their own Google Meet link and log each lesson. Under **Schedule** they book the lessons they agreed with a learner – several days and times at once – and send the times (and, for learners they added, the login) on WhatsApp. They may book beyond the hours the director allocated; the director sees that flagged.
- **Lesson bundles**: learners can buy lesson hours upfront (5 hours for R1 100, 10 hours for R2 000; the director changes the offer under Money). The director accepts the request, the learner pays by EFT, and each lesson they book after that is taken from the bundle automatically.
- **Analysis** (the director only) summarises lessons booked and finished per tutor and learner, flags lessons over the allocated hours or not logged, and makes sponsor invoices (for example SAILI at R200 per hour) from the delivered lessons, printed on the Adventuity invoice layout. Banking details for invoices are kept in the database (`private_settings`, key `invoice`), readable only by the director.

## Rebuild after changing code or settings

```bash
python3 build_portal.py          # writes site/  (needs secrets/content_key.b64 – never commit it)
node tools/e2e.js out/e2e        # end-to-end test against tools/mock_supabase.py (local Postgres)
```

The plain source files for the notes are not in this repository. Without them, the build decrypts the current `site/content.bin`, `content-10.bin` and `content-11.bin`, merges them and builds from that. You can also decrypt one file yourself:

```bash
python3 tools/decrypt_content.py site/content.bin bundle.json --key secrets/content_key.b64
python3 build_portal.py --bundle bundle.json
```

The key is also in Supabase, in table `content_keys` (id `v1`), and the tutor's account can read it.
