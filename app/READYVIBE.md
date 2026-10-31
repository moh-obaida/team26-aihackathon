# ReadyVibe review: Jeran (all 55 skills)

Run on 31 Oct 2026 against `http://localhost:8787` (production build) with the skills' own scanners (`inspect-metadata`, `check-links`, `audit-markup`, `audit-assets`, `observe-runtime`, `scan-secrets`) plus manual checks.
Evidence: **O** observed at runtime, **S** source-indicated, **T** covered by an automated test (`npm test`).

**Verdict:** no launch blockers found in the areas verified below. Items marked UNVERIFIED need a production URL; items marked REVIEW need a human (legal or safeguarding) decision. This is not a claim of legal compliance.

| # | Skill | Result | Evidence and action |
|---|---|---|---|
| 1 | launch-all | DONE | This review. |
| 2 | compliance-all | DONE | Rows 11–28 below. |
| 3 | compliance-diff | N/A | No earlier compliance baseline to diff against. |
| 4 | design-system-reconnaissance | DONE | Tokens in `src/styles.css` (logo palette, Readex/Plex type, radii, motion); all fixes reuse them. |
| 5 | discoverability-all | DONE | Rows 29–32. |
| 6 | launch-verification | DONE | Every fix re-scanned after the change (results in this table). |
| 7 | production-all | DONE | Rows 51–55. |
| 8 | quality-all | DONE | Rows 39–50. |
| 9 | site-reconnaissance | DONE | Private, authenticated PWA for UAE students, residents, guardians and moderators; no payments, no email, no trackers. |
| 10 | trust-all | DONE | Rows 39–48. |
| 11 | cookie-and-storage-audit | PASS (O) | One HttpOnly `SameSite=Lax` session cookie; localStorage `jeran.lang` and `jeran.appearance` (functional). Disclosed in the Privacy page. |
| 12 | consent-management | N/A (O) | `observe-runtime`: no third-party requests and no non-essential storage, so no consent banner is needed. Recheck if analytics are added. |
| 13 | analytics-privacy | N/A (O) | No analytics loaded. |
| 14 | third-party-privacy | PASS (O) | Fonts and icons self-hosted; zero third-party origins at runtime; CSP `default-src 'self'`. |
| 15 | policy-consistency | FIXED (O) | Privacy page now lists the exact storage keys and cookie lifetime that `observe-runtime` found. |
| 16 | data-flow-mapping | DONE (S) | Data stays in one SQLite database; only flows: browser ↔ own API. Export lists every table that holds the user's data. |
| 17 | privacy-readiness | PASS (T) | Pseudonymous display names, no phone or exact address collected, initials-only option for students, export and deletion in Settings. |
| 18 | privacy-policy | REVIEW | Plain-language policy written from observed behaviour. Needs a legal controller name and contact before a real launch. |
| 19 | terms-of-service | REVIEW | Terms page exists; needs legal review and an operating entity. |
| 20 | data-rights | FIXED (T) | Settings → Privacy: download my data (JSON), delete account (password + typed confirmation), unlink guardian. |
| 21 | email-compliance | N/A (S) | The app sends no email or SMS (stated in Settings → Notifications). |
| 22 | minors-readiness | REVIEW (T) | Guardian consent enforced server-side, no adult–minor messaging, no photos of students, safeguarding word filter in EN/AR. Guardian identity is not verified: real minors must not use it until a verified guardian check exists. |
| 23 | jurisdiction-applicability | REVIEW | UAE audience. UAE PDPL applicability and school safeguarding rules need a lawyer. |
| 24 | consumer-protection-readiness | N/A | No sales or prices. |
| 25 | regulated-domain-triggers | REVIEW | Minors + education-adjacent volunteering record. Hours are labelled as not an official UAE certificate everywhere. |
| 26 | legal-identity-notices | REVIEW | No operator entity or address exists yet; none was invented. |
| 27 | ai-features-readiness | N/A (S) | No AI features in the product. |
| 28 | user-content-safety | PASS (T) | Listings moderated before publishing, unsafe-task filter, reports queue with suspend action, reporter hidden from hosts. |
| 29 | seo-readiness | FIXED (O) | Real `robots.txt` (public pages only, private areas disallowed) and `sitemap.xml`, per-route titles, canonical. Localhost URLs in them come from the request host. UNVERIFIED until deployed. |
| 30 | social-sharing | FIXED (O) | og:title, og:description, og:image (1200×630 from the logo, absolute URL), twitter:card. |
| 31 | structured-data | N/A | A private app; no public entities to mark up. |
| 32 | search-console-readiness | UNVERIFIED | Needs the production domain. |
| 33 | wcag-readiness | PASS (O) | `audit-markup`: 0 findings. Labels, landmarks, skip link, focus moves on navigation, switches use `role="switch"`, 44px touch targets, reduced motion and text-size settings, RTL. Not a WCAG conformance claim. |
| 34 | multilingual-readiness | PASS (T) | EN/AR parity test (every key, matching placeholders, no English left in Arabic). Arabic loads on demand. |
| 35 | rtl-readiness | PASS (O) | `dir="rtl"`, logical CSS, mirrored arrows and switches, bidi-isolated names in mixed lists. |
| 36 | admin-audit-log | PASS (T) | Every privileged action is written to the audit log and shown as a plain sentence, grouped by day. |
| 37 | admin-authorization | PASS (T) | Role checks on the server; cross-role and guessed-ID access tests pass. |
| 38 | admin-dashboard | DONE | Overview, communities, users (detail sheet), moderators, reports, hours oversight, audit, platform settings. |
| 39 | content-trust | PASS (O) | No fake stats or testimonials; every number is a live count. |
| 40 | error-pages | PASS (O) | Not-found, access-denied, per-request error state with retry. |
| 41 | failure-resilience | FIXED (O) | Offline banner, retry on errors, double-submit guard, reload when a stale chunk is requested after deploy. |
| 42 | faq-readiness | PASS | Help page with six real questions. |
| 43 | forms-readiness | FIXED (O) | Sign-in and registration now `method="post"` (was GET, HIGH). Inline EN/AR errors, focus on first invalid field. |
| 44 | launch-identity | FIXED (O) | Logo, favicon, PWA icons, manifest, theme colour. |
| 45 | legal-navigation | PASS (O) | About, Safety, Privacy, Terms, Help from sign-in and Settings → Help. |
| 46 | link-integrity | PASS (O) | `check-links`: 0 findings. |
| 47 | mobile-readiness | FIXED (O) | Floating tab bar, no horizontal overflow on any route at 375px, small touch targets fixed. |
| 48 | performance-readiness | FIXED (O) | Brotli/gzip for all text assets; role screens, settings and Arabic split into chunks. `audit-assets`: 0 findings. |
| 49 | public-support | FIXED | Settings → Help: contact support and report a problem both go to the admin reports queue. |
| 50 | payments-readiness | N/A | No payments. |
| 51 | subscription-readiness | N/A | No subscriptions. |
| 52 | dependency-security | PASS (S) | Runtime dependencies: React and React DOM only; server uses Node built-ins. |
| 53 | deployment-cleanup | PASS (O) | `scan-secrets`: 0 findings; no source maps; demo accounts only when `DEMO=1`. |
| 54 | security-headers | PASS (O) | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. HSTS belongs on the TLS proxy (UNVERIFIED). |
| 55 | web-security | PASS (T) | scrypt passwords, hashed session tokens, CSRF header check, rate limits, server validation, CSV formula guard, password change signs out other devices. |

## Next action
Deploy behind HTTPS with `SECURE_COOKIES=1`, then re-run `inspect-metadata` against the real domain to clear rows 29 and 32.
