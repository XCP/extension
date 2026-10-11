import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function planShards(files, timings, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Shard count must be positive');
  if (new Set(files).size !== files.length) throw new Error('Duplicate collected file');
  const samples = Object.values(timings).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const fallback = samples[Math.floor(samples.length / 2)] ?? 60;
  const weight = file => Number.isFinite(timings[file]) && timings[file] > 0 ? timings[file] : fallback;
  const shards = Array.from({ length: count }, () => ({ seconds: 0, files: [] }));
  for (const file of [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b, 'en'))) {
    const shard = shards.reduce((best, next) => next.seconds < best.seconds ? next : best);
    shard.files.push(file);
    shard.seconds += weight(file);
  }
  return shards;
}

export function fileFilter(file) {
  // Playwright filters absolute file paths with regular expressions, including on Windows.
  return file.split('/').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]') + '$';
}

function runShard([selector, ...args]) {
  const match = /^(\d+)\/(\d+)$/.exec(selector ?? '');
  if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) {
    throw new Error('Usage: node scripts/e2e.mjs run current/total [Playwright options]');
  }
  if (args.some(arg => arg.startsWith('--shard'))) throw new Error('Do not combine weighted and native sharding');
  const cli = path.resolve('node_modules/@playwright/test/cli.js');
  // Ask Playwright what it actually collects: new specs enter the plan even without timing data,
  // while deleted files and config-excluded specs cannot influence the selection.
  const collected = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (collected.status !== 0) {
    process.stderr.write(collected.stderr ?? '');
    process.stderr.write(collected.stdout ?? '');
    throw new Error('Playwright collection failed');
  }
  const report = JSON.parse(collected.stdout);
  if (report.errors?.length) throw new Error('Playwright reported collection errors');
  const files = [...new Set(report.suites.map(suite =>
    path.relative(process.cwd(), path.resolve(report.config.rootDir, suite.file)).split(path.sep).join('/')))];
  if (!files.length) throw new Error('No E2E files collected');
  const timings = JSON.parse(fs.readFileSync(new URL('../e2e/timings.json', import.meta.url), 'utf8')).seconds;
  const shards = planShards(files, timings, Number(match[2]));
  const shard = shards[Number(match[1]) - 1];
  if (!shard.files.length) throw new Error('Empty shard; reduce the shard count');
  console.log(`E2E shard ${selector}: ${shard.files.length}/${files.length} files, estimated ${(shard.seconds / 60).toFixed(1)} minutes`);
  const result = spawnSync(process.execPath, [cli, 'test', ...shard.files.map(fileFilter), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function parseTimings(log) {
  const seconds = {};
  for (const line of log.replace(/\x1b\[[0-9;]*m/g, '').split('\n')) {
    if (!line.includes('Run E2E tests')) continue;
    const file = /(e2e\/[^:]+\.spec\.ts):\d+:\d+/.exec(line);
    const time = /\(([\d.]+)(ms|s|m)\)\s*$/.exec(line);
    if (!file || !time) continue;
    seconds[file[1]] = (seconds[file[1]] ?? 0) + Number(time[1]) * ({ ms: 0.001, s: 1, m: 60 }[time[2]]);
  }
  if (!Object.keys(seconds).length) throw new Error('No E2E timings found; keeping the existing baseline');
  return Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([file, duration]) => [file, Math.round(duration * 1000) / 1000]));
}

function updateTimings([logFile, source]) {
  if (!logFile || !source) throw new Error('Usage: node scripts/e2e.mjs timings run.log <run URL>');
  const seconds = parseTimings(fs.readFileSync(logFile, 'utf8'));
  fs.writeFileSync(new URL('../e2e/timings.json', import.meta.url), JSON.stringify({ source, seconds }, null, 2) + '\n');
  console.log(`Updated timings for ${Object.keys(seconds).length} files`);
}

async function check() {
  const { default: assert } = await import('node:assert/strict');
  const { test } = await import('node:test');

  test('CI browser images match the pinned Playwright runner', () => {
    const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const workflows = new URL('../.github/workflows/', import.meta.url);
    const images = fs.readdirSync(workflows).filter(file => /\.ya?ml$/.test(file)).flatMap(file => {
      const text = fs.readFileSync(new URL(file, workflows), 'utf8');
      return [...text.matchAll(/mcr\.microsoft\.com\/playwright:v([^\s]+)-noble/g)].map(match => ({ file, version: match[1] }));
    });
    assert.ok(images.length > 0, 'Expected CI to use the Playwright image');
    for (const image of images) assert.equal(image.version, manifest.devDependencies['@playwright/test'], image.file);
  });

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

  test('timings aggregate seconds, milliseconds and minutes from E2E steps only', () => {
    const timings = parseTimings([
      'job Run E2E tests e2e/b.spec.ts:1:1 test (1m)',
      '\x1b[32mjob Run E2E tests e2e/a.spec.ts:2:3 test (250ms)\x1b[0m',
      'job Run E2E tests e2e/a.spec.ts:4:5 test (1.2345s)',
      'job Run unit tests e2e/a.spec.ts:4:5 test (99s)',
      'job Run E2E tests no duration here',
    ].join('\n'));
    assert.deepEqual(timings, { 'e2e/a.spec.ts': 1.485, 'e2e/b.spec.ts': 60 });
    assert.deepEqual(Object.keys(timings), ['e2e/a.spec.ts', 'e2e/b.spec.ts']);
    assert.throws(() => parseTimings('no E2E results'), /keeping the existing baseline/);
  });

  test('invalid shard selectors and native sharding fail before collection', () => {
    for (const selector of [undefined, '0/6', '7/6', '1/0', 'not-a-shard']) {
      assert.throws(() => runShard([selector]), /Usage:/);
    }
    assert.throws(() => runShard(['1/6', '--shard=1/2']), /Do not combine/);
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'run': return runShard(args);
    case 'timings': return updateTimings(args);
    case 'check': return check();
    default: throw new Error('Usage: node scripts/e2e.mjs <run current/total [Playwright options] | timings run.log <run URL> | check>');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
