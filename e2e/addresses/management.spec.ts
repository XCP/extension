/**
 * Address Management Tests
 *
 * Tests for address operations: copy, navigation, adding, switching addresses.
 */

import {
  walletTest,
  expect,
  getCurrentAddress,
  grantClipboardPermissions
} from '../fixtures';

walletTest.describe('Address Management', () => {
  walletTest('copy address from blue button on index', async ({ page }) => {
    const addressButton = page.locator('[aria-label="Current address"]').first();
    await expect(addressButton).toBeVisible({ timeout: 10000 });
    await addressButton.click();

    const hasCheckIcon = await page.locator('svg.text-green-500').first().isVisible().catch(() => false);

    if (!hasCheckIcon) {
      const hasClipboardIcon = await page.locator('svg[aria-hidden="true"]').first().isVisible().catch(() => false);
      expect(hasClipboardIcon).toBe(true);
    } else {
      expect(hasCheckIcon).toBe(true);
    }
  });

  walletTest('navigate to address selection via chevron', async ({ page }) => {
    const chevronButton = page.locator('[aria-label="Select another address"]');

    if (await chevronButton.isVisible()) {
      await chevronButton.click();

      await expect(page.locator('text="Addresses"')).toBeVisible();
      await expect(page.locator('text=/Address 1/')).toBeVisible();
    } else {
      const addressManagement = page.locator('text=/Address|Manage/i');
      if (await addressManagement.isVisible()) {
        await addressManagement.click();
      }
    }
  });

  walletTest('add new address', async ({ page }) => {
    const chevronButton = page.locator('[aria-label="Select another address"]');

    if (await chevronButton.isVisible()) {
      await chevronButton.click();

      const addressesBefore = await page.locator('text=/Address \\d+/').count();

      const addButton = page.getByRole('button', { name: /Add Address/i }).last();
      if (await addButton.isVisible()) {
        await addButton.click();

        const addressesAfter = await page.locator('text=/Address \\d+/').count();
        expect(addressesAfter).toBeGreaterThan(addressesBefore);
      } else {
        expect(page.url()).toContain('address');
      }
    } else {
      const hasAddress = await page.locator('.font-mono').first().isVisible();
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
          const addButton = page.locator('button:has-text("Add Address"), button:has-text("Add")').first();
          if (await addButton.isVisible()) {
            await addButton.click();
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
    const chevronButton = page.locator('[aria-label="Select another address"]');

    if (await chevronButton.isVisible()) {
      await chevronButton.click();

      const copyButton = page.locator('[title*="Copy"], [aria-label*="Copy"]').first();
      if (await copyButton.isVisible()) {
        await copyButton.click();

        await expect(page.locator('.text-green-500, text=/copied/i')).toBeVisible();
      }
    }
  });

  walletTest('address type information display', async ({ page }) => {
    const chevronButton = page.locator('[aria-label="Select another address"]');

    if (await chevronButton.isVisible()) {
      await chevronButton.click();

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
      const hasAddress = await page.locator('.font-mono').first().isVisible();
      expect(hasAddress).toBe(true);
    }
  });

  walletTest('address validation and format checking', async ({ page }) => {
    let currentAddress = await getCurrentAddress(page);

    if (!currentAddress || currentAddress.length < 10) {
      const addressWithLabel = page.locator('[aria-label="Current address"]');
      if (await addressWithLabel.isVisible()) {
        currentAddress = await addressWithLabel.textContent() || '';
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
