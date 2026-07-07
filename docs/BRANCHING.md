# Branching workflow

`main` is production (what Vercel deploys live, what customers/staff use).
`dev` is the integration branch for groundwork and feature work — it should
have its own separate Vercel deployment (see below) so multi-iteration work is
verified before it ever reaches production.

## Day to day

1. Branch off `dev` for any feature/groundwork work: `claude/<name>` or
   `<name>` from `dev`, not `main`.
2. Open the PR with **base = `dev`**.
3. CI (`smoke`) runs the same way as it does against `main`.
4. Merge into `dev` once green. Iterate — `dev`'s Vercel deployment updates
   automatically on every merge, so it's always a live preview of
   in-progress work.
5. When a batch of work on `dev` is verified and ready to ship, open a
   **release PR: `dev` → `main`**. That is the *only* path that reaches
   production.

## One-time setup (outside this repo)

These need to happen once, by hand, and are prerequisites for the workflow
above to actually protect production:

1. **Second Vercel project** — import this same GitHub repo again as a new
   Vercel project, and set its **Production Branch** to `dev`. This gives a
   stable, persistent dev URL (distinct from per-PR preview URLs, which you
   already get today) that always reflects the latest merged `dev` commit.
   Do **not** repoint the existing project's production branch — that project
   stays tracking `main`.
2. **Branch protection on `main`** (GitHub → Settings → Branches → add rule
   for `main`):
   - Require a pull request before merging.
   - Require status checks to pass — select **`smoke`** (the CI job name).
     It needs to have run at least once against a branch/PR before it's
     selectable in the classic UI; pushing this PR to `dev` produces that run.
   - Require branches to be up to date before merging.
   - Do not allow force pushes; do not allow deletion.
   - Required approvals: your call given a small team — 0 is fine if you'd
     rather rely on the status check + your own review, or 1 if you want a
     second set of eyes before every release.
3. **GitHub default branch** — consider switching the repository's default
   branch to `dev` (Settings → General → Default branch). This makes new PRs
   opened from the GitHub UI target `dev` automatically, instead of someone
   having to remember to change the base away from `main`. The one thing to
   know: **scheduled GitHub Actions workflows (`keep-warm.yml`) always run
   using the copy of the workflow file on the default branch**, whichever
   branch that is. `keep-warm.yml` just pings a public URL with no
   branch-specific behavior, so this has no practical effect — but it's worth
   knowing if a scheduled workflow ever becomes branch-sensitive.

## What's already true without any of the above

`pull_request:` in `ci.yml` has no branch filter, so PRs targeting `dev` run
`smoke` exactly like PRs targeting `main` always have — no CI change was
needed for that half.
