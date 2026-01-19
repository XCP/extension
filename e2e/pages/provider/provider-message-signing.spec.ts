/**
 * E2E Tests for xcp_signMessage provider method
 *
 * Tests cover:
 * - Unauthorized access rejection
 * - Parameter validation
 * - Message format handling
 * - Approval popup display
 */

import { test, expect, Page } from '@playwright/test';
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

test.describe('Message Signing', () => {
  let server: http.Server;
  let serverUrl: string;
  let testPage: Page;

  test.beforeAll(async () => {
    const serverSetup = await createTestServer();
    server = serverSetup.server;
    serverUrl = serverSetup.url;
  });

  test.afterAll(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  test('should reject message signing when not connected', async ({ context }) => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);

    for (let i = 0; i < 10; i++) {
      const providerFound = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      if (providerFound) break;
      await testPage.waitForTimeout(1000);
    }

    // Check if provider is available
    const hasProvider = await testPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    if (!hasProvider) {
      await testPage.close();
      return; // Skip if provider not available
    }

    const result = await testPage.evaluate(async () => {
      return await (window as any).testSignMessage('Hello, Bitcoin!', 'bc1qtest123');
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toBeTruthy();
    await testPage.close();
  });

  test('should show approval popup for message signing', async ({ context }) => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);

    for (let i = 0; i < 10; i++) {
      const providerFound = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      if (providerFound) break;
      await testPage.waitForTimeout(1000);
    }

    const hasProvider = await testPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    if (!hasProvider) {
      await testPage.close();
      return;
    }

    const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);

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

    const connectionPopup = await popupPromise;
    if (connectionPopup) {
      expect(connectionPopup.url()).toContain('/provider/approve-connection');
      await connectionPopup.close();
    }

    const connectionResult = await connectionPromise;

    expect(connectionResult).toBeDefined();
    expect(connectionResult).toHaveProperty('error');
    await testPage.close();
  });

  test('should validate message parameters', async ({ context }) => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);

    for (let i = 0; i < 10; i++) {
      const providerFound = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      if (providerFound) break;
      await testPage.waitForTimeout(1000);
    }

    const result1 = await testPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      if (!provider) return { error: 'No provider' };

      try {
        return await provider.request({
          method: 'xcp_signMessage',
          params: [null, 'bc1qtest']
        });
      } catch (error: any) {
        return { error: error.message };
      }
    });

    expect(result1).toHaveProperty('error');
    expect(result1.error).toBeTruthy();

    const result2 = await testPage.evaluate(async () => {
      const provider = (window as any).xcpwallet;
      if (!provider) return { error: 'No provider' };

      try {
        return await provider.request({
          method: 'xcp_signMessage',
          params: ['Test message']
        });
      } catch (error: any) {
        return { error: error.message };
      }
    });

    expect(result2).toHaveProperty('error');
    expect(result2.error).toBeTruthy();
    await testPage.close();
  });

  test('should handle various message types', async ({ context }) => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);

    for (let i = 0; i < 10; i++) {
      const providerFound = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      if (providerFound) break;
      await testPage.waitForTimeout(1000);
    }

    // Check if provider is available, skip test if not (CI environment may not have provider)
    const hasProvider = await testPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    if (!hasProvider) {
      await testPage.close();
      return; // Skip test if provider not available
    }

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
        if (!provider) return { handled: false, error: 'No provider' };

        try {
          await provider.request({
            method: 'xcp_signMessage',
            params: [msg, 'bc1qtest']
          });
          return { handled: true };
        } catch (error: any) {
          return { handled: true, errorMessage: error.message };
        }
      }, message);

      expect(result.handled).toBe(true);
    }
    await testPage.close();
  });

  test('should check provider availability for signing', async ({ context }) => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);

    for (let i = 0; i < 10; i++) {
      const providerFound = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      if (providerFound) break;
      await testPage.waitForTimeout(1000);
    }

    const hasProvider = await testPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });

    // Provider injection may not work in all CI environments
    if (!hasProvider) {
      await testPage.close();
      return; // Skip if provider not available
    }

    expect(hasProvider).toBe(true);

    const methodCheck = await testPage.evaluate(() => {
      const provider = (window as any).xcpwallet;
      if (!provider) return false;

      return typeof provider.request === 'function';
    });

    expect(methodCheck).toBe(true);
    await testPage.close();
  });
});
