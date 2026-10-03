# GPI frontend

Frontend-first Grant Prospect Intelligence app built with Next.js App Router and TypeScript. The marketing site and product demo render without external credentials. Demo prospect records and evidence are fictional; the foundation dataset route uses the existing Postgres connection when configured.

## Run locally

```bash
npm install
npm run dev
npm run build
```

## Routes

- `/` — Product story and homepage
- `/platform` — Interactive demo workspace
- `/prospects/[id]` — Prospect intelligence and human review demo
- `/platform/foundations` — Existing parsed IRS 990-PF dataset browser (requires `DATABASE_URL`)
- `/pricing`, `/about`, `/login` — Supporting product pages

## Deploy to Vercel

Import the repository in Vercel and select the `web` directory as the root directory. Vercel detects Next.js and uses the default build command. No environment variables are required for the marketing site or demo. Configure `DATABASE_URL` only when the foundation dataset route should query a hosted Postgres database.

Alternatively, upload the `web` project folder through Vercel Drop for a first deployment. For ongoing work, connect the repository to GitHub so pushes can create deployments and previews.