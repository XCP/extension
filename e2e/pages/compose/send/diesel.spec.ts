import { Transaction } from '@scure/btc-signer';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { test, expect, createWallet } from '@e2e/fixtures';
import { mockDieselComposeNetwork } from '@e2e/diesel-compose-fixtures';

test.describe('DIESEL mining in the installed extension', () => {
  for (const scenario of ['BTC send', 'unsupported asset destruction'] as const) {
    test(`${scenario} reaches review with the correct mining behavior`, async ({ extensionContext, extensionPage: page, extensionId }, testInfo) => {
      const network = await mockDieselComposeNetwork(extensionContext);
      const goto = (route: string) => page.goto(`chrome-extension://${extensionId}/popup.html#/${route}`);
      const capture = async (name: string, fullPage = false) => {
        const path = testInfo.outputPath(`${name}.png`);
        await page.screenshot({ path, fullPage });
        await testInfo.attach(name, { path, contentType: 'image/png' });
      };
      await page.setViewportSize({ width: 350, height: 600 });
      await createWallet(page);
      await expect(page.getByLabel('Current address', { exact: true })).toBeVisible();
      await goto('settings/advanced');
      const mining = page.getByRole('switch', { name: 'Mine DIESEL (Alkanes)' });
      await mining.click();
      await expect(mining).toHaveAttribute('aria-checked', 'true');
      // Reload makes this exercise persisted settings and the popup-to-core bridge.
      await page.reload();
      await expect(mining).toHaveAttribute('aria-checked', 'true');

      if (scenario === 'BTC send') {
        const protection = page.getByRole('switch', { name: 'Protect Alkanes UTXOs' });
        await expect(protection).toHaveAttribute('aria-checked', 'true');
        await protection.click();
        await expect(mining).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByRole('status')).toHaveText('Protection off: ordinary spending can burn Alkanes.');
        await capture('advanced-protection-off');
        await mining.click();
        await expect(protection).toHaveAttribute('aria-checked', 'true');

        const endpoint = page.getByRole('textbox', { name: 'Alkanes API' });
        await endpoint.fill('http://insecure.example/rpc');
        await page.getByRole('button', { name: 'Save Alkanes API' }).click();
        await expect(page.getByRole('alert')).toContainText('Use an HTTPS URL');
        await endpoint.fill('https://mainnet.subfrost.io/v4/jsonrpc?e2e=1');
        await page.getByRole('button', { name: 'Save Alkanes API' }).click();
        await expect(page.getByRole('button', { name: 'Save Alkanes API' })).toBeDisabled();
        await page.reload();
        await expect(endpoint).toHaveValue('https://mainnet.subfrost.io/v4/jsonrpc?e2e=1');
        await page.getByRole('button', { name: 'Reset Alkanes API to default' }).click();
        await expect(endpoint).toHaveValue('https://mainnet.subfrost.io/v4/jsonrpc');
        await protection.scrollIntoViewIfNeeded();
        await capture('advanced-mining');
        await page.getByRole('button', { name: 'Toggle help text' }).click();
        await page.getByText(/Use a trusted mainnet Alkanes JSON-RPC endpoint/).scrollIntoViewIfNeeded();
        await capture('advanced-connection');

        await goto('compose/send/BTC');
        await page.getByPlaceholder('Enter destination address', { exact: true }).fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        await page.locator('input[name="quantity"]').fill('0.001');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(page.getByText('DIESEL mint:', { exact: true })).toBeVisible({ timeout: 45000 });
        await expect(page.getByText('0.00100000 BTC', { exact: true })).toBeVisible();
        expect(network.calls.length).toBeGreaterThanOrEqual(2);
        expect(network.calls.at(-1)!.params.has('more_outputs')).toBe(true);
      } else {
        await goto('compose/issuance/destroy/XCP');
        await page.locator('input[name="quantity"]').fill('1');
        await page.getByRole('button', { name: 'Destroy Supply', exact: true }).click();
        await expect(page.getByText('1.00000000 XCP', { exact: true })).toBeVisible({ timeout: 45000 });
        await expect(page.getByText('DIESEL mint:', { exact: true })).toHaveCount(0);
        expect(network.calls).toHaveLength(1);
        expect(network.calls[0].endpoint).toBe('destroy');
        expect(network.calls[0].params.has('more_outputs')).toBe(false);
      }

      const tx = Transaction.fromRaw(hexToBytes(network.calls.at(-1)!.rawtransaction), { allowUnknownOutputs: true });
      const scripts = Array.from({ length: tx.outputsLength }, (_, index) => bytesToHex(tx.getOutput(index).script!));
      // OP_RETURN OP_13 is the Alkanes runestone marker, independent of review labels.
      expect(scripts.some(script => script.startsWith('6a5d'))).toBe(scenario === 'BTC send');
      expect(network.unexpectedRequests).toEqual([]);
      await capture('review', true);
      // Stop at review: fixtures never sign or broadcast a transaction.
    });
  }
});
