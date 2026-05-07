---
name: grafana-plugin-release
description: >-
  Release the Grafana Cube datasource plugin end-to-end: babysit a feature PR
  until green and merge it, merge the release-please PR to publish a release,
  and run the CD workflow to deploy to Grafana Cloud.
  Use when the user mentions release, publish, ship, deploy the plugin, or
  babysit a PR.
---

# Grafana Plugin Release

Full release lifecycle for `grafana/grafana-cube-datasource`. Covers babysitting
a feature PR, cutting a release by merging the release-please PR, and deploying
via the CD workflow.

Version bump, `CHANGELOG.md` generation and tag push all happen in CI. A
release PR is maintained automatically by the `Release Please` workflow on
every push to `main` — to cut a release you just merge it. There are no local
`git`, `npm` or worktree commands to run. The only local credential needed is
`gh` auth to trigger workflows and merge PRs.

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

Release-please maintains a "chore(main): release X.Y.Z" PR that is updated on
every push to `main`. It bumps `package.json` / `package-lock.json` and
prepends a `CHANGELOG.md` entry derived from conventional commits since the
last tag.

Bump rules (configured in `release-please-config.json`, with
`bump-minor-pre-major` + `bump-patch-for-minor-pre-major` set for 0.x):

- Any `feat!:` or `BREAKING CHANGE:` → `minor` (would be `major` post-1.0)
- Any `feat:` → `patch` (would be `minor` post-1.0)
- Only `fix:` / `chore:` / `docs:` / `ci:` etc. → `patch`

**Find the open release PR:**

```bash
gh pr list --repo grafana/grafana-cube-datasource \
  --label 'autorelease: pending' --json number,title,headRefName
```

If none exists, run `gh workflow run release-please.yml --repo grafana/grafana-cube-datasource`
to create one (it normally auto-runs on push to `main`).

Review the PR — confirm the proposed version and changelog match your intent.
If the version is wrong, either adjust commit messages on `main` (then push)
or use a `Release-As: X.Y.Z` footer in a follow-up commit.

**Merge the release PR** with squash:

```bash
gh pr merge <PR> --repo grafana/grafana-cube-datasource --squash --delete-branch
```

Merging tags `vX.Y.Z`, which triggers `release.yml` to build a **draft**
GitHub release with signed plugin artefacts, SHA checksums and provenance
attestation. Wait for that workflow:

```bash
gh run list --workflow=release.yml --limit 1 \
  --repo grafana/grafana-cube-datasource \
  --json status,conclusion,displayTitle
```

**Edit the draft's release notes** before publishing — the
`grafana/plugin-actions/build-plugin` action populates the body with submission
boilerplate that's irrelevant to consumers. Replace it with the matching
`CHANGELOG.md` section, but **keep** the attestation link line that
`build-plugin` adds.

1. Read the new `vX.Y.Z` section from `CHANGELOG.md`.
2. Read the current draft body and grab the line that starts with
   `This build has been attested. You can view the attestation details [here](...)`.
3. Tidy up the changelog markdown (issue/PR links default to `/issues/` —
   GitHub redirects, but `/pull/` is more accurate; drop the per-line commit
   SHA links if they feel like noise).
4. Combine the two and update the draft:

   ```bash
   gh release edit v<VERSION> --repo grafana/grafana-cube-datasource --notes "$(cat <<'EOF'
   ## [<VERSION>](https://github.com/grafana/grafana-cube-datasource/compare/v<PREV>...v<VERSION>) (YYYY-MM-DD)

   ### Features
   ...

   ### Bug Fixes
   ...

   This build has been attested. You can view the attestation details [here](https://github.com/grafana/grafana-cube-datasource/attestations/<ID>).
   EOF
   )"
   ```

Then publish the draft and mark it as latest:

```bash
gh release edit v<VERSION> --repo grafana/grafana-cube-datasource --draft=false --latest
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
