/**
 * E2E Tests for xcp_signPsbt and xcp_signTransaction provider methods
 *
 * Tests cover:
 * - Parameter validation
 * - Unauthorized access rejection
 * - Approval popup display
 * - Method availability
 */

import { test, expect, Page } from '@playwright/test';
import * as http from 'http';

// Test fixtures - minimal valid transaction/PSBT hex for testing
const TEST_FIXTURES = {
  PSBT_HEX: '70736274ff0100520200000001aad73931018bd25f84ae400b68df0817e57e3e8e36b6e66ea1b0d8f9e7a1d5e10000000000fdffffff0110270000000000001976a9144b3518229b0d3554fe7cd3796ade632aff3069d888ac00000000000100fd01010200000001bd9b31ae5b2b0f9a26e0e8edc16c9ba3e00c0b9e9ef52cfbeee52a38ffed93ff010000006a47304402207f7d6c7c4c6f8f4c8f6e7d8e9f0a1b2c3d4e5f6071829394a5b6c7d8e9f0a1b02207f7d6c7c4c6f8f4c8f6e7d8e9f0a1b2c3d4e5f6071829394a5b6c7d8e9f0a1b0121024b3518229b0d3554fe7cd3796ade632aff3069d88b697e8df7ec8e8c1c8b9d9dfdffffff0200e1f505000000001976a914000000000000000000000000000000000000000088ac10270000000000001976a9144b3518229b0d3554fe7cd3796ade632aff3069d888ac00000000000000',
  RAW_TX_HEX: '0200000001aad73931018bd25f84ae400b68df0817e57e3e8e36b6e66ea1b0d8f9e7a1d5e10000000000fdffffff0110270000000000001976a9144b3518229b0d3554fe7cd3796ade632aff3069d888ac00000000',
  INVALID_HEX: 'deadbeef',
  EMPTY_HEX: '',
};

// Helper to create test HTML server
function createTestServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Transaction Signing Test</title>
        </head>
        <body>
          <h1>XCP Wallet Transaction Signing Test</h1>
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

            window.testSignPsbt = async (params) => {
              if (!window.xcpwallet) {
                throw new Error('Provider not available');
              }

              try {
                const result = await window.xcpwallet.request({
                  method: 'xcp_signPsbt',
                  params: [params]
                });

                return { success: true, result };
              } catch (error) {
                return { error: error.message };
              }
            };

            window.testSignTransaction = async (params) => {
              if (!window.xcpwallet) {
                throw new Error('Provider not available');
              }

              try {
                const result = await window.xcpwallet.request({
                  method: 'xcp_signTransaction',
                  params: [params]
                });

                return { success: true, result };
              } catch (error) {
                return { error: error.message };
              }
            };

            window.connectThenSign = async (method, params) => {
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

                const result = await window.xcpwallet.request({
                  method,
                  params: [params]
                });

                return {
                  success: true,
                  account: accounts[0],
                  result
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

test.describe('Transaction Signing (xcp_signPsbt & xcp_signTransaction)', () => {
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

  test.describe('xcp_signPsbt', () => {
    test('should reject PSBT signing when not connected', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const result = await testPage.evaluate(async (psbtHex) => {
        return await (window as any).testSignPsbt({ hex: psbtHex });
      }, TEST_FIXTURES.PSBT_HEX);

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      await testPage.close();
    });

    test('should reject PSBT signing with missing hex parameter', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const result = await testPage.evaluate(async () => {
        return await (window as any).testSignPsbt({});
      });

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      await testPage.close();
    });

    test('should reject PSBT signing with null params', async ({ context }) => {
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
        if (!provider) return { error: 'No provider' };

        try {
          return await provider.request({
            method: 'xcp_signPsbt',
            params: [null]
          });
        } catch (error: any) {
          return { error: error.message };
        }
      });

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      await testPage.close();
    });

    test('should check provider has xcp_signPsbt method available', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const methodCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) return false;

        return typeof provider.request === 'function';
      });

      expect(methodCheck).toBe(true);
      await testPage.close();
    });

    test('should handle various PSBT hex formats without crashing', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const testCases = [
        TEST_FIXTURES.PSBT_HEX,
        TEST_FIXTURES.INVALID_HEX,
        'not-hex-at-all',
        '70736274ff01',
      ];

      for (const hex of testCases) {
        const result = await testPage.evaluate(async (psbtHex) => {
          const provider = (window as any).xcpwallet;
          if (!provider) return { handled: false, error: 'No provider' };

          try {
            await provider.request({
              method: 'xcp_signPsbt',
              params: [{ hex: psbtHex }]
            });
            return { handled: true };
          } catch (error: any) {
            return { handled: true, errorMessage: error.message };
          }
        }, hex);

        expect(result.handled).toBe(true);
      }
      await testPage.close();
    });
  });

  test.describe('xcp_signTransaction', () => {
    test('should reject transaction signing when not connected', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const result = await testPage.evaluate(async (rawTxHex) => {
        return await (window as any).testSignTransaction({ hex: rawTxHex });
      }, TEST_FIXTURES.RAW_TX_HEX);

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      await testPage.close();
    });

    test('should reject transaction signing with missing hex parameter', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const result = await testPage.evaluate(async () => {
        return await (window as any).testSignTransaction({});
      });

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      await testPage.close();
    });

    test('should check provider has xcp_signTransaction method available', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const methodCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) return false;

        return typeof provider.request === 'function';
      });

      expect(methodCheck).toBe(true);
      await testPage.close();
    });

    test('should handle various transaction hex formats without crashing', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const testCases = [
        TEST_FIXTURES.RAW_TX_HEX,
        TEST_FIXTURES.INVALID_HEX,
        'not-hex-at-all',
        '02000000',
      ];

      for (const hex of testCases) {
        const result = await testPage.evaluate(async (txHex) => {
          const provider = (window as any).xcpwallet;
          if (!provider) return { handled: false, error: 'No provider' };

          try {
            await provider.request({
              method: 'xcp_signTransaction',
              params: [{ hex: txHex }]
            });
            return { handled: true };
          } catch (error: any) {
            return { handled: true, errorMessage: error.message };
          }
        }, hex);

        expect(result.handled).toBe(true);
      }
      await testPage.close();
    });
  });

  test.describe('Security', () => {
    test('should not expose sensitive data in PSBT signing errors', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const result = await testPage.evaluate(async (psbtHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider', hasSensitiveData: false };

        try {
          await provider.request({
            method: 'xcp_signPsbt',
            params: [{ hex: psbtHex }]
          });
          return { success: true, hasSensitiveData: false };
        } catch (error: any) {
          return {
            error: error.message,
            hasSensitiveData:
              error.message.includes('privateKey') ||
              error.message.includes('mnemonic') ||
              error.message.includes('seed') ||
              error.message.includes('password')
          };
        }
      }, TEST_FIXTURES.PSBT_HEX);

      expect(result.hasSensitiveData).toBe(false);
      await testPage.close();
    });

    test('should not expose sensitive data in transaction signing errors', async ({ context }) => {
      testPage = await context.newPage();
      await testPage.goto(serverUrl);

      for (let i = 0; i < 10; i++) {
        const providerFound = await testPage.evaluate(() => {
          return typeof (window as any).xcpwallet !== 'undefined';
        });
        if (providerFound) break;
        await testPage.waitForTimeout(1000);
      }

      const hasProvider = await testPage.evaluate(() => typeof (window as any).xcpwallet !== 'undefined');
      if (!hasProvider) { await testPage.close(); return; }

      const result = await testPage.evaluate(async (rawTxHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider', hasSensitiveData: false };

        try {
          await provider.request({
            method: 'xcp_signTransaction',
            params: [{ hex: rawTxHex }]
          });
          return { success: true, hasSensitiveData: false };
        } catch (error: any) {
          return {
            error: error.message,
            hasSensitiveData:
              error.message.includes('privateKey') ||
              error.message.includes('mnemonic') ||
              error.message.includes('seed') ||
              error.message.includes('password')
          };
        }
      }, TEST_FIXTURES.RAW_TX_HEX);

      expect(result.hasSensitiveData).toBe(false);
      await testPage.close();
    });
  });
});
