# Deploy AIVista on Render (free) + Turso (free) — no card needed

You'll end up with AIVista online at `https://aivista-xxxx.onrender.com`, with its data in a free Turso
database and a free uptime monitor keeping it awake so scheduled monitoring keeps running.
Total time: about 20–30 minutes.

**Trade-offs of the free plan:** 512 MB of memory, so JavaScript-heavy websites are crawled without a
headless browser (normal websites crawl fine). Free plans and their limits change — check each sign-up page.

---

## 1. Create the database on Turso

1. Go to https://turso.tech and **Sign up** with GitHub.
2. In the dashboard: **Databases → Create Database**. Name it `aivista`, pick the location closest to
   your Render region (e.g. *Singapore* / *Mumbai* if available), and create it.
3. On the database page, copy the **URL** — it looks like `libsql://aivista-yourname.turso.io`.
4. Click **Create Token** (or *Generate token*), keep *read & write*, no expiry, and copy the token.

Keep both somewhere safe for step 2. The token is a password — don't share it or commit it.

## 2. Deploy on Render

1. Go to https://render.com and **Sign up** with GitHub.
2. When asked which repositories Render may access, allow **roomslabdesigns-collab/aivista-v2**.
3. In the dashboard: **New + → Blueprint**, pick **aivista-v2**, and click **Connect**.
   Render reads `render.yaml` from the repo.
4. It asks for the secret values. Fill in:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Turso URL from step 1 |
   | `DATABASE_AUTH_TOKEN` | the Turso token from step 1 |
   | `GEMINI_API_KEY` | your Gemini key (or leave empty for demo mode only) |
   | `GROQ_API_KEY` | tester 1 — https://console.groq.com/keys |
   | `COHERE_API_KEY` | tester 2 — https://dashboard.cohere.com/api-keys |

   The testers are optional individually; live mode needs Gemini plus at least one of them.

5. Click **Apply**. The first build takes 3–5 minutes. When the status shows **Live**, open the
   `https://aivista-….onrender.com` link at the top of the service page.

## 3. Open the app

Open your site — there's no sign-in page; it goes straight to the dashboard with a demo analysis.

> **Anyone who has the link can use the app**, see your analyses, and (once API keys are set)
> spend your free AI quotas. Keep the link private. To require accounts instead, set
> `REQUIRE_LOGIN` to `true` in Render → **Environment**, sign up, then set `ALLOW_SIGNUP` to `false`.

## 4. Keep it awake (so monitoring runs on schedule)

Free Render services sleep after ~15 minutes without visitors, and the scheduler can't run while asleep.

1. Go to https://uptimerobot.com and sign up (free, no card).
2. **Add New Monitor**:
   - Type: **HTTP(s)**
   - URL: `https://aivista-….onrender.com/api/config`
   - Interval: **5 minutes**
3. Save. It also emails you if the site goes down.

(Alternative: https://cron-job.org with a job hitting the same URL every 10 minutes.)

---

## Updating the site

Every `git push` to `main` redeploys automatically:

```bash
git push
```

Your data stays in Turso, so redeploys and restarts don't lose anything.

## Checking logs

Render dashboard → your service → **Logs**. If you see
`WARNING: DATABASE_URL is not set`, the Turso URL is missing from the Environment settings.

## Troubleshooting

- **First visit takes ~30–60 seconds:** the service was asleep; the uptime monitor prevents this.
- **Build fails:** open the build logs in Render and send me the error.
- **"Please sign in" loop:** make sure you're using the `https://` address.
- **Turso errors in the logs (401/403):** the token is wrong or expired — create a new one and update
  `DATABASE_AUTH_TOKEN`.
