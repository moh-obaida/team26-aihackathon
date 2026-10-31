# Jeran — From Us, For Us

Team 26 UAE community volunteering app: a mobile-first installable PWA (React + Vite) with a Node server and SQLite (`node:sqlite`). All authorization is enforced on the server.

## Run

```bash
npm install
npm run build
npm run seed     # resets data/team26.db with fictional demo data
npm start        # http://localhost:8787 (serves the built app + API)
npm test         # API journeys, security attacks, EN/AR dictionary parity
```

Demo accounts (all fictional, password `Demo#2026`) are listed on the sign-in screen when `DEMO=1`.

## Demo script

1. Register a new **resident** (Arabic), request to join *Palm Court Residences*.
2. Sign in as **layla.mod** → Reviews → Members → approve.
3. Resident → Create → supervised clean-up → *Send for moderator review* (unsafe wording is blocked).
4. **layla.mod** → Reviews → Listings → *Publish listing*.
5. **yusuf.student** (English) → Discover → open it → *Apply to volunteer*.
6. **khalid.guardian** → Consents → *Approve participation*.
7. Resident → the request → *Accept* → *Mark activity completed* → *Confirm hours*.
8. **layla.mod** → Reviews → Hours → *Verify hours*.
9. Student → Home shows verified hours → Hours → *Download as spreadsheet* / *Open printable summary*.

Deployment needs HTTPS hosting; set `SECURE_COOKIES=1` behind TLS. Hours are community-verified only — not an official UAE certificate.
