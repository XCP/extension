import { expect, TEST_PASSWORD, TEST_PRIVATE_KEY, walletTest } from '@e2e/fixtures';
import { importWallet } from '@e2e/selectors';

// The native optional-extension-permission prompt is outside Playwright's page surface.
// Stub only that permission decision; clipboard reads/writes and wallet imports are real.
walletTest.describe('Imported private key clipboard cleanup', () => {
  for (const matching of [true, false]) {
    walletTest(matching ? 'clears the imported key' : 'preserves newly copied unrelated text', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate(() => {
        chrome.permissions.contains = (async () => true) as typeof chrome.permissions.contains;
      });
      await page.goto(`${page.url().split('#')[0]}#/keychain/setup/import-private-key`);
      const checkbox = page.getByRole('checkbox', { name: 'Clear clipboard after import' });
      await expect(checkbox).toBeChecked();
      await importWallet.privateKeyInput(page).fill(TEST_PRIVATE_KEY);
      await importWallet.backedUpCheckbox(page).check();
      await importWallet.passwordInput(page).fill(TEST_PASSWORD);
      const copiedText = matching ? TEST_PRIVATE_KEY : 'An unrelated note copied after entering the key';
      await page.evaluate(text => navigator.clipboard.writeText(text), copiedText);
      await importWallet.continueButton(page).click();
      await expect(page).toHaveURL(/#\/index$/);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(matching ? '' : copiedText);
    });
  }
});
