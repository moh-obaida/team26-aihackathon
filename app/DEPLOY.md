# Deploying Jeran for a live demo (HTTPS) and installing it on phones

Jeran is an installable web app (PWA). Nothing is built with Xcode or Android Studio: phones install it from the browser.
It needs an **HTTPS URL** — browsers only allow installation and service workers on HTTPS (or `localhost`).

## 1. Run it somewhere with HTTPS

One process serves the built app and the API; it needs Node 24 (built-in `node:sqlite`) and a place to keep one SQLite file.

```bash
npm ci && npm run build
DEMO=1 SECURE_COOKIES=1 TRUST_PROXY=1 PORT=8787 DB_PATH=/data/team26.db node server/index.js
```

or use the included `Dockerfile` on any container host (Fly.io, Render, Railway, a VPS behind Caddy/nginx):

```bash
docker build -t jeran . && docker run -p 8787:8787 -v jeran-data:/data jeran
```

| Variable | Set it to | Why |
|---|---|---|
| `SECURE_COOKIES=1` | always on HTTPS | session cookie becomes `Secure`; sends HSTS; redirects proxied `http://` to `https://` |
| `TRUST_PROXY=1` | only if **exactly one** proxy/load balancer sits in front | otherwise every phone shares the proxy's address and the sign-in rate limit (20/min) locks the room out |
| `DEMO=1` | demo only | seeds fictional data when the database is empty and lists the demo accounts on the sign-in screen (shared password) |
| `DB_PATH` | a path on a **persistent volume** | on an ephemeral disk the data resets on every redeploy (with `DEMO=1` it re-seeds, which is fine for a demo) |
| `PORT`, `HOST` | platform defaults | the Docker image binds `0.0.0.0` |

The TLS certificate must be valid (use the host's managed certificate, not a self-signed one) or phones will refuse to install.
Do not run a public deployment with `DEMO=1` once real people use it.

Reset demo data any time: `npm run seed` (wipes and re-seeds the database file; stop the server first).

## 2. Install on a phone

**iPhone / iPad (Safari only):** open the URL in Safari → Share → **Add to Home Screen** → Add. Open it from the home-screen icon; it runs full screen with no Safari toolbar.

**Android (Chrome):** open the URL → menu ⋮ → **Install app** (or the install banner) → Install. It appears in the app drawer with the Jeran icon and runs standalone.

Deep links work because the server returns the app for every route: `/student/hours`, `/guardian/consents`, … open directly, and signed-out visitors are sent to sign-in and then back to the page they asked for.

## 3. What the app caches (and what it never does)

The service worker (`public/sw.js`) caches only the app shell: the page, scripts, styles, fonts, logo and icons.
It never sees `/api/*`: sign-in state, participation records, consents and hours always come fresh from the server, and API responses are `Cache-Control: no-store`.
Error responses and anything marked `no-store`/`private` are never cached. Every build stamps a new worker version and deletes the old cache.
If the phone cannot reach the server, a signed-in user sees a clear "Can't reach Jeran" screen (they are *not* signed out), screens that failed reload by themselves when the connection returns, and a banner explains that changes will not be saved.

## 4. What has and has not been verified

Verified (automated: `npm test` and `npm run demo:check`, run in headless **Chromium** with touch emulation at iPhone- and Pixel-sized viewports):
manifest and icon integrity, iOS/mobile metadata, service-worker caching rules, HSTS/redirect/proxy behaviour, the full nine-step demo in English and Arabic, the student Applied tab, offline launch and reconnect, deep links, safe-area insets (Chromium's inset emulation), screen/tab/sheet motion and reduced-motion.
The production environment settings (`SECURE_COOKIES=1 TRUST_PROXY=1`) were also run behind a local TLS-terminating proxy with a self-signed certificate: HTTPS, HSTS and the http→https redirect behave as described.

**Not verified:**
- installation on a physical iPhone or Android phone, and Safari/WebKit rendering (no WebKit here);
- the `Dockerfile` was not built (no Docker daemon in the build sandbox);
- a deployment on a real public HTTPS host with a trusted certificate.

Do a 5-minute install on one iPhone and one Android phone before the demo, and run `BASE_URL=https://your-host npm run demo:check` against the deployed URL (it uses the demo accounts, so deploy with `DEMO=1`).
