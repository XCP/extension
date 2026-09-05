/**
 * E2E Tests for xcp_signMessage provider method
 *
 * Tests cover:
 * - Unauthorized access rejection
 * - Parameter validation
 * - Message format handling
 * - Approval popup display
 *
 * Uses walletTest fixture which provides a browser context with the extension loaded.
 */

import * as http from 'http';
import { verifySimpleBIP322 } from '../../src/core/bitcoin/bip322';
import { expect, walletTest } from '../fixtures';
import { captureApprovalSizes } from '../utils/approval-layout';

// Helper to create test HTML server
function createTestServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Message Signing Test</title>
        </head>
        <body>
          <h1>XCP Wallet Message Signing Test</h1>
          <div id="status">Waiting for provider...</div>
          <div id="result"></div>

          <script>
            let checkCount = 0;
            const checkProvider = setInterval(() => {
              checkCount++;
              if (window.xcpwallet) {
                document.getElementById('status').textContent = 'Provider detected!';
                clearInterval(checkProvider);
                window.dispatchEvent(new CustomEvent('provider-ready'));
              } else if (checkCount > 20) {
                document.getElementById('status').textContent = 'Provider not found';
                clearInterval(checkProvider);
              }
            }, 100);

            window.testSignMessage = async (message, address) => {
              if (!window.xcpwallet) {
                throw new Error('Provider not available');
              }

              try {
                const signature = await window.xcpwallet.request({
                  method: 'xcp_signMessage',
                  params: [message, address]
                });

                return { success: true, signature };
              } catch (error) {
                return { error: error.message };
              }
            };

            window.connectAndSign = async (message) => {
              if (!window.xcpwallet) {
                throw new Error('Provider not available');
              }

              try {
                const accounts = await window.xcpwallet.request({
                  method: 'xcp_requestAccounts'
                });

                if (!accounts || accounts.length === 0) {
                  throw new Error('No accounts connected');
                }

                const signature = await window.xcpwallet.request({
                  method: 'xcp_signMessage',
                  params: [message, accounts[0]]
                });

                return {
                  success: true,
                  account: accounts[0],
                  signature
                };
              } catch (error) {
                return { error: error.message };
              }
            };
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

// Helper to close server with timeout protection
async function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve();
    }, 5000);

    server.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

// Helper to wait for provider injection
async function waitForProvider(page: any, timeout = 10000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const found = await page.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
    if (found) return true;
    
  }
  return false;
}

walletTest.describe('Message Signing', () => {
  let server: http.Server;
  let serverUrl: string;

  walletTest.beforeAll(async () => {
    const serverSetup = await createTestServer();
    server = serverSetup.server;
    serverUrl = serverSetup.url;
  });

  walletTest.afterAll(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  walletTest('should reject message signing when not connected', async ({ context }) => {
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);

    const providerFound = await waitForProvider(testPage);
    expect(providerFound).toBe(true);

    const result = await testPage.evaluate(async () => {
      return await (window as any).testSignMessage('Hello, Bitcoin!', 'bc1qtest123');
    });

    // Should error when not connected
    expect(result).toHaveProperty('error');
    expect(result.error).toBeTruthy();

    await testPage.close();
  });

  walletTest('connects and signs only after reviewing the background request', async ({ context, page }) => {
    // Request the page fixture: it creates the wallet, while context alone only loads the extension.
    await expect(page).toHaveURL(/#\/index/);
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);
    await expect.poll(() => testPage.evaluate(() => 'xcpwallet' in window)).toBe(true);

    const connectionPopup = context.waitForEvent('page');
    const connectionResult = testPage.evaluate(async () => {
      const provider = (window as unknown as { xcpwallet: { request(args: { method: string }): Promise<{
        accounts: string[]; proof: { message: string; signature: string; address: string };
      }> } }).xcpwallet;
      try { return { connection: await provider.request({ method: 'xcp_requestAccounts' }) }; }
      catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    }).catch(error => ({ error: error instanceof Error ? error.message : String(error), connection: undefined }));
    const connectPage = await connectionPopup;
    await expect(connectPage).toHaveURL(/requests\/connect\/approve/);
    await expect(connectPage.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled();
    await captureApprovalSizes(connectPage, 'test-results/approval-gallery', 'connect-proved');
    await connectPage.getByRole('button', { name: 'Connect', exact: true }).click();
    const connected = await connectionResult;
    expect(connected.error).toBeUndefined();
    expect(connected.connection?.accounts).toHaveLength(1);
    const address = connected.connection!.accounts[0]!;
    const proof = connected.connection!.proof;
    expect(proof.address).toBe(address);
    expect(await verifySimpleBIP322(proof.message, proof.signature, address)).toBe(true);

    const message = 'Approve this exact XCP Wallet regression message.\n\n  Keep these spaces.\tAnd this tab.';
    const signingPopup = context.waitForEvent('page');
    const signingResult = testPage.evaluate(async ({ message, address }) => {
      const provider = (window as unknown as { xcpwallet: { request(args: { method: string; params: string[] }): Promise<string> } }).xcpwallet;
      try { return { signature: await provider.request({ method: 'xcp_signMessage', params: [message, address] }) }; }
      catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    }, { message, address }).catch(error => ({ error: error instanceof Error ? error.message : String(error), signature: undefined }));
    const signPage = await signingPopup;
    await expect(signPage).toHaveURL(/requests\/message\/approve/);
    await expect(signPage.getByText(message, { exact: true })).toBeVisible();
    expect(await signPage.getByText(message, { exact: true }).textContent()).toBe(message);
    await captureApprovalSizes(signPage, 'test-results/approval-gallery', 'message-proved');
    await signPage.getByRole('button', { name: 'Sign message', exact: true }).click();
    const signed = await signingResult;
    expect(signed.error).toBeUndefined();
    expect(typeof signed.signature).toBe('string');
    expect(await verifySimpleBIP322(message, signed.signature!, address)).toBe(true);
    expect(await verifySimpleBIP322(`${message} altered`, signed.signature!, address)).toBe(false);

    // Rejoining a completed request returns the original result without a second signer.
    const recovered = await testPage.evaluate(async ({ message, address }) => {
      const provider = (window as unknown as { xcpwallet: { request(args: { method: string; params: string[] }): Promise<string> } }).xcpwallet;
      return provider.request({ method: 'xcp_signMessage', params: [message, address] });
    }, { message, address });
    expect(recovered).toBe(signed.signature);
    await testPage.close();
  });
  walletTest('should validate message parameters - null message', async ({ context }) => {
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);

    const providerFound = await waitForProvider(testPage);
    expect(providerFound).toBe(true);

    const result = await testPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      if (!provider) throw new Error('No provider');

      try {
        return await provider.request({
          method: 'xcp_signMessage',
          params: [null, 'bc1qtest']
        });
      } catch (error: any) {
        return { error: error.message };
      }
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toBeTruthy();

    await testPage.close();
  });

  walletTest('should validate message parameters - missing address', async ({ context }) => {
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);

    const providerFound = await waitForProvider(testPage);
    expect(providerFound).toBe(true);

    const result = await testPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      if (!provider) throw new Error('No provider');

      try {
        return await provider.request({
          method: 'xcp_signMessage',
          params: ['Test message']
        });
      } catch (error: any) {
        return { error: error.message };
      }
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toBeTruthy();

    await testPage.close();
  });

  walletTest('should handle various message types without crashing', async ({ context }) => {
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);

    const providerFound = await waitForProvider(testPage);
    expect(providerFound).toBe(true);

    const messages = [
      'Simple text message',
      'Message with special chars: !@#$%^&*()',
      'Multi\nline\nmessage',
      'Unicode: 🚀 测试 тест',
      JSON.stringify({ type: 'json', data: 'test' }),
      'Very long message '.repeat(100)
    ];

    for (const message of messages) {
      const result = await testPage.evaluate(async (msg) => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('No provider');

        try {
          await provider.request({
            method: 'xcp_signMessage',
            params: [msg, 'bc1qtest']
          });
          return { handled: true };
        } catch (error: any) {
          // Error is expected (not connected), but we're testing it doesn't crash
          return { handled: true, errorMessage: error.message };
        }
      }, message);

      // Provider should handle the request without crashing
      expect(result.handled).toBe(true);
    }

    await testPage.close();
  });

  walletTest('provider should have request method for signing', async ({ context }) => {
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);

    const providerFound = await waitForProvider(testPage);
    expect(providerFound).toBe(true);

    const methodCheck = await testPage.evaluate(() => {
      const provider = (window as any).xcpwallet;
      if (!provider) throw new Error('No provider');
      return typeof provider.request === 'function';
    });

    expect(methodCheck).toBe(true);

    await testPage.close();
  });
});
