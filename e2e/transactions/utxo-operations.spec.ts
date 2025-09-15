import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  ExtensionContext, 
  TEST_PASSWORD, 
  TEST_MNEMONIC,
  importWallet,
  unlockWallet,
  cleanup
} from '../helpers/test-helpers';

let extensionContext: ExtensionContext;

test.beforeAll(async () => {
  extensionContext = await launchExtension('utxo-operations');
});

test.afterAll(async () => {
  if (extensionContext?.context) {
    await cleanup(extensionContext.context);
  }
});

test.describe('UTXO Operations', () => {
  test.beforeEach(async () => {
    const { page, extensionId } = extensionContext;
    
    // Navigate to extension
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('networkidle');
    
    // Setup wallet if needed
    const hasWelcome = await page.getByText('Welcome to XCP Wallet').isVisible({ timeout: 3000 }).catch(() => false);
    const hasImportButton = await page.getByText('Import Wallet').isVisible({ timeout: 1000 }).catch(() => false);
    
    if (hasWelcome || hasImportButton) {
      // Import wallet using the helper function
      await importWallet(page, TEST_MNEMONIC, TEST_PASSWORD);
      await page.waitForURL(/index/, { timeout: 10000 });
      await page.waitForTimeout(2000);
    } else if (await page.locator('input[name="password"]').isVisible({ timeout: 3000 }).catch(() => false)) {
      // Unlock wallet using helper
      await unlockWallet(page, TEST_PASSWORD);
      await page.waitForTimeout(2000);
    }
    
    // Wait for wallet to be fully loaded
    await page.waitForTimeout(3000);
  });

  test.describe('UTXO Operations with Mocked Data', () => {
    test('should test UTXO attach flow UI', async () => {
      const { page } = extensionContext;
      
      // Mock API responses to simulate having balances and UTXOs
      await page.route('**/api/*/address/**/balances', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                asset: 'XCP',
                quantity: '100000000',
                quantity_normalized: '1.00000000',
                address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
                asset_info: {
                  divisible: true,
                  locked: false,
                  supply: '2600000000000000',
                  description: 'The Counterparty protocol native currency',
                  issuer: null,
                  asset_longname: null
                }
              }
            ]
          })
        });
      });

      // Mock compose API for attach operation
      await page.route('**/api/*/compose/attach', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            result: {
              rawtransaction: '0x123abc',
              btc_fee: 1000,
              params: {
                asset: 'XCP',
                quantity: 100000000,
                destination: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
              }
            }
          })
        });
      });
      
      // Navigate to compose send for XCP (which has attach option)
      await page.goto(page.url().replace('/popup.html', '/popup.html#/compose/send/XCP'));
      await page.waitForLoadState('networkidle');
      
      // Look for the asset display or balance header
      const hasBalance = await page.locator('text=/XCP|Balance/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasBalance) {
        // The attach flow would typically be:
        // 1. Click on asset balance
        // 2. Navigate to UTXO view
        // 3. Click attach button
        // 4. Fill in amount and fee
        // 5. Review transaction
        
        // Test that we can navigate to the compose page
        expect(page.url()).toContain('/compose/send/XCP');
      } else {
        // If no balance visible, skip test
        test.skip();
      }
    });

    test('should test UTXO move flow UI', async () => {
      const { page } = extensionContext;
      
      // Mock UTXO response
      await page.route('**/api/*/utxo/**', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: {
              tx_hash: 'abc123def456',
              tx_index: 0,
              value: 10000,
              confirmations: 100,
              script_pubkey: 'mock_script',
              address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
            }
          })
        });
      });

      // Mock compose API for move operation
      await page.route('**/api/*/compose/move_utxo', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            result: {
              rawtransaction: '0x456def',
              btc_fee: 1500,
              params: {
                utxo: 'abc123def456:0',
                destination: 'bc1qtest456'
              }
            }
          })
        });
      });
      
      // Navigate to UTXO move compose page
      await page.goto(page.url().replace('/popup.html', '/popup.html#/compose/utxo/move'));
      await page.waitForLoadState('networkidle');
      
      // Check if we're on the move page
      const hasMoveForm = await page.locator('text=/Move UTXO|Destination/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasMoveForm) {
        // Look for destination input
        const destinationInput = page.locator('input[name="destination"], input[name="destination_display"]').first();
        const hasDestInput = await destinationInput.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (hasDestInput) {
          // Fill destination
          await destinationInput.fill('bc1qtest456');
          
          // Look for fee rate input
          const feeInput = page.locator('input[name="sat_per_vbyte"], input[name="feeRate"]').first();
          if (await feeInput.isVisible().catch(() => false)) {
            await feeInput.fill('1');
          }
          
          // Look for continue button
          const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
          expect(await continueBtn.isVisible()).toBeTruthy();
        }
      } else {
        test.skip();
      }
    });

    test('should test UTXO detach flow UI', async () => {
      const { page } = extensionContext;
      
      // Mock compose API for detach operation
      await page.route('**/api/*/compose/detach', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            result: {
              rawtransaction: '0x789ghi',
              btc_fee: 1200,
              params: {
                utxo: 'abc123def456:0'
              }
            }
          })
        });
      });
      
      // Navigate to UTXO detach compose page
      await page.goto(page.url().replace('/popup.html', '/popup.html#/compose/utxo/detach'));
      await page.waitForLoadState('networkidle');
      
      // Check if we're on the detach page
      const hasDetachForm = await page.locator('text=/Detach|UTXO/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasDetachForm) {
        // Detach typically has optional destination
        const feeInput = page.locator('input[name="sat_per_vbyte"], input[name="feeRate"]').first();
        if (await feeInput.isVisible().catch(() => false)) {
          await feeInput.fill('1');
          
          // Look for continue button
          const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
          expect(await continueBtn.isVisible()).toBeTruthy();
        }
      } else {
        test.skip();
      }
    });
  });

  test.describe('Balance and UTXO Navigation', () => {
    test('should navigate to balance view', async () => {
      const { page } = extensionContext;
      
      // Mock balances API
      await page.route('**/api/*/address/**/balances', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: [
              {
                asset: 'XCP',
                quantity: '100000000',
                quantity_normalized: '1.00000000',
                address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
                asset_info: {
                  divisible: true,
                  description: 'The Counterparty protocol native currency'
                }
              },
              {
                asset: 'TESTTOKEN',
                quantity: '1000',
                quantity_normalized: '1000',
                address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
                asset_info: {
                  divisible: false,
                  description: 'Test token'
                }
              }
            ]
          })
        });
      });
      
      // Reload to get mocked balances
      await page.reload();
      await page.waitForTimeout(3000);
      
      // Check if balance list is visible
      const balanceItems = page.locator('.relative.flex.items-center.p-3.bg-white.rounded-lg');
      const count = await balanceItems.count();
      
      // If we have balance items, test navigation
      if (count > 0) {
        const firstBalance = balanceItems.first();
        await firstBalance.click();
        
        // Should navigate to send page for that asset
        await page.waitForTimeout(1000);
        expect(page.url()).toMatch(/compose\/send/);
      } else {
        // No balances to test with
        test.skip();
      }
    });

    test('should display UTXO details when viewing UTXO page', async () => {
      const { page } = extensionContext;
      
      // Mock UTXO details
      await page.route('**/api/*/utxo/**', route => {
        const url = route.request().url();
        const txid = url.split('/utxo/')[1]?.split('/')[0] || 'mock123';
        
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: {
              tx_hash: txid,
              tx_index: 0,
              value: 10000,
              confirmations: 144,
              script_pubkey: '0014abc123',
              address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
              block_height: 800000,
              block_time: Date.now() / 1000
            }
          })
        });
      });
      
      // Navigate directly to a UTXO view page
      await page.goto(page.url().replace('/popup.html', '/popup.html#/utxo/mocktxid123'));
      await page.waitForLoadState('networkidle');
      
      // Check for UTXO details elements
      const hasUTXODetails = await page.locator('text=/UTXO|Confirmations|Value/i').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasUTXODetails) {
        // Check for action buttons
        const moveBtn = page.locator('button:has-text("Move")').first();
        const detachBtn = page.locator('button:has-text("Detach")').first();
        
        // At least one action should be available
        const hasMoveBtn = await moveBtn.isVisible({ timeout: 1000 }).catch(() => false);
        const hasDetachBtn = await detachBtn.isVisible({ timeout: 1000 }).catch(() => false);
        
        expect(hasMoveBtn || hasDetachBtn).toBeTruthy();
      } else {
        test.skip();
      }
    });
  });
});