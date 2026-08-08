import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Money arithmetic goes through `@/core/numeric`, not through `Number()`, `parseFloat`, `parseInt`,
 * `Math.*` or a bare operator.
 *
 * The reason is not tidiness. A Counterparty quantity is an unsigned 64-bit integer, and every one
 * of those converts it to a double first: past 2^53 the value is wrong before the arithmetic starts.
 * That is the same defect as the `JSON.parse` rounding fixed in `losslessJson.ts`, and it reappears
 * wherever a call site reaches past the numeric layer. It is not hypothetical — PEPECASH's supply
 * rendered as 995,269,258.1111112 on screen until the display stopped converting.
 *
 * This was a ratchet over 143 known sites while they were being worked through. They are gone, so
 * the rule is simply none: `numeric.ts` covers arithmetic, comparison, rounding, and the three ways
 * a value can arrive (`toBigNumber` defaults, `toFiniteNumber` fails, `toSafeInteger` bounds), so
 * there is no money calculation that needs a raw operator. A new one means either a genuine gap in
 * that module — fill it there, which is what `add`, `sum`, `maximum` and `toFiniteNumber` came from
 * — or an exemption argued below.
 *
 * Written as a test rather than a script because that is where this codebase keeps rules it cannot
 * express in a linter; see `layering.test.ts`, which asserts the core/platform direction the same
 * way.
 */

/** Operators that silently narrow a 64-bit quantity to a double. */
const RAW_NUMERIC = /\b(Number\(|parseFloat\(|parseInt\(|Math\.(floor|round|ceil|abs|min|max|pow)\()/g;

/** Identifiers that mark a value as money rather than a count, index or block height. */
const MONEY = /quantity|amount|satoshi|sats|price|supply|balance|fee(?!dback)|rate|payout|escrow|dividend/i;

/** Values that are counts, not money: converting these to a double is exact and fine. */
const NOT_MONEY =
  /blockHeight|block_index|blockIndex|timeout|Date\.|\.length|index|vout|nonce|expiration|decimals|divisor|confirmations|attempts|retries|limit|offset/i;

/**
 * Files that define the numeric layer itself, or otherwise legitimately hold raw arithmetic.
 * Every entry needs a reason, because an unargued exemption is how the rule erodes.
 */
const EXEMPT = new Set([
  // Defines the conversions everything else is required to use.
  'core/numeric.ts',
  // Renders through Intl, which takes the exact string; the only Number() left is a validity check.
  'core/format.ts',
  // Bitcoin consensus arithmetic over protocol integers — vbytes and sizes, never asset quantities.
  'core/bitcoin/feeEstimation.ts',
]);

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Raw money arithmetic on a line, ignoring comments.
 *
 * Split on either line ending rather than on '\n' alone. JavaScript's `.` does not match `\r`, so on
 * a CRLF checkout `//.*$` never reaches end-of-line and strips nothing: comments were scanned as
 * code, and a comment mentioning `Number()` scored as a violation. It also made the count differ
 * between a Windows working copy and CI's Linux one.
 */
function violationsIn(source: string): number {
  let count = 0;
  for (const line of source.split(/\r?\n/)) {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (!MONEY.test(code) || NOT_MONEY.test(code)) continue;
    const matches = code.match(RAW_NUMERIC);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * `numeric.ts` re-exports BigNumber and wraps every operation the app needs, so a direct import is a
 * call site that has stepped outside the layer — and each one has gone on to use a constructor or
 * static that numeric already covers.
 */
const DIRECT_IMPORT = /from ['"]bignumber\.js['"]/;

describe('money arithmetic goes through @/core/numeric', () => {
  const files = sourceFiles(SRC).filter((file) => {
    const relative = file.slice(SRC.length + 1).split('\\').join('/');
    return !EXEMPT.has(relative);
  });

  const relative = (file: string) => file.slice(SRC.length + 1).split('\\').join('/');

  it('finds the sources', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never converts a money value with a raw operator', () => {
    const offenders = files
      .map((file) => ({ file: relative(file), count: violationsIn(readFileSync(file, 'utf8')) }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.file}: ${entry.count}`);

    expect(offenders).toEqual([]);
  });

  it('never imports bignumber.js directly', () => {
    const offenders = files
      .filter((file) => relative(file) !== 'core/numeric.ts')
      .filter((file) => DIRECT_IMPORT.test(readFileSync(file, 'utf8')))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  // The detector reads lines, so it is worth knowing it still reacts to the thing it is looking for.
  it('would catch a new one', () => {
    expect(violationsIn('const fee = Number(params.quantity) * 2;')).toBe(1);
    expect(violationsIn('const blockIndex = Number(tx.block_index);')).toBe(0);
    expect(violationsIn('// Number(quantity) in a comment is not code')).toBe(0);
    expect(violationsIn('const total = toNumber(multiply(quantity, price));')).toBe(0);
  });
});
