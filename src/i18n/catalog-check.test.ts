import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let fixtureRoot: string;
let catalogPath: string;
const run = (...args: string[]) => spawnSync(process.execPath, [join(fixtureRoot, 'scripts/i18n.mjs'), ...args], {
  cwd: fixtureRoot, encoding: 'utf8', windowsHide: true,
});

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'xcp-i18n-check-'));
  for (const path of ['scripts', 'src', 'public/_locales/en']) mkdirSync(join(fixtureRoot, path), { recursive: true });
  copyFileSync(resolve('scripts/i18n.mjs'), join(fixtureRoot, 'scripts/i18n.mjs'));
  catalogPath = join(fixtureRoot, 'public/_locales/en/messages.json');
  writeFileSync(catalogPath, JSON.stringify({
    appName: { message: 'Example' }, appDescription: { message: 'Example wallet' }, appLocale: { message: 'en' },
    common_example: { message: 'Original $amount$', placeholders: { amount: { content: '$1' } } },
  }));
  writeFileSync(join(fixtureRoot, 'src/example.ts'), "export const example = () => t('common_example');\n");
  expect(run('check').status).toBe(0);
});

afterEach(() => {
  // Remove only the exact temporary fixture created above, never a computed parent directory.
  const target = resolve(fixtureRoot);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('xcp-i18n-check-')) throw new Error('Unexpected test fixture path');
  rmSync(target, { recursive: true, force: true });
});

it('rejects placeholders that differ from the English', () => {
  const locale = join(fixtureRoot, 'public/_locales/ja');
  mkdirSync(locale);
  const messages = { appName: { message: 'Example' }, appDescription: { message: 'Example' }, appLocale: { message: 'ja' }, common_example: { message: '元 $1' } };
  writeFileSync(join(locale, 'messages.json'), JSON.stringify(messages));
  expect(run('check').status).toBe(0);
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  catalog.common_example.placeholders.amount.content = '$2';
  writeFileSync(catalogPath, JSON.stringify(catalog));
  expect(run('check').status).toBe(1);
});

it('treats every key as a machine draft until it is listed as reviewed', () => {
  const locale = join(fixtureRoot, 'public/_locales/ja');
  mkdirSync(locale);
  writeFileSync(join(locale, 'messages.json'), JSON.stringify({
    appName: { message: 'Example' }, appDescription: { message: 'Example' }, appLocale: { message: 'ja' }, common_example: { message: '元 $1' },
  }));
  expect(run('check').stdout).toContain('ja: 4 messages, missing 0, stale 0, placeholder mismatches 0, 4 awaiting review');
  expect(run('review', 'ja', '--machine').stdout).toContain('# ja: 4 strings awaiting review');

  mkdirSync(join(fixtureRoot, 'i18n/reviewed'), { recursive: true });
  const reviewedPath = join(fixtureRoot, 'i18n/reviewed/ja.json');
  writeFileSync(reviewedPath, JSON.stringify({ reviewed: ['common_example'] }));
  expect(run('check').stdout).toContain('3 awaiting review');
  const review = run('review', 'ja', '--machine').stdout;
  expect(review).toContain('# ja: 3 strings awaiting review');
  expect(review).not.toContain('common_example');

  writeFileSync(reviewedPath, JSON.stringify({ reviewed: ['common_removed'] }));
  const stale = run('check');
  expect(stale.status).toBe(1);
  expect(stale.stdout).toContain('i18n/reviewed/ja.json lists a key that no longer exists: common_removed');
});

it('keeps zh an exact copy of zh_CN', () => {
  const chinese = { appName: { message: '例' }, appDescription: { message: '例' }, appLocale: { message: 'zh-CN' }, common_example: { message: '例 $1' } };
  for (const name of ['zh', 'zh_CN']) mkdirSync(join(fixtureRoot, 'public/_locales', name));
  const zhCn = join(fixtureRoot, 'public/_locales/zh_CN/messages.json');
  const zh = join(fixtureRoot, 'public/_locales/zh/messages.json');
  writeFileSync(zhCn, JSON.stringify(chinese, null, 2));
  writeFileSync(zh, '{}');
  const drift = run('check');
  expect(drift.status).toBe(1);
  expect(drift.stderr).toContain('zh/messages.json differs from zh_CN');
  expect(run('sync-zh').status).toBe(0);
  expect(readFileSync(zh, 'utf8')).toBe(readFileSync(zhCn, 'utf8'));
  expect(run('check').status).toBe(0);
});

it('rejects an approval fact label that would wrap at popup width', () => {
  mkdirSync(join(fixtureRoot, 'src/core/counterparty'), { recursive: true });
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  catalog.marketplace_example_label = { message: 'Your UTXO sats returned' };
  catalog.marketplace_example_note = { message: 'A label on its own line above' };
  writeFileSync(catalogPath, JSON.stringify(catalog));
  writeFileSync(join(fixtureRoot, 'src/core/counterparty/example.ts'), [
    "export const row = { kind: 'amount', label: t('marketplace_example_label'), value: '330 sats' };",
    "export const note = { kind: 'paragraph', label: t('marketplace_example_note'), value: 'text' };",
    '',
  ].join('\n'));
  const long = run('check');
  expect(long.status).toBe(1);
  expect(long.stderr).toContain('marketplace_example_label "Your UTXO sats returned" is 23 units, budget 18');
  expect(long.stderr).not.toContain('marketplace_example_note');

  catalog.marketplace_example_label = { message: 'UTXO returned' };
  writeFileSync(catalogPath, JSON.stringify(catalog));
  expect(run('check').status).toBe(0);
});
