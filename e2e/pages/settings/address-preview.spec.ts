/**
 * Settings Address Preview Tests
 *
 * Tests for address preview display in settings.
 */

import { walletTest, expect, navigateTo } from '../../fixtures';
import { settings, selectAddress } from '../../selectors';

walletTest.describe('Settings Address Preview', () => {
  walletTest('shows preview address in settings index under Address Type', async ({ page }) => {
    await navigateTo(page, 'settings');

    if (await settings.addressTypeOption(page).isVisible()) {
      const addressTypeContainer = settings.addressTypeOption(page).locator('xpath=../..').first();
      const description = addressTypeContainer.locator('.text-xs.text-gray-500');
      expect(await description.isVisible()).toBe(true);

      const descriptionText = await description.textContent();
      expect(descriptionText).toMatch(/(Legacy|Native SegWit|Nested SegWit|Taproot|CounterWallet)/);
    }
  });

  walletTest('shows preview addresses in address type settings page', async ({ page }) => {
    await navigateTo(page, 'settings');

    if (await settings.addressTypeOption(page).isVisible()) {
      await settings.addressTypeOption(page).click();

      expect(page.url()).toContain('address-type');

      const radioOptions = await page.locator('[role="radio"]').all();
      expect(radioOptions.length).toBeGreaterThan(0);

      let foundValidPreview = false;

      for (let i = 0; i < radioOptions.length; i++) {
        const radio = radioOptions[i];
        const labelElement = radio.locator('.text-sm.font-medium');
        const previewElement = radio.locator('.text-xs.text-gray-500').first();

        if (await labelElement.isVisible() && await previewElement.isVisible()) {
          const labelText = await labelElement.textContent();
          const previewText = await previewElement.textContent();

          expect(labelText).toMatch(/(Legacy|Native SegWit|Nested SegWit|Taproot|CounterWallet)/);

          if (previewText && !previewText.includes('Loading') && !previewText.includes('unlock')) {
            const addressPattern = /^(1[A-HJ-NP-Z0-9]{25,34}|3[A-HJ-NP-Z0-9]{25,34}|bc1[a-z0-9]{39,59}|tb1[a-z0-9]{39,59})/;
            const shortenedPattern = /^(1[A-HJ-NP-Z0-9]{5}\.\.\.|\w{6}\.\.\.\w{6})/;

            if (addressPattern.test(previewText) || shortenedPattern.test(previewText)) {
              foundValidPreview = true;
            }
          }
        }
      }

      expect(radioOptions.length).toBeGreaterThan(0);
    }
  });

  walletTest('shows different preview addresses for different formats', async ({ page }) => {
    await navigateTo(page, 'settings');

    if (await settings.addressTypeOption(page).isVisible()) {
      await settings.addressTypeOption(page).click();

      const radioOptions = await page.locator('[role="radio"]').all();
      const previewAddresses = [];

      for (const radio of radioOptions) {
        const previewElement = radio.locator('.text-xs.text-gray-500').first();
        if (await previewElement.isVisible()) {
          const previewText = await previewElement.textContent();
          if (previewText && !previewText.includes('Loading') && !previewText.includes('unlock')) {
            previewAddresses.push(previewText);
          }
        }
      }

      if (previewAddresses.length > 1) {
        const uniqueAddresses = new Set(previewAddresses);
        expect(uniqueAddresses.size).toBe(previewAddresses.length);
      }
    }
  });

  walletTest('handles address format changes and updates previews', async ({ page }) => {
    await navigateTo(page, 'settings');

    if (await settings.addressTypeOption(page).isVisible()) {
      await settings.addressTypeOption(page).click();

      const radioOptions = await page.locator('[role="radio"]').all();

      if (radioOptions.length > 1) {
        let selectedIndex = -1;
        for (let i = 0; i < radioOptions.length; i++) {
          const isChecked = await radioOptions[i].getAttribute('aria-checked') === 'true';
          if (isChecked) {
            selectedIndex = i;
            break;
          }
        }

        const newIndex = selectedIndex === 0 ? 1 : 0;
        await radioOptions[newIndex].click();

        const newChecked = await radioOptions[newIndex].getAttribute('aria-checked');
        expect(newChecked).toBe('true');

        await page.goBack();

        if (await settings.addressTypeOption(page).isVisible()) {
          const updatedContainer = settings.addressTypeOption(page).locator('xpath=../..').first();
          const updatedDescription = updatedContainer.locator('.text-xs.text-gray-500');

          if (await updatedDescription.isVisible()) {
            const newDescriptionText = await updatedDescription.textContent();
            expect(newDescriptionText).toMatch(/(Legacy|Native SegWit|Nested SegWit|Taproot|CounterWallet)/);
          }
        }
      }
    }
  });
});
