import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Extension pages and content scripts never run background code.
 *
 * The background owns the wallet: the decrypted keychain, the session, the stored provider
 * requests. A page that imports one of those modules does not reach the background's copy; it gets
 * its own, empty or stale, and answers from it. Pages talk to the background through the service
 * clients instead.
 *
 * Biome's noRestrictedImports (biome.json) rejects a direct import from a UI file. It cannot see a
 * UI file importing an allowed module that itself imports a background one, which lands the
 * background module in the popup bundle just the same. This walks the import graph from each UI
 * entry point, following every value import including lazy routes, and fails on the first
 * background-only module it reaches.
 */

const SRC_ROOT = resolve('src');

const UI_ENTRIES = [
  // The side panel loads the popup's main.tsx too.
  'src/entrypoints/popup/main.tsx',
  'src/entrypoints/content.ts',
  'src/entrypoints/injected.ts',
];

/** Background-only, as in biome.json's noRestrictedImports override. Paths relative to src/. */
const BACKGROUND_ONLY = [
  /^platform\/walletManager\.ts$/,
  /^platform\/auth\//,
  /^platform\/provider\//,
  /^platform\/storage\/(requestStorage|sessionMetadataStorage|updateStorage|keyStorage)\.ts$/,
  /^services\/\w+Service\.ts$/,
  /^services\/signDelivery\.ts$/,
];

/**
 * Background-only modules UI code still reaches, each with the importer that may reach it and why.
 * The same exemption is in biome.json; this list is where it is argued. It should only shrink.
 */
const ALLOWED: Record<string, { importers: string[]; reason: string }> = {
  'platform/storage/keyStorage.ts': {
    importers: ['contexts/settings-context.tsx', 'contexts/wallet-context.tsx'],
    reason: 'Both contexts watch the session master key (watchKeychainLock) to notice a lock made ' +
      'elsewhere. The vault-permission hardening change replaces this with a background-owned ' +
      'signal; remove this entry and the biome.json override with it.',
  },
};

// Value imports, re-exports and dynamic imports. `import type` / `export type` are erased.
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
  // Assets (CSS, images) and WXT virtual modules are not code this rule is about.
  return null;
}

const toSrc = (file: string) => relative(SRC_ROOT, file).split(sep).join('/');

/** Every local module reachable from an entry, each with every reachable module importing it. */
function reachable(entry: string): Map<string, Set<string>> {
  const importedBy = new Map<string, Set<string>>([[toSrc(resolve(entry)), new Set()]]);
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const source = readFileSync(file, 'utf8');
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const local = resolveLocal(match[1]!, file);
        if (!local) continue;
        const importers = importedBy.get(toSrc(local));
        if (importers) { importers.add(toSrc(file)); continue; }
        importedBy.set(toSrc(local), new Set([toSrc(file)]));
        queue.push(local);
      }
    }
  }
  return importedBy;
}

/** Each (background module, importer) edge in a graph. */
function backgroundEdges(modules: Map<string, Set<string>>): [string, string][] {
  return [...modules]
    .filter(([file]) => BACKGROUND_ONLY.some((rule) => rule.test(file)))
    .flatMap(([file, importers]) => [...importers].map((importer): [string, string] => [file, importer]));
}

describe('UI import graph', () => {
  const graphs = UI_ENTRIES.map((entry) => ({ entry, modules: reachable(entry) }));

  it('walks the whole popup, lazy routes included (guards against a vacuous pass)', () => {
    const popup = graphs[0]!.modules;
    expect(popup.size).toBeGreaterThan(300);
    expect(popup.has('services/walletServiceClient.ts')).toBe(true);
    expect([...popup.keys()].some((file) => file.startsWith('pages/requests/'))).toBe(true);
  });

  it('recognises a background module when one is reached (guards against a vacuous pass)', () => {
    const background = reachable('src/entrypoints/background.ts');
    const found = [...background.keys()].filter((file) => BACKGROUND_ONLY.some((rule) => rule.test(file)));
    expect(found).toEqual(expect.arrayContaining(['platform/walletManager.ts', 'services/providerService.ts']));
  });

  it.each(UI_ENTRIES)('%s reaches no background-only module', (entry) => {
    const modules = graphs.find((graph) => graph.entry === entry)!.modules;
    const offenders = backgroundEdges(modules)
      .filter(([file, importer]) => !ALLOWED[file]?.importers.includes(importer))
      .map(([file, importer]) => `${file} (imported by ${importer})`);
    expect(offenders).toEqual([]);
  });

  it('keeps every allowance in use, so the list cannot rot', () => {
    const used = new Set(graphs.flatMap(({ modules }) => backgroundEdges(modules)
      .map(([file, importer]) => `${file} <- ${importer}`)));
    const declared = Object.entries(ALLOWED)
      .flatMap(([file, { importers }]) => importers.map((importer) => `${file} <- ${importer}`));
    expect(declared.filter((pair) => !used.has(pair))).toEqual([]);
  });
});
