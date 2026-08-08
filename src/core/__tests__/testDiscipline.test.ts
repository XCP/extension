import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  blank,
  canFail,
  collectAssertingNames,
  helperFiles,
  SRC,
  testBlocks,
  testFiles,
} from './helpers/testDiscipline';

/**
 * Every test can fail.
 *
 * A test with no assertion passes for as long as its subject does not throw, which means it passes
 * when the subject is deleted, when it returns the wrong answer, and when it returns nothing at
 * all. It is worse than no test: it occupies the name of the thing that should have been checked,
 * and it counts toward a green suite, so nobody looks again.
 *
 * This is not hypothetical here. `bip322-standardness.test.ts` had two tests that called the
 * verifier and `console.log`ged the result. One was logging `false` for a valid BIP-322 P2TR test
 * vector — a real gap in the verifier, sitting inside a passing suite. The other re-used a
 * signature already established not to belong to its address (see the fixture removed from
 * `wallet-fixtures.test.ts`), asserting nothing while its comment claimed the verification "should
 * work". Both survived a deliberate sweep for exactly this defect, because a sweep is a memory and
 * this is a rule.
 *
 * The detector lives in `helpers/testDiscipline.ts`; this file is the rule and its self-tests.
 */

/**
 * Tests exempt from the rule. Every entry needs a reason, because an unargued exemption is how the
 * rule erodes — and a list that grows is the signal to fix the tests instead of the rule.
 */
const EXEMPT = new Set<string>([
  // Nothing yet. Add as `path/to/file.test.ts::test name`, with the reason above it.
]);

describe('every test can fail', () => {
  const files = testFiles(SRC);

  // Assertion helpers live beside the suites and in helpers/ modules, so both are scanned.
  const assertingNames = collectAssertingNames(
    [...files, ...helperFiles(SRC)].map((f) => blank(readFileSync(f, 'utf8')))
  );

  const relative = (file: string) => file.slice(SRC.length + 1).split('\\').join('/');

  it('finds the suites', () => {
    // A scan that silently matched nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(200);
  });

  it('resolves the assertion helpers', () => {
    // Named rather than counted: if helper resolution broke, the count could still look plausible
    // while every compose test started reading as a violation.
    expect(assertingNames.has('assertComposeUrlCalled')).toBe(true);
  });

  it('has no test without an assertion', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const blocks = testBlocks(readFileSync(file, 'utf8'), relative(file));
      for (const block of blocks) {
        if (block.modifier.includes('todo')) continue;
        const id = `${block.file}:${block.line} :: ${block.name}`;
        if (EXEMPT.has(id)) continue;
        if (!canFail(block.body, assertingNames)) offenders.push(id);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The detector is itself code, so it needs to react to the thing it is looking for.
  describe('would catch a new one', () => {
    const asserting = new Set(['assertThings']);

    it('flags a test whose body only calls the subject', () => {
      const blocks = testBlocks(`it('does a thing', async () => { await doThing(); });`);
      expect(blocks).toHaveLength(1);
      expect(canFail(blocks[0]!.body, asserting)).toBe(false);
    });

    it('flags a body that only logs', () => {
      const blocks = testBlocks(`it('x', async () => { const r = await f(); console.log('r', r); });`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(false);
    });

    it('flags an empty body', () => {
      const blocks = testBlocks(`it('x', () => {\n  // covered elsewhere\n});`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(false);
    });

    it('accepts a direct assertion', () => {
      const blocks = testBlocks(`it('x', () => { expect(f()).toBe(1); });`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    it('accepts an assertion made through a helper', () => {
      const blocks = testBlocks(`it('x', async () => { await f(); assertThings(a, b); });`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    it('accepts rejects/resolves without a bare expect call', () => {
      const blocks = testBlocks(`it('x', async () => { await expect(f()).rejects.toThrow(); });`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    it('does not count an assertion that is only inside a string or comment', () => {
      const blocks = testBlocks(`it('x', () => {\n  // expect(1).toBe(1)\n  const s = 'expect(2).toBe(2)';\n  run(s);\n});`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(false);
    });

    it('does not end a block early on a brace inside a string', () => {
      const blocks = testBlocks(`it('x', () => { const s = '}'; expect(s).toBe('}'); });`);
      expect(blocks).toHaveLength(1);
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    // The bug that made the first run report two genuinely asserting tests as violations.
    it('does not let an apostrophe inside a regex literal swallow the assertion after it', () => {
      const blocks = testBlocks(
        `it('x', () => {\n  const el = screen.getByPlaceholderText(/use UTXO's address/i);\n  expect(el).toBeInTheDocument();\n});`
      );
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    it('does not let a quote inside a regex character class swallow the assertion', () => {
      const blocks = testBlocks(
        `it('x', () => {\n  const bad = files.filter((f) => /from\\s*['"]@\\/platform\\//.test(read(f)));\n  expect(bad).toEqual([]);\n});`
      );
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    it('still treats division as division', () => {
      // If `/` after a value were read as a regex, the rest of the line would be blanked away.
      const blocks = testBlocks(`it('x', () => { const half = total / 2; expect(half).toBe(1); });`);
      expect(canFail(blocks[0]!.body, asserting)).toBe(true);
    });

    it('reads the name of an it.each block', () => {
      const blocks = testBlocks(`it.each([1,2])('handles %s', (n) => { expect(n).toBeGreaterThan(0); });`);
      expect(blocks[0]!.name).toBe('handles %s');
    });

    it('leaves todo alone', () => {
      const blocks = testBlocks(`it.todo('later');`);
      expect(blocks[0]!.modifier).toContain('todo');
    });
  });
});
