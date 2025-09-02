import { test, expect } from '@playwright/test';
import { launchExtension, cleanup } from './helpers/test-helpers';

test('extension loads', async () => {
  const { context, page } = await launchExtension('basic');
  
  // Wait for page to load with a more generous timeout
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  
  // Take a screenshot to see what we have
  await page.screenshot({ path: 'test-results/screenshots/extension-loaded.png' });
  
  // Check that we can access the page
  const title = await page.title();
  expect(title).toBeTruthy();
  
  // Check if there's any content - either onboarding or wallet page
  const hasContent = await page.locator('text=/Create Wallet|Import Wallet|Unlock|Address/i').first().isVisible({ timeout: 10000 }).catch(() => false);
  expect(hasContent).toBe(true);
  
  // Verify the body has content
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText).toBeTruthy();
  expect(bodyText.length).toBeGreaterThan(10);
  
  await cleanup(context);
});