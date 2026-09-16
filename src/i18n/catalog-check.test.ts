import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let fixtureRoot: string;
let catalogPath: string;
let generatedPath: string;
const run = (command: string) => spawnSync(process.execPath, [join(fixtureRoot, 'scripts/i18n.mjs'), command], {
  cwd: fixtureRoot, encoding: 'utf8', windowsHide: true,
});

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'xcp-i18n-check-'));
  for (const path of ['scripts', 'src/i18n', 'public/_locales/en']) mkdirSync(join(fixtureRoot, path), { recursive: true });
  copyFileSync(resolve('scripts/i18n.mjs'), join(fixtureRoot, 'scripts/i18n.mjs'));
  catalogPath = join(fixtureRoot, 'public/_locales/en/messages.json');
  generatedPath = join(fixtureRoot, 'src/i18n/en.generated.ts');
  writeFileSync(catalogPath, JSON.stringify({
    appName: { message: 'Example' }, appDescription: { message: 'Example wallet' }, appLocale: { message: 'en' },
    common_example: { message: 'Original $amount$', placeholders: { amount: { content: '$1' } } },
  }));
  writeFileSync(join(fixtureRoot, 'src/example.ts'), "export const example = () => t('common_example');\n");
  expect(run('build').status).toBe(0);
  expect(run('check').status).toBe(0);
});

afterEach(() => {
  // Remove only the exact temporary fixture created above, never a computed parent directory.
  const target = resolve(fixtureRoot);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('xcp-i18n-check-')) throw new Error('Unexpected test fixture path');
  rmSync(target, { recursive: true, force: true });
});

it('rejects stale fallback text even when all catalog keys still match', () => {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  catalog.common_example.message = 'Corrected $amount$';
  writeFileSync(catalogPath, JSON.stringify(catalog));
  const stale = run('check');
  expect(stale.status).toBe(1);
  expect(stale.stderr).toContain('en.generated.ts is out of date');
  expect(run('build').status).toBe(0);
  expect(run('check').status).toBe(0);
});

it('checks expanded placeholder contents while accepting Windows line endings', () => {
  writeFileSync(generatedPath, readFileSync(generatedPath, 'utf8').replace(/\n/g, '\r\n'));
  expect(run('check').status).toBe(0);
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  catalog.common_example.placeholders.amount.content = '$2';
  writeFileSync(catalogPath, JSON.stringify(catalog));
  expect(run('check').status).toBe(1);
  expect(run('build').status).toBe(0);
  expect(run('check').status).toBe(0);
});
