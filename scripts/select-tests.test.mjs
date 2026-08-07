import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { globToRegExp, classifyFile, buildPlan } from './select-tests.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(path.join(repoRoot, '.ci', 'test-selection.json'), 'utf8'));

test('globToRegExp semantics', () => {
  assert.equal(globToRegExp('src/**').test('src/utils/buildCubeQuery.ts'), true);
  assert.equal(globToRegExp('src/**').test('pkg/plugin/query.go'), false);
  assert.equal(globToRegExp('**/*.md').test('README.md'), true);
  assert.equal(globToRegExp('**/*.md').test('docs/a/b.md'), true);
  assert.equal(globToRegExp('**/*.md').test('src/datasource.ts'), false);
  assert.equal(globToRegExp('*.md').test('docs/a.md'), false);
  assert.equal(globToRegExp('go.???').test('go.sum'), true);
  assert.equal(globToRegExp('go.???').test('go.mod/x'), false);
  // regex metacharacters in path names must be treated literally
  assert.equal(globToRegExp('a+b/**').test('a+b/c.ts'), true);
  assert.equal(globToRegExp('a+b/**').test('aab/c.ts'), false);
});

test('docs-only change skips every suite', () => {
  const plan = buildPlan(['README.md', 'docs/selective-ci.md', 'src/img/logo.svg'], policy);
  assert.equal(plan.frontend, 'skip');
  assert.equal(plan.backend, 'skip');
  assert.equal(plan.e2e, false);
});

test('frontend source change selects related jest tests and flags e2e', () => {
  const plan = buildPlan(['src/utils/buildCubeQuery.ts'], policy);
  assert.equal(plan.frontend, 'related');
  assert.deepEqual(plan.frontendFiles, ['src/utils/buildCubeQuery.ts']);
  assert.equal(plan.backend, 'skip');
  assert.equal(plan.e2e, true);
});

test('backend change runs full go suite, skips jest', () => {
  const plan = buildPlan(['pkg/plugin/query.go', 'go.sum'], policy);
  assert.equal(plan.backend, 'run');
  assert.equal(plan.frontend, 'skip');
  assert.equal(plan.e2e, true);
});

test('frontend toolchain change escalates to full jest suite', () => {
  const plan = buildPlan(['package-lock.json'], policy);
  assert.equal(plan.frontend, 'full');
  assert.equal(plan.backend, 'skip');
});

test('workflow/selection-infra change runs everything', () => {
  for (const f of ['.github/workflows/push.yaml', '.ci/test-selection.json', 'scripts/select-tests.mjs']) {
    const plan = buildPlan([f], policy);
    assert.equal(plan.full, true, f);
    assert.equal(plan.frontend, 'full', f);
    assert.equal(plan.backend, 'run', f);
    assert.equal(plan.e2e, true, f);
  }
});

test('unrecognized file falls back to full run (fail-safe)', () => {
  const plan = buildPlan(['mystery-new-dir/thing.xyz'], policy);
  assert.equal(plan.full, true);
  const d = classifyFile('mystery-new-dir/thing.xyz', policy);
  assert.equal(d.glob, null);
});

test('deleted frontend file widens jest run to full (fail-safe)', () => {
  const exists = (f) => f !== 'src/utils/removed.ts';
  const plan = buildPlan(['src/utils/removed.ts'], policy, exists);
  assert.equal(plan.frontend, 'full');
  assert.deepEqual(plan.frontendFiles, []);
});

test('mixed frontend and backend change runs both, selectively where possible', () => {
  const plan = buildPlan(['src/datasource.ts', 'pkg/plugin/datasource.go'], policy);
  assert.equal(plan.frontend, 'related');
  assert.equal(plan.backend, 'run');
  assert.equal(plan.e2e, true);
});

test('e2e-only change touches neither unit suite', () => {
  const plan = buildPlan(['tests/queryEditor.spec.ts', 'playwright.config.ts'], policy);
  assert.equal(plan.frontend, 'skip');
  assert.equal(plan.backend, 'skip');
  assert.equal(plan.e2e, true);
});
