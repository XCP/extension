/**
 * Account events reach connected pages, and only them.
 *
 * The worker delivers provider events without being able to read tab URLs (the extension holds no
 * `tabs` or site host permission), so these tests pin the observable contract from a real page:
 * the connected origin hears about an address-type switch and a lock, and a page on another origin
 * open at the same time hears nothing.
 */

import * as http from 'node:http';
import { expect, lockWallet, navigateTo, walletTest } from '@e2e/fixtures';
import { settings } from '@e2e/selectors';
import type { Page } from '@playwright/test';

function startDapp(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Account events dApp</title></head><body>dApp</body></html>');
    });
    // Every interface, so both localhost and 127.0.0.1 (two origins) reach it.
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== 'string') resolve({ server, port: address.port });
    });
  });
}

type EventWindow = Window & { xcpEvents: string[][] };

async function openDapp(page: Page, url: string): Promise<Page> {
  const dapp = await page.context().newPage();
  await dapp.goto(url);
  await expect.poll(() => dapp.evaluate(() => 'xcpwallet' in window)).toBe(true);
  await dapp.evaluate(() => {
    const w = window as unknown as EventWindow & {
      xcpwallet: { on(event: string, listener: (accounts: string[]) => void): void };
    };
    w.xcpEvents = [];
    w.xcpwallet.on('accountsChanged', accounts => { w.xcpEvents.push(accounts); });
  });
  return dapp;
}

const events = (dapp: Page) => dapp.evaluate(() => (window as unknown as EventWindow).xcpEvents);

walletTest.describe('Account events', () => {
  let dappServer: { server: http.Server; port: number };

  walletTest.beforeAll(async () => { dappServer = await startDapp(); });
  walletTest.afterAll(async () => { await new Promise<void>(resolve => dappServer.server.close(() => resolve())); });

  walletTest('a connected page hears about an address-type switch and a lock; another origin hears nothing', async ({ context, page }) => {
    await expect(page).toHaveURL(/#\/index/);
    const connected = await openDapp(page, `http://localhost:${dappServer.port}`);
    // Same server, different origin.
    const bystander = await openDapp(page, `http://127.0.0.1:${dappServer.port}`);

    const approvalWindow = context.waitForEvent('page');
    const connection = connected.evaluate(() => (window as unknown as {
      xcpwallet: { request(args: { method: string }): Promise<{ accounts: string[] }> };
    }).xcpwallet.request({ method: 'xcp_requestAccounts' }));
    const approval = await approvalWindow;
    await approval.getByRole('button', { name: 'Connect', exact: true }).click();
    const [original] = (await connection).accounts;
    expect(original).toBeTruthy();

    // Switch to Taproot from Settings.
    await navigateTo(page, 'settings');
    await settings.addressTypeOption(page).click();
    await expect(page).toHaveURL(/address-type/);
    await page.locator('[role="radio"], [role="option"]').filter({ hasText: 'Taproot' }).first().click();

    await expect.poll(async () => (await events(connected)).at(-1)?.[0] ?? '', { timeout: 15_000 })
      .toMatch(/^bc1p/);
    const switched = (await events(connected)).at(-1)!;
    expect(switched).toHaveLength(1);
    expect(switched[0]).not.toBe(original);

    await navigateTo(page, 'wallet');
    await lockWallet(page);
    await expect.poll(async () => (await events(connected)).at(-1), { timeout: 15_000 }).toEqual([]);

    // Give any stray delivery the same window it had, then check the other origin stayed silent.
    await connected.waitForTimeout(500);
    expect(await events(bystander)).toEqual([]);

    await connected.close();
    await bystander.close();
  });
});
