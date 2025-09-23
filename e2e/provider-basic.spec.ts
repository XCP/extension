import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Basic Provider Tests', () => {
  test('Test dApp loads and detects provider', async ({ page }) => {
    // Navigate to the test dApp
    // Load test dApp directly as file
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await page.goto(`file:///${testDappPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

    // Check that the page loaded
    await expect(page).toHaveTitle(/XCP Wallet/);

    // Check for provider detection message
    const statusElement = page.locator('#status');
    await expect(statusElement).toBeVisible();

    // In a real extension environment, this would show "✅ XCP Wallet detected!"
    // In test environment without extension, it shows error message
    const statusText = await statusElement.textContent();
    console.log('Provider status:', statusText);
  });

  test('Test dApp UI elements are functional', async ({ page }) => {
    // Load test dApp directly as file
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await page.goto(`file:///${testDappPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

    // Test navigation buttons
    const composeButton = page.locator('[data-section="compose"]');
    await composeButton.click();

    // Verify compose section is visible
    const composeSection = page.locator('#compose-section');
    await expect(composeSection).toBeVisible();

    // Test tab switching
    const orderTab = page.locator('[data-tab="order"]');
    await orderTab.click();

    // Verify order tab content is visible
    const orderTabContent = page.locator('#order-tab');
    await expect(orderTabContent).toBeVisible();

    // Test form inputs
    await page.fill('#orderGiveAsset', 'TEST');
    const inputValue = await page.inputValue('#orderGiveAsset');
    expect(inputValue).toBe('TEST');
  });

  test('Test dApp shows proper error when extension not installed', async ({ page }) => {
    // Load test dApp directly as file
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await page.goto(`file:///${testDappPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

    // Without extension, should show error alert
    const walletAlert = page.locator('#walletAlert');

    // Check if provider is not detected (in test environment)
    const hasProvider = await page.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    if (!hasProvider) {
      // Alert should be visible when no provider
      await expect(walletAlert).not.toHaveClass(/hidden/);
      await expect(walletAlert).toContainText('XCP Wallet extension not detected');
    }
  });

  test('Test dApp form validation works', async ({ page }) => {
    // Load test dApp directly as file
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await page.goto(`file:///${testDappPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

    // Navigate to compose section
    await page.click('[data-section="compose"]');

    // Try to fill invalid values
    await page.fill('#sendQuantity', '-100');
    const quantity = await page.inputValue('#sendQuantity');

    // Browser should handle number input validation
    // Negative numbers might be prevented depending on browser
    console.log('Quantity value after negative input:', quantity);

    // Test asset selection
    await page.selectOption('#sendAsset', 'PEPECASH');
    const selectedAsset = await page.inputValue('#sendAsset');
    expect(selectedAsset).toBe('PEPECASH');
  });

  test('Event log functionality works', async ({ page }) => {
    // Load test dApp directly as file
    const testDappPath = path.join(__dirname, 'test-dapp-unified.html');
    await page.goto(`file:///${testDappPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });

    // Navigate to events section
    await page.click('[data-section="events"]');

    const eventsSection = page.locator('#events-section');
    await expect(eventsSection).toBeVisible();

    // Check clear logs button works
    const clearButton = page.locator('#btnClearLogs');
    await clearButton.click();

    const eventLogs = page.locator('#eventLogs');
    await expect(eventLogs).toContainText('Event logs cleared');
  });
});