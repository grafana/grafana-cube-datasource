#!/usr/bin/env node
/**
 * Assert that every `overrides` entry in package.json is actually reflected in
 * package-lock.json.
 *
 * `npm ci` cannot catch this. npm never records `overrides` in the lockfile, so
 * it has nothing to compare against, and a stale nested entry whose original
 * range still matches is left untouched. That let PR #550 merge green with a
 * declared js-yaml override silently unapplied: package.json pinned
 * @istanbuljs/load-nyc-config's js-yaml to 5.3.0 while the lockfile kept
 * resolving 3.15.1 (fixed in #563).
 *
 * Renovate edits lockfiles surgically rather than regenerating them, so it can
 * bump an override in package.json while rewriting only the top-level lockfile
 * entry. Expect this check to fire on that, and see the remediation it prints -
 * plain `npm install` will not fix it.
 */
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

// Flat overrides ("js-yaml": "5.3.0") apply to every instance in the tree.
// Nested overrides ({"parent": {"child": "..."}}) apply only under that parent.
const flat = new Map();
const nested = [];
for (const [name, value] of Object.entries(pkg.overrides ?? {})) {
  if (typeof value === 'string') {
    flat.set(name, value);
  } else {
    for (const [child, version] of Object.entries(value)) {
      if (typeof version === 'string') {
        nested.push({ parent: name, child, version });
      }
    }
  }
}

const MARKER = 'node_modules/';
const problems = [];

for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path || !meta.version) {
    continue;
  }
  const name = path.slice(path.lastIndexOf(MARKER) + MARKER.length);

  // npm applies the most specific matching rule, so a nested override for this
  // exact path wins over a flat override of the same package name.
  const rule = nested.find((n) => path === `node_modules/${n.parent}/node_modules/${n.child}`);
  const expected = rule ? rule.version : flat.get(name);
  if (!expected || meta.version === expected) {
    continue;
  }

  const source = rule ? `nested override under ${rule.parent}` : 'override';
  problems.push(`${path}\n      locked ${meta.version}, ${source} declares ${expected}`);
}

if (problems.length > 0) {
  console.error(`package-lock.json does not honour ${problems.length} declared override(s):\n`);
  for (const problem of problems) {
    console.error(`  - ${problem}\n`);
  }
  console.error('To fix: delete the offending entries from package-lock.json, then run');
  console.error('`npm install --package-lock-only`. Plain `npm install` will NOT self-heal,');
  console.error('because the locked version still satisfies the dependency range it came from.');
  process.exit(1);
}

console.log(`All ${flat.size + nested.length} declared override(s) are honoured in package-lock.json.`);
