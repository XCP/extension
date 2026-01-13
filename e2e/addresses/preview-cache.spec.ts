import { test, expect } from '@playwright/test';
import { launchExtension, setupWallet, cleanup, navigateViaFooter, lockWallet, unlockWallet, TEST_PASSWORD } from '../helpers/test-helpers';

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

    // Navigate to settings > Address Type
    await navigateViaFooter(page, 'settings');
    const addressTypeOption = page.getByText('Address Type');
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await page.waitForURL(/address-type/, { timeout: 5000 });

    // Wait for address cards to load
    await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });
    // Wait for page to stabilize (address previews may load asynchronously)
    await page.waitForLoadState('networkidle');
    // Wait specifically for address preview text to appear (contains bc1 or starts with 1 or 3)
    await expect(page.locator('[role="radio"] .text-xs').first()).toBeVisible({ timeout: 10000 });

    // Get initial addresses
    const cards = await page.locator('[role="radio"]').all();
    const initialAddresses = [];
    for (const card of cards) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      // Description might not exist if address preview not loaded
      const descElement = card.locator('.text-xs');
      const descText = await descElement.count() > 0 ? await descElement.textContent() : '';
      initialAddresses.push({ title: titleText, description: descText });
    }

    // Navigate back to main index page before locking
    await navigateViaFooter(page, 'wallet');

    // Lock the wallet
    await lockWallet(page);

    // Should be redirected to unlock page
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[name="password"]')).toBeVisible();

    // Unlock with correct password
    await unlockWallet(page, TEST_PASSWORD);

    // Wait for wallet to be fully loaded after unlock - an address should be visible on index page
    // This ensures the wallet context has refreshed before we navigate
    await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

    // Navigate back to settings > Address Type
    await navigateViaFooter(page, 'settings');
    await expect(page.getByText('Address Type')).toBeVisible({ timeout: 5000 });
    await page.getByText('Address Type').click();
    await page.waitForURL(/address-type/, { timeout: 5000 });

    // Wait for address cards to load
    await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });
    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Wait for address preview text to actually appear with longer timeout
    // Address previews are loaded asynchronously after unlock
    const addressPreviewSelector = page.locator('[role="radio"] .text-xs').filter({ hasText: /^(bc1|1|3)/ }).first();
    const previewAppeared = await addressPreviewSelector.isVisible({ timeout: 15000 }).catch(() => false);

    if (!previewAppeared) {
      console.log('WARNING: Address preview text did not appear within 15 seconds after unlock');
      console.log('This may indicate the address cache is not being restored properly after unlock');
      // Take a screenshot for debugging
      await page.screenshot({ path: 'test-results/preview-cache-post-unlock-debug.png', fullPage: true });
    }

    const cardsAfter = await page.locator('[role="radio"]').all();
    const addressesAfterUnlock = [];

    for (const card of cardsAfter) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descElement = card.locator('.text-xs');
      const descText = await descElement.count() > 0 ? await descElement.textContent() : '';
      addressesAfterUnlock.push({ title: titleText, description: descText });
    }

    console.log(`Found ${initialAddresses.length} initial addresses and ${addressesAfterUnlock.length} addresses after unlock`);

    // Verify addresses are the same (cached)
    expect(initialAddresses.length).toBeGreaterThan(0);
    expect(addressesAfterUnlock.length).toBe(initialAddresses.length);

    // Check if any address previews loaded after unlock
    const loadedAfterUnlock = addressesAfterUnlock.filter(a => a.description && a.description.length > 0);
    console.log(`Addresses with previews after unlock: ${loadedAfterUnlock.length}/${addressesAfterUnlock.length}`);

    for (const initial of initialAddresses) {
      const after = addressesAfterUnlock.find(a => a.title === initial.title);
      console.log(`Comparing ${initial.title}: "${initial.description}" vs "${after?.description}"`);
      expect(after).toBeDefined();
      // If the description is empty after unlock, this indicates a cache persistence issue
      expect(after?.description).toBe(initial.description);
    }

    await cleanup(context);
  });
});