import { expect, walletTest } from '../fixtures';
import { approvalCatalog } from '../utils/approval-locale';
import { callGalleryService } from '../utils/provider-gallery';

for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const) walletTest.describe(language, () => {
  walletTest.use({ browserLocale: language });
  walletTest('default names translate on display while service names stay canonical', async ({ page }, info) => {
    const message = approvalCatalog(language);
    const wallet = await callGalleryService<{ id: string; name: string }>(page, 'getActiveWallet');
    const address = await callGalleryService<{ name: string; address: string }>(page, 'getActiveAddress');
    expect(wallet.name).toBe('Wallet 1');
    expect(address.name).toBe('Address 1');
    const walletLabel = message('default_wallet_name', ['1']);
    const addressLabel = message('default_address_name', ['1']);
    const base = page.url().split('#')[0];
    await expect(page.getByRole('button', { name: message('app_select_wallet'), exact: true })).toHaveText(walletLabel);
    const nameLabel = page.getByRole('button', { name: message('app_select_wallet'), exact: true }).locator('span');
    expect(await nameLabel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(page.getByText(addressLabel, { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${language}-home.png`) });
    for (const [route, label] of [['/keychain/wallets', walletLabel], ['/addresses', addressLabel], ['/addresses/details', addressLabel]] as const) {
      await page.goto(`${base}#${route}`);
      await expect(page.locator('main')).toContainText(label);
      await expect(page.locator('main')).not.toContainText(/\b(?:Wallet|Address) 1\b/);
      expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${language}-${route.split('/').at(-1)}.png`) });
    }
    // Inspect the confirmation only; no password entry or removal submission.
    await page.goto(`${base}#/keychain/wallets/remove/${wallet.id}`);
    await expect(page.getByRole('button', { name: message('wallets_remove_remove', [walletLabel]), exact: true })).toBeVisible();
    expect((await callGalleryService<{ name: string }>(page, 'getActiveWallet')).name).toBe(wallet.name);
    expect(await callGalleryService(page, 'getActiveAddress')).toEqual(address);
  });
});
