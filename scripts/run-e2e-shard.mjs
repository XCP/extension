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

function main() {
  const [selector, ...args] = process.argv.slice(2);
  const match = /^(\d+)\/(\d+)$/.exec(selector ?? '');
  if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) {
    throw new Error('Usage: node scripts/run-e2e-shard.mjs current/total [Playwright options]');
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
