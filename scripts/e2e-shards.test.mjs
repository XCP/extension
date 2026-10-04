import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileFilter, planShards } from './run-e2e-shard.mjs';

test('every collected file belongs to exactly one shard, including new files without timings', () => {
  const files = ['heavy.spec.ts', 'medium.spec.ts', 'small.spec.ts', 'new.spec.ts'];
  const timings = { 'heavy.spec.ts': 100, 'medium.spec.ts': 60, 'small.spec.ts': 20, 'deleted.spec.ts': 90 };
  const plan = planShards(files, timings, 2);
  assert.deepEqual(plan.flatMap(s => s.files).sort(), [...files].sort());
  assert.equal(new Set(plan.flatMap(s => s.files)).size, files.length);
  assert.ok(plan.every(s => s.seconds > 0));
  assert.deepEqual(planShards([...files].reverse(), timings, 2), plan);
});

test('duration balancing spreads heavy files instead of grouping them by file order', () => {
  const files = ['a', 'b', 'c', 'd'];
  const plan = planShards(files, { a: 100, b: 100, c: 10, d: 10 }, 2);
  assert.deepEqual(plan.map(s => s.seconds), [110, 110]);
});

test('missing or invalid timings cannot exclude a spec', () => {
  const files = ['zero', 'negative', 'unknown'];
  assert.deepEqual(planShards(files, { zero: 0, negative: -1 }, 1)[0].seconds, 180);
  assert.throws(() => planShards(['same', 'same'], {}, 2), /Duplicate/);
  assert.throws(() => planShards(files, {}, 0), /positive/);
});

test('file filters match exact paths on Linux and Windows, including bracketed route names', () => {
  const filter = new RegExp(fileFilter('e2e/pages/assets/[txHash].spec.ts'));
  assert.ok(filter.test('/app/e2e/pages/assets/[txHash].spec.ts'));
  assert.ok(filter.test('C:\\app\\e2e\\pages\\assets\\[txHash].spec.ts'));
  assert.ok(!filter.test('/app/e2e/pages/assets/t.spec.ts'));
  assert.ok(!filter.test('/app/e2e/pages/assets/[txHash].spec.ts.bak'));
});
