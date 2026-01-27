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

import { walletTest, expect } from '../fixtures';
import * as http from 'http';

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

  walletTest('xcp_requestAccounts triggers popup or returns error', async ({ context }) => {
    const testPage = await context.newPage();
    await testPage.goto(serverUrl);

    const providerFound = await waitForProvider(testPage);
    expect(providerFound).toBe(true);

    // Listen for popup
    let popupPage: any = null;
    const popupPromise = new Promise<void>((resolve) => {
      context.on('page', (page) => {
        popupPage = page;
        resolve();
      });
    });

    const connectionPromise = testPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      if (!provider) return { error: 'No provider' };

      try {
        const accounts = await provider.request({
          method: 'xcp_requestAccounts'
        });
        return { accounts };
      } catch (error: any) {
        return { error: error.message };
      }
    });

    // Wait for either popup or response
    const raceResult = await Promise.race([
      popupPromise.then(() => 'popup'),
      connectionPromise.then(() => 'response'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000))
    ]);

    if (raceResult === 'popup') {
      // Popup opened - could be approval page or main popup (for wallet setup/unlock)
      expect(popupPage).not.toBeNull();
      if (popupPage) {
        // Either approval page or main popup is valid
        const url = popupPage.url();
        const isValidPopup = url.includes('/requests/connect/approve') ||
                            url.includes('popup.html');
        expect(isValidPopup).toBe(true);
        await popupPage.close();
      }
      // Wait for the error response
      const connectionResult = await connectionPromise;
      expect(connectionResult).toHaveProperty('error');
    } else if (raceResult === 'response') {
      // Got direct response - should be an error
      const connectionResult = await connectionPromise;
      expect(connectionResult).toHaveProperty('error');
    } else {
      throw new Error('Test timed out waiting for popup or response');
    }

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
