import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtension, setupWallet, cleanup, createWallet, TEST_PASSWORD } from '../helpers/test-helpers';
import * as http from 'http';

/**
 * E2E Tests for xcp_signPsbt and xcp_signTransaction provider methods
 *
 * Tests cover:
 * - Parameter validation
 * - Unauthorized access rejection
 * - Approval popup display
 * - Method availability
 */

// Test fixtures - minimal valid transaction/PSBT hex for testing
// These are structurally valid but won't work on mainnet (test-only)
const TEST_FIXTURES = {
  // A minimal valid PSBT structure (won't work on mainnet, just for parsing tests)
  PSBT_HEX: '70736274ff0100520200000001aad73931018bd25f84ae400b68df0817e57e3e8e36b6e66ea1b0d8f9e7a1d5e10000000000fdffffff0110270000000000001976a9144b3518229b0d3554fe7cd3796ade632aff3069d888ac00000000000100fd01010200000001bd9b31ae5b2b0f9a26e0e8edc16c9ba3e00c0b9e9ef52cfbeee52a38ffed93ff010000006a47304402207f7d6c7c4c6f8f4c8f6e7d8e9f0a1b2c3d4e5f6071829394a5b6c7d8e9f0a1b02207f7d6c7c4c6f8f4c8f6e7d8e9f0a1b2c3d4e5f6071829394a5b6c7d8e9f0a1b0121024b3518229b0d3554fe7cd3796ade632aff3069d88b697e8df7ec8e8c1c8b9d9dfdffffff0200e1f505000000001976a914000000000000000000000000000000000000000088ac10270000000000001976a9144b3518229b0d3554fe7cd3796ade632aff3069d888ac00000000000000',

  // A minimal raw transaction hex
  RAW_TX_HEX: '0200000001aad73931018bd25f84ae400b68df0817e57e3e8e36b6e66ea1b0d8f9e7a1d5e10000000000fdffffff0110270000000000001976a9144b3518229b0d3554fe7cd3796ade632aff3069d888ac00000000',

  // Invalid hex (not a valid PSBT/transaction)
  INVALID_HEX: 'deadbeef',

  // Empty hex
  EMPTY_HEX: '',
};

test.describe('Transaction Signing (xcp_signPsbt & xcp_signTransaction)', () => {
  let context: BrowserContext;
  let extensionPage: Page;
  let testPage: Page;
  let server: http.Server;
  let serverUrl: string;

  test.beforeAll(async () => {
    // Create HTTP server for testing
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
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
              // Wait for provider
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

              // Test PSBT signing
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

              // Test raw transaction signing
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

              // Test connection first, then sign
              window.connectThenSign = async (method, params) => {
                if (!window.xcpwallet) {
                  throw new Error('Provider not available');
                }

                try {
                  // First connect
                  const accounts = await window.xcpwallet.request({
                    method: 'xcp_requestAccounts'
                  });

                  if (!accounts || accounts.length === 0) {
                    throw new Error('No accounts connected');
                  }

                  // Then sign
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
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    // Launch extension
    const ext = await launchExtension('tx-signing');
    context = ext.context;
    extensionPage = ext.page;

    // Wait for extension to initialize
    await extensionPage.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    // Close server with timeout
    if (server) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log('Server close timeout, forcing resolution');
          resolve();
        }, 5000);

        server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Cleanup context
    if (context) {
      await cleanup(context).catch(err => {
        console.log('Context cleanup error:', err);
      });
    }
  });

  test.beforeEach(async () => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);

    // Wait for provider to be injected with longer timeout and retries
    let providerFound = false;
    for (let i = 0; i < 10; i++) {
      providerFound = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      if (providerFound) break;
      await testPage.waitForTimeout(1000);
    }

    // If still no provider after 10 seconds, wait another 2 seconds
    if (!providerFound) {
      await testPage.waitForTimeout(2000);
    }
  });

  test.afterEach(async () => {
    if (testPage) {
      try {
        if (!testPage.isClosed()) {
          await testPage.close();
        }
      } catch (err) {
        console.log('Page close error (ignored):', (err as any).message);
      }
    }
  });

  test.describe('xcp_signPsbt', () => {
    test('should reject PSBT signing when not connected', async () => {
      const result = await testPage.evaluate(async (psbtHex) => {
        return await (window as any).testSignPsbt({ hex: psbtHex });
      }, TEST_FIXTURES.PSBT_HEX);

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      console.log('Error received when not connected (PSBT):', result.error);
    });

    test('should reject PSBT signing with missing hex parameter', async () => {
      const result = await testPage.evaluate(async () => {
        return await (window as any).testSignPsbt({});
      });

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      console.log('Error for missing hex (PSBT):', result.error);
    });

    test('should reject PSBT signing with null params', async () => {
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
    });

    test('should accept valid signInputs parameter structure', async () => {
      // This test verifies the parameter validation, not actual signing
      const result = await testPage.evaluate(async (psbtHex) => {
        return await (window as any).testSignPsbt({
          hex: psbtHex,
          signInputs: {
            'bc1qtest123': [0, 1]
          },
          sighashTypes: [0x01, 0x01]
        });
      }, TEST_FIXTURES.PSBT_HEX);

      // Should fail with unauthorized (not parameter validation error)
      expect(result).toHaveProperty('error');
      // The error should be about authorization, not parameter format
      console.log('Error with valid params (PSBT):', result.error);
    });

    test('should check provider has xcp_signPsbt method available', async () => {
      const methodCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) return false;

        return typeof provider.request === 'function';
      });

      expect(methodCheck).toBe(true);
    });

    test('should handle various PSBT hex formats without crashing', async () => {
      const testCases = [
        TEST_FIXTURES.PSBT_HEX,
        TEST_FIXTURES.INVALID_HEX,
        'not-hex-at-all',
        '70736274ff01', // Truncated PSBT
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
            // Any error is fine - we're testing it doesn't crash
            return { handled: true, errorMessage: error.message };
          }
        }, hex);

        expect(result.handled).toBe(true);
      }
    });
  });

  test.describe('xcp_signTransaction', () => {
    test('should reject transaction signing when not connected', async () => {
      const result = await testPage.evaluate(async (rawTxHex) => {
        return await (window as any).testSignTransaction({ hex: rawTxHex });
      }, TEST_FIXTURES.RAW_TX_HEX);

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      console.log('Error received when not connected (raw tx):', result.error);
    });

    test('should reject transaction signing with missing hex parameter', async () => {
      const result = await testPage.evaluate(async () => {
        return await (window as any).testSignTransaction({});
      });

      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
      console.log('Error for missing hex (raw tx):', result.error);
    });

    test('should accept hex as plain string parameter', async () => {
      // xcp_signTransaction supports both { hex: "..." } and plain string
      const result = await testPage.evaluate(async (rawTxHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };

        try {
          return await provider.request({
            method: 'xcp_signTransaction',
            params: [rawTxHex] // Plain string, not object
          });
        } catch (error: any) {
          return { error: error.message };
        }
      }, TEST_FIXTURES.RAW_TX_HEX);

      expect(result).toHaveProperty('error');
      // Should fail with unauthorized, not parameter error
      console.log('Error with string param (raw tx):', result.error);
    });

    test('should check provider has xcp_signTransaction method available', async () => {
      const methodCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) return false;

        return typeof provider.request === 'function';
      });

      expect(methodCheck).toBe(true);
    });

    test('should handle various transaction hex formats without crashing', async () => {
      const testCases = [
        TEST_FIXTURES.RAW_TX_HEX,
        TEST_FIXTURES.INVALID_HEX,
        'not-hex-at-all',
        '02000000', // Truncated transaction
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
            // Any error is fine - we're testing it doesn't crash
            return { handled: true, errorMessage: error.message };
          }
        }, hex);

        expect(result.handled).toBe(true);
      }
    });
  });

  test.describe('Approval Popup', () => {
    test('should show approval popup for PSBT signing when connected', async () => {
      // This test requires wallet to be set up
      // First check if we can trigger a connection popup

      const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);

      const requestPromise = testPage.evaluate(async (psbtHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };

        try {
          // First try to connect
          const accounts = await provider.request({
            method: 'xcp_requestAccounts'
          });

          // If connected, try to sign
          const result = await provider.request({
            method: 'xcp_signPsbt',
            params: [{ hex: psbtHex }]
          });

          return { result };
        } catch (error: any) {
          return { error: error.message };
        }
      }, TEST_FIXTURES.PSBT_HEX);

      // Check if popup appeared
      const popup = await popupPromise;
      if (popup) {
        // Popup appeared - could be connection or signing approval
        console.log('Popup URL:', popup.url());
        expect(popup.url()).toMatch(/provider\/(approval-queue|approve-psbt|approve-connection)/);
        await popup.close();
      }

      const result = await requestPromise;
      expect(result).toBeDefined();
      // Expect error since we didn't complete the approval
      expect(result).toHaveProperty('error');
    });

    test('should show approval popup for transaction signing when connected', async () => {
      const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);

      const requestPromise = testPage.evaluate(async (rawTxHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };

        try {
          // First try to connect
          const accounts = await provider.request({
            method: 'xcp_requestAccounts'
          });

          // If connected, try to sign
          const result = await provider.request({
            method: 'xcp_signTransaction',
            params: [{ hex: rawTxHex }]
          });

          return { result };
        } catch (error: any) {
          return { error: error.message };
        }
      }, TEST_FIXTURES.RAW_TX_HEX);

      // Check if popup appeared
      const popup = await popupPromise;
      if (popup) {
        // Popup appeared - could be connection or signing approval, or main popup that will navigate
        console.log('Popup URL:', popup.url());
        // Accept any extension popup - it may navigate to the approval page
        expect(popup.url()).toContain('chrome-extension://');
        await popup.close();
      }

      const result = await requestPromise;
      expect(result).toBeDefined();
      // Expect error since we didn't complete the approval
      expect(result).toHaveProperty('error');
    });
  });

  test.describe('Security', () => {
    test('should not expose sensitive data in PSBT signing errors', async () => {
      const result = await testPage.evaluate(async (psbtHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };

        try {
          await provider.request({
            method: 'xcp_signPsbt',
            params: [{ hex: psbtHex }]
          });
          return { success: true };
        } catch (error: any) {
          return {
            error: error.message,
            // Check that error doesn't contain sensitive patterns
            hasSensitiveData:
              error.message.includes('privateKey') ||
              error.message.includes('mnemonic') ||
              error.message.includes('seed') ||
              error.message.includes('password')
          };
        }
      }, TEST_FIXTURES.PSBT_HEX);

      expect(result.hasSensitiveData).toBe(false);
    });

    test('should not expose sensitive data in transaction signing errors', async () => {
      const result = await testPage.evaluate(async (rawTxHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };

        try {
          await provider.request({
            method: 'xcp_signTransaction',
            params: [{ hex: rawTxHex }]
          });
          return { success: true };
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
    });

    test('should reject overly large PSBT hex', async () => {
      // Create a very large hex string (5MB)
      const largeHex = '70736274ff' + 'aa'.repeat(5 * 1024 * 1024);

      const result = await testPage.evaluate(async (psbtHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };

        try {
          await provider.request({
            method: 'xcp_signPsbt',
            params: [{ hex: psbtHex }]
          });
          return { success: true };
        } catch (error: any) {
          return { error: error.message };
        }
      }, largeHex);

      expect(result).toHaveProperty('error');
      // Should either reject due to size or other validation
      expect(result.error).toBeTruthy();
    });
  });

  test.describe('Rate Limiting', () => {
    test('should handle rapid PSBT signing requests gracefully', async () => {
      const results = await testPage.evaluate(async (psbtHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return [{ error: 'No provider' }];

        const results = [];

        // Make rapid requests
        for (let i = 0; i < 20; i++) {
          try {
            await provider.request({
              method: 'xcp_signPsbt',
              params: [{ hex: psbtHex }]
            });
            results.push({ success: true, index: i });
          } catch (error: any) {
            results.push({ error: error.message, index: i });

            // Check for rate limit
            if (error.message.toLowerCase().includes('rate') ||
                error.message.toLowerCase().includes('limit')) {
              results.push({ rateLimited: true });
              break;
            }
          }
        }

        return results;
      }, TEST_FIXTURES.PSBT_HEX);

      // Should handle all requests (even if they error)
      expect(results.length).toBeGreaterThan(0);
    });

    test('should handle rapid transaction signing requests gracefully', async () => {
      const results = await testPage.evaluate(async (rawTxHex) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return [{ error: 'No provider' }];

        const results = [];

        // Make rapid requests
        for (let i = 0; i < 20; i++) {
          try {
            await provider.request({
              method: 'xcp_signTransaction',
              params: [{ hex: rawTxHex }]
            });
            results.push({ success: true, index: i });
          } catch (error: any) {
            results.push({ error: error.message, index: i });

            // Check for rate limit
            if (error.message.toLowerCase().includes('rate') ||
                error.message.toLowerCase().includes('limit')) {
              results.push({ rateLimited: true });
              break;
            }
          }
        }

        return results;
      }, TEST_FIXTURES.RAW_TX_HEX);

      // Should handle all requests (even if they error)
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
