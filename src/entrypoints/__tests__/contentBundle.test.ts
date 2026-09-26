import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The content script is injected into every page, and content scripts cannot be code-split: any
// import, even a dynamic one, is inlined. It must reach the provider only through the client proxy.
describe('content script imports', () => {
  it('never imports the provider service implementation', () => {
    const source = readFileSync('src/entrypoints/content.ts', 'utf8');
    expect(source).not.toMatch(/['"]@\/services\/providerService['"]/);
    expect(source).toMatch(/['"]@\/services\/providerServiceClient['"]/);
  });
});

const SRC_ROOT = resolve('src');

// Matches value imports and re-exports (static, side-effect and dynamic). `import type` and
// `export type` are erased at build time, so they are skipped.
const IMPORT_PATTERNS = [
  /^\s*import\s+(?!type\s)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
  /^\s*export\s+(?!type\s)[^'";]*?\s+from\s+['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = join(SRC_ROOT, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
}

/** Walks the static import graph from an entry; returns each bare (package) specifier and its first importer. */
function collectPackageImports(entry: string): Map<string, string> {
  const packages = new Map<string, string>();
  const seen = new Set<string>();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]!;
        if (specifier.startsWith('#')) continue; // WXT virtual modules
        const local = resolveLocal(specifier, file);
        if (local) queue.push(local);
        else if (!packages.has(specifier)) packages.set(specifier, relative(SRC_ROOT, file).split(sep).join('/'));
      }
    }
  }
  return packages;
}

// Libraries that belong in the background/popup only. Reaching one from the content script
// (e.g. through a module that imports core/bitcoin/address just for the AddressFormat map)
// inlines it, plus its importers' top-level side effects, into every page the user visits.
const FORBIDDEN_IN_CONTENT = [/^bignumber\.js$/, /^@noble\//, /^@scure\//];

describe('content script import graph', () => {
  it('does not reach crypto or bignumber libraries', () => {
    const packages = collectPackageImports('src/entrypoints/content.ts');
    const offenders = [...packages]
      .filter(([specifier]) => FORBIDDEN_IN_CONTENT.some((pattern) => pattern.test(specifier)))
      .map(([specifier, importer]) => `${specifier} (imported by ${importer})`);
    expect(offenders).toEqual([]);
  });

  it('walker follows imports (guards against a vacuous pass)', () => {
    const fromAddress = collectPackageImports('src/core/bitcoin/address.ts');
    expect([...fromAddress.keys()]).toEqual(expect.arrayContaining(['@noble/hashes/sha2.js', 'bignumber.js']));
  });
});
