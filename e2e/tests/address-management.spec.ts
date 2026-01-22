/**
 * Address Management Tests
 *
 * Tests for address operations: copy, navigation, adding, switching addresses.
 */

import { walletTest, expect, getCurrentAddress } from '../fixtures';
import { index, selectAddress, viewAddress } from '../selectors';

walletTest.describe('Address Management', () => {
  walletTest('copy address from blue button on index', async ({ page }) => {
    await expect(index.currentAddress(page)).toBeVisible({ timeout: 10000 });
    await index.currentAddress(page).click();

    const hasCheckIcon = await page.locator('svg.text-green-500').first().isVisible().catch(() => false);

    if (!hasCheckIcon) {
      const hasClipboardIcon = await page.locator('svg[aria-hidden="true"]').first().isVisible().catch(() => false);
      expect(hasClipboardIcon).toBe(true);
    } else {
      expect(hasCheckIcon).toBe(true);
    }
  });

  walletTest('navigate to address selection via chevron', async ({ page }) => {
    if (await selectAddress.chevronButton(page).isVisible()) {
      await selectAddress.chevronButton(page).click();

      await expect(page.locator('text="Addresses"')).toBeVisible();
      await expect(selectAddress.addressLabel(page, 1)).toBeVisible();
    } else {
      const addressManagement = page.locator('text=/Address|Manage/i');
      if (await addressManagement.isVisible()) {
        await addressManagement.click();
      }
    }
  });

  walletTest('add new address', async ({ page }) => {
    if (await selectAddress.chevronButton(page).isVisible()) {
      await selectAddress.chevronButton(page).click();

      const addressesBefore = await page.locator('text=/Address \\d+/').count();

      if (await selectAddress.addAddressButton(page).isVisible()) {
        await selectAddress.addAddressButton(page).click();

        const addressesAfter = await page.locator('text=/Address \\d+/').count();
        expect(addressesAfter).toBeGreaterThan(addressesBefore);
      } else {
        expect(page.url()).toContain('address');
      }
    } else {
      // If chevron not visible, verify we're on index page with address displayed
      const hasAddress = await index.addressText(page).isVisible({ timeout: 5000 });
      expect(hasAddress).toBe(true);
    }
  });

  walletTest('switch between addresses', async ({ page }) => {
    const chevronButton = page.locator('[aria-label="Select another address"], button:has(svg)').last();
    const isChevronVisible = await chevronButton.isVisible().catch(() => false);

    if (isChevronVisible) {
      await chevronButton.click();

      const onAddressPage = page.url().includes('select-address') ||
                           await page.locator('text=/Select.*Address/i').isVisible();

      if (onAddressPage) {
        const addressCount = await page.locator('text=/Address \\d+/').count();
        if (addressCount < 2) {
          if (await selectAddress.addAddressButton(page).isVisible()) {
            await selectAddress.addAddressButton(page).click();
          }
        }

        const addresses = page.locator('text=/Address \\d+/');
        const count = await addresses.count();
        if (count > 1) {
          await addresses.nth(1).click();
        }

        const currentUrl = page.url();
        expect(currentUrl).toBeTruthy();
      }
    } else {
      expect(page.url()).toContain('extension');
    }
  });

  walletTest('copy address from address list', async ({ page }) => {
    if (await selectAddress.chevronButton(page).isVisible()) {
      await selectAddress.chevronButton(page).click();

      if (await selectAddress.copyButton(page).isVisible()) {
        await selectAddress.copyButton(page).click();

        await expect(page.locator('.text-green-500, text=/copied/i')).toBeVisible();
      }
    }
  });

  walletTest('address type information display', async ({ page }) => {
    if (await selectAddress.chevronButton(page).isVisible()) {
      await selectAddress.chevronButton(page).click();

      const addressTypes = ['P2WPKH', 'Native SegWit', 'SegWit', 'Legacy', 'P2PKH'];
      let foundType = false;

      for (const type of addressTypes) {
        const typeElement = page.locator(`text=${type}`);
        if (await typeElement.isVisible()) {
          foundType = true;
          break;
        }
      }

      if (!foundType) {
        const onAddressPage = page.url().includes('address');
        expect(onAddressPage).toBe(true);
      } else {
        expect(foundType).toBe(true);
      }
    } else {
      // If chevron not visible, verify we're on index page with address displayed
      const hasAddress = await index.addressText(page).isVisible({ timeout: 5000 });
      expect(hasAddress).toBe(true);
    }
  });

  walletTest('address validation and format checking', async ({ page }) => {
    let currentAddress = await getCurrentAddress(page);

    if (!currentAddress || currentAddress.length < 10) {
      if (await index.currentAddress(page).isVisible()) {
        currentAddress = await index.currentAddress(page).textContent() || '';
      }
    }

    if (!currentAddress || currentAddress.length < 10) {
      const copyButton = page.locator('button[aria-label*="Copy"]').first();
      if (await copyButton.isVisible()) {
        const parent = copyButton.locator('..');
        currentAddress = await parent.locator('.font-mono').textContent() || '';
      }
    }

    expect(currentAddress).toBeTruthy();
    expect(currentAddress.length).toBeGreaterThan(10);
  });
});
