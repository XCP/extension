import { test, expect } from '@playwright/test';
import { launchExtension, cleanup } from './helpers/test-helpers';

test('extension loads', async () => {
  const { context, page } = await launchExtension('basic');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Take a screenshot to see what we have
  await page.screenshot({ path: 'test-results/screenshots/extension-loaded.png' });
  
  // Just check that we can access the page
  const title = await page.title();
  
  // Check if there's any content
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText).toBeTruthy();
  
  await cleanup(context);
});