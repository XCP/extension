import { test, expect, type Page, chromium } from '@playwright/test';
import path from 'path';

const TEST_PASSWORD = 'test123456';

async function setupExtension() {
  const extensionPath = path.resolve('.output/chrome-mv3');
  
  const context = await chromium.launchPersistentContext('test-results/wallet-lock-unlock', {
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
    
    // Check the backup checkbox
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    
    // Set password
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    
    // Wait for main page
    await page.waitForURL(/index/, { timeout: 10000 });
  } else {
    // Check if we need to unlock
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      await page.locator('input[name="password"]').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /unlock/i }).click();
      await page.waitForURL(/index/, { timeout: 10000 });
    }
  }
}

test.describe('Wallet Lock and Unlock', () => {
  let page: Page;
  let context: any;

  test.beforeEach(async () => {
    const setup = await setupExtension();
    page = setup.page;
    context = setup.context;
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('lock wallet using header button', async () => {
    // Ensure we have a wallet created
    await createInitialWallet(page);
    
    // Find the lock button in the header (right button) - it might be an icon button
    const lockButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    const isVisible = await lockButton.isVisible().catch(() => false);
    
    if (!isVisible) {
      // Try alternative selector
      const altLockButton = page.getByRole('button', { name: /lock/i });
      if (await altLockButton.isVisible().catch(() => false)) {
        await altLockButton.click();
      } else {
        throw new Error('Lock button not found');
      }
    } else {
      await lockButton.click();
    }
    
    // Should be redirected to unlock screen
    await page.waitForURL(/unlock/, { timeout: 5000 });
    await expect(page.getByText(/unlock/i)).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('unlock wallet with correct password', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock wallet"]');
    await page.waitForSelector('text=Unlock Wallet');
    
    // Enter correct password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Unlock")');
    
    // Should be back on main page
    await page.waitForSelector('text=/Assets|Balances/');
    await expect(page.locator('button[aria-label="Lock wallet"]')).toBeVisible();
  });

  test('unlock wallet with incorrect password shows error', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock wallet"]');
    await page.waitForSelector('text=Unlock Wallet');
    
    // Enter incorrect password
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Unlock")');
    
    // Should show error message
    await expect(page.locator('text=/Invalid password|Incorrect password/')).toBeVisible();
    
    // Should still be on unlock screen
    await expect(page.locator('text=Unlock Wallet')).toBeVisible();
  });

  test('lock all wallets option', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Access wallet menu
    await page.click('button[aria-label="Wallet options"]');
    
    // Look for "Lock All Wallets" option
    const lockAllOption = page.locator('text=Lock All Wallets');
    if (await lockAllOption.isVisible()) {
      await lockAllOption.click();
      
      // Should be redirected to unlock screen
      await page.waitForSelector('text=Unlock Wallet');
      await expect(page.locator('input[type="password"]')).toBeVisible();
    } else {
      // If not in menu, the lock button in header locks all wallets
      await page.click('button[aria-label="Lock wallet"]');
      await page.waitForSelector('text=Unlock Wallet');
    }
  });

  test('wallet auto-lock settings', async () => {
    // Ensure we have a wallet
    await createInitialWallet(page);
    
    // Navigate to settings
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector('text=Settings');
    
    // Look for security settings
    await page.click('text=Security');
    
    // Should see auto-lock options
    await expect(page.locator('text=/Auto-lock|Lock timeout/')).toBeVisible();
    
    // Check available timeout options
    const timeoutOptions = ['1 minute', '5 minutes', '15 minutes', '30 minutes', 'Disabled'];
    for (const option of timeoutOptions) {
      const optionLocator = page.locator(`text="${option}"`);
      if (await optionLocator.isVisible()) {
        console.log(`Auto-lock option available: ${option}`);
      }
    }
  });

  test('reset wallet option when locked', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock wallet"]');
    await page.waitForSelector('text=Unlock Wallet');
    
    // Look for reset wallet option
    const resetButton = page.locator('text=/Forgot password|Reset wallet/i');
    if (await resetButton.isVisible()) {
      await resetButton.click();
      
      // Should show reset wallet confirmation
      await expect(page.locator('text=/Reset.*wallet|permanently delete/i')).toBeVisible();
      
      // Don't actually reset - just verify the option exists
      const cancelButton = page.locator('button:has-text("Cancel")');
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
    }
  });

  test('multiple unlock attempts', async () => {
    // Ensure we have a wallet and lock it
    await createInitialWallet(page);
    await page.click('button[aria-label="Lock wallet"]');
    await page.waitForSelector('text=Unlock Wallet');
    
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
    
    // Lock the wallet
    await page.click('button[aria-label="Lock wallet"]');
    await page.waitForSelector('text=Unlock Wallet');
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be on unlock screen
    await expect(page.locator('text=Unlock Wallet')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('unlock state persists on reload', async () => {
    // Ensure we have a wallet and it's unlocked
    await createInitialWallet(page);
    
    // Verify we're on main page (unlocked)
    await expect(page.locator('text=/Assets|Balances/')).toBeVisible();
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be unlocked and on main page
    await expect(page.locator('text=/Assets|Balances/')).toBeVisible();
    await expect(page.locator('button[aria-label="Lock wallet"]')).toBeVisible();
  });
});