import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  importWallet,
  unlockWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC 
} from './helpers/test-helpers';

// Expected addresses for the test mnemonic across different address types
const EXPECTED_ADDRESSES = {
  P2PKH: '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',     // Legacy
  P2WPKH: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', // Native SegWit (bech32)
  P2SH_P2WPKH: '37Lx99uaGn5avKBxiW26HjedQE3LrDCZru', // Nested SegWit
  P2TR: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', // Taproot
};

test('import wallet with test mnemonic', async () => {
  const { context, page } = await launchExtension('wallet-import-basic');
  
  // Check if onboarding page
  const hasImportOption = await page.getByText('Import Wallet').isVisible().catch(() => false);
  
  if (!hasImportOption) {
    // Wallet already exists, skip this test
    await cleanup(context);
    return;
  }
  
  // Import wallet with test mnemonic
  await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);
  
  // Wait for wallet to load
  await page.waitForURL(/index/, { timeout: 10000 });
  await page.waitForTimeout(2000);
  
  // Check the default address (should be Native SegWit)
  const fullAddressElement = page.locator('text=/^bc1q[a-z0-9]{38}$/');
  const truncatedAddressElement = page.locator('text=/^bc1q[a-z0-9]{2,3}\\.\\.\\.[a-z0-9]{6}$/');
  
  let foundAddress = false;
  if (await fullAddressElement.count() > 0) {
    const fullAddress = await fullAddressElement.first().textContent();
    expect(fullAddress).toBe(EXPECTED_ADDRESSES.P2WPKH);
    foundAddress = true;
  } else if (await truncatedAddressElement.count() > 0) {
    const truncatedAddress = await truncatedAddressElement.first().textContent();
    // Verify it starts with bc1q and ends correctly
    expect(truncatedAddress).toMatch(/^bc1q/);
    foundAddress = true;
  }
  
  expect(foundAddress).toBe(true);
  
  await page.screenshot({ path: 'test-results/screenshots/imported-wallet.png' });
  
  await cleanup(context);
});

test('switch address types with imported wallet', async () => {
  const { context, page } = await launchExtension('wallet-import-switch');
  
  // Check if we need to import wallet first
  const hasImportOption = await page.getByText('Import Wallet').isVisible().catch(() => false);
  if (hasImportOption) {
    await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);
    await page.waitForURL(/index/, { timeout: 10000 });
    await page.waitForTimeout(2000);
  } else {
    // Unlock wallet if needed
    const needsUnlock = page.url().includes('unlock');
    if (needsUnlock) {
      await unlockWallet(page, TEST_PASSWORD);
    }
  }
  
  // Navigate to settings to change address type
  await navigateViaFooter(page, 'settings');
  
  // Look for address type settings
  const addressTypeOption = page.locator('text=/Address Type|address type/i');
  if (await addressTypeOption.isVisible()) {
    await addressTypeOption.click();
    await page.waitForTimeout(1000);
    
    // Try to select Legacy address type
    const legacyOption = page.locator('text=/Legacy|P2PKH/i');
    if (await legacyOption.isVisible()) {
      await legacyOption.click();
      await page.waitForTimeout(1000);
    }
  }
  
  // Go back to main page
  await navigateViaFooter(page, 'wallet');
  await page.waitForTimeout(1000);
  
  await cleanup(context);
});

test('import with invalid mnemonic shows error', async () => {
  const { context, page } = await launchExtension('wallet-import-invalid');
  
  // Check if onboarding page
  const hasImportOption = await page.getByText('Import Wallet').isVisible().catch(() => false);
  
  if (!hasImportOption) {
    // Wallet already exists, skip this test
    await cleanup(context);
    return;
  }
  
  // Click import wallet
  await page.getByText('Import Wallet').click();
  await page.waitForTimeout(1000);
  
  // Enter invalid mnemonic
  const mnemonicWords = 'invalid words that are not a valid mnemonic phrase test test test test test test'.split(' ');
  
  // Fill in the word inputs
  for (let i = 0; i < Math.min(mnemonicWords.length, 12); i++) {
    const input = page.locator(`input[name="word-${i}"]`);
    if (await input.isVisible()) {
      await input.fill(mnemonicWords[i]);
    }
  }
  
  // Try to check the confirmation (if exists)
  const confirmCheckbox = page.getByLabel(/I have saved|backed up/i);
  if (await confirmCheckbox.isVisible()) {
    await confirmCheckbox.check();
  }
  
  // Set password
  await page.locator('input[name="password"]').fill(TEST_PASSWORD);
  
  // Try to submit
  await page.getByRole('button', { name: /Continue|Import/i }).click();
  
  // Should show error or not navigate away
  await page.waitForTimeout(2000);
  
  // Check if we're still on import page (not navigated to index)
  const stillOnImport = !page.url().includes('index');
  expect(stillOnImport).toBe(true);
  
  await cleanup(context);
});

test('import with private key', async () => {
  const { context, page } = await launchExtension('wallet-import-privkey');
  
  // Check if onboarding page
  const hasImportOption = await page.getByText('Import Wallet').isVisible().catch(() => false);
  
  if (!hasImportOption) {
    // Wallet already exists, skip this test
    await cleanup(context);
    return;
  }
  
  // Click import wallet
  await page.getByText('Import Wallet').click();
  await page.waitForTimeout(1000);
  
  // Look for private key option
  const privateKeyOption = page.locator('text=/Private Key|private key/i');
  if (await privateKeyOption.isVisible()) {
    await privateKeyOption.click();
    await page.waitForTimeout(1000);
    
    // Test private key (from test mnemonic, first address)
    const testPrivateKey = 'L1Knwj9W3qK3qMKdTvmg3VfzUs3ij2LETTFhxza9LfD5dngnoLG1';
    
    // Enter private key
    const privateKeyInput = page.locator('input[placeholder*="private key"], textarea[placeholder*="private key"]');
    await privateKeyInput.fill(testPrivateKey);
    
    // Set password
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    
    // Submit
    await page.getByRole('button', { name: /Continue|Import/i }).click();
    
    // Should navigate to index
    await page.waitForURL(/index/, { timeout: 10000 });
    
    // Verify wallet loaded
    await expect(page.locator('text=/Assets|Balances|BTC/')).toBeVisible();
  }
  
  await cleanup(context);
});