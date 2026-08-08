import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every test can fail.
 *
 * A test with no assertion passes for as long as its subject does not throw, which means it passes
 * when the subject is deleted, when it returns the wrong answer, and when it returns nothing at
 * all. It is worse than no test: it occupies the name of the thing that should have been checked,
 * and it counts toward a green suite, so nobody looks again.
 *
 * This is not hypothetical here. `bip322-standardness.test.ts` had two tests that called the
 * verifier and `console.log`ged the result. One was logging `false` for a valid BIP-322
 * P2TR test vector — a real verifier gap, sitting inside a passing suite, and paired with the
 * wrong message on top of that. Both were fixed once the test had to assert something. The other was
 * re-using a signature that had already been established to not belong to its address (see the
 * fixture removed from `wallet-fixtures.test.ts`), asserting nothing while its comment claimed the
 * verification "should work". Both had survived at least one deliberate sweep for exactly this
 * defect, because a sweep is a memory and this is a rule.
 *
 * **Why this is not a regex.** The naive version — flag any `it()` without a literal `expect(` —
 * reports 14 tests here, and 9 of them are fine: the compose suites assert through
 * `assertComposeUrlCalled`. An invariant that cries wolf gets deleted, so this resolves helpers.
 * A function counts as asserting if its body asserts, or if it calls something that asserts, to a
 * fixpoint. Matching is by name across files, which is imprecise in one direction only: a helper
 * sharing a name with an asserting function would let a bad test through. It never invents a
 * violation, which is the property that keeps the rule alive.
 *
 * `.skip` is not an escape hatch — biome's `noSkippedTests` is already an error. `.todo` is
 * allowed, because a todo declares that it does not test anything yet.
 *
 * Written as a test rather than a script for the reason `numericDiscipline.test.ts` gives: it is
 * where this codebase keeps rules a linter cannot express.
 */

/** A direct assertion. `verifyProperty` is the fuzz suites' own assertion entry point. */
export const ASSERTION =
  /\b(expect|assert|assertType|expectTypeOf|verifyProperty)\s*\(|\.(toThrow|rejects|resolves)\b/;

/**
 * `it(`, `test(`, `it.each(...)(`, `it.concurrent(` — and the modifier, so `.todo` is visible.
 *
 * The lookbehind is load-bearing: `\b` matches between a dot and a word, so `ASSERTION.test(body)`
 * and every other `.test(` call read as a test declaration. That alone produced most of the first
 * run's false positives.
 */
export const TEST_START = /(?<![.\w])(it|test)((?:\.\w+)*)\s*\(/g;

/** `function name(`, `const name = (`, `const name = async (`, `const name = function` */
export const FUNCTION_DEF =
  /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g;


/** `src/`, from `src/core/__tests__/helpers/`. */
export const SRC = join(__dirname, '..', '..', '..');

export function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') out.push(...testFiles(full));
    } else if (/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Helper modules the suites import their assertions from. */
export function helperFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') out.push(...helperFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Characters after which a `/` begins a regex literal rather than a division.
 *
 * The usual JavaScript lexing ambiguity. Getting it wrong in the permissive direction (treating a
 * division as a regex) would blank real code, so the set is the conservative one: positions where a
 * value cannot already be complete.
 */
const REGEX_MAY_FOLLOW = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';']);

/**
 * `}` is deliberately absent: in a `.tsx` file `<Foo prop={value} />` puts a `/` right after one,
 * and reading that as a regex blanks the rest of the file until the next slash. That single
 * character reported 40-odd asserting tests as violations.
 *
 * `=>` is included because `.filter((f) => /re/.test(f))` is the shape this repo's own invariant
 * tests use, and `>` alone would catch `a > b / c`.
 *
 * A newline is not a position either, and must not reset what came before it: JSX is routinely
 * formatted with the closing `/>` alone on its own line, so treating start-of-line as a regex
 * position turned every self-closing tag into one.
 */
function regexMayFollow(prev: string | undefined, prev2: string | undefined, word: string): boolean {
  if (prev === undefined) return true;
  if (prev === '>' ) return prev2 === '=';
  if (REGEX_MAY_FOLLOW.has(prev)) return true;
  return ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'instanceof'].includes(word);
}

/**
 * The source with comments, string bodies and regex literals blanked, positions preserved.
 *
 * Brace matching has to run over this rather than the raw text: a brace inside a string literal or
 * a comment would otherwise close a test block early, and `expect(` written inside a comment would
 * score as an assertion. Length is preserved so offsets still index the original.
 *
 * Regex literals have to be handled for the same reason as strings, and the first version of this
 * did not — which made `getByPlaceholderText(/Leave empty to use UTXO's address/i)` open a string at
 * the apostrophe that ran on and swallowed the `expect()` after it. Two genuinely asserting tests
 * were reported as violations, including one in `layering.test.ts`, this repo's other invariant.
 */
export function blank(source: string): string {
  const out = source.split('');
  let i = 0;
  /** Last significant character seen, for the regex-vs-division decision. */
  let prev: string | undefined;
  let prev2: string | undefined;
  /** The identifier immediately before `prev`, for the keyword cases (`return /re/`). */
  let word = '';
  while (i < source.length) {
    const c = source[i] ?? '';
    const next = source[i + 1];
    if (c === '/' && next !== '/' && next !== '*' && regexMayFollow(prev, prev2, word)) {
      out[i++] = ' ';
      let inClass = false;
      while (i < source.length && (inClass || source[i] !== '/')) {
        if (source[i] === '\\') { out[i] = ' '; i++; }
        else if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        if (i < source.length) {
          if (source[i] !== '\n' && source[i] !== '\r') out[i] = ' ';
          i++;
        }
      }
      if (i < source.length) out[i++] = ' ';
      while (i < source.length && /[dgimsuvy]/.test(source[i] ?? '')) out[i++] = ' ';
      prev2 = prev; prev = 'x'; word = '';
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') out[i++] = ' ';
    } else if (c === '/' && next === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] !== '\n' && source[i] !== '\r') out[i] = ' ';
        i++;
      }
      if (i < source.length) { out[i++] = ' '; out[i++] = ' '; }
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { out[i] = ' '; i++; }
        if (i < source.length) {
          if (source[i] !== '\n' && source[i] !== '\r') out[i] = ' ';
          i++;
        }
      }
      i++;
      // A completed string is a value, so a `/` after it is division.
      prev2 = prev; prev = 'x'; word = '';
    } else {
      // A newline is whitespace: it does not end an expression, so `prev` carries across it. JSX is
      // routinely formatted with the closing `/>` alone on its own line, so treating start-of-line
      // as a regex position turned every self-closing tag into one — and the resulting "regex" ran
      // on to the next slash in the file, blanking the assertion that followed.
      if (c === '\n' || c === '\r') word = '';
      else if (c.trim()) {
        word = /\w/.test(c) ? word + c : '';
        prev2 = prev;
        prev = c;
      }
      i++;
    }
  }
  return out.join('');
}

/** The span from an opening paren at `open` to its match, over already-blanked source. */
function matchParen(blanked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < blanked.length; i++) {
    if (blanked[i] === '(') depth++;
    else if (blanked[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return blanked.length - 1;
}

/**
 * The body of a function whose definition starts at `from`, by brace matching.
 *
 * An earlier version read a fixed 4000 characters instead. That is not merely imprecise, it is
 * imprecise in the dangerous direction: any function *declared within 4000 characters of an
 * unrelated `expect(`* was marked as asserting, so tests calling it were excused. It hid a real
 * assertion-free test in `bip322-standardness.test.ts` that a manual read had already found.
 */
export function functionBody(blanked: string, from: number): string {
  const open = blanked.indexOf('{', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < blanked.length; i++) {
    if (blanked[i] === '{') depth++;
    else if (blanked[i] === '}') {
      depth--;
      if (depth === 0) return blanked.slice(open, i + 1);
    }
  }
  return blanked.slice(open);
}

/** Names of functions defined in `blanked` whose own body contains a direct assertion. */
export function directlyAssertingNames(blanked: string): Set<string> {
  const names = new Set<string>();
  for (const match of blanked.matchAll(FUNCTION_DEF)) {
    const name = match[1] ?? match[2];
    if (!name) continue;
    if (ASSERTION.test(functionBody(blanked, match.index ?? 0))) names.add(name);
  }
  return names;
}

/** Every call made inside a span, as bare identifiers. */
export function callsIn(blanked: string): string[] {
  return [...blanked.matchAll(/\b(\w+)\s*\(/g)].map((m) => m[1] ?? '');
}

export interface TestBlock {
  file: string;
  /** 1-based line of the declaration, so an offender can be opened directly. */
  line: number;
  name: string;
  modifier: string;
  body: string;
}

/** Every `it`/`test` block in a file, with its body already blanked. */
export function testBlocks(source: string, file = ''): TestBlock[] {
  const blanked = blank(source);
  const blocks: TestBlock[] = [];
  for (const match of blanked.matchAll(TEST_START)) {
    const modifier = match[2] ?? '';
    let open = (match.index ?? 0) + match[0].length - 1;
    let close = matchParen(blanked, open);
    // `it.each(table)(name, fn)` is curried: the first parens hold the table, and the name and body
    // are in a second call after it. Without this the table is scanned as the body.
    const curried = blanked.slice(close + 1).match(/^\s*\(/);
    if (curried) {
      open = close + curried[0].length;
      close = matchParen(blanked, open);
    }
    // The name lives in the original text; the blanked copy has had it erased.
    const head = source.slice(open, Math.min(close, open + 200));
    const named = head.match(/^\(\s*["'`](.*?)["'`]/s);
    blocks.push({
      file,
      line: source.slice(0, open).split(new RegExp(String.raw`?
`)).length,
      name: named?.[1] ?? source.slice(open + 1, open + 60).trim(),
      modifier,
      body: blanked.slice(open, close + 1),
    });
  }
  return blocks;
}

/** Whether a block can fail: it asserts directly, or calls something that does. */
export function canFail(body: string, assertingNames: ReadonlySet<string>): boolean {
  if (ASSERTION.test(body)) return true;
  return callsIn(body).some((name) => assertingNames.has(name));
}


/**
 * Every function name that asserts, directly or by calling something that does.
 *
 * Name-based and cross-file, which is imprecise in one direction only: a name collision could let a
 * bad test through, but it can never invent a violation. That asymmetry is what keeps the rule from
 * crying wolf and being deleted.
 */
export function collectAssertingNames(sources: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const source of sources) for (const n of directlyAssertingNames(source)) names.add(n);
  // A helper that calls an asserting helper is itself asserting. The chain is short, so a bounded
  // loop reaches the fixpoint and cannot hang the suite.
  for (let round = 0; round < 5; round++) {
    const before = names.size;
    for (const source of sources) {
      for (const match of source.matchAll(FUNCTION_DEF)) {
        const name = match[1] ?? match[2];
        if (!name || names.has(name)) continue;
        if (callsIn(functionBody(source, match.index ?? 0)).some((c) => names.has(c))) names.add(name);
      }
    }
    if (names.size === before) break;
  }
  return names;
}
