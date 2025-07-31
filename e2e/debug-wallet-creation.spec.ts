import { test, expect } from "./fixtures";
import { 
  waitForServiceWorker, 
  getExtensionId, 
  navigateToExtension,
  createWallet,
  verifyWalletCreated,
  getExtensionStorage
} from "./helpers/extension-helpers";

test("debug: step-by-step wallet creation", async ({ context, page }) => {
  console.log("1. Waiting for service worker...");
  const serviceWorker = await waitForServiceWorker(context);
  const extensionId = getExtensionId(serviceWorker.url());
  console.log("Extension ID:", extensionId);

  console.log("2. Navigating to extension...");
  await navigateToExtension(page, extensionId);
  
  // Take screenshot of initial page
  await page.screenshot({ path: "debug-1-initial.png" });
  
  console.log("3. Current URL:", page.url());
  
  // Check if we're on the onboarding page
  const createWalletButton = page.getByRole('button', { name: /Create Wallet/i });
  await expect(createWalletButton).toBeVisible({ timeout: 5000 });
  
  console.log("4. Clicking Create Wallet...");
  await createWalletButton.click();
  
  // Wait for navigation
  await page.waitForURL(/#\/create-wallet$/, { timeout: 10000 });
  await page.screenshot({ path: "debug-2-create-wallet.png" });
  
  console.log("5. Revealing recovery phrase...");
  const viewPhraseButton = page.getByText(/View 12-word Secret Phrase/);
  await expect(viewPhraseButton).toBeVisible();
  await viewPhraseButton.click();
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "debug-3-phrase-revealed.png" });
  
  console.log("6. Checking confirmation checkbox...");
  const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  
  // Wait for password field to appear
  await page.waitForSelector('input[name="password"]', { state: 'visible' });
  await page.screenshot({ path: "debug-4-password-field.png" });
  
  console.log("7. Entering password...");
  await page.fill('input[name="password"]', 'TestPassword123!');
  
  console.log("8. Clicking Continue...");
  const continueButton = page.getByRole('button', { name: /Continue/i });
  await expect(continueButton).toBeVisible();
  await expect(continueButton).toBeEnabled();
  
  // Listen for any console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text());
    }
  });
  
  await continueButton.click();
  
  console.log("9. Waiting for wallet creation...");
  
  // Wait a bit to see what happens
  await page.waitForTimeout(3000);
  
  // Check current URL
  console.log("10. Current URL after submit:", page.url());
  
  // Take screenshot of result
  await page.screenshot({ path: "debug-5-after-submit.png" });
  
  // Check for any error messages
  const errorAlert = page.locator('[role="alert"]').first();
  if (await errorAlert.isVisible()) {
    const errorText = await errorAlert.textContent();
    console.log("Error found:", errorText);
  }
  
  // Check extension storage
  const storage = await getExtensionStorage(page, 'appRecords');
  console.log("11. Extension storage appRecords:", storage);
  
  // Keep browser open for manual inspection
  await page.waitForTimeout(30000);
});