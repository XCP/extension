import { test, expect } from '../fixtures';

test('simple debug: check extension loads', async ({ page, extensionId, context }) => {
  console.log('[Simple Debug] Extension ID:', extensionId);
  
  // Check service workers
  const workers = context.serviceWorkers();
  console.log('[Simple Debug] Service workers count:', workers.length);
  if (workers.length > 0) {
    console.log('[Simple Debug] Service worker URL:', workers[0].url());
  }
  
  // Navigate to extension
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Log current URL
  console.log('[Simple Debug] Current URL:', page.url());
  
  // Check page title
  const title = await page.title();
  console.log('[Simple Debug] Page title:', title);
  
  // Check for any visible text
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('[Simple Debug] Page text:', bodyText.substring(0, 200));
  
  // Take screenshot
  await page.screenshot({ path: 'simple-debug.png' });
  
  // Check for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Simple Debug] Console error:', msg.text());
    }
  });
  
  // Try to click Create Wallet if visible
  const createButton = page.getByRole('button', { name: /Create Wallet/i });
  const isVisible = await createButton.isVisible().catch(() => false);
  console.log('[Simple Debug] Create button visible:', isVisible);
  
  if (isVisible) {
    console.log('[Simple Debug] Clicking create button...');
    await createButton.click();
    
    // Wait a bit
    await page.waitForTimeout(3000);
    
    // Log new URL
    console.log('[Simple Debug] URL after click:', page.url());
    
    // Check for password field
    const hasPasswordField = await page.locator('input[name="password"]').count() > 0;
    console.log('[Simple Debug] Has password field:', hasPasswordField);
  }
  
  // Keep browser open
  await page.waitForTimeout(30000);
});