# 04 · How the three of us work

## Suggested split (change freely)

| Person | Owns |
|---|---|
| Kanha | Repo, Vercel project, pipeline runs and data releases |
| Rithik | Web app: foundation profile page, ranking UI |
| Sankalp | Classification (LLM) and scoring; outcome logging |

## Daily habits

1. `git pull` on `main` before you start.
2. Commit small, straight on `main` (team decision: no pull requests): `git add -A && git commit -m "Add foundation profile page"`.
3. `git pull --rebase`, then `git push`. Vercel deploys `main` to production on every push.
4. Tell the others in chat before big changes to files someone else owns.
5. Before each push run `cd web && npm run build && npm run lint`.

## Never commit

- `.env`, `.env.local`, any API key or database password (rotate immediately if you do).
- `data/` (IRS files, Parquet). Share processed files by drive.
- Anything from the design-partner client: briefs, funder lists, contact names, donor data. Keep those in a private shared folder outside the repo. The .gitignore blocks `client/`, `*.docx` and `*.pptx` as a safety net.

## Data releases

Only one person reruns the full pipeline. After a run, share `data/processed/foundations_<year>.parquet` and everyone reloads with `--load-only`.

## Schema changes

Edit `pipeline/schema.sql`, tell the team in chat and in the commit message, and everyone reruns the load (it truncates and reloads `foundations`; `outcomes` is untouched).
