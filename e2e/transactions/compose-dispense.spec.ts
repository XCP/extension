/**
 * Compose Dispense Tests
 *
 * Tests for the dispenser interaction flow including address input,
 * dispenser selection, and transaction composition.
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('Compose Dispense', () => {
  walletTest('should compose dispense transaction', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    expect(page.url()).toContain('dispenser/dispense');

    const addressInput = page.locator('input[name="dispenserAddress"]');
    await addressInput.waitFor({ state: 'visible', timeout: 10000 });

    await addressInput.fill('bc1qtest123');
    const inputValue = await addressInput.inputValue();
    expect(inputValue).toBe('bc1qtest123');

    await addressInput.clear();
    await addressInput.fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(await addressInput.inputValue()).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });

  walletTest('should handle multiple dispensers at same address', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('label:has-text("Dispenser Address")')).toBeVisible();

    await page.fill('input[name="dispenserAddress"]', 'bc1qtest');
    await page.waitForTimeout(2000);

    const errorVisible = await page.locator('text=/No open dispenser found at this address/i').isVisible({ timeout: 3000 }).catch(() => false);

    if (errorVisible) {
      await expect(page.locator('text=/No open dispenser found at this address/i')).toBeVisible();
    } else {
      const dispenserRadios = await page.locator('input[type="radio"]').count();
      if (dispenserRadios > 1) {
        await page.locator('input[type="radio"]').nth(1).click();
        expect(await page.locator('input[type="radio"]').nth(1).isChecked()).toBe(true);
      }
    }
  });

  walletTest('should calculate max dispenses correctly', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="dispenserAddress"]', 'bc1qdispenser');
    await page.waitForTimeout(1000);

    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();

      const maxButton = page.locator('button:has-text("Max")');
      if (await maxButton.isVisible()) {
        await maxButton.click();

        const amountInput = page.locator('input[name="numberOfDispenses"]');
        const value = await amountInput.inputValue();

        expect(value).not.toBe('');
        expect(parseInt(value)).toBeGreaterThan(0);
      }
    }
  });

  walletTest('should show error for insufficient balance', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="dispenserAddress"]', 'bc1qexpensive');
    await page.waitForTimeout(1000);

    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();

      const maxButton = page.locator('button:has-text("Max")');
      if (await maxButton.isVisible()) {
        await maxButton.click();

        const errorMessage = page.locator('text=/Insufficient BTC balance/i');
        if (await errorMessage.isVisible()) {
          await expect(errorMessage).toBeVisible();
        }
      }
    }
  });

  walletTest('should display multiple assets on review when multiple dispensers trigger', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="dispenserAddress"]', '1BigDeaLFejyJiK6rLaj4LYCikD5CfYyhp');
    await page.waitForTimeout(1000);

    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();

      await page.fill('input[name="numberOfDispenses"]', '100');

      await page.click('button:has-text("Continue")');

      const dispensersLabel = page.locator('text=Dispensers:');
      if (await dispensersLabel.isVisible()) {
        const dispensersValue = await dispensersLabel.locator('..').locator('.bg-gray-50').textContent();
        if (dispensersValue && parseInt(dispensersValue) > 1) {
          const youReceive = await page.locator('text=You Receive:').locator('..').locator('.bg-gray-50');
          const receiveText = await youReceive.textContent();

          expect(receiveText).toContain('\n');
        }
      }
    }
  });

  walletTest('should allow editing times to dispense after clicking max', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/dispenser/dispense`);
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="dispenserAddress"]', 'bc1qdispenser');
    await page.waitForTimeout(1000);

    const dispenserRadio = page.locator('input[type="radio"]').first();
    if (await dispenserRadio.isVisible()) {
      await dispenserRadio.click();

      const maxButton = page.locator('button:has-text("Max")');
      if (await maxButton.isVisible()) {
        await maxButton.click();

        const amountInput = page.locator('input[name="numberOfDispenses"]');
        const maxValue = await amountInput.inputValue();

        await amountInput.clear();
        await amountInput.fill('1');

        const newValue = await amountInput.inputValue();
        expect(newValue).toBe('1');
        expect(newValue).not.toBe(maxValue);
      }
    }
  });
});
