import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  createWallet,
  importWallet,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC 
} from './helpers/test-helpers';

test.describe('Wallet UI Interactions', () => {
  test('refresh mnemonic button on create wallet', async () => {
    const { context, page } = await launchExtension('refresh-mnemonic');
    
    // Navigate to create wallet flow
    const needsOnboarding = await page.getByText('Create Wallet').isVisible().catch(() => false);
    if (needsOnboarding) {
      await page.getByText('Create Wallet').click();
    } else {
      // If already has wallet, navigate through wallet management
      const walletButton = page.locator('button').filter({ hasText: /Wallet/i }).first();
      await walletButton.click();
      await page.waitForTimeout(1000);
      await page.getByText('Add Wallet').click();
      await page.waitForTimeout(1000);
      await page.getByText('Create Wallet').click();
    }
    
    await page.waitForTimeout(1000);
    
    // Look for the refresh button (FaSync icon) in the header
    const refreshButton = page.locator('button[aria-label="Generate new recovery phrase"]');
    const hasRefreshButton = await refreshButton.isVisible().catch(() => false);
    // console.log('Has refresh button:', hasRefreshButton);
    
    if (hasRefreshButton) {
      // Click "View 12-word Secret Phrase" first to see the mnemonic
      await page.getByText('View 12-word Secret Phrase').click();
      await page.waitForTimeout(1000);
      
      // Get the initial mnemonic words
      const initialWords: string[] = [];
      for (let i = 1; i <= 12; i++) {
        const wordElement = page.locator(`text=/^${i}\\./`).locator('..').locator('text=/\\w+/').last();
        const word = await wordElement.textContent();
        initialWords.push(word || '');
      }
      // console.log('Initial first word:', initialWords[0]);
      
      // Click refresh button
      await refreshButton.click();
      await page.waitForTimeout(1000);
      
      // Get the new mnemonic words
      const newWords: string[] = [];
      for (let i = 1; i <= 12; i++) {
        const wordElement = page.locator(`text=/^${i}\\./`).locator('..').locator('text=/\\w+/').last();
        const word = await wordElement.textContent();
        newWords.push(word || '');
      }
      // console.log('New first word:', newWords[0]);
      
      // Verify the mnemonic changed
      expect(initialWords[0]).not.toBe(newWords[0]);
      // console.log('✓ Mnemonic successfully refreshed');
    }
    
    await cleanup(context);
  });

  test('password show/hide on create wallet', async () => {
    const { context, page } = await launchExtension('password-show-hide-create');
    
    // Navigate to create wallet
    const needsOnboarding = await page.getByText('Create Wallet').isVisible().catch(() => false);
    if (needsOnboarding) {
      await page.getByText('Create Wallet').click();
    } else {
      const walletButton = page.locator('button').filter({ hasText: /Wallet/i }).first();
      await walletButton.click();
      await page.waitForTimeout(1000);
      await page.getByText('Add Wallet').click();
      await page.waitForTimeout(1000);
      await page.getByText('Create Wallet').click();
    }
    
    await page.waitForTimeout(1000);
    
    // View secret phrase and check the checkbox to reveal password input
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.waitForTimeout(500);
    
    // Find password input and show/hide button
    const passwordInput = page.locator('input[name="password"]');
    const showHideButton = page.locator('button[aria-label*="password"]').filter({ has: page.locator('svg') });
    
    // Initially should be password type
    const initialType = await passwordInput.getAttribute('type');
    // console.log('Initial input type:', initialType);
    expect(initialType).toBe('password');
    
    // Type a password
    await passwordInput.fill(TEST_PASSWORD);
    
    // Click show password button
    await showHideButton.click();
    await page.waitForTimeout(500);
    
    // Should now be text type
    const typeAfterShow = await passwordInput.getAttribute('type');
    // console.log('Type after clicking show:', typeAfterShow);
    expect(typeAfterShow).toBe('text');
    
    // Verify password is visible
    const visiblePassword = await passwordInput.inputValue();
    expect(visiblePassword).toBe(TEST_PASSWORD);
    // console.log('✓ Password is visible');
    
    // Click hide password button
    await showHideButton.click();
    await page.waitForTimeout(500);
    
    // Should be password type again
    const typeAfterHide = await passwordInput.getAttribute('type');
    // console.log('Type after clicking hide:', typeAfterHide);
    expect(typeAfterHide).toBe('password');
    // console.log('✓ Password show/hide toggle works');
    
    await cleanup(context);
  });

  test('mnemonic show/hide on import wallet', async () => {
    const { context, page } = await launchExtension('mnemonic-show-hide');
    
    // Navigate to import wallet
    const hasImportWallet = await page.getByText('Import Wallet').isVisible().catch(() => false);
    
    if (hasImportWallet) {
      await page.getByText('Import Wallet').click();
    } else {
      // Reset and start fresh by reloading
      await page.reload();
      await page.waitForTimeout(1000);
      const importButton = await page.getByText('Import Wallet').isVisible().catch(() => false);
      if (importButton) {
        await page.getByText('Import Wallet').click();
      }
    }
    
    await page.waitForTimeout(1000);
    
    // Look for the eye icon button in the header
    const eyeButton = page.locator('button[aria-label*="recovery phrase"]').filter({ has: page.locator('svg') });
    const hasEyeButton = await eyeButton.isVisible().catch(() => false);
    // console.log('Has eye button in header:', hasEyeButton);
    
    if (hasEyeButton) {
      // Enter mnemonic words
      const mnemonicWords = TEST_MNEMONIC.split(' ');
      for (let i = 0; i < mnemonicWords.length; i++) {
        const input = page.locator(`input[name="word-${i}"]`);
        await input.fill(mnemonicWords[i]);
        await page.waitForTimeout(50);
      }
      
      // Check initial type of inputs (should be password)
      const firstInput = page.locator('input[name="word-0"]');
      const initialType = await firstInput.getAttribute('type');
      // console.log('Initial mnemonic input type:', initialType);
      expect(initialType).toBe('password');
      
      // Click show button
      await eyeButton.click();
      await page.waitForTimeout(500);
      
      // Should now be text type
      const typeAfterShow = await firstInput.getAttribute('type');
      // console.log('Type after clicking show:', typeAfterShow);
      expect(typeAfterShow).toBe('text');
      
      // Verify words are visible
      const visibleWord = await firstInput.inputValue();
      expect(visibleWord).toBe('abandon');
      // console.log('✓ Mnemonic words are visible');
      
      // Click hide button
      await eyeButton.click();
      await page.waitForTimeout(500);
      
      // Should be password type again
      const typeAfterHide = await firstInput.getAttribute('type');
      // console.log('Type after clicking hide:', typeAfterHide);
      expect(typeAfterHide).toBe('password');
      // console.log('✓ Mnemonic show/hide toggle works');
    }
    
    await cleanup(context);
  });

  test('password show/hide on import wallet', async () => {
    const { context, page } = await launchExtension('password-show-hide-import');
    
    // Navigate to import wallet
    const hasImportWallet = await page.getByText('Import Wallet').isVisible().catch(() => false);
    
    if (hasImportWallet) {
      await page.getByText('Import Wallet').click();
    } else {
      // Reset and start fresh by reloading
      await page.reload();
      await page.waitForTimeout(1000);
      const importButton = await page.getByText('Import Wallet').isVisible().catch(() => false);
      if (importButton) {
        await page.getByText('Import Wallet').click();
      }
    }
    
    await page.waitForTimeout(1000);
    
    // Enter mnemonic and check checkbox to reveal password input
    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < mnemonicWords.length; i++) {
      const input = page.locator(`input[name="word-${i}"]`);
      await input.fill(mnemonicWords[i]);
      await page.waitForTimeout(50);
    }
    
    await page.getByLabel(/I have saved|backed up/i).check();
    await page.waitForTimeout(500);
    
    // Find password input and show/hide button
    const passwordInput = page.locator('input[name="password"]');
    const showHideButton = passwordInput.locator('..').locator('button[aria-label*="password"]');
    
    // Test password show/hide functionality
    const initialType = await passwordInput.getAttribute('type');
    // console.log('Initial password type:', initialType);
    expect(initialType).toBe('password');
    
    await passwordInput.fill(TEST_PASSWORD);
    
    // Click show
    await showHideButton.click();
    await page.waitForTimeout(500);
    
    const typeAfterShow = await passwordInput.getAttribute('type');
    expect(typeAfterShow).toBe('text');
    // console.log('✓ Password is visible on import');
    
    // Click hide
    await showHideButton.click();
    await page.waitForTimeout(500);
    
    const typeAfterHide = await passwordInput.getAttribute('type');
    expect(typeAfterHide).toBe('password');
    // console.log('✓ Password show/hide works on import');
    
    await cleanup(context);
  });
});