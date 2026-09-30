# 03 · Deploy on a new Vercel project

Vercel hosts only the **web app**. The pipeline runs on your laptops. Vercel cannot reach a Postgres on your laptop, so a deployed app needs a hosted database.

## Plan rules that matter (checked against Vercel's docs)

- **Hobby** is free but non-commercial only. It does not support collaboration on **private** repos: the commit author must be the Hobby team owner. Collaboration is free for **public** repos.
- **Pro** has team collaboration, $20 per developer seat per month, with a trial.
- Each teammate's `git config user.email` must match their GitHub account, and their Vercel account must be linked to GitHub.

Pick the option you chose in docs/01. Public repo plus Hobby is the cheapest path for a class project.

## Status for this team

- Repo: https://github.com/kjodhpur/GrantI (public). Vercel team: `kjodhpurs-projects` (Hobby).
- **Vercel project: `granti`** (team `kjodhpurs-projects`), linked to `kjodhpur/GrantI`, Next.js, production branch `main`. Every push to `main` deploys to production. Dashboard: https://vercel.com/kjodhpurs-projects/granti
- Production URLs: https://granti-rouge.vercel.app and https://granti-kjodhpurs-projects.vercel.app
- **`DATABASE_URL` is not set yet**, so the deployed page shows "DATABASE_URL is not set". Do step 1 below, then add it in Project Settings → Environment Variables (Production and Preview) and redeploy.
- **Sharing:** Hobby has no team seats, so Rithik and Sankalp do not need Vercel accounts to contribute. Add them as GitHub collaborators (repo Settings → Collaborators); every push then builds on Vercel.
- **Preview links are behind Vercel Authentication by default**, so teammates without Vercel access get a login wall. Either use `npm run dev` locally, or in Vercel → Project → Settings → Deployment Protection set Vercel Authentication to "Only production" or off (the app shows only public IRS data; the database password is never exposed to the browser).

## 1. Hosted database (pick one, all have a free tier)

Neon, Supabase, or Vercel's Marketplace Postgres. Create a project, copy the **pooled** connection string (it looks like `postgresql://user:pass@host/db?sslmode=require`). Then load the data from your laptop:

```bash
export DATABASE_URL='<pooled string>'
cd pipeline && python build_foundations.py --year 2025 --load-only
```

The full 2025 set is about 130,000 rows: small for any free tier. Confirm the free tier's storage limit before loading several years.

## 2. Import the project

1. vercel.com → Add New → Project → Import your GitHub repo (install the Vercel GitHub app for that repo if asked).
2. **Root Directory: `web`** (click Edit). This is the step people miss in a monorepo.
3. Framework preset: Next.js (auto-detected). Leave build settings alone.
4. Environment Variables: add `DATABASE_URL` = the pooled string. Add it for Production and Preview.
5. Deploy.

Every push to a branch gets a preview URL; merging to `main` updates production.

## 3. Add teammates

- Public repo on Hobby: teammates push to GitHub; Vercel builds it. They do not need to be added to the Vercel team.
- Private repo on Pro: Vercel → Team Settings → Members → Invite.

## 4. If a deploy fails

- Build error mentioning `web/`: Root Directory is not set to `web`.
- Page says "DATABASE_URL is not set": add the variable, then Redeploy (variables apply to new deployments only).
- "Database error": wrong string, or the table is empty. Run the load step against that database.
- Commit blocked or "no access": author email does not match GitHub, or private repo on Hobby with a non-owner committer.

## Optional: use the Vercel CLI

`npm i -g vercel`, then `vercel link` inside the repo and choose the `web` root. `vercel env pull web/.env.local` copies the project's environment variables to your machine.
