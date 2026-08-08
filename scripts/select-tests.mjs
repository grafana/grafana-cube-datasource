#!/usr/bin/env node
/**
 * Change-based test selection engine (shadow-mode prototype).
 *
 * Reads the set of files changed by a PR, classifies each file against the
 * policy in .ci/test-selection.json, and emits a test plan:
 *
 *   frontend: "related" (jest --findRelatedTests <files>) | "full" | "skip"
 *   backend:  "run" (go test ./pkg/...) | "skip"
 *   e2e:      affected true/false (report-only while in shadow mode)
 *
 * Design constraints (see docs/selective-ci.md):
 *  - Deterministic: the same diff always yields the same plan.
 *  - Fail-safe: anything unrecognized, any error reading the diff or the
 *    policy, and any deleted/renamed frontend file escalates toward running
 *    MORE tests, never fewer. Selection failures produce a full-run plan
 *    with exit code 0 rather than a red check.
 *  - Auditable: every per-file decision (file -> matched glob -> domains) is
 *    written to the GitHub job summary.
 *
 * Usage:
 *   node scripts/select-tests.mjs --base origin/main
 *   node scripts/select-tests.mjs --files-from changed.txt   # for testing
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Convert a policy glob to an anchored RegExp.
 * Supported syntax: "**" (any path, crossing "/"), "*" (within one path
 * segment), "?" (single non-"/" character). "**\/" also matches zero
 * directories, so "**\/*.md" matches "README.md".
 */
export function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

/** First-match-wins classification of one file against the policy rules. */
export function classifyFile(file, policy) {
  for (const rule of policy.rules) {
    for (const glob of rule.match) {
      if (globToRegExp(glob).test(file)) {
        return { file, glob, domains: rule.domains, reason: rule.reason ?? '' };
      }
    }
  }
  // Fail-safe: a file the policy does not recognize runs everything.
  return { file, glob: null, domains: ['full'], reason: 'no rule matched (fail-safe default)' };
}

/**
 * Build the test plan for a set of changed files.
 * `fileExists` is injectable for tests; the real caller passes fs.existsSync
 * so that deleted/renamed frontend files (whose dependents jest can no
 * longer trace) escalate the frontend run to "full".
 */
export function buildPlan(changedFiles, policy, fileExists = () => true) {
  const decisions = changedFiles.map((f) => classifyFile(f, policy));

  const has = (domain) => decisions.some((d) => d.domains.includes(domain));
  const full = has('full');

  let frontend = 'skip';
  let frontendFiles = [];
  if (full || has('frontend-full')) {
    frontend = 'full';
  } else if (has('frontend')) {
    frontendFiles = decisions.filter((d) => d.domains.includes('frontend')).map((d) => d.file);
    if (frontendFiles.every((f) => fileExists(f))) {
      frontend = 'related';
    } else {
      // A deleted source file's dependents cannot be found via
      // --findRelatedTests, so widen to the full frontend suite.
      frontend = 'full';
      frontendFiles = [];
    }
  }

  const backend = full || has('backend') ? 'run' : 'skip';
  const e2e = full || has('e2e');

  return { frontend, frontendFiles, backend, e2e, full, decisions };
}

function changedFilesFromGit(baseRef) {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', `${baseRef}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function fullRunPlan(reason) {
  return {
    frontend: 'full',
    frontendFiles: [],
    backend: 'run',
    e2e: true,
    full: true,
    decisions: [],
    failSafe: reason,
  };
}

function writeGithubOutputs(plan, listFile) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  appendFileSync(
    out,
    [
      `frontend=${plan.frontend}`,
      `backend=${plan.backend}`,
      `e2e_affected=${plan.e2e}`,
      `frontend_files_list=${listFile ?? ''}`,
      '',
    ].join('\n')
  );
}

function writeSummary(plan, changedFiles) {
  const lines = [];
  lines.push('## Selective test plan (shadow mode)');
  lines.push('');
  if (plan.failSafe) {
    lines.push(`> ⚠️ Fail-safe triggered — running everything. Reason: ${plan.failSafe}`);
    lines.push('');
  }
  lines.push('| Suite | Decision |');
  lines.push('|---|---|');
  const frontendLabel =
    plan.frontend === 'related'
      ? `related tests only (${plan.frontendFiles.length} changed source file(s) → \`jest --findRelatedTests\`)`
      : plan.frontend;
  lines.push(`| Frontend (jest) | ${frontendLabel} |`);
  lines.push(`| Backend (go test ./pkg/...) | ${plan.backend} |`);
  lines.push(
    `| E2E (Playwright) | ${plan.e2e ? 'affected — full CI e2e matrix applies' : 'not affected by this change'} |`
  );
  lines.push('');
  lines.push(`${changedFiles.length} changed file(s). Per-file decisions:`);
  lines.push('');
  lines.push('<details><summary>Audit trail</summary>');
  lines.push('');
  lines.push('| File | Matched rule | Domains |');
  lines.push('|---|---|---|');
  for (const d of plan.decisions) {
    lines.push(`| \`${d.file}\` | \`${d.glob ?? '(none)'}\` | ${d.domains.join(', ') || 'none'} |`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push(
    'This check is a non-blocking shadow of the full **Plugins - CI** pipeline. ' +
      'See `docs/selective-ci.md` for the model, fail-safe rules, and rollout plan.'
  );
  const text = lines.join('\n') + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  }
  return text;
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const baseRef = getArg('--base');
  const filesFrom = getArg('--files-from');
  const policyPath = getArg('--policy') ?? '.ci/test-selection.json';

  if (!baseRef && !filesFrom) {
    console.error('usage: select-tests.mjs --base <ref> | --files-from <path> [--policy <path>]');
    process.exit(1);
  }

  let plan;
  let changedFiles = [];
  try {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    changedFiles = filesFrom
      ? readFileSync(filesFrom, 'utf8').split('\n').filter(Boolean)
      : changedFilesFromGit(baseRef);
    plan = buildPlan(changedFiles, policy, existsSync);
  } catch (err) {
    // Selection must never be the reason CI goes red or tests get skipped.
    plan = fullRunPlan(`selector error: ${err.message}`);
  }

  let listFile;
  if (plan.frontend === 'related' && plan.frontendFiles.length > 0) {
    listFile = path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'selective-tests-frontend-files.txt');
    writeFileSync(listFile, plan.frontendFiles.join('\n') + '\n');
  }

  writeGithubOutputs(plan, listFile);
  const summary = writeSummary(plan, changedFiles);
  console.log(summary);
  console.log(JSON.stringify({ ...plan, decisions: undefined }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
