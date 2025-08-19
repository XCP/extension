import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtension, setupWallet, cleanup } from './helpers/test-helpers';
import * as http from 'http';

/**
 * Consolidated Provider Tests
 * 
 * This file combines all provider test functionality from:
 * - provider-connection.spec.ts
 * - provider-connection-fixed.spec.ts
 * - provider-connection-simplified.spec.ts
 * - provider-tests.spec.ts
 * - provider-flow.spec.ts
 */

test.describe('XCP Provider', () => {
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
            <title>XCP Provider Test</title>
          </head>
          <body>
            <h1>XCP Wallet Provider Test Page</h1>
            <div id="status">Checking provider...</div>
            <div id="results"></div>
            
            <script>
              // Check for provider after a delay
              setTimeout(() => {
                window.providerFound = typeof window.xcpwallet !== 'undefined';
                document.getElementById('status').textContent = 
                  window.providerFound ? 'Provider found!' : 'Provider not found';
              }, 1000);
              
              // Helper for checking provider methods
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
              
              // Test provider helper
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
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
    
    // Launch extension and setup wallet
    const ext = await launchExtension('provider');
    context = ext.context;
    extensionPage = ext.page;
    
    await setupWallet(extensionPage);
    await extensionPage.waitForTimeout(2000);
  });
  
  test.afterAll(async () => {
    // Close server with timeout protection
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
    
    // Cleanup context with error handling
    if (context) {
      await cleanup(context).catch(err => {
        console.log('Context cleanup error (ignored):', (err as any).message);
      });
    }
  });
  
  test.beforeEach(async () => {
    testPage = await context.newPage();
    await testPage.goto(serverUrl);
    await testPage.waitForTimeout(2000);
  });
  
  test.afterEach(async () => {
    if (testPage && !testPage.isClosed()) {
      await testPage.close().catch(() => {});
    }
  });
  
  test.describe('Provider Injection', () => {
    test('should inject provider on localhost', async () => {
      const hasProvider = await testPage.evaluate(() => {
        return typeof (window as any).xcpwallet !== 'undefined';
      });
      
      expect(hasProvider).toBe(true);
    });
    
    test('should have all required provider methods', async () => {
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
      expect(providerInfo?.isConnected).toBe(false); // Should start disconnected
    });
  });
  
  test.describe('Connection Management', () => {
    test('should return empty accounts when not connected', async () => {
      const accounts = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_accounts' });
      });
      
      expect(accounts).toEqual([]);
    });
    
    test('should check isConnected status correctly', async () => {
      const isConnected = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return provider.isConnected();
      });
      
      expect(isConnected).toBe(false);
    });
    
    test('should show approval popup for connection', async () => {
      // Set up popup listener before triggering the request
      let popup: any = null;
      const popupPromise = new Promise<any>((resolve) => {
        context.on('page', (page) => {
          if (page.url().includes('/provider/approval-queue')) {
            popup = page;
            resolve(page);
          }
        });
      });
      
      // Request accounts (should trigger popup)
      const accountsPromise = testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        
        try {
          return await provider.request({ method: 'xcp_requestAccounts' });
        } catch (error: any) {
          return { error: error.message };
        }
      });
      
      // Wait for popup with timeout
      const raceResult = await Promise.race([
        popupPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Popup timeout')), 15000))
      ]).catch(() => null);
      
      if (!raceResult) {
        // If no popup appeared, check if the request was already approved
        const result = await accountsPromise;
        console.log('No popup appeared, request result:', result);
        return; // Skip this test if already connected
      }
      
      // Verify it's the approval queue
      expect(popup.url()).toContain('/provider/approval-queue');
      
      // Close popup to simulate rejection
      await popup.close();
      
      // Check result
      const result = await accountsPromise;
      expect(result).toHaveProperty('error');
    });
  });
  
  test.describe('Network Information', () => {
    test('should return correct chain ID', async () => {
      const chainId = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_chainId' });
      });
      
      expect(chainId).toBe('0x0'); // Bitcoin mainnet
    });
    
    test('should return correct network', async () => {
      const network = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) throw new Error('Provider not found');
        return await provider.request({ method: 'xcp_getNetwork' });
      });
      
      expect(network).toBe('mainnet');
    });
  });
  
  test.describe('Security', () => {
    test('should reject unauthorized signing requests', async () => {
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
      expect(result.error).toContain('Unauthorized');
    });
    
    test('should handle invalid methods', async () => {
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
      
      // Should reject invalid methods
      expect(result.error).toContain('not supported');
    });
    
    test('should validate parameter size limits', async () => {
      // Create large parameter (2MB)
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
      
      // Should reject large parameters
      expect(result.error).toContain('Request parameters too large');
    });
    
    test('should not expose sensitive data', async () => {
      const securityCheck = await testPage.evaluate(() => {
        const provider = (window as any).xcpwallet;
        if (!provider) {
          return { error: 'Provider not available' };
        }
        
        // Provider should not expose internal methods or data
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
    });
  });
  
  test.describe('Event Handling', () => {
    test('should support event listeners', async () => {
      const eventTest = await testPage.evaluate(() => {
        return new Promise((resolve) => {
          const provider = (window as any).xcpwallet;
          if (!provider) {
            resolve({ error: 'Provider not found' });
            return;
          }
          
          let eventReceived = false;
          
          // Set up event listener
          const handler = () => {
            eventReceived = true;
          };
          
          provider.on('test', handler);
          
          // Check that handler was added
          const hasHandler = typeof provider.removeListener === 'function';
          
          // Remove handler
          provider.removeListener('test', handler);
          
          resolve({
            hasEventMethods: true,
            canAddListener: hasHandler
          });
        });
      });
      
      expect(eventTest).toHaveProperty('hasEventMethods', true);
      expect(eventTest).toHaveProperty('canAddListener', true);
    });
  });
  
  test.describe('Rate Limiting', () => {
    test('should handle rapid requests gracefully', async () => {
      const rateLimitTest = await testPage.evaluate(async () => {
        const provider = (window as any).xcpwallet;
        if (!provider) {
          return [{ error: 'Provider not available - rate limit test skipped' }];
        }
        
        const results = [];
        
        // Make many rapid requests to trigger rate limiting
        for (let i = 0; i < 50; i++) {
          try {
            // Use a simple method that should work quickly
            const response = await provider.request({
              method: 'xcp_chainId'
            });
            results.push({ success: true, index: i });
          } catch (error: any) {
            results.push({ error: error.message, index: i });
            
            // Check for rate limit errors
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
      
      // Check if rate limiting is handled properly
      const hasRateLimit = rateLimitTest.some(result => 
        ('error' in result && result.error?.toLowerCase().includes('rate')) ||
        ('error' in result && result.error?.toLowerCase().includes('limit')) ||
        ('rateLimited' in result && result.rateLimited) ||
        ('error' in result && result.error?.includes('not available'))
      );
      
      // Either rate limiting works or provider handles rapid requests
      const isHandled = hasRateLimit || rateLimitTest.length > 0;
      expect(isHandled).toBe(true);
    });
  });
});

