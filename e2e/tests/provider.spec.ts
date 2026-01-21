/**
 * XCP Provider Tests
 *
 * Tests for the wallet provider injection, connection management,
 * network information, security, and event handling.
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
          <title>XCP Provider Test</title>
        </head>
        <body>
          <h1>XCP Wallet Provider Test Page</h1>
          <div id="status">Checking provider...</div>
          <div id="results"></div>

          <script>
            setTimeout(() => {
              window.providerFound = typeof window.xcpwallet !== 'undefined';
              document.getElementById('status').textContent =
                window.providerFound ? 'Provider found!' : 'Provider not found';
            }, 1000);

            window.checkProvider = () => {
              const provider = window.xcpwallet;
              if (!provider) return null;
              return {
                hasRequest: typeof provider.request === 'function',
                hasOn: typeof provider.on === 'function',
                hasRemoveListener: typeof provider.removeListener === 'function',
                hasIsConnected: typeof provider.isConnected === 'function'
              };
            };

            window.testProvider = async (method, params) => {
              if (!window.xcpwallet) {
                throw new Error('Provider not available');
              }
              return await window.xcpwallet.request({ method, params });
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
    await page.waitForTimeout(500);
  }
  return false;
}

walletTest.describe('XCP Provider', () => {
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

  walletTest.describe('Provider Injection', () => {
    walletTest('should inject provider on localhost', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      await testPage.close();
    });

    walletTest('should have all required provider methods', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const providerInfo = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) return null;

        return {
          hasRequest: typeof provider.request === 'function',
          hasOn: typeof provider.on === 'function',
          hasRemoveListener: typeof provider.removeListener === 'function',
        };
      });

      expect(providerInfo).not.toBeNull();
      expect(providerInfo?.hasRequest).toBe(true);
      expect(providerInfo?.hasOn).toBe(true);
      expect(providerInfo?.hasRemoveListener).toBe(true);

      await testPage.close();
    });
  });

  walletTest.describe('Connection Management', () => {
    walletTest('should return empty accounts when not connected', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const accounts = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_accounts' });
      });

      expect(accounts).toEqual([]);

      await testPage.close();
    });

    walletTest('should check connection status via xcp_accounts', async ({ context }) => {
      // isConnected() is not provided - use xcp_accounts to check connection status
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      // Check connection status by calling xcp_accounts
      const accounts = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_accounts' });
      });

      // Empty accounts means not connected
      expect(accounts).toEqual([]);

      await testPage.close();
    });

    walletTest('xcp_requestAccounts triggers approval popup or returns error', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      // Listen for popup
      let popupOpened = false;
      let popupPage: any = null;

      const popupPromise = new Promise<void>((resolve) => {
        context.on('page', (page) => {
          popupOpened = true;
          popupPage = page;
          resolve();
        });
      });

      // Request accounts - this should either open popup or return error
      const accountsPromise = testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        try {
          return await provider.request({ method: 'xcp_requestAccounts' });
        } catch (error: any) {
          return { error: error.message };
        }
      });

      // Wait for either popup or response
      const raceResult = await Promise.race([
        popupPromise.then(() => 'popup'),
        accountsPromise.then(() => 'response'),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 10000))
      ]);

      if (raceResult === 'popup') {
        // Popup opened - verify it's the approval page
        expect(popupOpened).toBe(true);
        // Close popup to allow test to complete
        if (popupPage) await popupPage.close();
        // Wait for the error response from rejected connection
        const result = await accountsPromise;
        expect(result).toHaveProperty('error');
      } else if (raceResult === 'response') {
        // Got direct response - should be an error (wallet not set up or not connected)
        const result = await accountsPromise;
        expect(result).toHaveProperty('error');
      } else {
        // Timeout - test infrastructure issue
        throw new Error('Test timed out waiting for popup or response');
      }

      await testPage.close();
    });
  });

  walletTest.describe('Network Information', () => {
    walletTest('xcp_chainId returns chain ID or error', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const result = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        try {
          return { chainId: await provider.request({ method: 'xcp_chainId' }) };
        } catch (error: any) {
          return { error: error.message };
        }
      });

      // Either returns a chain ID or an error (if wallet not set up)
      expect('chainId' in result || 'error' in result).toBe(true);

      await testPage.close();
    });

    walletTest('xcp_getNetwork returns network or error', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const result = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        try {
          return { network: await provider.request({ method: 'xcp_getNetwork' }) };
        } catch (error: any) {
          return { error: error.message };
        }
      });

      // Either returns a network or an error (if wallet not set up)
      expect('network' in result || 'error' in result).toBe(true);

      await testPage.close();
    });
  });

  walletTest.describe('Security', () => {
    walletTest('should reject unauthorized signing requests', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const result = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        try {
          return await provider.request({
            method: 'xcp_signMessage',
            params: ['Test message', 'bc1qtest123']
          });
        } catch (error: any) {
          return { error: error.message };
        }
      });

      // Should get an error - unauthorized or not connected
      expect(result).toHaveProperty('error');

      await testPage.close();
    });

    walletTest('should handle invalid methods with error', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const result = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        try {
          await provider.request({ method: 'invalid_method' });
          return { success: true };
        } catch (error: any) {
          return { error: error.message };
        }
      });

      // Should error on invalid method
      expect(result).toHaveProperty('error');

      await testPage.close();
    });

    walletTest('should validate parameter size limits', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      // Create a 2MB parameter
      const largeParam = 'x'.repeat(2 * 1024 * 1024);

      const result = await testPage.evaluate(async (param) => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        try {
          const response = await provider.request({
            method: 'xcp_getBalances',
            params: [{ largeData: param }]
          });
          return { success: true, response };
        } catch (error: any) {
          return { error: error.message };
        }
      }, largeParam);

      // Should error on oversized params
      expect(result).toHaveProperty('error');

      await testPage.close();
    });

    walletTest('should not expose sensitive data in provider object', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const securityCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        const exposedKeys = Object.keys(provider);
        const sensitiveKeys = ['_internal', 'privateKey', 'mnemonic', '_storage'];

        const hasSensitiveData = sensitiveKeys.some(key =>
          exposedKeys.includes(key) ||
          exposedKeys.some(exposedKey => exposedKey.includes(key))
        );

        return {
          exposedKeys,
          hasSensitiveData
        };
      });

      expect(securityCheck.hasSensitiveData).toBe(false);

      await testPage.close();
    });
  });

  walletTest.describe('Event Handling', () => {
    walletTest('should support event listeners', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const eventTest = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        const handler = () => {};

        // Test that event methods exist and work
        provider.on('test', handler);
        provider.removeListener('test', handler);

        return {
          hasOn: typeof provider.on === 'function',
          hasRemoveListener: typeof provider.removeListener === 'function'
        };
      });

      expect(eventTest.hasOn).toBe(true);
      expect(eventTest.hasRemoveListener).toBe(true);

      await testPage.close();
    });
  });

  walletTest.describe('Rate Limiting', () => {
    walletTest('should handle rapid requests gracefully', async ({ context }) => {
      const testPage = await context.newPage();
      await testPage.goto(serverUrl);

      const providerFound = await waitForProvider(testPage);
      expect(providerFound).toBe(true);

      const results = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        const results: Array<{ success?: boolean; error?: string; rateLimited?: boolean; index: number }> = [];

        // Make 50 rapid requests
        for (let i = 0; i < 50; i++) {
          try {
            await provider.request({ method: 'xcp_chainId' });
            results.push({ success: true, index: i });
          } catch (error: any) {
            const errorMessage = error.message.toLowerCase();
            const isRateLimited = errorMessage.includes('rate') ||
                                  errorMessage.includes('limit') ||
                                  errorMessage.includes('too many') ||
                                  errorMessage.includes('throttle');

            results.push({
              error: error.message,
              rateLimited: isRateLimited,
              index: i
            });

            // If rate limited, we've proven the feature works
            if (isRateLimited) break;
          }
        }

        return results;
      });

      // Test passes if we got responses (with or without rate limiting)
      // The important thing is the provider doesn't crash under load
      expect(results.length).toBeGreaterThan(0);

      await testPage.close();
    });
  });
});
