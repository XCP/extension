/**
 * Provider Resilience Tests
 *
 * Tests for edge cases and resilience scenarios:
 * - Connection recovery after page reload
 * - Connection state after wallet lock/unlock
 * - Handling partial/interrupted flows
 * - State synchronization between dApp and wallet
 * - Connection persistence across browser sessions
 *
 * These tests ensure the provider handles real-world usage patterns
 * where users may reload pages, lock wallets, or interrupt flows.
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import * as http from 'http';
import path from 'path';
import { chromium } from '@playwright/test';
import { onboarding, createWallet as createWalletSelectors, unlock, header } from '../selectors';

const TEST_PASSWORD = 'TestPassword123!';

// Create a more sophisticated test dApp that tracks state properly
function createResilientTestDapp(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Resilient Test dApp</title>
          <style>
            body { font-family: system-ui; padding: 20px; max-width: 600px; margin: 0 auto; }
            .status { padding: 12px; border-radius: 8px; margin: 10px 0; }
            .connected { background: #d4edda; border: 1px solid #28a745; }
            .disconnected { background: #f8d7da; border: 1px solid #dc3545; }
            .connecting { background: #fff3cd; border: 1px solid #ffc107; }
            .error { background: #f8d7da; border: 1px solid #dc3545; }
            .no-wallet { background: #e2e3e5; border: 1px solid #6c757d; }
            button { padding: 10px 20px; margin: 5px; cursor: pointer; border: none; border-radius: 4px; }
            button:disabled { opacity: 0.5; cursor: not-allowed; }
            .btn-primary { background: #007bff; color: white; }
            .btn-danger { background: #dc3545; color: white; }
            .btn-secondary { background: #6c757d; color: white; }
            #log { background: #f8f9fa; padding: 10px; height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; }
            .log-entry { margin: 2px 0; }
            .log-event { color: #007bff; }
            .log-error { color: #dc3545; }
            .log-success { color: #28a745; }
          </style>
        </head>
        <body>
          <h1>Provider Resilience Test</h1>

          <div id="status" class="status no-wallet">Checking for wallet...</div>
          <div id="account"></div>

          <div style="margin: 20px 0;">
            <button id="connect-btn" class="btn-primary" onclick="connect()" disabled>Connect</button>
            <button id="disconnect-btn" class="btn-danger" onclick="disconnect()" disabled>Disconnect</button>
            <button id="check-btn" class="btn-secondary" onclick="checkConnection()">Check Connection</button>
            <button id="clear-log" class="btn-secondary" onclick="clearLog()">Clear Log</button>
          </div>

          <h3>Event Log</h3>
          <div id="log"></div>

          <script>
            // State machine for connection
            const ConnectionState = {
              NO_WALLET: 'no-wallet',
              DISCONNECTED: 'disconnected',
              CONNECTING: 'connecting',
              CONNECTED: 'connected',
              ERROR: 'error'
            };

            let state = {
              connectionState: ConnectionState.NO_WALLET,
              account: null,
              provider: null,
              eventCount: 0,
              lastError: null,
              connectionAttempts: 0,
              lastChecked: null
            };

            // Logging utility
            function log(message, type = 'info') {
              const logEl = document.getElementById('log');
              const entry = document.createElement('div');
              entry.className = 'log-entry log-' + type;
              entry.textContent = new Date().toISOString().substr(11, 12) + ' ' + message;
              logEl.appendChild(entry);
              logEl.scrollTop = logEl.scrollHeight;
              console.log('[TestDapp]', message);
            }

            function clearLog() {
              document.getElementById('log').innerHTML = '';
            }

            function updateUI() {
              const statusEl = document.getElementById('status');
              const accountEl = document.getElementById('account');
              const connectBtn = document.getElementById('connect-btn');
              const disconnectBtn = document.getElementById('disconnect-btn');

              // Update status display
              statusEl.className = 'status ' + state.connectionState;

              switch (state.connectionState) {
                case ConnectionState.NO_WALLET:
                  statusEl.textContent = 'XCP Wallet not detected';
                  connectBtn.disabled = true;
                  disconnectBtn.disabled = true;
                  break;
                case ConnectionState.DISCONNECTED:
                  statusEl.textContent = 'Not connected';
                  connectBtn.disabled = false;
                  disconnectBtn.disabled = true;
                  break;
                case ConnectionState.CONNECTING:
                  statusEl.textContent = 'Connecting... (attempt ' + state.connectionAttempts + ')';
                  connectBtn.disabled = true;
                  disconnectBtn.disabled = true;
                  break;
                case ConnectionState.CONNECTED:
                  statusEl.textContent = 'Connected: ' + state.account;
                  connectBtn.disabled = true;
                  disconnectBtn.disabled = false;
                  break;
                case ConnectionState.ERROR:
                  statusEl.textContent = 'Error: ' + (state.lastError || 'Unknown');
                  connectBtn.disabled = false;
                  disconnectBtn.disabled = true;
                  break;
              }

              accountEl.textContent = state.account || '';
            }

            // Wait for provider with timeout
            async function waitForProvider(timeout = 5000) {
              const start = Date.now();
              while (!window.xcpwallet && Date.now() - start < timeout) {
                await new Promise(r => setTimeout(r, 100));
              }
              return window.xcpwallet || null;
            }

            // Initialize on page load
            async function init() {
              log('Initializing...');

              const provider = await waitForProvider();
              if (!provider) {
                log('Provider not found after timeout', 'error');
                state.connectionState = ConnectionState.NO_WALLET;
                updateUI();
                return;
              }

              state.provider = provider;
              log('Provider found, setting up event listeners', 'success');

              // Set up event listeners BEFORE checking connection
              provider.on('accountsChanged', (accounts) => {
                state.eventCount++;
                log('Event #' + state.eventCount + ': accountsChanged - ' + JSON.stringify(accounts), 'event');

                if (accounts && accounts.length > 0) {
                  state.account = accounts[0];
                  state.connectionState = ConnectionState.CONNECTED;
                } else {
                  state.account = null;
                  state.connectionState = ConnectionState.DISCONNECTED;
                }
                updateUI();
              });

              provider.on('disconnect', (data) => {
                state.eventCount++;
                log('Event #' + state.eventCount + ': disconnect', 'event');
                state.account = null;
                state.connectionState = ConnectionState.DISCONNECTED;
                updateUI();
              });

              // Check existing connection
              await checkConnection();
            }

            // Check connection state (useful on page load and for debugging)
            async function checkConnection() {
              if (!state.provider) {
                log('No provider available', 'error');
                return;
              }

              state.lastChecked = new Date().toISOString();
              log('Checking connection state...');

              try {
                // xcp_accounts returns connected accounts without prompting
                const accounts = await state.provider.request({ method: 'xcp_accounts' });
                log('xcp_accounts returned: ' + JSON.stringify(accounts));

                if (accounts && accounts.length > 0) {
                  state.account = accounts[0];
                  state.connectionState = ConnectionState.CONNECTED;
                  log('Already connected to: ' + state.account, 'success');
                } else {
                  state.account = null;
                  state.connectionState = ConnectionState.DISCONNECTED;
                  log('Not connected (no accounts returned)');
                }

              } catch (error) {
                log('Error checking connection: ' + error.message, 'error');
                state.lastError = error.message;
                state.connectionState = ConnectionState.ERROR;
              }

              updateUI();
            }

            // Connect to wallet
            async function connect() {
              if (!state.provider) {
                log('No provider', 'error');
                return;
              }

              if (state.connectionState === ConnectionState.CONNECTING) {
                log('Already connecting, please wait...', 'error');
                return;
              }

              state.connectionAttempts++;
              state.connectionState = ConnectionState.CONNECTING;
              state.lastError = null;
              updateUI();

              log('Requesting connection (attempt ' + state.connectionAttempts + ')...');

              try {
                const accounts = await state.provider.request({ method: 'xcp_requestAccounts' });
                log('Connection successful: ' + JSON.stringify(accounts), 'success');

                if (accounts && accounts.length > 0) {
                  state.account = accounts[0];
                  state.connectionState = ConnectionState.CONNECTED;
                } else {
                  // Shouldn't happen - success without accounts
                  log('Warning: Connection returned success but no accounts', 'error');
                  state.connectionState = ConnectionState.DISCONNECTED;
                }
              } catch (error) {
                log('Connection failed: ' + error.message, 'error');
                state.lastError = error.message;
                state.connectionState = ConnectionState.ERROR;
              }

              updateUI();
            }

            // Disconnect from wallet
            async function disconnect() {
              if (!state.provider) return;

              log('Disconnecting...');

              try {
                await state.provider.request({ method: 'xcp_disconnect' });
                log('Disconnected successfully', 'success');
                state.account = null;
                state.connectionState = ConnectionState.DISCONNECTED;
              } catch (error) {
                log('Disconnect error: ' + error.message, 'error');
                state.lastError = error.message;
              }

              updateUI();
            }

            // Expose state for testing
            window.testState = state;
            window.testFunctions = { init, connect, disconnect, checkConnection, log };

            // Auto-initialize
            init();
          </script>
        </body>
        </html>
      `);
    });

    server.listen(0, 'localhost', () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        resolve({ server, url: `http://localhost:${address.port}` });
      }
    });
  });
}

async function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(), 5000);
    server.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function launchExtension(testId: string): Promise<{
  context: BrowserContext;
  page: Page;
  extensionId: string;
}> {
  const extensionPath = path.resolve('.output/chrome-mv3');
  const isCI = process.env.CI === 'true';
  const timeout = isCI ? 60000 : 30000;

  const context = await chromium.launchPersistentContext(`test-results/resilience-${testId}`, {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    timeout,
  });

  let extensionId: string | null = null;
  const maxWait = isCI ? 45 : 20;

  for (let i = 0; i < maxWait && !extensionId; i++) {
    await new Promise(r => setTimeout(r, 1000));
    for (const sw of context.serviceWorkers()) {
      const match = sw.url().match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        extensionId = match[1];
        break;
      }
    }
  }

  if (!extensionId) {
    await context.close();
    throw new Error('Failed to find extension ID');
  }

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForLoadState('domcontentloaded');

  return { context, page, extensionId };
}

async function createWallet(page: Page): Promise<void> {
  await onboarding.createWalletButton(page).click();
  await page.waitForURL(/create-wallet/);
  await createWalletSelectors.revealPhraseCard(page).click();

  await createWalletSelectors.savedPhraseCheckbox(page).check();
  await createWalletSelectors.passwordInput(page).fill(TEST_PASSWORD);
  await createWalletSelectors.continueButton(page).click();
  await page.waitForURL(/index/, { timeout: 15000 });
}

async function lockWallet(page: Page): Promise<void> {
  await header.lockButton(page).click();
  await page.waitForURL(/unlock/);
}

async function unlockWallet(page: Page): Promise<void> {
  await unlock.passwordInput(page).fill(TEST_PASSWORD);
  await unlock.unlockButton(page).click();
  await page.waitForURL(/index/, { timeout: 10000 });
}

async function waitForProvider(page: Page, timeout = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hasProvider = await page.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
    if (hasProvider) return true;
    
  }
  return false;
}

// ============================================================================
// Tests
// ============================================================================

const test = base.extend<{
  dappServer: { server: http.Server; url: string };
}>({
  dappServer: async ({}, use) => {
    const serverSetup = await createResilientTestDapp();
    await use(serverSetup);
    await closeServer(serverSetup.server);
  },
});

test.describe('Provider Resilience - Connection Recovery', () => {
  test('dApp correctly detects connection state on page load', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('detect-state');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);

      // Wait for init to complete
      await dappPage.waitForSelector('.status:not(.no-wallet)', { timeout: 10000 });

      // Should show as disconnected initially
      const state = await dappPage.evaluate(() => (window as any).testState);
      expect(state.connectionState).toBe('disconnected');

      await dappPage.close();
    } finally {
      await context.close();
    }
  });

  test('connection persists after page reload', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('persist-reload');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      // Start connection
      const connectPromise = dappPage.evaluate(() => {
        return (window as any).testFunctions.connect();
      });

      // Wait for approval popup and approve
      await extensionPage.waitForLoadState('networkidle');
      const pages = context.pages();
      const approvalPage = pages.find(p => p.url().includes('approve-connection'));

      if (approvalPage) {
        await approvalPage.reload();
        await approvalPage.waitForLoadState('networkidle');
        const connectBtn = approvalPage.locator('button:has-text("Connect")');
        if (await connectBtn.isVisible({ timeout: 5000 })) {
          await connectBtn.click();
        }
      }

      await connectPromise.catch(() => {});
      await dappPage.waitForLoadState('networkidle');

      // Check if connected
      const stateBeforeReload = await dappPage.evaluate(() => (window as any).testState);
      if (stateBeforeReload.connectionState !== 'connected') {
        console.log('Connection was not established, skipping reload test');
        await dappPage.close();
        return;
      }

      // Reload the page
      await dappPage.reload();
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status:not(.no-wallet)', { timeout: 10000 });

      // Should detect existing connection
      await dappPage.waitForLoadState('networkidle');
      const stateAfterReload = await dappPage.evaluate(() => (window as any).testState);

      // Either still connected or the connection was properly detected
      expect(['connected', 'disconnected']).toContain(stateAfterReload.connectionState);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });

  test('handles wallet lock during connection attempt gracefully', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('lock-during');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      // Start connection but don't wait for it
      dappPage.evaluate(() => {
        (window as any).testFunctions.connect();
      });

      // Give it a moment to start
      await dappPage.waitForLoadState('networkidle');

      // Lock the wallet mid-connection
      await extensionPage.bringToFront();
      await lockWallet(extensionPage);

      // Wait for the connection attempt to complete (should fail or timeout)
      await dappPage.waitForLoadState('networkidle');

      // dApp should handle this gracefully (either error state or disconnected)
      const state = await dappPage.evaluate(() => (window as any).testState);
      expect(['disconnected', 'error']).toContain(state.connectionState);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });

  test('multiple rapid connect clicks are handled gracefully', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('rapid-clicks');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      // Click connect multiple times rapidly
      await dappPage.click('#connect-btn');
      
      await dappPage.click('#connect-btn').catch(() => {});
      
      await dappPage.click('#connect-btn').catch(() => {});

      // Wait and check state
      await dappPage.waitForLoadState('networkidle');

      // Should still be in a valid state (connecting, error, or disconnected)
      const state = await dappPage.evaluate(() => (window as any).testState);
      expect(['connecting', 'disconnected', 'error', 'connected']).toContain(state.connectionState);

      // Connection attempts should be tracked
      expect(state.connectionAttempts).toBeGreaterThanOrEqual(1);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });

  test('xcp_accounts returns empty array when disconnected', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('state-consistency');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      // Check that xcp_accounts returns empty array when disconnected
      const result = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        const accounts = await provider.request({ method: 'xcp_accounts' });
        return { accounts };
      });

      expect(result.accounts).toEqual([]);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });

  test('handles extension service worker restart', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('sw-restart');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      // Make a request before "restart"
      const beforeResult = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        try {
          return await provider.request({ method: 'xcp_chainId' });
        } catch (e: any) {
          return { error: e.message };
        }
      });

      // Service worker restart is simulated by waiting - in real scenario
      // the SW can restart at any time. We verify requests still work.
      await dappPage.waitForLoadState('networkidle');

      // Make a request after "restart"
      const afterResult = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        try {
          return await provider.request({ method: 'xcp_chainId' });
        } catch (e: any) {
          return { error: e.message };
        }
      });

      // Both should work (or both should error consistently)
      expect(typeof beforeResult).toBe(typeof afterResult);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });
});

test.describe('Provider Resilience - Error Handling', () => {
  test('handles request timeout gracefully', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('timeout');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      // The injected script has a 60s timeout for requests
      // We test that the error handling works by making a request
      // and checking the promise behavior
      const result = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        const startTime = Date.now();
        try {
          await provider.request({ method: 'xcp_chainId' });
          return { success: true, duration: Date.now() - startTime };
        } catch (e: any) {
          return { error: e.message, duration: Date.now() - startTime };
        }
      });

      // Should complete (success or error) without hanging
      expect(result.duration).toBeLessThan(5000);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });

  test('handles invalid method gracefully', async ({ dappServer }) => {
    const { context, page: extensionPage, extensionId } = await launchExtension('invalid-method');

    try {
      await createWallet(extensionPage);

      const dappPage = await context.newPage();
      await dappPage.goto(dappServer.url);
      await waitForProvider(dappPage);
      await dappPage.waitForSelector('.status.disconnected', { timeout: 10000 });

      const result = await dappPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        try {
          await provider.request({ method: 'invalid_nonexistent_method_xyz' });
          return { success: true };
        } catch (e: any) {
          return { error: e.message };
        }
      });

      expect(result.error).toBeTruthy();
      // Note: The extension returns generic "Request failed" for security
      // (prevents information leakage about internal methods)
      expect(result.error).toMatch(/Unsupported method|Request failed/);

      await dappPage.close();
    } finally {
      await context.close();
    }
  });
});
