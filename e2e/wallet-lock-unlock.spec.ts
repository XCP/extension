import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';

async function setupExtension(testName: string) {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext(`test-results/wallet-lock-unlock-${testName}`, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
  });

  // Wait for extension to load
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  const extensionId = serviceWorker.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('networkidle');
  
  return { page, context };
}

async function createInitialWallet(page: Page) {
  // Check if we're on onboarding
  const hasCreateWallet = await page.getByText('Create Wallet').isVisible().catch(() => false);
  
  if (hasCreateWallet) {
    // Create initial wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    
    // Reveal phrase
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    
    // Check the backup checkbox - it's a label that clicks the checkbox
    await page.getByText('I have saved my secret recovery phrase.').click();
    await page.waitForTimeout(500);
    
    // Set password
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    
    // Wait for navigation - the URL uses hash routing
    await page.waitForURL(url => url.href.includes('#/index') || url.href.endsWith('popup.html'), { timeout: 10000 });
  } else {
    // Check if we need to unlock
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      await page.locator('input[name="password"]').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: 'Unlock Wallet' }).click();
      await page.waitForURL(url => url.href.includes('#/index') || url.href.endsWith('popup.html'), { timeout: 10000 });
    }
  }
}

test.describe('Wallet Lock and Unlock', () => {
  let page: Page;
  let context: any;

  test.beforeEach(async ({ }, testInfo) => {
    const testName = testInfo.title.replace(/[^a-z0-9]/gi, '-');
    const setup = await setupExtension(testName);
    page = setup.page;
    context = setup.context;
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('lock wallet using header button', async () => {
    // Ensure we have a wallet created
    await createInitialWallet(page);
    
    // Click the lock button in the header
    await page.click('button[aria-label="Lock Wallet"]');
    
    // Should be redirected to unlock screen
    await page.waitForURL('**/unlock-wallet', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'XCP Wallet' })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('unlock wallet with correct password', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock Wallet"]');
    await page.waitForURL(url => url.href.includes('#/unlock-wallet'));
    
    // Enter correct password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Unlock")');
    
    // Should be back on main page
    await page.waitForSelector('text=/Assets|Balances/');
    await expect(page.locator('button[aria-label="Lock Wallet"]')).toBeVisible();
  });

  test('unlock wallet with incorrect password shows error', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock Wallet"]');
    await page.waitForURL(url => url.href.includes('#/unlock-wallet'));
    
    // Enter incorrect password
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Unlock")');
    
    // Should show error message
    await expect(page.locator('text="Invalid password. Please try again."')).toBeVisible();
    
    // Should still be on unlock screen
    await expect(page.getByRole('heading', { name: 'XCP Wallet' })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('lock all wallets option', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // The lock button in the header locks all wallets
    await page.click('button[aria-label="Lock Wallet"]');
    
    // Wait for navigation to unlock page
    await page.waitForTimeout(1000);
    
    // Should show unlock page with XCP Wallet title and password input
    await page.waitForSelector('text=XCP Wallet', { timeout: 10000 });
    await expect(page.locator('input[type="password"][placeholder="Enter your password"]')).toBeVisible();
    
    // Verify we're on the unlock page
    const unlockButton = page.locator('button[aria-label="Unlock Wallet"]');
    await expect(unlockButton).toBeVisible();
  });

  test('wallet auto-lock settings', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Navigate to settings using footer button
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(3).click(); // Settings is the 4th button
    await page.waitForURL('**/settings', { timeout: 10000 });
    
    // Click on Advanced settings option
    await page.locator('div[role="button"][aria-label="Advanced"]').click();
    await page.waitForURL('**/settings/advanced', { timeout: 10000 });
    
    // Should see auto-lock timer setting
    await expect(page.locator('text="Auto-Lock Timer"')).toBeVisible();
    
    // Check available timeout options
    const timeoutOptions = ['1 Minute', '5 Minutes', '15 Minutes', '30 Minutes'];
    for (const option of timeoutOptions) {
      const optionLocator = page.locator(`text="${option}"`);
      await expect(optionLocator).toBeVisible();
    }
    
    // Verify we can select an option
    const firstOption = page.locator('div[role="radio"]').first();
    await firstOption.click();
    await page.waitForTimeout(500);
  });

  test('reset wallet option in settings', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Navigate to settings using footer button
    const footer = page.locator('.border-t.border-gray-300').filter({ has: page.locator('.grid.grid-cols-4') });
    await footer.locator('button').nth(3).click(); // Settings is the 4th button
    await page.waitForURL('**/settings', { timeout: 10000 });
    
    // Scroll to bottom to find reset wallet button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    
    // Look for reset wallet button
    const resetButton = page.locator('button[aria-label="Reset Wallet"]');
    await expect(resetButton).toBeVisible();
    
    // Click reset wallet
    await resetButton.click();
    await page.waitForURL('**/reset-wallet', { timeout: 10000 });
    
    // Should show reset wallet confirmation page
    await page.waitForTimeout(500);
    
    // Go back without resetting
    await page.goBack();
    await page.waitForURL('**/settings', { timeout: 10000 });
  });

  test('multiple unlock attempts', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock Wallet"]');
    await page.waitForURL(url => url.href.includes('#/unlock-wallet'));
    
    // Try multiple incorrect passwords
    for (let i = 0; i < 3; i++) {
      await page.fill('input[type="password"]', `wrongpass${i}`);
      await page.click('button:has-text("Unlock")');
      
      // Should show error each time
      await expect(page.locator('text=/Invalid password|Incorrect password/')).toBeVisible();
      
      // Clear the input for next attempt
      await page.locator('input[type="password"]').clear();
    }
    
    // Finally try correct password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Unlock")');
    
    // Should successfully unlock
    await page.waitForSelector('text=/Assets|Balances/');
  });

  test('lock state persists on reload', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Wait for main page to be ready
    await page.waitForSelector('text=/Assets|Balances/', { timeout: 10000 });
    
    // Lock the wallet
    await page.click('button[aria-label="Lock Wallet"]');
    await page.waitForTimeout(1000);
    
    // Should be on unlock screen with XCP Wallet title
    await page.waitForSelector('text=XCP Wallet', { timeout: 10000 });
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should still be on unlock screen after reload
    await expect(page.locator('text=XCP Wallet')).toBeVisible();
    await expect(page.locator('input[type="password"][placeholder="Enter your password"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Unlock Wallet"]')).toBeVisible();
  });

  test('unlock state persists on reload', async () => {
    // Ensure we have a wallet and it's unlocked
    await createInitialWallet(page);
    
    // Verify we're on main page (unlocked)
    // Verify we're on main page (check for one of the tab buttons)
    await expect(page.locator('button[aria-label="View Assets"]')).toBeVisible();
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be unlocked and on main page
    // Verify we're on main page (check for one of the tab buttons)
    await expect(page.locator('button[aria-label="View Assets"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Lock Wallet"]')).toBeVisible();
  });
});