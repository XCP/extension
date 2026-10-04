import fs from 'node:fs';

const [logFile, source] = process.argv.slice(2);
if (!logFile || !source) throw new Error('Usage: node scripts/update-e2e-timings.mjs run.log <run URL>');
const log = fs.readFileSync(logFile, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
const seconds = {};
for (const line of log.split('\n')) {
  if (!line.includes('Run E2E tests')) continue;
  const file = /(e2e\/[^:]+\.spec\.ts):\d+:\d+/.exec(line);
  const time = /\(([\d.]+)(ms|s|m)\)\s*$/.exec(line);
  if (!file || !time) continue;
  seconds[file[1]] = (seconds[file[1]] ?? 0) + Number(time[1]) * ({ ms: 0.001, s: 1, m: 60 }[time[2]]);
}
if (!Object.keys(seconds).length) throw new Error('No E2E timings found; keeping the existing baseline');
const sorted = Object.fromEntries(Object.entries(seconds).sort(([a], [b]) => a.localeCompare(b, 'en'))
  .map(([file, duration]) => [file, Math.round(duration * 1000) / 1000]));
fs.writeFileSync(new URL('../e2e/timings.json', import.meta.url), JSON.stringify({ source, seconds: sorted }, null, 2) + '\n');
console.log(`Updated timings for ${Object.keys(seconds).length} files`);
