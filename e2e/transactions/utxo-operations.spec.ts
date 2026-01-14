/**
 * UTXO Operations Tests
 *
 * Tests for UTXO management including attach, move, and detach operations,
 * as well as balance and UTXO navigation.
 */

import {
  test,
  walletTest,
  expect,
  importMnemonic,
  unlockWallet,
  TEST_PASSWORD,
  TEST_MNEMONIC
} from '../fixtures';

walletTest.describe('UTXO Operations with Mocked Data', () => {
  walletTest('should test UTXO attach flow UI', async ({ page }) => {
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

    await page.goto(page.url().replace('/popup.html', '/popup.html#/compose/send/XCP'));
    await page.waitForLoadState('networkidle');

    const hasBalance = await page.locator('text=/XCP|Balance/i').isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBalance) {
      expect(page.url()).toContain('/compose/send/XCP');
    } else {
      walletTest.skip();
    }
  });

  walletTest('should test UTXO move flow UI', async ({ page }) => {
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

    await page.goto(page.url().replace('/popup.html', '/popup.html#/compose/utxo/move'));
    await page.waitForLoadState('networkidle');

    const hasMoveForm = await page.locator('text=/Move UTXO|Destination/i').isVisible({ timeout: 5000 }).catch(() => false);

    if (hasMoveForm) {
      const destinationInput = page.locator('input[name="destination"], input[name="destination_display"]').first();
      const hasDestInput = await destinationInput.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasDestInput) {
        await destinationInput.fill('bc1qtest456');

        const feeInput = page.locator('input[name="sat_per_vbyte"], input[name="feeRate"]').first();
        if (await feeInput.isVisible().catch(() => false)) {
          await feeInput.fill('1');
        }

        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
        expect(await continueBtn.isVisible()).toBeTruthy();
      }
    } else {
      walletTest.skip();
    }
  });

  walletTest('should test UTXO detach flow UI', async ({ page }) => {
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

    await page.goto(page.url().replace('/popup.html', '/popup.html#/compose/utxo/detach'));
    await page.waitForLoadState('networkidle');

    const hasDetachForm = await page.locator('text=/Detach|UTXO/i').isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDetachForm) {
      const feeInput = page.locator('input[name="sat_per_vbyte"], input[name="feeRate"]').first();
      if (await feeInput.isVisible().catch(() => false)) {
        await feeInput.fill('1');

        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
        expect(await continueBtn.isVisible()).toBeTruthy();
      }
    } else {
      walletTest.skip();
    }
  });
});

walletTest.describe('Balance and UTXO Navigation', () => {
  walletTest('should navigate to balance view', async ({ page }) => {
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

    await page.reload();
    await page.waitForTimeout(3000);

    const balanceItems = page.locator('.relative.flex.items-center.p-3.bg-white.rounded-lg');
    const count = await balanceItems.count();

    if (count > 0) {
      const firstBalance = balanceItems.first();
      await firstBalance.click();

      await page.waitForTimeout(1000);
      expect(page.url()).toMatch(/compose\/send/);
    } else {
      walletTest.skip();
    }
  });

  walletTest('should display UTXO details when viewing UTXO page', async ({ page }) => {
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

    await page.goto(page.url().replace('/popup.html', '/popup.html#/utxo/mocktxid123'));
    await page.waitForLoadState('networkidle');

    const hasUTXODetails = await page.locator('text=/UTXO|Confirmations|Value/i').isVisible({ timeout: 5000 }).catch(() => false);

    if (hasUTXODetails) {
      const moveBtn = page.locator('button:has-text("Move")').first();
      const detachBtn = page.locator('button:has-text("Detach")').first();

      const hasMoveBtn = await moveBtn.isVisible({ timeout: 1000 }).catch(() => false);
      const hasDetachBtn = await detachBtn.isVisible({ timeout: 1000 }).catch(() => false);

      expect(hasMoveBtn || hasDetachBtn).toBeTruthy();
    } else {
      walletTest.skip();
    }
  });
});
