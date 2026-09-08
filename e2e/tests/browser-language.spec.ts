import { chromium, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TEST_MNEMONICS, TEST_PASSWORDS } from '../test-data';
import { callGalleryService } from '../utils/provider-gallery';

// Use the browser's real catalog selection, not Playwright's page locale emulation
// or the wallet's manual language setting. HK records the pinned Chromium's
// preferred-locale behavior; it is not a separate Chrome Web Store locale.
const cases = [
  { browser: 'en-US', ui: 'en-US', catalog: 'en' },
  { browser: 'ja', ui: 'ja', catalog: 'ja' },
  { browser: 'zh-CN', ui: 'zh-CN', catalog: 'zh-CN' },
  { browser: 'zh-TW', ui: 'zh-TW', catalog: 'zh-TW' },
  { browser: 'zh-HK', ui: 'zh-TW', catalog: 'zh-HK' },
  { browser: 'de', ui: 'de', catalog: 'en' },
] as const;

for (const locale of cases) {
  test(`browser language ${locale.browser} works before setup and after locking`, async ({}, info) => {
    const catalog = JSON.parse(readFileSync(`public/_locales/${locale.catalog.replace('-', '_')}/messages.json`, 'utf8'));
    const message = (key: string): string => catalog[key].message;
    const extension = path.resolve('.output/chrome-mv3');
    // Deep artifact paths can exceed Windows' storage path limit inside Chromium.
    // Keep unique profiles under the existing short, ignored test-results folder.
    mkdirSync('test-results', { recursive: true });
    const profile = mkdtempSync(path.resolve('test-results/browser-auto-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      // An explicit undefined prevents the test runner injecting its en-US emulation.
      locale: undefined,
      // Linux selects its application locale from LANGUAGE. --lang covers Windows.
      env: { ...process.env, LANGUAGE: locale.browser.replaceAll('-', '_') },
      viewport: { width: 360, height: 780 },
      args: [
        `--lang=${locale.browser}`,
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    try {
      // No external data, compose, signing or broadcasting is needed for this journey.
      await context.route(/^https?:/, route => route.abort());
      await context.route('**/v2/**', route => route.fulfill({ json: { result: [], result_count: 0 } }));
      await context.route('**/api/address/**', route => route.fulfill({ json: {
        chain_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 },
        mempool_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 },
      } }));
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const base = new URL('popup.html', worker.url()).href;
      const page = await context.newPage();
      await page.goto(base);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.catalog);
      expect(await page.evaluate(() => ({
        ui: chrome.i18n.getUILanguage(),
        catalog: chrome.i18n.getMessage('appLocale'),
      }))).toEqual({ ui: locale.ui, catalog: locale.catalog });

      const checkAutomaticSettings = async () => {
        const settings = await callGalleryService<{ language: string; numberLocale: string }>(page, 'getSettings');
        expect(settings.language).toBe('auto');
        expect(settings.numberLocale).toBe('auto');
      };
      const capture = async (name: string) => {
        const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
        const screenshot = info.outputPath(`${locale.browser}-${name}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        await info.attach(name, { path: screenshot, contentType: 'image/png' });
      };

      await checkAutomaticSettings();
      await expect(page.getByRole('button', { name: message('keychain_onboarding_create_wallet'), exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: message('keychain_onboarding_import_wallet'), exact: true })).toBeVisible();
      await expect(page.locator('a[href="https://www.xcp.io/terms"]')).toHaveText(message('common_terms_of_service'));
      await expect(page.locator('a[href="https://www.xcp.io/privacy"]')).toHaveText(message('common_privacy_policy'));
      await capture('onboarding');

      // Known public test phrase in an isolated profile. Keep every display preference
      // at its default through setup, settings, locking, and a password retry.
      await page.getByRole('button', { name: message('keychain_onboarding_import_wallet'), exact: true }).click();
      for (const [index, word] of TEST_MNEMONICS.standard.split(' ').entries()) {
        await page.locator(`input[name="word-${index}"]`).fill(word);
      }
      await page.getByRole('checkbox').check();
      await page.locator('input[name="password"]').fill(TEST_PASSWORDS.valid);
      await page.getByRole('button', { name: message('common_continue'), exact: true }).click();
      await expect(page).toHaveURL(/#\/index$/);
      await page.goto(`${base}#/settings`);
      const controls = page.locator('section[aria-label] select');
      await expect(controls).toHaveCount(3);
      await expect(controls.nth(0)).toHaveValue('auto');
      await expect(controls.nth(1)).toHaveValue('auto');
      await expect(controls.nth(2)).toHaveValue('usd');
      await checkAutomaticSettings();
      await capture('settings');

      await callGalleryService(page, 'lockKeychain');
      await page.goto(`${base}#/keychain/unlock`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.catalog);
      const unlock = page.getByRole('button', { name: message('keychain_unlock_unlock'), exact: true });
      await expect(unlock).toBeVisible();
      const password = page.locator('input[name="password"]');
      await password.fill('wrong-password-for-locale-test');
      await unlock.click();
      await expect(page.getByRole('alert')).toHaveText(message('keychain_unlock_invalid_password_please_try_again'));
      await capture('unlock-retry');
      await password.fill(TEST_PASSWORDS.valid);
      await unlock.click();
      await expect(page).toHaveURL(/#\/index$/);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.catalog);
      await checkAutomaticSettings();
    } finally {
      await context.close();
    }
  });
}
