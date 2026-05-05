---
name: grafana-plugin-release
description: >-
  Release the Grafana Cube datasource plugin end-to-end: babysit a feature PR
  until green and merge it, trigger the version-bump-changelog workflow to
  publish a release, and run the CD workflow to deploy to Grafana Cloud.
  Use when the user mentions release, publish, ship, deploy the plugin, or
  babysit a PR.
---

# Grafana Plugin Release

Full release lifecycle for `grafana/grafana-cube-datasource`. Covers babysitting
a feature PR, cutting a release via the automated version-bump workflow, and
deploying via the CD workflow.

The version bump, `CHANGELOG.md` generation and tag push all happen in CI via
the `Version bump, changelog` workflow — there are no local `git`, `npm` or
worktree commands to run. The only local credential needed is `gh` auth to
trigger the workflows.

## Phase 1 — Babysit & merge the feature PR

If the user provides a PR to babysit before releasing:

1. Poll CI with `gh pr checks <PR> --repo grafana/grafana-cube-datasource`
   every 60–90s until all checks resolve.
2. Triage any Bugbot or reviewer comments — fix what you agree with, explain
   when you disagree.
3. If a check **fails**, investigate the logs:
   `gh run view <run-id> --repo grafana/grafana-cube-datasource --log-failed`
4. PR titles must follow conventional commits (`feat:`, `fix:`, `chore:`, …) —
   the `Conventional Commits` check enforces this and the prefix decides the
   `CHANGELOG.md` section the change is filed under. Fix the title with
   `gh pr edit <PR> --title "..."` if it fails.
5. Once green + mergeable, merge with squash and delete the remote branch:
   `gh pr merge <PR> --repo grafana/grafana-cube-datasource --squash --delete-branch`
6. Delete local branches for the merged PR and any predecessor PRs the user
   mentions: `git branch -D <branch> ...`
7. Prune stale remote-tracking refs: `git fetch --prune origin`

## Phase 2 — Cut the release

Trigger the `Version bump, changelog` workflow. It bumps the version in
`package.json` + `package-lock.json`, generates a `CHANGELOG.md` entry from
conventional commits since the last tag, commits to `main`, and pushes the
tag. The tag push then triggers `release.yml` to build a draft GitHub release.

**Determine the version bump.** Review commits since the last tag:

```bash
LAST_TAG=$(gh release list --repo grafana/grafana-cube-datasource --limit 1 --json tagName --jq '.[0].tagName')
gh api "repos/grafana/grafana-cube-datasource/compare/${LAST_TAG}...main" \
  --jq '.commits[] | "\(.sha[:8]) \(.commit.message | split("\n")[0])"'
```

- Any `feat:` → `minor`
- Only `fix:` / `chore:` / `docs:` / `ci:` etc. → `patch`
- Any `feat!:` or `BREAKING CHANGE:` → `major`

Ask the user to confirm the version if unsure.

**Trigger the workflow:**

```bash
gh workflow run version-bump-changelog.yml \
  --repo grafana/grafana-cube-datasource \
  -f version=<patch|minor|major> -f generate-changelog=true
```

Wait for it to complete:

```bash
gh run list --workflow=version-bump-changelog.yml --limit 1 \
  --repo grafana/grafana-cube-datasource \
  --json status,conclusion,displayTitle
```

A successful run pushes a `vX.Y.Z` tag, which triggers `release.yml` to build
a **draft** GitHub release with signed plugin artefacts, SHA checksums and
provenance attestation. Wait for that workflow too:

```bash
gh run list --workflow=release.yml --limit 1 \
  --repo grafana/grafana-cube-datasource \
  --json status,conclusion,displayTitle
```

Publish the draft release:

```bash
gh release edit v<VERSION> --repo grafana/grafana-cube-datasource --draft=false
```

## Phase 3 — CD deployment

The CD workflow (`.github/workflows/publish.yaml`) publishes to the Grafana
plugin catalog. It is triggered via `workflow_dispatch`. Each environment is
an independent run (they don't bundle each other).

Available environments: `dev`, `ops`, `prod-canary`, `prod`.

**Default: deploy straight to prod.** While the plugin is experimental and
moving fast, skip the staged rollout and go directly to prod:

```bash
gh workflow run publish.yaml --repo grafana/grafana-cube-datasource \
  -f branch=main -f environment=prod
```

If the user wants a staged rollout instead, deploy through environments in
order (dev -> ops -> prod-canary -> prod), confirming each succeeds before
proceeding.

Poll the run with:

```bash
gh run list --workflow=publish.yaml --limit 1 \
  --repo grafana/grafana-cube-datasource \
  --json status,conclusion,displayTitle
```

Wait for `"status": "completed"` and `"conclusion": "success"`.

## Phase 4 — Internal post-publish steps

After the catalog publish completes, follow the internal post-publish runbook
to bump the plugin on the relevant Grafana Cloud instances and restart them.

## Post-release

- Verify the plugin version is live: check the
  [Grafana plugin catalog](https://grafana.com/grafana/plugins/grafana-cube-datasource/)
