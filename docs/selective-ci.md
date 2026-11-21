# Selective CI (shadow-mode prototype)

This repo carries a prototype of **change-based test selection**: on every
pull request, the `Selective Tests (shadow)` workflow inspects the diff,
decides deterministically which test suites the change can plausibly affect,
runs only those, and publishes an audit trail of every decision to the job
summary. The full **Plugins - CI** pipeline continues to run unchanged on
every PR and on every push to `main` — selection is a _shadow_, not a gate.

It is also deliberately a small-scale testbed for a bigger idea: the same
machinery, pointed at a repo where tests dominate CI wall-clock (this repo's
tests do not — see [What this does and doesn't buy](#what-this-does-and-doesnt-buy-here)),
is the on-ramp to selective CI for much larger codebases, with
[yono](https://github.com/grafana/yono) overlays maintaining the policy.
See yono's `docs/guides/test-selection.md` for that half of the design.

## How it works

Three pieces, all in this repo:

| Piece    | File                                                                                | Role                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy   | [`.ci/test-selection.json`](../.ci/test-selection.json)                             | ~6 rules mapping path globs → test domains. The only hand-maintained artifact.                                                                    |
| Engine   | [`scripts/select-tests.mjs`](../scripts/select-tests.mjs)                           | Classifies the diff against the policy, emits the plan + audit trail. Dependency-free, unit-tested (`node --test scripts/select-tests.test.mjs`). |
| Workflow | [`.github/workflows/selective-tests.yml`](../.github/workflows/selective-tests.yml) | Runs the plan on PRs. Non-required check while in shadow mode.                                                                                    |

The plan has three axes:

- **Frontend (jest)** — the policy only decides _whether_ frontend tests run;
  _which_ tests run is derived from the real module dependency graph by
  `jest --findRelatedTests <changed files>`. There is no hand-written
  file→test map to rot. Toolchain-level changes (lockfile, jest config,
  `.config/`) escalate to the full jest suite because they invalidate the
  dependency graph itself.
- **Backend (go)** — any backend-affecting change runs `go test ./pkg/...`.
  The entire Go suite builds and runs in seconds here, so per-package
  selection via the import graph (the right answer at
  grafana/grafana scale) would add complexity for no saving.
- **E2E (Playwright)** — report-only: the plan records whether the change
  is e2e-affecting, but Playwright still runs only in the full pipeline.
  This is where the real wall-clock lives (five Grafana versions × image
  pull + boot), and the lever there is slimming the PR-time version matrix
  in the shared `plugin-ci-workflows` pipeline — a follow-up, not this
  prototype.

## Fail-safe rules

Selection can only err toward running **more** tests, never fewer:

1. A changed file matching **no policy rule** → full run of everything.
2. Changes to the selection machinery itself (`.ci/`, `scripts/`,
   `.github/`) → full run of everything.
3. A changed frontend file that no longer exists (delete/rename) → full
   jest suite, because its dependents can't be traced.
4. Any selector error (unreadable policy, git failure) → full-run plan and
   a green step, with the failure reason printed in the summary. The
   selector must never be the reason CI blocks a PR.

## Auditability

Every run writes to the GitHub job summary: the plan, and a per-file table
of _file → matched rule → domains_. When (not if) selection makes a call a
human disagrees with, the artifact to fix is a visible, versioned rule —
not a model's judgment. This is deliberate: the design keeps an LLM off the
critical path (deterministic machinery decides per-PR) and reserves it for
_maintaining_ the policy (see the yono overlay guide).

## Rollout plan

1. **Shadow (now).** Non-required check. Collect evidence: selective
   outcome vs full-suite outcome per PR. The metric that matters is
   _escapes_ — PRs where selection skipped a suite the full run failed.
   Target: zero over a meaningful sample.
2. **Gate.** Make `Selective Tests` a required check; keep the full suite
   required too (no time saved yet, but the gate is proven under load).
3. **Selective pre-merge.** Drop the full suite pre-merge: full pipeline
   runs on push to `main` (it already does), selective runs on PRs. A
   post-merge failure on `main` that a skipped test would have caught is
   the signal to tighten the policy — and the event a yono overlay reacts
   to automatically.
4. **E2E matrix.** Separately: reduce the PR-time Playwright matrix (e.g.
   oldest + newest supported Grafana) via `plugin-ci-workflows` inputs,
   full matrix post-merge.

## What this does and doesn't buy here

Measured on a recent green run of Plugins - CI (~10m46s wall-clock): actual
test execution is under ~2.5 minutes total — frontend test+build 45s,
backend test+build 12s, and five parallel ~21s Playwright suites wrapped in
~2–3 minutes each of runner queueing, Grafana image pulls, and setup. So in
this repo, selection buys a fast (~1–2 min) developer signal and, at stage
3, roughly a minute of required-check latency on docs/single-domain PRs.
The mechanism, the audit trail, and the rollout ladder are the deliverable;
the big wins belong to repos where the test-execution term dominates.

## Maintenance

The policy is a handful of rules over top-level directories and changes
only when the repo's shape changes (a new top-level dir, a new toolchain
file). Everything fine-grained is derived per-run from the actual
dependency graph. Unrecognized paths fail safe to a full run, so a stale
policy degrades to "runs too much", never "skips too much". The yono
`test-selection` overlay (see yono repo) closes the loop long-term:
it watches CI events, audits escapes and over-selection, and proposes
policy updates as reviewable PRs.
