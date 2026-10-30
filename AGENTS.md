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

## Rules

- The two imported folders are unmodified copies of their source repos. Their own `AGENTS.md`, tests and
  tooling apply to maintaining those repos, not to this one. Do not edit them here.
- Work on `main`.
- Skills run with full agent permissions. Review a new third-party skill before installing it.
