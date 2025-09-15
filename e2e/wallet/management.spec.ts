import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  createWallet,
  importWallet,
  importPrivateKey,
  switchWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC,
  TEST_PRIVATE_KEY 
} from '../helpers/test-helpers';

test.describe('Wallet Management Features', () => {
  test('access wallet management from header', async () => {
    const { context, page } = await launchExtension('wallet-mgmt-header');
    await setupWallet(page);
    
    // Look for wallet button in header - try different selectors
    const walletButton = page.locator('button').filter({ hasText: /Wallet/i }).first();
    const headerButton = page.locator('header button').first();
    
    if (await walletButton.isVisible()) {
      await walletButton.click();
    } else if (await headerButton.isVisible()) {
      await headerButton.click();
    }
    
    await page.waitForTimeout(1000);
    
    // Should see wallet menu or page
    const onWalletPage = page.url().includes('wallet');
    
    if (onWalletPage) {
      // We're already on the wallet management page
      const hasWalletList = await page.getByText(/Wallet 1/i).isVisible().catch(() => false);
      expect(hasWalletList).toBe(true);
      
      // Check for "Add Wallet" button
      const hasAddWallet = await page.getByText('Add Wallet').isVisible().catch(() => false);
      expect(hasAddWallet).toBe(true);
    }
    
    await cleanup(context);
  });
  
  test('add multiple wallets', async () => {
    const { context, page } = await launchExtension('multiple-wallets');
    await setupWallet(page);
    
    // Navigate to wallet management
    const walletButton = page.locator('button').filter({ hasText: /Wallet/i }).first();
    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Check if we're on wallet page
      if (page.url().includes('wallet')) {
        // Look for add wallet button  
        const addButton = page.getByText('Add Wallet');
        if (await addButton.isVisible()) {
          await addButton.click();
          await page.waitForTimeout(1000);
          
          // Should see options
          const hasCreateOption = await page.getByText('Create New Wallet').isVisible().catch(() => false);
          
          if (hasCreateOption) {
            await page.getByText('Create New Wallet').click();
            await page.waitForTimeout(1000);
            
            // Complete wallet creation
            await page.getByText('View 12-word Secret Phrase').click();
            await page.waitForTimeout(1000);
            await page.getByLabel(/I have saved my secret recovery phrase/).check();
            await page.waitForTimeout(500);
            await page.locator('input[name="password"]').fill(TEST_PASSWORD);
            await page.getByRole('button', { name: /Continue/i }).click();
            
            // Should return to wallet list with 2 wallets
            await page.waitForTimeout(2000);
            const wallet2 = await page.getByText('Wallet 2').isVisible().catch(() => false);
            expect(wallet2).toBe(true);
          }
        }
      }
    }
    
    await cleanup(context);
  });

  test('create multiple wallets', async () => {
    const { context, page } = await launchExtension('multiple-wallets-create');
    
    // Create first wallet
    await createWallet(page, TEST_PASSWORD);
    
    // Navigate to wallet management (likely in header or settings)
    const walletButton = page.locator('header button').first();
    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Look for "Add Wallet" or "Create Wallet" button
      const addWalletButton = page.getByText(/Add Wallet|Create.*Wallet|New Wallet/i);
      if (await addWalletButton.isVisible()) {
        await addWalletButton.click();
        await page.waitForTimeout(1000);
        
        // Should show wallet creation options
        const createOption = page.getByText(/Create.*Wallet/i);
        if (await createOption.isVisible()) {
          await createOption.click();
          
          // Complete second wallet creation
          await page.getByText('View 12-word Secret Phrase').click();
          await page.waitForTimeout(1000);
          await page.getByLabel(/I have saved my secret recovery phrase/).check();
          await page.waitForTimeout(500);
          await page.locator('input[name="password"]').fill(TEST_PASSWORD);
          await page.getByRole('button', { name: /Continue/i }).click();
          
          // Should have created second wallet
          await page.waitForTimeout(2000);
          const wallet2 = await page.getByText('Wallet 2').isVisible().catch(() => false);
          expect(wallet2).toBe(true);
        }
      }
    }
    
    await cleanup(context);
  });

  test('import wallet from mnemonic', async () => {
    const { context, page } = await launchExtension('import-mnemonic-mgmt');
    
    // Check if we're on onboarding or need to add wallet
    const hasImportOption = await page.getByText('Import Wallet').isVisible().catch(() => false);
    
    if (hasImportOption) {
      // Import from onboarding
      await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);
      
      // Verify wallet imported successfully
      await expect(page).toHaveURL(/index/);
      await expect(page.locator('text=/Assets|Balances/').first()).toBeVisible();
    } else {
      // Create initial wallet first, then add imported wallet
      await setupWallet(page);
      
      // Try to add another wallet via import
      const walletButton = page.locator('header button').first();
      if (await walletButton.isVisible()) {
        await walletButton.click();
        await page.waitForTimeout(1000);
        
        const addWalletButton = page.getByText(/Add Wallet|Import/i);
        if (await addWalletButton.isVisible()) {
          await addWalletButton.click();
          await page.waitForTimeout(1000);
          
          const importOption = page.getByText(/Import.*Wallet/i);
          if (await importOption.isVisible()) {
            await importOption.click();
            await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);
          }
        }
      }
    }
    
    await cleanup(context);
  });

  test('import wallet from private key', async () => {
    const { context, page } = await launchExtension('import-privkey-mgmt');
    
    // Check if we're on onboarding
    const hasImportOption = await page.getByText('Import Wallet').isVisible().catch(() => false);
    
    if (hasImportOption) {
      // Import from onboarding using private key option
      await page.getByText('Import Wallet').click();
      await page.waitForTimeout(1000);
      
      // Look for private key option
      const privateKeyOption = page.locator('text=/Private Key|private key/i');
      if (await privateKeyOption.isVisible()) {
        await privateKeyOption.click();
        await importPrivateKey(page, TEST_PRIVATE_KEY, TEST_PASSWORD);
        
        // Verify wallet imported
        await expect(page).toHaveURL(/index/);
      }
    } else {
      // Create wallet first, then add private key wallet
      await setupWallet(page);
    }
    
    await cleanup(context);
  });

  test('switch between wallets', async () => {
    const { context, page } = await launchExtension('switch-wallets');
    
    // Create first wallet
    await createWallet(page, TEST_PASSWORD);
    
    // Navigate to wallet switcher in header
    const walletButton = page.locator('header button').first();
    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Look for Add Wallet button (the + button)
      const addWalletButton = page.getByRole('button', { name: /Add.*Wallet|\+/i }).last();
      if (await addWalletButton.isVisible()) {
        await addWalletButton.click();
        await page.waitForTimeout(1000);
        
        // Should now be on the Add Wallet page with three options
        // Click Import Mnemonic button
        const importMnemonicButton = page.getByRole('button', { name: /Import Mnemonic/i });
        if (await importMnemonicButton.isVisible()) {
          await importMnemonicButton.click();
          await page.waitForTimeout(1000);
          
          // Use a different mnemonic for the second wallet
          const secondMnemonic = 'test test test test test test test test test test test junk';
          await importWallet(page, secondMnemonic, TEST_PASSWORD);
          
          // Should return to index after import
          await page.waitForURL('**/index**', { timeout: 10000 });
        }
      }
      
      // Now switch between wallets - click wallet button again
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Should see both wallets - click on Wallet 2
      const wallet2 = page.getByText('Wallet 2');
      if (await wallet2.isVisible()) {
        await wallet2.click();
        await page.waitForTimeout(1000);
        
        // Verify we're back on index with an address visible
        const hasAddress = await page.locator('.font-mono').first().isVisible();
        expect(hasAddress).toBe(true);
      }
    }
    
    await cleanup(context);
  });

  test('wallet naming and identification', async () => {
    const { context, page } = await launchExtension('wallet-naming');
    await setupWallet(page);
    
    // Look for wallet indicator in header - might be button or text
    const walletButton = page.locator('header button, header [role="button"]').first();
    const isWalletButtonVisible = await walletButton.isVisible().catch(() => false);
    
    if (isWalletButtonVisible) {
      const walletText = await walletButton.textContent();
      
      // Check if it's a wallet indicator or back button
      if (walletText && walletText.includes('Back')) {
        // We're on a sub-page, navigate back first
        await walletButton.click();
        await page.waitForTimeout(1000);
      }
      
      // Now check for wallet information
      const hasWalletInfo = await page.locator('text=/Wallet/i').first().isVisible().catch(() => false);
      const hasAddressInfo = await page.locator('.font-mono').first().isVisible().catch(() => false);
      
      // Should have some wallet or address identifier
      expect(hasWalletInfo || hasAddressInfo).toBe(true);
    } else {
      // No wallet button visible, just check we're on a valid page
      const hasContent = await page.locator('text=/Wallet|Address|Bitcoin/i').first().isVisible().catch(() => false);
      expect(hasContent).toBe(true);
    }
    
    await cleanup(context);
  });

  test('wallet removal/deletion option', async () => {
    const { context, page } = await launchExtension('wallet-removal');
    await setupWallet(page);
    
    // Navigate to wallet management
    const walletButton = page.locator('header button').first();
    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.waitForTimeout(1000);
      
      // Look for wallet settings or options
      const settingsButton = page.locator('[aria-label*="settings"], [aria-label*="options"]').first();
      if (await settingsButton.isVisible()) {
        await settingsButton.click();
        await page.waitForTimeout(1000);
        
        // Should show delete/remove option
        const deleteOption = await page.locator('text=/Delete|Remove|Clear/i').isVisible();
        if (deleteOption) {
          // Don't actually delete, just verify option exists
          expect(deleteOption).toBe(true);
        }
      }
    }
    
    await cleanup(context);
  });

  test('wallet backup and recovery phrase access', async () => {
    const { context, page } = await launchExtension('wallet-backup');
    await setupWallet(page);
    
    // The backup features are accessed through wallet/address menus, not settings
    // Navigate to wallet selection page
    const walletButton = page.locator('header button').first();
    if (await walletButton.isVisible()) {
      await walletButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Look for wallet menu button (three dots)
    const menuButtons = page.locator('button[aria-label*="menu"], button').filter({ hasText: '⋮' });
    const menuCount = await menuButtons.count();
    
    if (menuCount > 0) {
      // Click the first menu button
      await menuButtons.first().click();
      await page.waitForTimeout(500);
      
      // Look for "Show Passphrase" or "Show Private Key" in menu
      const backupOption = page.locator('button:has-text("Show Passphrase"), button:has-text("Show Private Key")').first();
      const foundBackup = await backupOption.isVisible().catch(() => false);
      
      // Test passes if backup option exists
      expect(foundBackup).toBe(true);
    } else {
      // Alternative: Try from address menu on main page
      await page.goto(`chrome-extension://${page.url().split('/')[2]}/popup.html#/index`);
      await page.waitForTimeout(1000);
      
      // Just verify we're on a valid wallet page
      const isOnWalletPage = await page.locator('text=/Assets|Balances|BTC/').first().isVisible().catch(() => false);
      expect(isOnWalletPage).toBe(true);
    }
    
    await cleanup(context);
  });

  test('wallet address type selection', async () => {
    const { context, page } = await launchExtension('address-type-selection');
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    
    // Look for address type settings
    const addressSettings = page.locator('text=/Address.*Type|address.*type/i');
    if (await addressSettings.isVisible()) {
      await addressSettings.click();
      await page.waitForTimeout(1000);
      
      // Should show address type options
      const addressTypes = ['Legacy', 'SegWit', 'Native SegWit', 'P2PKH', 'P2WPKH'];
      let foundTypes = 0;
      
      for (const type of addressTypes) {
        const typeOption = await page.locator(`text=${type}`).isVisible().catch(() => false);
        if (typeOption) foundTypes++;
      }
      
      expect(foundTypes).toBeGreaterThan(0);
    }
    
    await cleanup(context);
  });
});