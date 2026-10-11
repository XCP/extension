import { cpSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { base64ToBuffer } from '../../src/core/encryption/buffer';
import { deriveKey } from '../../src/core/encryption/encryption';
import { decryptKeychain, encryptKeychainRecord } from '../../src/core/wallet/keychainCrypto';
import type { CoinLock } from '../../src/types/coinLocks';
import type { KeychainRecord, Wallet } from '../../src/types/wallet';
import { importMnemonic, TEST_PASSWORD, TEST_PRIVATE_KEY, unlockWallet } from '../fixtures';
import { callGalleryService } from '../utils/provider-gallery';

const from = process.env.RELEASE_UPGRADE_FROM;
const to = process.env.RELEASE_UPGRADE_TO;

test('published 0.14.4 vault survives the packaged 0.15.0 upgrade', async () => {
  // biome-ignore lint/suspicious/noSkippedTests: Manual release check requires both production packages.
  test.skip(!from || !to, 'Set RELEASE_UPGRADE_FROM and RELEASE_UPGRADE_TO to unpacked production packages.');
  test.setTimeout(180_000);
  const root = mkdtempSync(path.join(tmpdir(), 'xcp-upgrade-'));
  const extension = path.join(root, 'extension');
  const previous = path.join(root, 'previous');
  expect(path.dirname(path.resolve(extension))).toBe(root);
  expect(path.dirname(path.resolve(previous))).toBe(root);
  cpSync(from!, extension, { recursive: true });

  async function launch() {
    const context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      headless: false,
      viewport: { width: 350, height: 600 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-sandbox'],
    });
    await context.route('https://**/*', route => route.fulfill({ json: { result: [] } }));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    return { context, page, worker, id };
  }

  let browser = await launch();
  try {
    expect(await browser.page.evaluate(() => chrome.runtime.getManifest().version)).toBe('0.14.4');
    await importMnemonic(browser.page);
    const mnemonic = await callGalleryService<Wallet>(browser.page, 'getActiveWallet');
    await callGalleryService(browser.page, 'addAddress', [mnemonic.id]);
    await callGalleryService(browser.page, 'createPrivateKeyWallet', [TEST_PRIVATE_KEY, TEST_PASSWORD, 'Upgrade key']);
    await callGalleryService(browser.page, 'selectWallet', [mnemonic.id]);
    await callGalleryService(browser.page, 'updateSettings', [{ fiat: 'eur', priceUnit: 'sats', autoLockTimer: '15m', showHelpText: false }]);
    const origin = 'https://upgrade.example';
    await callGalleryService(browser.page, 'addConnectedWebsite', [origin]);
    const wallets = await callGalleryService<Wallet[]>(browser.page, 'getWallets');
    const active = await callGalleryService<{ address: string }>(browser.page, 'getActiveAddress');
    const settings = await callGalleryService(browser.page, 'getSettings');
    await callGalleryService(browser.page, 'lockKeychain');

    // Seed signed-offer history into the disposable vault, then make the old release read it.
    const record = await browser.worker.evaluate(async () => (await chrome.storage.local.get('keychainRecord')).keychainRecord as KeychainRecord);
    const key = await deriveKey(TEST_PASSWORD, base64ToBuffer(record.salt), record.kdf.iterations);
    const keychain = await decryptKeychain(record, key);
    const now = Math.floor(Date.now() / 1000);
    const offer: CoinLock = {
      outpoint: `${'ab'.repeat(32)}:0`, address: active.address, kind: 'offer_slot', manual: false,
      refs: ['upgrade-offer', 'upgrade-authorization'], valueSats: 1000, origin,
      expiresAt: now + 3600, createdAt: now, seenAt: now, unlocked: false,
    };
    keychain.coinLocks = [offer];
    const seeded = await encryptKeychainRecord(keychain, key, record.salt, record.kdf.iterations);
    await browser.worker.evaluate(record => chrome.storage.local.set({ keychainRecord: record }), seeded);
    await browser.page.reload();
    await unlockWallet(browser.page);
    expect(await callGalleryService(browser.page, 'getCoinLocks', [active.address])).toEqual([offer]);
    const pending = {
      id: 'upgrade-pending', origin, timestamp: Date.now(), requestKey: 'cd'.repeat(32),
      kind: 'sign-message', status: 'pending', walletId: mnemonic.id, address: active.address,
      message: 'Disposable upgrade approval',
    };
    await browser.worker.evaluate(request => chrome.storage.session.set({ pending_sign_flow: [request] }), pending);
    await browser.page.goto(`chrome-extension://${browser.id}/popup.html#/requests/message/approve?requestId=${pending.id}`);
    await expect(browser.page.getByText(pending.message, { exact: true })).toBeVisible();
    const id = browser.id;
    await browser.context.close();
    renameSync(extension, previous);
    cpSync(to!, extension, { recursive: true });

    browser = await launch();
    expect(browser.id).toBe(id);
    expect(await browser.page.evaluate(() => chrome.runtime.getManifest().version)).toBe('0.15.0');
    expect(await callGalleryService(browser.page, 'isKeychainUnlocked')).toBe(false);
    await unlockWallet(browser.page);
    expect(await callGalleryService(browser.page, 'getWallets')).toEqual(wallets);
    expect(await callGalleryService(browser.page, 'getActiveAddress')).toMatchObject(active);
    expect(await callGalleryService(browser.page, 'getSettings')).toEqual(settings);
    expect(await callGalleryService(browser.page, 'getCoinLocks', [active.address])).toEqual([offer]);
    const session = await browser.worker.evaluate(() => chrome.storage.session.get('pending_sign_flow'));
    expect(session.pending_sign_flow ?? []).toEqual([]);
    await browser.page.goto(`chrome-extension://${id}/popup.html#/requests/message/approve?requestId=${pending.id}`);
    await expect(browser.page.getByText('Request Expired', { exact: true })).toBeVisible();
    await expect(browser.page.getByText(pending.message, { exact: true })).toHaveCount(0);
    await expect(browser.page.getByRole('button', { name: /^sign message$/i })).toHaveCount(0);
  } finally {
    await browser.context.close();
  }
});
