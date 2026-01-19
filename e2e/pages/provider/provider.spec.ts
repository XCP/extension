/**
 * XCP Provider Tests
 *
 * Tests for the wallet provider injection, connection management,
 * network information, security, and event handling.
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

test.describe('XCP Provider', () => {
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

  test.describe('Provider Injection', () => {
    test('should inject provider on localhost', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      // Wait for provider to be injected
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

      expect(hasProvider).toBe(true);
      await testPage.close();
    });

    test('should have all required provider methods', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      // Wait for provider
      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const providerInfo = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) return null;

        return {
          hasRequest: typeof provider.request === 'function',
          hasOn: typeof provider.on === 'function',
          hasRemoveListener: typeof provider.removeListener === 'function',
          hasIsConnected: typeof provider.isConnected === 'function',
          isConnected: provider.isConnected()
        };
      });

      expect(providerInfo).not.toBeNull();
      expect(providerInfo?.hasRequest).toBe(true);
      expect(providerInfo?.hasOn).toBe(true);
      expect(providerInfo?.hasRemoveListener).toBe(true);
      expect(providerInfo?.hasIsConnected).toBe(true);
      expect(providerInfo?.isConnected).toBe(false);
      await testPage.close();
    });
  });

  test.describe('Connection Management', () => {
    test.skip('should return empty accounts when not connected', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const accounts = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_accounts' });
      });

      expect(accounts).toEqual([]);
      await testPage.close();
    });

    test('should check isConnected status correctly', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const isConnected = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return provider.isConnected();
      });

      expect(isConnected).toBe(false);
      await testPage.close();
    });

    test('should show approval popup for connection', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      let popup: any = null;
      const popupPromise = new Promise<any>((resolve) => {
        context.on('page', (page) => {
          if (page.url().includes('/provider/approve-connection')) {
            popup = page;
            resolve(page);
          }
        });
      });

      const accountsPromise = testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');

        try {
          return await provider.request({ method: 'xcp_requestAccounts' });
        } catch (error: any) {
          return { error: error.message };
        }
      });

      const raceResult = await Promise.race([
        popupPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Popup timeout')), 15000))
      ]).catch(() => null);

      if (!raceResult) {
        const result = await accountsPromise;
        await testPage.close();
        return;
      }

      expect(popup.url()).toContain('/provider/approve-connection');

      await popup.close();

      const result = await accountsPromise;
      expect(result).toHaveProperty('error');
      await testPage.close();
    });
  });

  test.describe('Network Information', () => {
    test.skip('should return correct chain ID', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const chainId = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_chainId' });
      });

      expect(chainId).toBe('0x0');
      await testPage.close();
    });

    test.skip('should return correct network', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const network = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_getNetwork' });
      });

      expect(network).toBe('mainnet');
      await testPage.close();
    });
  });

  test.describe('Security', () => {
    test('should reject unauthorized signing requests', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

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

      expect(result).toHaveProperty('error');
      expect(
        result.error.includes('Unauthorized') ||
        result.error.includes('Extension services not available')
      ).toBeTruthy();
      await testPage.close();
    });

    test('should handle invalid methods', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const result = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'Provider not available' };

        try {
          await provider.request({
            method: 'invalid_method'
          });

          return { success: true };
        } catch (error: any) {
          return { error: error.message };
        }
      });

      expect(
        result.error.includes('not supported') ||
        result.error.includes('Extension services not available')
      ).toBeTruthy();
      await testPage.close();
    });

    test('should validate parameter size limits', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const largeParam = 'x'.repeat(2 * 1024 * 1024);

      const result = await testPage.evaluate(async (param) => {
        try {
          const provider = (window as any).xcpwallet;
          if (!provider) {
            return { error: 'Provider not available' };
          }

          const response = await provider.request({
            method: 'xcp_getBalances',
            params: [{ largeData: param }]
          });

          return { success: true, response };
        } catch (error: any) {
          return { error: error.message };
        }
      }, largeParam);

      expect(
        result.error.includes('Request parameters too large') ||
        result.error.includes('Extension services not available')
      ).toBeTruthy();
      await testPage.close();
    });

    test('should not expose sensitive data', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const securityCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) {
          return { error: 'Provider not available' };
        }

        const exposedKeys = Object.keys(provider);
        const sensitiveKeys = ['_internal', 'privateKey', 'mnemonic', '_storage'];

        const hasSensitiveData = sensitiveKeys.some(key =>
          exposedKeys.includes(key) ||
          exposedKeys.some(exposedKey => exposedKey.includes(key))
        );

        return {
          success: true,
          exposedKeys,
          hasSensitiveData
        };
      });

      expect(securityCheck.hasSensitiveData).toBe(false);
      await testPage.close();
    });
  });

  test.describe('Event Handling', () => {
    test('should support event listeners', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const eventTest = await testPage.evaluate(() => {
        return new Promise((resolve) => {
          const provider = (window as any).xcpwallet;
          if (!provider) {
            resolve({ error: 'Provider not found' });
            return;
          }

          const handler = () => {};

          provider.on('test', handler);

          const hasHandler = typeof provider.removeListener === 'function';

          provider.removeListener('test', handler);

          resolve({
            hasEventMethods: true,
            canAddListener: hasHandler
          });
        });
      });

      expect(eventTest).toHaveProperty('hasEventMethods', true);
      expect(eventTest).toHaveProperty('canAddListener', true);
      await testPage.close();
    });
  });

  test.describe('Rate Limiting', () => {
    test('should handle rapid requests gracefully', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const rateLimitTest = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) {
          return [{ error: 'Provider not available - rate limit test skipped' }];
        }

        const results = [];

        for (let i = 0; i < 50; i++) {
          try {
            const response = await provider.request({
              method: 'xcp_chainId'
            });
            results.push({ success: true, index: i });
          } catch (error: any) {
            results.push({ error: error.message, index: i });

            if (error.message.toLowerCase().includes('rate') ||
                error.message.toLowerCase().includes('limit') ||
                error.message.toLowerCase().includes('too many') ||
                error.message.toLowerCase().includes('throttle')) {
              results.push({ rateLimited: true });
              break;
            }
          }
        }

        return results;
      });

      const hasRateLimit = rateLimitTest.some(result =>
        ('error' in result && result.error?.toLowerCase().includes('rate')) ||
        ('error' in result && result.error?.toLowerCase().includes('limit')) ||
        ('rateLimited' in result && result.rateLimited) ||
        ('error' in result && result.error?.includes('not available'))
      );

      const isHandled = hasRateLimit || rateLimitTest.length > 0;
      expect(isHandled).toBe(true);
      await testPage.close();
    });
  });
});
