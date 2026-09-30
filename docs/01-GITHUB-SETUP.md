# 01 · Create the GitHub repo

Decide first: **public or private?** It changes what Vercel lets you do for free (see 03).

| Option | Repo | Vercel | Cost | Rule |
|---|---|---|---|---|
| A (simplest) | Public | Hobby, all 3 teammates can push | $0 | No client names or files anywhere in the repo |
| B | Private | Pro trial, then $20 per developer seat per month | $0 during trial | Safe for client-related work |
| C | Private | Hobby | $0 | Hobby does not support collaborators on private repos: commits must come from the Hobby account owner only. Not recommended |

Recommendation: **A for the class project**, keeping it generic ("Grant Prospect Intelligence"). Do not name the design-partner client in a public repo unless they approve.

## Status: done

The repo exists and is **public** (option A): https://github.com/kjodhpur/GrantI. Vercel is on Hobby (free). Nothing to create; skip to "Add teammates".

## Add teammates

Repo → Settings → Collaborators → Add people → Rithik and Sankalp by GitHub username. They accept the emailed invite.

## Each teammate, first time

```bash
git clone https://github.com/kjodhpur/GrantI.git
git config user.name  "Your Name"
git config user.email "<the email on your GitHub account>"
```

The email must match your GitHub account or Vercel will not attribute your commits to you.

## Protect main (2 minutes)

Not used. The team pushes directly to `main` with no pull requests, so leave branch protection off. Pull with `git pull --rebase` before every push.
