import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  blank,
  canFail,
  collectAssertingNames,
  expectCalls,
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
 * vector — a real verifier gap, sitting inside a passing suite, and paired with the wrong message
 * on top of that. Both were fixed once the test had to assert something. The other re-used a
 * signature already established not to belong to its address (see the fixture removed from
 * `wallet-fixtures.test.ts`), asserting nothing while its comment claimed the verification "should
 * work". Both survived a deliberate sweep for exactly this defect, because a sweep is a memory and
 * this is a rule.
 *
 * The rule now has a second half, for the same reason it has a first. Requiring only that a test
 * assert *something* let `expect(typeof result).toBe('boolean')` stand in for a real check in that
 * same file, and underneath it BIP-322 verification of the spec's own published P2WPKH vectors had
 * never worked in either direction. An assertion that holds whichever way the subject behaves is a
 * test with no assertion spelled differently, so a test whose assertions are all of that kind is
 * reported the same way. One strong assertion is enough; a weak one beside a real one is not a
 * defect, and flagging it would be the rule inventing a violation.
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

  it('has no test that cannot fail', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const blocks = testBlocks(readFileSync(file, 'utf8'), relative(file));
      for (const block of blocks) {
        if (block.modifier.includes('todo')) continue;
        const id = `${block.file}:${block.line} :: ${block.name}`;
        if (EXEMPT.has(id)) continue;
        if (canFail(block.body, assertingNames)) continue;
        // Naming which of the two it is, because the fixes are different: one test needs an
        // assertion, the other needs its assertion to be about the value rather than the type.
        const reason = expectCalls(block.body).length > 0 ? 'every assertion is weak' : 'no assertion';
        offenders.push(`${id} [${reason}]`);
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

    // An assertion that cannot fail is the same defect as no assertion, one level up. The rule only
    // learned this after `expect(typeof result).toBe('boolean')` hid a total BIP-322 segwit
    // interoperability failure for the entire life of that test.
    describe('and a new tautological one', () => {
      const weak = (source: string) => canFail(testBlocks(source)[0]!.body, asserting);

      it('flags a type-only assertion', () => {
        expect(weak(`it('x', async () => { const r = await verify(a, b); expect(typeof r).toBe('boolean'); });`)).toBe(false);
      });

      it('flags a type-only assertion on a property', () => {
        expect(weak(`it('x', async () => { const r = await f(); expect(typeof r.valid).toBe('boolean'); });`)).toBe(false);
      });

      it('flags a literal tautology', () => {
        expect(weak(`it('x', () => { const a = f(); expect(a || !a).toBe(true); });`)).toBe(false);
        expect(weak(`it('x', () => { const a = f(); expect(!a || a).toBeTruthy(); });`)).toBe(false);
      });

      it('flags a self-comparison', () => {
        expect(weak(`it('x', () => { const r = f(); expect(r).toBe(r); });`)).toBe(false);
        expect(weak(`it('x', () => { expect(r.length).toEqual(r.length); });`)).toBe(false);
      });

      it('flags asserting a constant against itself', () => {
        expect(weak(`it('x', () => { doWork(); expect(true).toBe(true); });`)).toBe(false);
        expect(weak(`it('x', () => { doWork(); expect(1).toBe(1); });`)).toBe(false);
      });

      it('accepts a weak assertion standing next to a strong one', () => {
        // The rule is "every assertion is weak", not "any assertion is weak". A typeof check used
        // as a narrowing step before a real assertion is ordinary code.
        expect(weak(`it('x', async () => { const r = await f(); expect(typeof r).toBe('object'); expect(r.valid).toBe(true); });`)).toBe(true);
      });

      it('does not read two different string literals as a self-comparison', () => {
        // `blank()` erases string contents, so `'a'` and `'b'` arrive here as the same run of
        // spaces. Comparing them would report a genuine assertion as a tautology.
        expect(weak(`it('x', () => { expect(name).toBe('expected'); });`)).toBe(true);
        expect(weak(`it('x', () => { expect('a').toBe('b'); });`)).toBe(true);
      });

      it('does not read two different regex literals as a self-comparison', () => {
        // Blanking leaves a regex literal as pure whitespace, delimiters included.
        expect(weak(`it('x', () => { expect(pattern).toEqual(/abc/); });`)).toBe(true);
      });

      it('leaves a negated self-comparison alone', () => {
        // `expect(x).not.toBe(x)` always fails. That is a different defect, and not this rule's.
        expect(weak(`it('x', () => { const r = f(); expect(r).not.toBe(r); });`)).toBe(true);
      });

      it('does not flag a comparison against a different value', () => {
        expect(weak(`it('x', () => { expect(a.b).toBe(a.c); });`)).toBe(true);
        expect(weak(`it('x', () => { expect(total).toBe(1); });`)).toBe(true);
      });

      it('does not flag an unrelated || that is not a tautology', () => {
        expect(weak(`it('x', () => { expect(a || b).toBe(true); });`)).toBe(true);
        expect(weak(`it('x', () => { expect(!a || !b).toBe(true); });`)).toBe(true);
      });

      it('treats assertion forms it cannot take apart as strong', () => {
        // Classifying an `assert()` or a `verifyProperty()` would mean parsing what this does not
        // parse. Guessing there is how the rule would start inventing violations.
        expect(weak(`it('x', () => { assert(typeof r === 'boolean'); });`)).toBe(true);
        expect(weak(`it('x', () => { verifyProperty(model); });`)).toBe(true);
      });

      it('reads the matcher chain past a modifier', () => {
        const calls = expectCalls(blank(`expect(f()).resolves.toBe(1);`));
        expect(calls).toHaveLength(1);
        expect(calls[0]!.subject).toBe('f()');
        expect(calls[0]!.chain.trim()).toBe('.resolves.toBe(1)');
      });

      it('does not treat a member named expect as an assertion', () => {
        // The `\b`-after-a-dot bug that produced most of the first run's false positives.
        expect(expectCalls(blank(`harness.expect(1);`))).toHaveLength(0);
      });
    });

    /**
     * Found by mutation-testing the rule above: a file of deliberately tautological tests was not
     * flagged, and the reason was not the new classifier at all.
     *
     * `const isBig = (n) => n > 10` has no braces, so the old `indexOf('{')` walked past the whole
     * definition and returned the next block in the file as the "body". Any assertion in that
     * unrelated block marked `isBig` as an assertion helper, and every test that called it was
     * excused. Same defect class as the fixed-4000-characters version the header describes, and
     * imprecise in the same dangerous direction.
     */
    describe('resolves helper bodies, not the next block', () => {
      const namesIn = (source: string) => collectAssertingNames([blank(source)]);

      it('does not attribute a later block to an expression-bodied arrow', () => {
        const source = [
          `const isBig = (n) => n > 10;`,
          `describe('s', () => {`,
          `  it('x', () => { expect(isBig(11)).toBe(true); });`,
          `});`,
        ].join('\n');
        expect(namesIn(source).has('isBig')).toBe(false);
      });

      it('still resolves an arrow with a brace body', () => {
        expect(namesIn(`const assertBig = (n) => { expect(n).toBeGreaterThan(10); };`).has('assertBig')).toBe(true);
      });

      it('still resolves a function declaration', () => {
        expect(namesIn(`function assertBig(n: number): void { expect(n).toBeGreaterThan(10); }`).has('assertBig')).toBe(true);
      });

      it('resolves a declaration whose parameters contain parens', () => {
        // The parameter list is skipped by brace matching, not by a `[^)]*` scan.
        expect(namesIn(`function assertBig(n = fallback(1)) { expect(n).toBeGreaterThan(10); }`).has('assertBig')).toBe(true);
      });

      it('does not attribute a later body to an overload signature', () => {
        const source = [
          `function widen(n: number): void;`,
          `describe('s', () => { it('x', () => { expect(1).toBe(1); }); });`,
        ].join('\n');
        expect(namesIn(source).has('widen')).toBe(false);
      });
    });
  });
});
