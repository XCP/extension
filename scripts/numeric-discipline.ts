/**
 * Money arithmetic must go through `@/core/numeric`, not through `Number()`, `parseFloat`,
 * `Math.*` or a bare `/`.
 *
 * The reason is not tidiness. A Counterparty quantity is a 64-bit integer, and every one of those
 * operators converts it to a double first: above 2^53 the value is wrong before the arithmetic
 * starts. That is the same defect as the `JSON.parse` rounding fixed in `losslessJson.ts`, and it
 * reappears wherever a call site reaches past the numeric layer. `numeric.ts` exports `multiply`,
 * `divide`, `subtract`, `toBigNumber`, `toSatoshis`, `fromSatoshis` and the comparison helpers, so
 * there is no arithmetic that needs a raw operator.
 *
 * A one-time cleanup would not hold — the count grew to three figures while nobody was counting.
 * This is a ratchet instead: BASELINE records what each file is currently allowed, the check fails
 * if any file exceeds it, and lowering a number is the only permitted edit. New code starts at
 * zero because a file absent from BASELINE is allowed none.
 *
 * Run: npx tsx scripts/numeric-discipline.ts
 *      npx tsx scripts/numeric-discipline.ts --update   (only ever to lower a count)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

/** Operators that silently narrow a 64-bit quantity to a double. */
const RAW_NUMERIC = /\b(Number\(|parseFloat\(|parseInt\(|Math\.(floor|round|ceil|abs|min|max|pow)\()/g;

/** Identifiers that mark a value as money rather than a count, index or block height. */
const MONEY = /quantity|amount|satoshi|sats|price|supply|balance|fee(?!dback)|rate|payout|escrow|dividend/i;

/** Values that are counts, not money: converting these to a double is exact and fine. */
const NOT_MONEY = /blockHeight|block_index|blockIndex|timeout|Date\.|\.length|index|vout|nonce|expiration|decimals|divisor|confirmations|attempts|retries|limit|offset/i;

/** Files that define the numeric layer, or otherwise legitimately hold raw arithmetic. */
const EXEMPT = [
  'src/core/numeric.ts',
  'src/core/format.ts',
  // Bitcoin consensus arithmetic operates on protocol integers, not asset quantities.
  'src/core/bitcoin/feeEstimation.ts',
];

export function violationsIn(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (!MONEY.test(code) || NOT_MONEY.test(code)) continue;
    const matches = code.match(RAW_NUMERIC);
    if (matches) count += matches.length;
  }
  return count;
}

const BASELINE_PATH = join(process.cwd(), 'scripts', 'numeric-discipline.baseline.json');

function scan(): Record<string, number> {
  const files = globSync('src/**/*.{ts,tsx}', { cwd: process.cwd() })
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !f.includes('__tests__') && !f.includes('.test.'))
    .filter((f) => !EXEMPT.includes(f));

  const counts: Record<string, number> = {};
  for (const file of files) {
    const n = violationsIn(readFileSync(file, 'utf8'));
    if (n > 0) counts[file] = n;
  }
  return counts;
}

const current = scan();
const total = Object.values(current).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update')) {
  let baseline: Record<string, number> = {};
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    // First run: whatever is there becomes the ceiling.
  }
  const raised = Object.entries(current).filter(([f, n]) => n > (baseline[f] ?? 0));
  if (raised.length > 0 && Object.keys(baseline).length > 0) {
    console.error('Refusing to raise the baseline. These files gained raw money arithmetic:');
    for (const [f, n] of raised) console.error(`  ${f}: ${baseline[f] ?? 0} -> ${n}`);
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(current).length} files, ${total} sites.`);
  process.exit(0);
}

let baseline: Record<string, number>;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error('No baseline. Run with --update to record one.');
  process.exit(1);
}

const regressions = Object.entries(current)
  .filter(([file, n]) => n > (baseline[file] ?? 0))
  .map(([file, n]) => `  ${file}: ${baseline[file] ?? 0} allowed, ${n} found`);

const improved = Object.entries(baseline).filter(
  ([file, n]) => (current[file] ?? 0) < n
);

if (regressions.length > 0) {
  console.error('Raw money arithmetic added outside @/core/numeric:\n');
  console.error(regressions.join('\n'));
  console.error('\nUse multiply/divide/subtract/toBigNumber/isGreaterThan from @/core/numeric.');
  console.error('A 64-bit quantity passed through Number() is already rounded.');
  process.exit(1);
}

console.log(`${total} sites across ${Object.keys(current).length} files, none above baseline.`);
if (improved.length > 0) {
  console.log(`${improved.length} file(s) improved — run --update to lock the gain in.`);
}
