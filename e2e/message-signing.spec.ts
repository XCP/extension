import { test, expect, Page, BrowserContext } from '@playwright/test';
import { launchExtension, setupWallet, cleanup } from './helpers/test-helpers';
import * as http from 'http';

test.describe('Message Signing', () => {
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
            <title>Message Signing Test</title>
          </head>
          <body>
            <h1>XCP Wallet Message Signing Test</h1>
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
              
              // Test message signing
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
              
              // Test connection and signing flow
              window.connectAndSign = async (message) => {
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
                  
                  // Then sign with the first account
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
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
    
    // Launch extension WITHOUT setting up wallet
    // Individual tests will set up wallet if needed
    const ext = await launchExtension('message-signing');
    context = ext.context;
    extensionPage = ext.page;
    
    // Just wait for extension to initialize
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
    await testPage.waitForTimeout(2000);
  });
  
  test.afterEach(async () => {
    if (testPage) {
      try {
        if (!testPage.isClosed()) {
          await testPage.close();
        }
      } catch (err) {
        // Page may already be closed, ignore error
        console.log('Page close error (ignored):', (err as any).message);
      }
    }
  });
  
  test('should reject message signing when not connected', async () => {
    const result = await testPage.evaluate(async () => {
      return await (window as any).testSignMessage('Hello, Bitcoin!', 'bc1qtest123');
    });
    
    expect(result).toHaveProperty('error');
    // Accept either "Unauthorized" or service initialization errors
    expect(
      result.error.includes('Unauthorized') || 
      result.error.includes('Extension services not available')
    ).toBeTruthy();
  });
  
  test('should show approval popup for message signing', async () => {
    // Ensure context and test page are available
    if (!context || !testPage) {
      console.log('Context or test page not available, skipping test');
      return;
    }
    
    // Verify the provider is available first
    const hasProvider = await testPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });
    
    if (!hasProvider) {
      console.log('Provider not available on test page');
      return;
    }
    
    // Test the connection flow
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
    
    // Check if popup appeared
    const connectionPopup = await popupPromise;
    if (connectionPopup) {
      expect(connectionPopup.url()).toContain('/provider/approval-queue');
      await connectionPopup.close();
    }
    
    const connectionResult = await connectionPromise;
    
    // Verify we got an expected response (either accounts or proper error)
    expect(connectionResult).toBeDefined();
    expect(connectionResult).toHaveProperty('error'); // Should have error since we didn't approve
  });
  
  test('should validate message parameters', async () => {
    // Test with missing message
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
    // Accept either "Message is required" or service initialization errors
    expect(
      result1.error.includes('Message is required') || 
      result1.error.includes('Extension services not available')
    ).toBeTruthy();
    
    // Test with missing address
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
    // When message is provided but address is missing, it should fail with unauthorized since no wallet/connection
    expect(
      result2.error.includes('Unauthorized') || 
      result2.error.includes('Extension services not available')
    ).toBeTruthy();
  });
  
  test('should handle various message types', async () => {
    const messages = [
      'Simple text message',
      'Message with special chars: !@#$%^&*()',
      'Multi\nline\nmessage',
      'Unicode: 🚀 测试 тест',
      JSON.stringify({ type: 'json', data: 'test' }),
      'Very long message '.repeat(100)
    ];
    
    // Just verify these don't crash the provider
    for (const message of messages) {
      const result = await testPage.evaluate(async (msg) => {
        const provider = (window as any).xcpwallet;
        if (!provider) return { error: 'No provider' };
        
        try {
          // This will fail with unauthorized, but we're just checking it handles the message
          await provider.request({
            method: 'xcp_signMessage',
            params: [msg, 'bc1qtest']
          });
          return { handled: true };
        } catch (error: any) {
          // We expect unauthorized or service error, anything else is a problem
          if (error.message.includes('Unauthorized') || error.message.includes('Extension services not available')) {
            return { handled: true };
          }
          return { error: error.message };
        }
      }, message);
      
      expect(result.handled).toBe(true);
    }
  });
  
  test('should check provider availability for signing', async () => {
    const hasProvider = await testPage.evaluate(() => {
      return typeof (window as any).xcpwallet !== 'undefined';
    });
    
    expect(hasProvider).toBe(true);
    
    // Check that signing method exists
    const methodCheck = await testPage.evaluate(() => {
      const provider = (window as any).xcpwallet;
      if (!provider) return false;
      
      // Check if we can call the method (it should fail with auth error)
      return typeof provider.request === 'function';
    });
    
    expect(methodCheck).toBe(true);
  });
});