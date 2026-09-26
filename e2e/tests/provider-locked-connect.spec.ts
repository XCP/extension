/**
 * Connecting while the wallet is locked.
 *
 * The dApp's xcp_requestAccounts opens one window for the password, and after unlock the connect
 * approval continues in that same window. The background emits wallet-unlocked before the unlock
 * screen's own unlock call returns, so the unlock screen's "go home" and the background's
 * navigation race. These tests pin the outcome: the approval route always wins, home never shows
 * in between, and the dApp's promise settles once the user approves.
 */

import * as http from 'node:http';
import { expect, lockWallet, TEST_PASSWORD, walletTest } from '@e2e/fixtures';
import { unlock } from '@e2e/selectors';
import type { Page } from '@playwright/test';

function startDapp(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Locked connect dApp</title></head><body>dApp</body></html>');
    });
    server.listen(0, 'localhost', () => {
      const address = server.address();
      if (address && typeof address !== 'string') resolve({ server, url: `http://localhost:${address.port}` });
    });
  });
}

type ConnectOutcome = { accounts?: string[]; error?: string };

function requestAccounts(dapp: Page): Promise<ConnectOutcome> {
  return dapp.evaluate(async () => {
    const provider = (window as unknown as {
      xcpwallet: { request(args: { method: string }): Promise<{ accounts: string[] }> };
    }).xcpwallet;
    try { return { accounts: (await provider.request({ method: 'xcp_requestAccounts' })).accounts }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }).catch(error => ({ error: error instanceof Error ? error.message : String(error) }));
}

/**
 * Record every route the unlock window's app visits. HashRouter moves with history.pushState and
 * replaceState, which fire no event, so wrap them; sessionStorage outlives the document the
 * background replaces, so the new document can still be asked what the old one did.
 */
async function recordRoutes(popup: Page): Promise<void> {
  await popup.evaluate(() => {
    const log = (url: string | URL | null | undefined) => {
      const routes = JSON.parse(sessionStorage.getItem('e2e-routes') ?? '[]') as string[];
      routes.push(String(url ?? location.href));
      sessionStorage.setItem('e2e-routes', JSON.stringify(routes));
    };
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
        log(url);
        original(data, unused, url);
      };
    }
  });
}

async function openLockedDapp(page: Page, dappUrl: string) {
  await expect(page).toHaveURL(/#\/index/);
  await lockWallet(page);
  const dapp = await page.context().newPage();
  await dapp.goto(dappUrl);
  await expect.poll(() => dapp.evaluate(() => 'xcpwallet' in window)).toBe(true);
  return dapp;
}

walletTest.describe('Connect while locked', () => {
  let dappServer: { server: http.Server; url: string };

  walletTest.beforeAll(async () => { dappServer = await startDapp(); });
  walletTest.afterAll(async () => { await new Promise<void>(resolve => dappServer.server.close(() => resolve())); });

  walletTest('continues into the connect approval in the unlock window without going home', async ({ context, page }) => {
    const dapp = await openLockedDapp(page, dappServer.url);

    const unlockWindow = context.waitForEvent('page');
    const connection = requestAccounts(dapp);
    const popup = await unlockWindow;
    await expect(popup).toHaveURL(/popup\.html\?continues=/);
    await expect(unlock.passwordInput(popup)).toBeVisible();

    const visited: string[] = [];
    popup.on('framenavigated', frame => { if (frame === popup.mainFrame()) visited.push(frame.url()); });
    await recordRoutes(popup);

    await unlock.passwordInput(popup).fill(TEST_PASSWORD);
    await unlock.unlockButton(popup).click();

    // The same window, now a fresh document on the approval route.
    await expect(popup).toHaveURL(/popup\.html\?reuse=[^#]+#\/requests\/connect\/approve\?/);
    const connect = popup.getByRole('button', { name: 'Connect', exact: true });
    await expect(connect).toBeEnabled();

    const routes = [
      ...visited,
      ...await popup.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-routes') ?? '[]') as string[]),
    ];
    expect(routes.filter(url => /#\/index\b/.test(url))).toEqual([]);
    // One window for the whole request.
    expect(context.pages().filter(p => p.url().includes('/requests/connect/approve'))).toHaveLength(1);

    const closed = popup.waitForEvent('close');
    await connect.click();
    const outcome = await connection;
    expect(outcome.error).toBeUndefined();
    expect(outcome.accounts).toHaveLength(1);
    await closed;
    await dapp.close();
  });

  walletTest('sends the unlock window home when the site is already connected', async ({ context, page }) => {
    // Connect once while unlocked.
    await expect(page).toHaveURL(/#\/index/);
    const dapp = await context.newPage();
    await dapp.goto(dappServer.url);
    await expect.poll(() => dapp.evaluate(() => 'xcpwallet' in window)).toBe(true);
    const approvalWindow = context.waitForEvent('page');
    const first = requestAccounts(dapp);
    const approval = await approvalWindow;
    await approval.getByRole('button', { name: 'Connect', exact: true }).click();
    expect((await first).accounts).toHaveLength(1);

    await lockWallet(page);
    const unlockWindow = context.waitForEvent('page');
    const again = requestAccounts(dapp);
    const popup = await unlockWindow;
    await expect(popup).toHaveURL(/popup\.html\?continues=/);
    await unlock.passwordInput(popup).fill(TEST_PASSWORD);
    await unlock.unlockButton(popup).click();

    // No approval is needed, so the dApp gets its accounts and the waiting window is released
    // straight away rather than after the unlock screen's fallback.
    const outcome = await again;
    expect(outcome.error).toBeUndefined();
    expect(outcome.accounts).toHaveLength(1);
    await expect(popup).toHaveURL(/popup\.html\?reuse=[^#]+#\/index/, { timeout: 3000 });
    await dapp.close();
  });
});
