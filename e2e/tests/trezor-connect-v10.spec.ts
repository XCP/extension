import { walletTest, expect } from '../fixtures';

// Exercise the built SDK, service worker and Chrome's external messaging permission.
// Only Suite's approval UI is replaced; this does not claim physical-device coverage.
walletTest('Connect 10 reaches Suite Web and surfaces cancellation through the wallet', async ({ page, context }) => {
  await context.route('https://suite.trezor.io/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>Suite test approval</title><script>
      window.calls = [];
      const channel = { here: '@trezor/suite-web', peer: '@trezor/connect-webextension-externally-connectable' };
      const send = (message) => {
        const id = new URLSearchParams(location.hash.slice(1)).get('extension-id');
        chrome.runtime.sendMessage(id, { ...message, channel }).catch(() => {});
      };
      function receive() {
        const encoded = new URLSearchParams(location.hash.slice(1)).get('message');
        if (!encoded) return;
        const message = JSON.parse(encoded);
        if (message.type === 'channel-handshake-request') {
          send({ type: 'channel-handshake-confirm' });
          send({ type: 'popup-core-loaded' });
        } else if (message.type === 'popup-handshake') {
          window.manifest = message.payload.manifest;
          send({ id: message.id, payload: {} });
        } else if (message.payload?.method) {
          window.calls.push(message.payload.method);
          send({ id: message.id, payload: { success: false,
            error: { code: 'Failure_ActionCancelled', message: 'User cancelled' } } });
        }
      }
      addEventListener('hashchange', receive);
      receive();
    </script>`,
  }));
  await page.goto(`${page.url().split('#')[0]}#/keychain/wallets/connect-hardware`);
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Connect Trezor', exact: true }).click();
  const suite = await opened;
  await expect(suite).toHaveURL(/^https:\/\/suite\.trezor\.io\/web\/connect-popup\/?#/);
  // Chrome's extension-created tab can bypass Playwright routing on its first load.
  // Navigate the owned test tab once so the Suite fixture handles the handshake.
  const fixtureUrl = new URL(suite.url());
  fixtureUrl.searchParams.set('xcp-test-fixture', '1');
  await suite.goto(fixtureUrl.toString());
  await expect(suite).toHaveTitle('Suite test approval');
  await expect.poll(() => suite.evaluate(() => (window as any).calls)).toEqual(['selectAccount']);
  expect(await suite.evaluate(() => (window as any).manifest.appName)).toBe('XCP Wallet');
  await expect(page.getByRole('alert')).toContainText('Trezor operation cancelled.');
  await expect(page.getByRole('button', { name: 'Connect Trezor', exact: true })).toBeEnabled();
});
