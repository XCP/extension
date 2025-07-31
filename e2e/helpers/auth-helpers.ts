import { Page } from '@playwright/test';
import { waitForProxyServices } from './extension-init';

export const TEST_PASSWORD = 'TestPassword123!';

/**
 * Create a new wallet through the UI with proper error handling
 */
export async function createWalletWithUI(page: Page, extensionId: string): Promise<boolean> {
  try {
    console.log('[Auth] Starting wallet creation...');
    
    // Navigate to onboarding
    await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);
    await page.waitForLoadState('networkidle');
    
    // Ensure proxy services are ready
    await waitForProxyServices(page);
    
    // Click Create Wallet
    const createButton = page.getByRole('button', { name: /Create Wallet/i });
    await createButton.waitFor({ state: 'visible' });
    await createButton.click();
    
    // Wait for create wallet page
    await page.waitForURL(/#\/create-wallet$/, { timeout: 10000 });
    console.log('[Auth] Navigated to create wallet page');
    
    // Click to reveal recovery phrase
    const revealButton = page.getByText(/View 12-word Secret Phrase/);
    await revealButton.waitFor({ state: 'visible' });
    await revealButton.click();
    
    // Small delay to ensure phrase is visible
    await page.waitForTimeout(500);
    
    // Check the confirmation checkbox
    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await checkbox.waitFor({ state: 'visible' });
    await checkbox.check();
    
    // Wait for password field to appear (it's conditional on checkbox)
    await page.waitForSelector('input[name="password"]', { state: 'visible', timeout: 5000 });
    
    // Fill password
    await page.fill('input[name="password"]', TEST_PASSWORD);
    
    // Submit
    const continueButton = page.getByRole('button', { name: /Continue/i });
    await continueButton.waitFor({ state: 'visible' });
    
    // Listen for console errors before clicking
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await continueButton.click();
    console.log('[Auth] Submitted wallet creation form');
    
    // Wait for success (redirect to index) or error
    const result = await Promise.race([
      page.waitForURL(/#\/index$/, { timeout: 10000 }).then(() => 'success'),
      page.locator('[role="alert"]').waitFor({ state: 'visible', timeout: 5000 }).then(() => 'error'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000))
    ]);
    
    if (result === 'success') {
      console.log('[Auth] Wallet created successfully');
      // Wait for wallet address to appear
      await page.waitForSelector('text=bc1q', { timeout: 5000 });
      return true;
    } else if (result === 'error') {
      const errorText = await page.locator('[role="alert"]').textContent();
      console.error('[Auth] Wallet creation error:', errorText);
      console.error('[Auth] Console errors:', errors);
      return false;
    } else {
      console.error('[Auth] Wallet creation timeout');
      console.error('[Auth] Console errors:', errors);
      return false;
    }
  } catch (error) {
    console.error('[Auth] Wallet creation failed:', error);
    return false;
  }
}

/**
 * Unlock an existing wallet
 */
export async function unlockWallet(page: Page, extensionId: string, walletId?: string): Promise<boolean> {
  try {
    console.log('[Auth] Unlocking wallet...');
    
    // Navigate to unlock page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/unlock-wallet`);
    await page.waitForLoadState('networkidle');
    
    // Ensure proxy services are ready
    await waitForProxyServices(page);
    
    // Select wallet if specified
    if (walletId) {
      await page.selectOption('select[name="wallet"]', walletId);
    }
    
    // Fill password
    await page.fill('input[name="password"]', TEST_PASSWORD);
    
    // Submit
    const unlockButton = page.getByRole('button', { name: /unlock/i });
    await unlockButton.click();
    
    // Wait for success
    await page.waitForURL(/#\/index$/, { timeout: 10000 });
    await page.waitForSelector('text=bc1q', { timeout: 5000 });
    
    console.log('[Auth] Wallet unlocked successfully');
    return true;
  } catch (error) {
    console.error('[Auth] Wallet unlock failed:', error);
    return false;
  }
}

/**
 * Check if wallet is currently unlocked
 */
export async function isWalletUnlocked(page: Page): Promise<boolean> {
  const url = page.url();
  return !url.includes('unlock-wallet') && !url.includes('onboarding');
}

/**
 * Ensure wallet is unlocked, creating one if necessary
 */
export async function ensureWalletReady(page: Page, extensionId: string): Promise<boolean> {
  console.log('[Auth] Ensuring wallet is ready...');
  
  // Check current state
  const currentUrl = page.url();
  
  if (currentUrl.includes('onboarding')) {
    // No wallet exists, create one
    console.log('[Auth] No wallet exists, creating...');
    return await createWalletWithUI(page, extensionId);
  } else if (currentUrl.includes('unlock-wallet')) {
    // Wallet exists but is locked
    console.log('[Auth] Wallet is locked, unlocking...');
    return await unlockWallet(page, extensionId);
  } else if (currentUrl.includes('#/index')) {
    // Already unlocked
    console.log('[Auth] Wallet already unlocked');
    return true;
  } else {
    // Unknown state, navigate to root and check
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForTimeout(1000);
    return await ensureWalletReady(page, extensionId);
  }
}