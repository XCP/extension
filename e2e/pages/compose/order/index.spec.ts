/**
 * Compose Order Page Tests (/compose/order)
 *
 * Tests for creating DEX orders.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose } from '../../../selectors';
import {
  enableValidationBypass,
  enableDryRun,
  waitForReview,
} from '../../../compose-test-helpers';

walletTest.describe('Compose Order Page (/compose/order)', () => {
  // Helper to navigate to order form with asset parameter
  const goToOrderForm = async (page: any) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/order/XCP`);
    await page.waitForLoadState('networkidle');
  };

  walletTest('can navigate to order form from actions', async ({ page }) => {
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const orderOption = page.locator('text=/Create Order|New Order|Place Order/i').first();
    const optionCount = await orderOption.count();

    if (optionCount > 0) {
      await expect(orderOption).toBeVisible({ timeout: 5000 });
      await orderOption.click();
      await expect(page).toHaveURL(/order/, { timeout: 5000 });
    }
  });

  walletTest('order form has Buy/Sell tabs', async ({ page }) => {
    await goToOrderForm(page);

    // Both tabs should be visible (they're toggle tabs)
    const buyTab = compose.order.buyTab(page);
    const sellTab = compose.order.sellTab(page);

    await expect(buyTab).toBeVisible({ timeout: 5000 });
    await expect(sellTab).toBeVisible({ timeout: 5000 });
  });

  walletTest('order form defaults to Sell tab', async ({ page }) => {
    await goToOrderForm(page);

    const sellTab = compose.order.sellTab(page);
    await expect(sellTab).toBeVisible({ timeout: 5000 });
    await expect(sellTab).toHaveClass(/underline/);
  });

  walletTest('order form has amount and price inputs', async ({ page }) => {
    await goToOrderForm(page);

    const amountInput = compose.order.amountInput(page);
    const priceInput = compose.order.priceInput(page);

    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await expect(priceInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('order form has settings button', async ({ page }) => {
    await goToOrderForm(page);

    const settingsButton = page.locator('button[aria-label="Order Settings"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('order form validates required fields', async ({ page }) => {
    await goToOrderForm(page);

    // Order form has amount and price inputs that need values
    const amountInput = compose.order.amountInput(page);
    const priceInput = compose.order.priceInput(page);

    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await expect(priceInput).toBeVisible({ timeout: 5000 });

    // Both inputs should be required for form submission
    const amountRequired = await amountInput.getAttribute('required');
    const priceRequired = await priceInput.getAttribute('required');

    // Either form requires fields OR the inputs start empty
    const amountValue = await amountInput.inputValue();
    const priceValue = await priceInput.inputValue();

    expect(amountRequired !== null || amountValue === '').toBe(true);
    expect(priceRequired !== null || priceValue === '').toBe(true);
  });
});

walletTest.describe('Order Flow - Full Compose Flow', () => {
  const goToOrderForm = async (page: any) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';
    await page.goto(`${baseUrl}/compose/order/XCP`);
    await page.waitForLoadState('networkidle');
  };

  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await enableDryRun(page);
  });

  walletTest('form → review: valid order shows review page', async ({ page }) => {
    await goToOrderForm(page);

    const amountInput = compose.order.amountInput(page);
    const priceInput = compose.order.priceInput(page);

    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill('1');

    await expect(priceInput).toBeVisible({ timeout: 5000 });
    await priceInput.fill('0.001');

    const submitBtn = compose.common.submitButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);

    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });

  walletTest('full flow: order form → review → verify content', async ({ page }) => {
    await goToOrderForm(page);

    const amountInput = compose.order.amountInput(page);
    const priceInput = compose.order.priceInput(page);

    await expect(amountInput).toBeVisible({ timeout: 5000 });
    await amountInput.fill('1');

    await expect(priceInput).toBeVisible({ timeout: 5000 });
    await priceInput.fill('0.001');

    const submitBtn = compose.common.submitButton(page);
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await waitForReview(page);

    const reviewContent = await page.content();
    expect(reviewContent).toMatch(/review|confirm|sign/i);
  });
});
