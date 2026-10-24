# AIVista — AI Search Revenue Agent

An agentic **Generative Engine Optimization (GEO)** platform. Give it a company and it investigates how AI assistants
(ChatGPT-style LLMs) talk about that brand versus its competitors — then tells you why, and what to do about it.

```
Company details → Website investigation → Customer query generation → AI search testing (many LLMs)
→ Competitor + citation analysis → Visibility gap diagnosis → GEO recommendations → Experiments → Measure impact
```

Everything runs on **free** tools and free-tier APIs. With no API keys at all, it runs in **demo mode**.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — it goes straight to the dashboard, which starts with a demo analysis of the
fictional company **Relay CRM**. There's no sign-in by default; set `REQUIRE_LOGIN=true` to require
email/password accounts, each with its own private workspace.

For crawling JavaScript-heavy websites (single-page apps), install the headless browser once:

```bash
npx playwright install chromium
```

Without it the crawler still works; it just can't read pages that render entirely in the browser.

## Features

- **Optional accounts & workspaces** (`REQUIRE_LOGIN=true`) — email/password sign-in (scrypt-hashed passwords, httpOnly session cookies, login rate limiting)
- **Investigation pipeline** — crawl → product understanding → customer queries → multi-LLM testing → analysis
- **Dashboard** — KPIs, visibility trend with projected impact, competitor table, findings with evidence
- **Experiments** — the agent proposes, you approve / start / complete
- **Monitoring** — re-run an analysis daily, weekly or monthly; each run adds a real data point to the trend
- **Reports** — run history with CSV / JSON export

## Live mode (real data, free APIs)

1. Copy `.env.example` to `.env`
2. Add free keys:
   - `GEMINI_API_KEY` — https://aistudio.google.com/apikey (query generation, analysis, recommendations, and a Google-Search-grounded assistant that returns real citations)
   - `OPENROUTER_API_KEY` — https://openrouter.ai/keys (free `:free` models are discovered automatically)
   - `GROQ_API_KEY` — https://console.groq.com/keys
   - Optional: `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `GITHUB_MODELS_TOKEN`
3. Restart `npm run dev`, click **New Analysis**, choose **Live**.

A live run needs Gemini plus at least one testing provider. Free tiers are rate-limited, so the app queues calls
per provider and retries on `429`; a 10-query run against ~15 models typically takes a few minutes.

## Deploy (free)

The app is one Node process that serves both the UI and the API.

**No card needed: Render free + Turso free** — step-by-step guide in [deploy/RENDER.md](deploy/RENDER.md).
Uses the native Node runtime from `render.yaml`; a free uptime monitor keeps it awake for scheduled monitoring.

**Oracle Cloud Always Free** (needs a card for identity verification) — free permanently, always on, enough memory for Chromium.
Follow the step-by-step guide in [deploy/ORACLE.md](deploy/ORACLE.md); `deploy/oracle-setup.sh` does the server setup
(Node.js, Chromium, Caddy with automatic HTTPS, systemd service) and `deploy/update.sh` deploys new commits.

**Render (free web service + free Turso database)**
1. Create a free database at https://turso.tech and copy its URL (`libsql://…`) and auth token.
2. Push this repo to GitHub.
3. In Render: **New → Blueprint**, pick the repo. `render.yaml` builds the `Dockerfile`.
4. Fill in `DATABASE_URL`, `DATABASE_AUTH_TOKEN` and your AI keys when prompted.
5. After creating your own account, set `ALLOW_SIGNUP=false` so strangers can't sign up.

Render's free tier sleeps after inactivity, so scheduled monitoring only runs while the service is awake.
For reliable monitoring use an always-on host (Render paid, Railway, Fly.io) or a VPS.

**Any Docker host**

```bash
docker build -t aivista .
```
```bash
docker run -p 3001:3001 -v aivista-data:/app/data --env-file .env aivista
```

**Without Docker**: `npm run build` then `npm start` (serves on `PORT`, default 3001).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Recharts, lucide-react, Motion |
| Backend | Node.js, Express 5, TypeScript (tsx), Server-Sent Events for live progress |
| Database | SQLite via libSQL + Drizzle ORM (`data/aivista.db`; point `DATABASE_URL` at Turso to host it) |
| Crawling | fetch + Cheerio, same-domain crawl prioritizing pricing/product/compare pages; Playwright (headless Chromium) fallback for JS-rendered pages |
| Auth | scrypt password hashing, hashed session tokens in SQLite, httpOnly cookies |
| Scheduling | in-process scheduler (checks every minute) for monitoring re-runs |
| AI | Gemini (brain) · OpenRouter free models, Groq, Cerebras, Mistral, GitHub Models (assistants under test) |

## How the numbers are computed

All metrics are computed from the raw AI answers with the same code in demo and live mode (`server/pipeline/metrics.ts`):

- **Mention rate** — share of answers that mention the brand
- **Recommendation rate** — share of answers that name the brand first
- **AI visibility** — weighted: named first = 1, top-3 = 0.6, any mention = 0.35
- **Citation coverage** — share of source-backed answers that include the brand
- **Projected impact** — confidence-weighted lift from the recommendations with diminishing returns
  (`server/pipeline/impact.ts`). It's an estimate; re-running the analysis after shipping changes measures the real effect.

## Project layout

```
shared/types.ts            Types shared by API and UI
server/index.ts            Express API + SSE
server/auth.ts             Accounts, sessions, workspaces
server/scheduler.ts        Monitoring schedules
server/pipeline/runner.ts  Orchestrates a run and persists results
server/pipeline/live.ts    Live engine (crawl → Gemini → free LLMs → Gemini diagnosis)
server/pipeline/demo.ts    Demo engine (deterministic simulated answers)
server/pipeline/metrics.ts Mention / citation / competitor analysis
server/pipeline/impact.ts  Trend, KPIs, projections, experiments
server/providers/          Gemini client, free-provider registry, rate limiter
src/                       React app (pages/, components/)
```

## Scripts

- `npm run dev` — API (port 3001) + UI (port 5173)
- `npm run build` then `npm start` — production build served by the API on port 3001
- `npm run lint` — type-check
