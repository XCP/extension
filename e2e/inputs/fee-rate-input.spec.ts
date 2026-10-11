import type { Page } from '@playwright/test';
import { expect, navigateTo, walletTest } from '../fixtures';
import { index } from '../selectors';

const preset = (page: Page) => page.getByRole('button', { name: /Fastest.*sat\/vB/i });
const feeValue = (page: Page) => page.locator('input[name="sat_per_vbyte"]');

async function selectCustom(page: Page) {
  await preset(page).click();
  await page.getByRole('option', { name: /Custom/i }).click();
  await expect(feeValue(page)).toBeVisible();
}

walletTest.describe('FeeRateInput Component', () => {
  walletTest.beforeEach(async ({ page }) => {
    await page.route('https://mempool.space/api/v1/fees/precise', route => route.fulfill({
      json: { fastestFee: 5, halfHourFee: 3, hourFee: 1 },
    }));
    await navigateTo(page, 'wallet');
    await index.sendButton(page).click();
    await page.waitForURL(/compose\/send/);
    // Clear any fee cache populated before the route was installed.
    await page.reload();
    await expect(feeValue(page)).toHaveValue('5');
  });

  walletTest('shows the required label and quoted preset', async ({ page }) => {
    await expect(page.locator('label').filter({ hasText: 'Fee Rate' })).toHaveText(/Fee Rate.*\*/);
    await expect(preset(page)).toBeVisible();
  });

  walletTest('selecting a preset changes the submitted fee', async ({ page }) => {
    await preset(page).click();
    await page.getByRole('option', { name: /30 Min/i }).click();
    await expect(feeValue(page)).toHaveValue('3');
    await expect(page.getByRole('button', { name: /30 Min.*3.*sat\/vB/i })).toBeVisible();
  });

  walletTest('custom fees retain the exact entered value', async ({ page }) => {
    await selectCustom(page);
    await feeValue(page).fill('0.25');
    await feeValue(page).blur();
    await expect(feeValue(page)).toHaveValue('0.25');
    await expect(feeValue(page)).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#sat_per_vbyte-error')).toHaveCount(0);
  });

  walletTest('a custom fee below the minimum is rejected', async ({ page }) => {
    await selectCustom(page);
    await feeValue(page).fill('0.09');
    await feeValue(page).blur();
    await expect(feeValue(page)).toHaveValue('0.09');
    await expect(feeValue(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#sat_per_vbyte-error')).toContainText('0.1');
  });

  walletTest('reset restores the first preset', async ({ page }) => {
    await selectCustom(page);
    await feeValue(page).fill('25');
    await page.getByRole('button', { name: /reset to first preset/i }).click();
    await expect(feeValue(page)).toHaveValue('5');
    await expect(preset(page)).toBeVisible();
  });
});
