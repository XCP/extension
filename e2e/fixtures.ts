/**
 * Playwright Fixtures for XCP Wallet E2E Tests
 *
 * Provides automatic setup/teardown for extension and wallet states.
 */

import { test as base, expect, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import path from 'path';

// ============================================================================
// Constants
// ============================================================================

export const TEST_PASSWORD = 'TestPassword123!';
export const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
export const TEST_PRIVATE_KEY = 'L4p2b9VAf8k5aUahF1JCJUzZkgNEAqLfq8DDdQiyAprQAKSbu8hf';

// Counterwallet mnemonic (different wordlist)
export const TEST_COUNTERWALLET_MNEMONIC = 'like just love know never want time out there make look eye';

// ============================================================================
// Types
// ============================================================================

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  extensionPage: Page;
  extensionId: string;
}

interface WalletFixtures {
  context: BrowserContext;
  page: Page;
  extensionId: string;
}

// ============================================================================
// Core: Launch Extension
// ============================================================================

async function launchExtension(testId: string): Promise<{
  context: BrowserContext;
  page: Page;
  extensionId: string;
}> {
  const extensionPath = path.resolve('.output/chrome-mv3');
  const isCI = process.env.CI === 'true';
  const timeout = isCI ? 60000 : 30000;

  const context = await chromium.launchPersistentContext(`test-results/${testId}`, {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    timeout,
  });

  // Find extension ID - try multiple methods
  let extensionId: string | null = null;
  const maxWait = isCI ? 45 : 20;

  for (let i = 0; i < maxWait && !extensionId; i++) {
    await sleep(1000);

    // Method 1: Check service workers
    for (const sw of context.serviceWorkers()) {
      const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        extensionId = match[1];
        break;
      }
    }

    // Method 2: Check pages
    if (!extensionId) {
      for (const p of context.pages()) {
        const match = p.url().match(/chrome-extension:\/\/([^/]+)/);
        if (match) {
          extensionId = match[1];
          break;
        }
      }
    }

    // Method 3: Check background pages (MV2 fallback)
    if (!extensionId) {
      for (const bp of context.backgroundPages()) {
        const match = bp.url().match(/chrome-extension:\/\/([^/]+)/);
        if (match) {
          extensionId = match[1];
          break;
        }
      }
    }
  }

  if (!extensionId) {
    await context.close();
    throw new Error('Failed to find extension ID after ' + maxWait + ' seconds');
  }

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('domcontentloaded');

  return { context, page, extensionId };
}

// ============================================================================
// Wallet Actions
// ============================================================================

async function createWallet(page: Page, password = TEST_PASSWORD): Promise<void> {
  await page.getByRole('button', { name: 'Create Wallet' }).click();
  await page.waitForURL(/create-wallet/);

  // Click the reveal phrase card (not a button)
  await page.locator('text=View 12-word Secret Phrase').click();

  // Wait for phrase to be revealed and checkbox to appear
  await page.waitForTimeout(500);

  await page.getByLabel(/I have saved my secret recovery phrase/).check();
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

async function importMnemonic(page: Page, mnemonic = TEST_MNEMONIC, password = TEST_PASSWORD): Promise<void> {
  await page.getByRole('button', { name: 'Import Wallet' }).click();
  await page.waitForSelector('input[name="word-0"]');

  const words = mnemonic.split(' ');
  for (let i = 0; i < words.length && i < 12; i++) {
    await page.locator(`input[name="word-${i}"]`).fill(words[i]);
  }

  await page.getByLabel(/I have saved my secret recovery phrase/).check();
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

async function importPrivateKey(page: Page, privateKey = TEST_PRIVATE_KEY, password = TEST_PASSWORD): Promise<void> {
  await page.getByRole('button', { name: /Import Private Key/i }).click();
  await page.waitForSelector('input[name="private-key"]');

  await page.locator('input[name="private-key"]').fill(privateKey);
  await page.getByLabel(/I have backed up this private key/i).check();
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

async function unlockWallet(page: Page, password = TEST_PASSWORD): Promise<void> {
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
  await page.waitForURL(/index/, { timeout: 10000 });
}

async function lockWallet(page: Page): Promise<void> {
  const lockButton = page.locator('header button, nav button').last();
  await lockButton.click();
  await page.waitForURL(/unlock/);
}

async function setupWallet(page: Page, password = TEST_PASSWORD): Promise<void> {
  // Wait for the app to finish routing to either unlock or onboarding
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Wait for either unlock page or create wallet button to appear
  const unlockInput = page.locator('input[name="password"]');
  const createButton = page.getByRole('button', { name: 'Create Wallet' });

  // Wait for one of the two states to be visible
  await Promise.race([
    unlockInput.waitFor({ state: 'visible', timeout: 10000 }),
    createButton.waitFor({ state: 'visible', timeout: 10000 }),
  ]).catch(() => {});

  const url = page.url();

  if (url.includes('unlock') || await unlockInput.isVisible().catch(() => false)) {
    await unlockWallet(page, password);
  } else {
    const hasCreate = await createButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCreate) {
      await createWallet(page, password);
    }
  }
}

// ============================================================================
// Navigation
// ============================================================================

type NavTarget = 'wallet' | 'market' | 'actions' | 'settings';

async function navigateTo(page: Page, target: NavTarget): Promise<void> {
  const ariaLabel = { wallet: 'Wallet', market: 'Market', actions: 'Actions', settings: 'Settings' };
  const paths = { wallet: '/index', market: '/market', actions: '/actions', settings: '/settings' };
  const pattern = { wallet: /index/, market: /market/, actions: /actions/, settings: /settings/ };

  const button = page.locator(`button[aria-label="${ariaLabel[target]}"]`);

  // Footer buttons only visible on main pages (index, market, actions, settings)
  // If button not visible, navigate directly via URL
  if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
    await button.click();
  } else {
    // Navigate directly - handle hash-based routing (e.g., popup/index.html#/settings/address-type)
    const currentUrl = page.url();
    // Find the base URL before the hash
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}${paths[target]}`);
  }
  await page.waitForURL(pattern[target], { timeout: 5000 });
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function cleanup(context: BrowserContext): Promise<void> {
  try {
    for (const page of context.pages()) {
      await page.close().catch(() => {});
    }
    await context.close();
  } catch {
    await context.close().catch(() => {});
  }
}

async function getCurrentAddress(page: Page): Promise<string> {
  const addressArea = page.locator('[aria-label="Current address"]');
  const text = await addressArea.locator('.font-mono').first().textContent();
  return text?.trim() || '';
}

async function grantClipboardPermissions(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

// ============================================================================
// Fixtures
// ============================================================================

/**
 * Base test - extension loaded, no wallet
 */
export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({}, use, testInfo) => {
    const testId = testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    const { context } = await launchExtension(testId);
    await use(context);
    await cleanup(context);
  },

  extensionPage: async ({ extensionContext }, use) => {
    const page = extensionContext.pages().find(p => p.url().includes('chrome-extension://'));
    if (!page) throw new Error('Extension page not found');
    await use(page);
  },

  extensionId: async ({ extensionContext }, use) => {
    for (const sw of extensionContext.serviceWorkers()) {
      const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        await use(match[1]);
        return;
      }
    }
    for (const p of extensionContext.pages()) {
      const match = p.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        await use(match[1]);
        return;
      }
    }
    throw new Error('Extension ID not found');
  },
});

/**
 * Wallet test - extension loaded with wallet ready
 */
export const walletTest = base.extend<WalletFixtures>({
  context: async ({}, use, testInfo) => {
    const testId = `w-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 45)}`;
    const { context } = await launchExtension(testId);
    await use(context);
    await cleanup(context);
  },

  page: async ({ context }, use) => {
    const page = context.pages().find(p => p.url().includes('chrome-extension://'));
    if (!page) throw new Error('Extension page not found');
    await setupWallet(page);
    await use(page);
  },

  extensionId: async ({ context }, use) => {
    for (const sw of context.serviceWorkers()) {
      const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        await use(match[1]);
        return;
      }
    }
    throw new Error('Extension ID not found');
  },
});

// ============================================================================
// Exports
// ============================================================================

export {
  expect,
  launchExtension,
  createWallet,
  importMnemonic,
  importPrivateKey,
  unlockWallet,
  lockWallet,
  setupWallet,
  navigateTo,
  cleanup,
  getCurrentAddress,
  grantClipboardPermissions,
  sleep,
};

export type { NavTarget };
