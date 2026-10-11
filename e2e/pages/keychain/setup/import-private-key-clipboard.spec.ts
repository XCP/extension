import { expect, TEST_PASSWORD, TEST_PRIVATE_KEY, walletTest } from '@e2e/fixtures';
import { importWallet } from '@e2e/selectors';

// The native optional-extension-permission prompt is outside Playwright's page surface.
// Stub only that permission decision; clipboard reads/writes and wallet imports are real.
walletTest.describe('Imported private key clipboard cleanup', () => {
  for (const matching of [true, false]) {
    walletTest(matching ? 'clears a key copied outside the wallet after import' : 'preserves newly copied unrelated text', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate(() => {
        chrome.permissions.contains = (async () => true) as typeof chrome.permissions.contains;
      });
      await page.goto(`${page.url().split('#')[0]}#/keychain/setup/import-private-key`);
      const checkbox = page.getByRole('checkbox', { name: 'Clear clipboard after import' });
      await expect(checkbox).toBeChecked();
      // Simulate another wallet copying a key: never invoke XCP's copy hook or its timer.
      const source = await context.newPage();
      await source.route('https://clipboard-source.example/**', route => route.fulfill({
        contentType: 'text/html', body: '<html><body>External clipboard source</body></html>',
      }));
      await source.goto('https://clipboard-source.example/');
      await source.evaluate(key => navigator.clipboard.writeText(key), TEST_PRIVATE_KEY);
      await page.bringToFront();
      await importWallet.privateKeyInput(page).focus();
      await importWallet.privateKeyInput(page).press('ControlOrMeta+V');
      await expect(importWallet.privateKeyInput(page)).toHaveValue(TEST_PRIVATE_KEY);
      await importWallet.backedUpCheckbox(page).check();
      await importWallet.passwordInput(page).fill(TEST_PASSWORD);
      const copiedText = matching ? TEST_PRIVATE_KEY : 'An unrelated note copied after entering the key';
      if (!matching) {
        await source.bringToFront();
        await source.evaluate(text => navigator.clipboard.writeText(text), copiedText);
        await page.bringToFront();
      }
      await importWallet.continueButton(page).click();
      await expect(page).toHaveURL(/#\/index$/);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(matching ? '' : copiedText);
    });
  }
});
