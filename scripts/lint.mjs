/** Per-file/rule warning budgets let legacy code improve without admitting new debt. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const executable = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url));
const baselinePath = new URL('../lint-baseline.json', import.meta.url);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const diagnostics = [];
for (const args of [
  ['src', '--format=json'],
  ['src', '--type-aware', '-A', 'all', '-W', 'typescript/no-floating-promises', '-W', 'typescript/no-misused-promises', '--format=json'],
]) {
  const result = spawnSync(process.execPath, [executable, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error(`Oxlint failed to run: ${result.error?.message ?? result.stderr ?? result.signal}`);
  }
  const output = JSON.parse(result.stdout);
  if (!Array.isArray(output.diagnostics)) throw new Error('Oxlint returned no diagnostics array');
  diagnostics.push(...output.diagnostics);
  if (result.status !== 0 && !output.diagnostics.some(item => item.severity === 'error')) {
    throw new Error(`Oxlint failed without an error diagnostic: ${result.stderr}`);
  }
}

const counts = new Map();
let failed = false;
for (const diagnostic of diagnostics) {
  const filename = diagnostic.filename.replaceAll('\\', '/');
  const key = `${filename} | ${diagnostic.code}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  if (diagnostic.severity === 'error' || counts.get(key) > (baseline.warnings[key] ?? 0)) {
    const line = diagnostic.labels?.[0]?.span?.line ?? 1;
    console.error(`${filename}:${line}: ${diagnostic.code}: ${diagnostic.message}`);
    failed = true;
  }
}

// Never adds allowances: fixes reduce the committed budget, including deleted files.
const pruned = Object.fromEntries(Object.entries(baseline.warnings)
  .map(([key, count]) => [key, Math.min(count, counts.get(key) ?? 0)])
  .filter(([, count]) => count > 0));
if (process.argv.includes('--prune')) {
  baseline.warnings = pruned;
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
} else if (process.env.CI && JSON.stringify(pruned) !== JSON.stringify(baseline.warnings)) {
  // In CI, a budget above the current count is slack a later change could spend on new
  // warnings, so the committed baseline must already be pruned.
  console.error('lint-baseline.json allows more warnings than remain; run `npm run lint:prune` and commit it.');
  failed = true;
}
console.log(`${diagnostics.length} lint warnings/errors; ${failed ? 'new violations detected' : 'all within the existing per-file/rule budgets'}.`);
process.exitCode = failed ? 1 : 0;
