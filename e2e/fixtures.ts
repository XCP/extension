/**
 * Playwright Fixtures for XCP Wallet E2E Tests
 *
 * Provides automatic setup/teardown for extension and wallet states.
 */

import { test as base, expect, BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { TEST_PASSWORDS, TEST_MNEMONICS, TEST_PRIVATE_KEYS } from './test-data';
import {
  onboarding,
  createWallet as createWalletSelectors,
  importWallet,
  unlock,
  header,
  index,
} from './selectors';

// ============================================================================
// Constants (re-exported from test-data.ts for convenience)
// ============================================================================

export const TEST_PASSWORD = TEST_PASSWORDS.valid;
export const TEST_MNEMONIC = TEST_MNEMONICS.standard;
export const TEST_PRIVATE_KEY = TEST_PRIVATE_KEYS.mainnet;
export const TEST_COUNTERWALLET_MNEMONIC = TEST_MNEMONICS.counterwallet;

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

interface LaunchOptions {
  /** Use sidepanel.html instead of popup.html - required for hardware wallet tests */
  useSidepanel?: boolean;
}

async function launchExtension(testId: string, options?: LaunchOptions): Promise<{
  context: BrowserContext;
  page: Page;
  extensionId: string;
  contextPath: string;
}> {
  const extensionPath = path.resolve('.output/chrome-mv3');
  const isCI = process.env.CI === 'true';
  const timeout = isCI ? 60000 : 30000;
  const contextPath = `test-results/${testId}`;

  // Clean up any existing context directory to ensure fresh state
  try {
    fs.rmSync(contextPath, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }

  const context = await chromium.launchPersistentContext(contextPath, {
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

  // Block Fathom analytics in E2E tests to avoid polluting dashboards
  await context.route('**/cdn.usefathom.com/**', route => route.abort());

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
  // Use sidepanel for hardware wallet tests (Trezor button only shows in sidepanel context)
  const entrypoint = options?.useSidepanel ? 'sidepanel.html' : 'popup.html';
  await page.goto(`chrome-extension://${extensionId}/${entrypoint}`);
  await page.waitForLoadState('domcontentloaded');

  return { context, page, extensionId, contextPath };
}

// ============================================================================
// Wallet Actions
// ============================================================================

async function createWallet(page: Page, password = TEST_PASSWORD): Promise<void> {
  // Wait for page to be ready and button to be visible
  await page.waitForLoadState('domcontentloaded');
  const createButton = onboarding.createWalletButton(page);
  await createButton.waitFor({ state: 'visible', timeout: 15000 });
  await createButton.click();
  await page.waitForURL(/keychain\/setup\/create-mnemonic/);

  // Wait for page to fully load before clicking reveal card
  await page.waitForLoadState('networkidle');

  // Click the reveal phrase card - wait for it to be visible and clickable
  const revealCard = createWalletSelectors.revealPhraseCard(page);
  await revealCard.waitFor({ state: 'visible', timeout: 5000 });
  await revealCard.click();

  // Wait for checkbox to be visible (phrase has been revealed)
  const checkbox = createWalletSelectors.savedPhraseCheckbox(page);
  await expect(checkbox).toBeVisible({ timeout: 5000 });

  await checkbox.check();
  await createWalletSelectors.passwordInput(page).fill(password);
  await createWalletSelectors.continueButton(page).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

async function importMnemonic(page: Page, mnemonic = TEST_MNEMONIC, password = TEST_PASSWORD): Promise<void> {
  // Wait for Import Wallet button to be visible before clicking
  const importButton = onboarding.importWalletButton(page);
  await importButton.waitFor({ state: 'visible', timeout: 10000 });
  await importButton.click();
  await importWallet.wordInput(page, 0).waitFor({ state: 'visible' });

  const words = mnemonic.split(' ');
  for (let i = 0; i < words.length && i < 12; i++) {
    await importWallet.wordInput(page, i).fill(words[i]);
  }

  // Wait for the checkbox to become enabled (words must be validated)
  const checkbox = importWallet.savedPhraseCheckbox(page);
  await expect(checkbox).toBeEnabled({ timeout: 5000 });
  await checkbox.check();
  await importWallet.passwordInput(page).fill(password);
  await importWallet.continueButton(page).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

async function importPrivateKey(page: Page, privateKey = TEST_PRIVATE_KEY, password = TEST_PASSWORD): Promise<void> {
  await onboarding.importPrivateKeyButton(page).click();
  await importWallet.privateKeyInput(page).waitFor({ state: 'visible' });

  await importWallet.privateKeyInput(page).fill(privateKey);
  await importWallet.backedUpCheckbox(page).check();
  await importWallet.passwordInput(page).fill(password);
  await importWallet.continueButton(page).click();

  await page.waitForURL(/index/, { timeout: 15000 });
}

async function unlockWallet(page: Page, password = TEST_PASSWORD): Promise<void> {
  await unlock.passwordInput(page).fill(password);
  await unlock.unlockButton(page).click();

  // Wait for navigation to index page
  await page.waitForURL(/index/, { timeout: 15000 });

  // Wait for the page to fully render after unlock
  await page.waitForLoadState('domcontentloaded');
}

async function lockWallet(page: Page): Promise<void> {
  const lockButton = header.lockButton(page);
  await lockButton.waitFor({ state: 'visible', timeout: 5000 });
  await lockButton.click();
  await page.waitForURL(/unlock/);
}

async function setupWallet(page: Page, password = TEST_PASSWORD): Promise<void> {
  // Wait for the app to finish initial load
  await page.waitForLoadState('domcontentloaded');

  // Wait for either unlock page or create wallet button to appear
  const unlockInput = unlock.passwordInput(page);
  const createButton = onboarding.createWalletButton(page);

  // Race to see which state appears first
  const visibleElement = await Promise.race([
    unlockInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'unlock' as const),
    createButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'create' as const),
  ]);

  if (visibleElement === 'unlock') {
    await unlockWallet(page, password);
  } else {
    await createWallet(page, password);
  }
}

// ============================================================================
// Navigation
// ============================================================================

type NavTarget = 'wallet' | 'market' | 'actions' | 'settings';

async function navigateTo(page: Page, target: NavTarget): Promise<void> {
  const paths = { wallet: '/index', market: '/market', actions: '/actions', settings: '/settings' };
  const pattern = { wallet: /index/, market: /market/, actions: /actions/, settings: /settings/ };

  // Direct navigation is more reliable than clicking footer buttons
  // (some pages don't show footer, or React re-renders cause stability issues)
  const currentUrl = page.url();
  const hashIndex = currentUrl.indexOf('#');
  const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
  await page.goto(`${baseUrl}${paths[target]}`);
  await page.waitForURL(pattern[target], { timeout: 5000 });
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function cleanup(context: BrowserContext, contextPath?: string): Promise<void> {
  try {
    for (const page of context.pages()) {
      await page.close().catch(() => {});
    }
    await context.close();
  } catch {
    await context.close().catch(() => {});
  }

  // Clean up persistent context directory to ensure fresh state on retry
  if (contextPath) {
    try {
      fs.rmSync(contextPath, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist or can't be deleted
    }
  }
}

async function getCurrentAddress(page: Page): Promise<string> {
  // Use index.addressText which filters by address pattern (bc1, tb1, 1, 3, m, n prefixes)
  const text = await index.addressText(page).textContent();
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
    const { context, contextPath } = await launchExtension(testId);
    await use(context);
    await cleanup(context, contextPath);
  },

  extensionPage: async ({ extensionContext }, use) => {
    // Find the extension page that was created by launchExtension
    const page = extensionContext.pages().find(p => p.url().includes('chrome-extension://'));
    if (!page) throw new Error('Extension page not found');

    // Ensure the page is fully loaded before returning
    await page.waitForLoadState('domcontentloaded');

    // Wait for either the unlock screen or onboarding to be visible
    // This ensures the extension React app has initialized
    const unlockInput = page.locator('input[name="password"]');
    const createButton = page.getByRole('button', { name: /Create.*Wallet/i });

    await Promise.race([
      unlockInput.waitFor({ state: 'visible', timeout: 30000 }),
      createButton.waitFor({ state: 'visible', timeout: 30000 }),
    ]).catch(() => {
      // If neither appears, the page might still be loading
      // Continue anyway and let the test handle it
    });

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
    const { context, contextPath } = await launchExtension(testId);
    await use(context);
    await cleanup(context, contextPath);
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
  // Note: sleep() is intentionally not exported - use web-first assertions instead
};

export type { NavTarget };
