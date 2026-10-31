# AGENTS.md

Team 26 AI Hackathon. The app scaffold is intentionally empty until the rules are announced.
Do not create one unprompted.

## Skills

Skills live in three places. Only the first is auto-discovered, so read the others on demand.

### 1. Installed skills (auto-discovered)

In `.claude/skills/` (mirrored in `.agents/skills/`). Use them when the task matches.

| Skill | Use when |
|-------|----------|
| `base44-sdk` | Planning or writing anything that talks to Base44: entities, backend functions, actors, agents, AI gateway. Read it before implementing a feature. |
| `base44-sandbox` | Developing a Base44 app remotely in its cloud sandbox, with no local checkout. |
| `frontend-design` | Building new UI or reshaping existing UI, and avoiding templated defaults. |
| `webapp-testing` | Running and testing the local web app with Playwright: screenshots, console logs, UI behavior. |
| `vercel-react-best-practices` | Writing or reviewing React/Next.js code for performance. |
| `web-design-guidelines` | Reviewing UI code for accessibility and UX guideline compliance. |

### 2. `experience-skills/` (UI/UX quality)

Specialists live in `experience-skills/skills/<name>/SKILL.md`. Read the `SKILL.md` before applying one.

- Start with `experience-architect` for any user-facing screen, flow or app.
- Use `use-all-skills` only when asked for a full Experience Skills pass.
- Reach for a specialist when its symptom shows up: `composition-repair` (empty or unbalanced layouts),
  `interaction-design` (forms, controls), `motion-design`, `responsive-validation` (before shipping),
  `state-design`, `empty-state-design`, `visual-identity`, `workflow-compression`,
  `product-friction`, `interface-forensics`, `anti-slop-ui` / `anti-ai-slop` (generic-looking UI),
  `critical-review` (judging finished work).

### 3. `readyvibe-skills/` (launch readiness)

Specialists live in `readyvibe-skills/skills/<group>/<name>/SKILL.md`.

- For "make this ready to launch", use `skills/core/launch-all`.
- Narrower entry points in `skills/core/`: `quality-all`, `compliance-all`, `discoverability-all`,
  `production-all`, `trust-all`.
- Groups: `accessibility`, `admin`, `commerce`, `compliance`, `discoverability`,
  `internationalization`, `quality`, `security`.

## Running the app locally (Base44 sandbox)

The app lives in `app/` and runs from source with live reload via `docker-compose.base44.yml`:

```bash
docker compose -f docker-compose.base44.yml up -d --build   # then http://localhost:3000
```

- `web` is the Vite dev server (host port 3000) and proxies `/api` to `http://api:8787`;
  the proxy target comes from `API_PROXY_TARGET` (defaults to `http://localhost:8787`).
- `api` runs `node --watch-path=/app/server server/index.js`; Node **24** is required because the
  server uses the built-in `node:sqlite` (Node 22 needs a flag, which `app/package.json` ignores).
- `deps` is a one-shot `npm ci` service: both app services wait for it so they never install concurrently.
- `DEMO=1` seeds the fictional demo data into the empty database on first boot and lists the demo
  accounts (password `Demo#2026`) under "demo accounts" on the sign-in screen. The SQLite file lives on
  the `api-data` volume at `/data/team26.db`; `docker compose down -v` resets it.
- Tests run inside the containers, e.g.
  `docker compose -f docker-compose.base44.yml exec -T api npm test`.

Prefer this over `app/Dockerfile`, which builds a production image and freezes the source.

Split hosting (frontend on Vercel, API in the container) is documented in `app/DEPLOY.md` §1b.
The client reads `VITE_API_BASE` at build time (`app/src/api.js`); the server answers CORS only for
`ALLOWED_ORIGINS` and switches the session cookie to `SameSite=None; Secure` when `COOKIE_SAMESITE=none`.
Before a split deploy, run the suite: `npm test` (now `node --test test/*.test.js`, which Node 24 requires).

## Rules

- The two imported folders are unmodified copies of their source repos. Their own `AGENTS.md`, tests and
  tooling apply to maintaining those repos, not to this one. Do not edit them here.
- Work on `main`.
- Skills run with full agent permissions. Review a new third-party skill before installing it.
