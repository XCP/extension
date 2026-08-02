import { walletTest, getWalletId, TEST_PASSWORD } from './fixtures';
import { unlock, secrets } from './selectors';
walletTest('dump private key page', async ({ page }) => {
  const id = await getWalletId(page);
  await page.goto(page.url().replace(/\/index.*/, `/keychain/secrets/show-private-key/${id}`));
  await page.waitForLoadState('networkidle');
  console.log('URL ' + page.url().split('#')[1]);
  console.log('BEFORE ' + JSON.stringify((await page.locator('body').innerText()).slice(0, 250)));
  await unlock.passwordInput(page).fill(TEST_PASSWORD);
  await secrets.revealButton(page).click();
  await page.waitForTimeout(2500);
  console.log('AFTER ' + JSON.stringify((await page.locator('body').innerText()).slice(0, 450)));
});
