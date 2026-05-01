---
name: grafana-plugin-release
description: >-
  Release the Grafana Cube datasource plugin end-to-end: babysit a feature PR
  until green and merge it, create and merge a release PR (version bump +
  changelog), tag the release, and run the CD workflow through all environments.
  Use when the user mentions release, publish, ship, deploy the plugin, or
  babysit a PR.
---

# Grafana Plugin Release

Full release lifecycle for `grafana/grafana-cube-datasource`. Covers babysitting
a PR, creating a release PR, tagging, and CD deployment.

## Phase 1 — Babysit & merge the feature PR

If the user provides a PR to babysit before releasing:

1. Poll CI with `gh pr checks <PR> --repo grafana/grafana-cube-datasource`
   every 60–90s until all checks resolve.
2. Triage any Bugbot or reviewer comments — fix what you agree with, explain
   when you disagree.
3. If a check **fails**, investigate the logs:
   `gh run view <run-id> --repo grafana/grafana-cube-datasource --log-failed`
4. Once green + mergeable, merge with squash and delete the remote branch:
   `gh pr merge <PR> --repo grafana/grafana-cube-datasource --squash --delete-branch`
5. Switch to main and pull: `git checkout main && git pull`
6. Delete local branches for the merged PR and any predecessor PRs the user
   mentions: `git branch -D <branch> ...`
7. Prune stale remote-tracking refs: `git fetch --prune origin`

## Phase 2 — Create the release PR

1. **Determine the version bump.** Review commits since the last tag:

   ```
   git log $(git describe --tags --abbrev=0)..HEAD --oneline
   ```

   - New features → `minor`
   - Bug fixes only → `patch`
   - Breaking changes → `major`

   Ask the user to confirm the version if unsure.

2. **Create the release branch and bump:**

   ```
   git checkout -b sj/release/v<VERSION>
   npm version <patch|minor|major> --no-git-tag-version
   ```

3. **Update `CHANGELOG.md`.** Prepend a new section after `# Changelog`:

   ```markdown
   ## <VERSION> (<YYYY-MM-DD>)

   ### Features | Bug Fixes | Security | Breaking Changes

   - **Short bold title**: Description (#PR)

   **Full Changelog**: [v<PREV>...v<VERSION>](https://github.com/grafana/grafana-cube-datasource/compare/v<PREV>...v<VERSION>)
   ```

   Only list user-facing changes (features, fixes, security, deprecations).
   Skip dependency bumps unless they fix a CVE worth calling out.

4. **Commit, push, and open the PR:**

   ```
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore: release v<VERSION>"
   git push -u origin HEAD
   gh pr create --title "chore: release v<VERSION>" --body "..."
   ```

   PR body should include a summary table of what's included and a release
   checklist (CI, merge, tag, CD).

5. **Babysit the release PR** using the same polling loop from Phase 1.

6. **Merge** when green:
   `gh pr merge <PR> --repo grafana/grafana-cube-datasource --squash --delete-branch`

## Phase 3 — Tag & push

After the release PR is merged:

```
git checkout main && git pull
git tag v<VERSION>
git push origin v<VERSION>
```

This triggers `.github/workflows/release.yml` which:
- Builds and signs the plugin for all platforms
- Creates a **draft** GitHub release with artifacts and SHA checksums
- Generates provenance attestation

Verify the release workflow completes:

```
gh run list --workflow=release.yml --limit 1 --repo grafana/grafana-cube-datasource
```

Then publish the draft release:

```
gh release edit v<VERSION> --repo grafana/grafana-cube-datasource --draft=false
```

## Phase 4 — CD deployment

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

```
gh run list --workflow=publish.yaml --limit 1 --repo grafana/grafana-cube-datasource --json status,conclusion,displayTitle
```

Wait for `"status": "completed"` and `"conclusion": "success"`.

## Phase 5 — Update internal Grafana instances

After the catalog publish completes, bump the plugin on the internal Grafana
Cloud instances and restart them. Use `gcom-ops` from the sibling
`deployment_tools` repo (`../deployment_tools/scripts/gcom/gcom-ops`), or a
local alias if available.

Update each instance to the latest catalog version:

```bash
gcom-ops /instances/bidev/plugins/grafana-cube-datasource -dversion=latest
gcom-ops /instances/bi/plugins/grafana-cube-datasource -dversion=latest
gcom-ops /instances/ops/plugins/grafana-cube-datasource -dversion=latest
```

Then restart each instance so the new version takes effect:

```bash
gcom-ops /instances/bidev/restart -d 'reason=SamJ here- bump Cube DS to version <VERSION>'
gcom-ops /instances/bi/restart -d 'reason=SamJ here- bump Cube DS to version <VERSION>'
gcom-ops /instances/ops/restart -d 'reason=SamJ here- bump Cube DS to version <VERSION>'
```

## Post-release

- Clean up the local release branch: `git branch -d sj/release/v<VERSION>`
- Verify the plugin version is live: check the
  [Grafana plugin catalog](https://grafana.com/grafana/plugins/grafana-cube-datasource/)
