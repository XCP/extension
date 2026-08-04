import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `core` is the half of the wallet that does not need a browser extension to run: message packing
 * and unpacking, signing, key derivation, encryption, validation, formatting. `platform` is the
 * half that does — chrome storage, the session keychain, the dapp bridge, analytics.
 *
 * The direction is the whole point. `platform` may call into `core`; `core` may not reach back.
 * That is what keeps the signing and verification path testable without a browser, portable to
 * other hosts, and free of any dependency on extension state.
 *
 * The rule is not obvious from reading one file, and an editor's auto-import will happily break it,
 * so it is asserted rather than documented.
 */
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

describe('core does not depend on the extension runtime', () => {
  const files = sourceFiles(join(SRC, 'core'));

  it('finds the core sources', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never imports from platform', () => {
    const offenders = files.filter((f) => /from\s*['"]@\/platform\//.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  // The import rule above is the enforceable half; this catches a file reaching for chrome.* or the
  // extension's own module graph directly, which would make it unportable without importing
  // anything from platform at all.
  it('never touches extension globals or extension-only modules', () => {
    const banned = /\bchrome\.\w|from\s*['"]#imports['"]|from\s*['"]webext-bridge|from\s*['"]wxt\//;
    const offenders = files.filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
