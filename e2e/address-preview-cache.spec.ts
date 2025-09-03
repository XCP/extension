import { test, expect } from '@playwright/test';
import { launchExtension, setupWallet, cleanup, navigateViaFooter, lockWallet, unlockWallet, TEST_PASSWORD } from './helpers/test-helpers';

test.describe('Address Preview Cache', () => {
  test('should cache and display address previews when wallet unlocked', async () => {
    const { context, page, extensionId } = await launchExtension('address-preview-cache');
    
    // Setup wallet - this unlocks it
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    await page.waitForTimeout(1000);
    
    // Navigate to Address Type settings
    await page.click('text=Address Type');
    await page.waitForTimeout(2000);
    
    // Check that we have address previews (not empty)
    // Should see at least one address that starts with expected prefixes
    const cards = await page.locator('[role="radio"]').all();
    
    console.log(`Found ${cards.length} address type cards`);
    
    // Get the description text from each card
    const descriptions = [];
    for (const card of cards) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descText = await card.locator('.text-xs').textContent();
      descriptions.push({ title: titleText, description: descText });
      console.log(`Card: ${titleText} -> ${descText}`);
    }
    
    // Find specific cards
    const legacyCard = descriptions.find(d => d.title?.includes('Legacy'));
    const nativeCard = descriptions.find(d => d.title?.includes('Native SegWit'));
    const nestedCard = descriptions.find(d => d.title?.includes('Nested SegWit'));
    const taprootCard = descriptions.find(d => d.title?.includes('Taproot'));
    
    console.log('Address previews found:');
    console.log('Legacy:', legacyCard?.description);
    console.log('Native SegWit:', nativeCard?.description);
    console.log('Nested SegWit:', nestedCard?.description);
    console.log('Taproot:', taprootCard?.description);
    
    // Verify addresses are not empty and have correct prefixes
    expect(legacyCard?.description).toBeTruthy();
    expect(legacyCard?.description).toContain('1'); // Legacy addresses start with 1
    
    expect(nativeCard?.description).toBeTruthy();
    expect(nativeCard?.description).toContain('bc1q'); // Native SegWit addresses start with bc1q
    
    expect(nestedCard?.description).toBeTruthy();
    expect(nestedCard?.description).toContain('3'); // Nested SegWit addresses start with 3
    
    expect(taprootCard?.description).toBeTruthy();
    expect(taprootCard?.description).toContain('bc1p'); // Taproot addresses start with bc1p
    
    await cleanup(context);
  });

  test('should show address type description on settings index', async () => {
    const { context, page, extensionId } = await launchExtension('address-preview-settings');
    
    // Setup wallet
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    await page.waitForTimeout(1000);
    
    // Look for the Address Type card on settings index
    const addressTypeCard = page.locator('text=Address Type').locator('..');
    
    // Check if it has the address type description
    const description = await addressTypeCard.locator('.text-xs').textContent();
    
    console.log('Address Type card description:', description);
    
    // Should show the address type description (Taproot by default for new wallets)
    expect(description).toBeTruthy();
    expect(description).toBe('Taproot (P2TR)');
    
    await cleanup(context);
  });
  
  test('addresses persist in cache after wallet lock', async () => {
    const { context, page, extensionId } = await launchExtension('address-cache-lock');
    
    // Setup wallet - this unlocks it
    await setupWallet(page);
    
    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    await page.waitForTimeout(1000);
    
    // Navigate to Address Type settings
    await page.click('text=Address Type');
    await page.waitForTimeout(2000);
    
    // Get initial addresses
    const cards = await page.locator('[role="radio"]').all();
    const initialAddresses = [];
    for (const card of cards) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descText = await card.locator('.text-xs').textContent();
      initialAddresses.push({ title: titleText, description: descText });
    }
    
    // Navigate back to settings main page
    await page.goBack();
    await page.waitForTimeout(500);
    
    // Lock the wallet using the helper function
    await lockWallet(page);
    
    // Should be redirected to unlock page
    await expect(page.locator('text=Enter Password')).toBeVisible({ timeout: 5000 });
    
    // Unlock the wallet again using the helper function
    await unlockWallet(page, TEST_PASSWORD);
    await page.waitForTimeout(1000);
    
    // Navigate back to settings
    await navigateViaFooter(page, 'settings');
    await page.waitForTimeout(1000);
    
    // Navigate to Address Type settings
    await page.click('text=Address Type');
    await page.waitForTimeout(2000);
    
    // Get addresses after unlock
    const cardsAfter = await page.locator('[role="radio"]').all();
    const addressesAfterUnlock = [];
    for (const card of cardsAfter) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descText = await card.locator('.text-xs').textContent();
      addressesAfterUnlock.push({ title: titleText, description: descText });
    }
    
    // Verify addresses are the same (cached)
    for (let i = 0; i < initialAddresses.length; i++) {
      const initial = initialAddresses[i];
      const after = addressesAfterUnlock.find(a => a.title === initial.title);
      console.log(`Comparing ${initial.title}: "${initial.description}" vs "${after?.description}"`);
      expect(after?.description).toBe(initial.description);
    }
    
    await cleanup(context);
  });
});