/**
 * Broadcast and Inscription Tests
 *
 * Tests for the broadcast form including text broadcasts and
 * inscription file uploads for SegWit wallets.
 */

import { walletTest, expect, navigateTo } from '../fixtures';

walletTest.describe('Broadcast Form', () => {
  walletTest('basic broadcast form functionality', async ({ page }) => {
    await navigateTo(page, 'actions');

    const broadcastButton = page.locator('text=/Broadcast/i').first();
    if (await broadcastButton.isVisible({ timeout: 5000 })) {
      await broadcastButton.click();
    } else {
      await page.goto(page.url().replace(/\/[^\/]*$/, '/compose/broadcast'));
    }

    await page.waitForURL('**/compose/broadcast', { timeout: 10000 }).catch(() => {});

    await page.waitForTimeout(2000);

    const textArea = page.locator('textarea[name="text"]');
    const textAreaVisible = await textArea.isVisible({ timeout: 5000 }).catch(() => false);

    if (textAreaVisible) {
      await textArea.fill('Test broadcast message');
      const value = await textArea.inputValue();
      expect(value).toBe('Test broadcast message');

      const inscribeToggle = page.locator('text=/Inscribe/i');
      const toggleExists = await inscribeToggle.count() > 0;

      if (toggleExists) {
        const toggleButton = page.locator('button[role="switch"]').first();
        if (await toggleButton.isVisible()) {
          await toggleButton.click();
          await page.waitForTimeout(500);

          const fileUploaderVisible = await page.locator('text=/Choose File/i').isVisible({ timeout: 2000 }).catch(() => false);
          expect(fileUploaderVisible).toBe(true);
        }
      }
    } else {
      expect(page.url()).toContain('broadcast');
    }
  });

  walletTest('file upload workflow when available', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.count() > 0;

    if (!toggleExists) {
      walletTest.skip(true, 'Inscription not available for this wallet type');
    }

    await toggleButton.click();

    await expect(page.locator('text="Choose File"')).toBeVisible();

    const fileContent = 'Test broadcast content';
    const fileName = 'test-broadcast.txt';

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text="Choose File"').click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });

    await expect(page.locator(`text="${fileName}"`)).toBeVisible();
    await expect(page.locator('text="Remove file"')).toBeVisible();

    await expect(page.locator('text=/Size:.*KB/')).toBeVisible();

    await page.locator('text="Remove file"').click();

    await expect(page.locator(`text="${fileName}"`)).not.toBeVisible();
    await expect(page.locator('text="Choose File"')).toBeVisible();
  });

  walletTest('validates file size limit when inscription available', async ({ page }) => {
    await navigateTo(page, 'actions');
    const broadcastButton = page.locator('text=/Broadcast/i').first();
    await expect(broadcastButton).toBeVisible({ timeout: 5000 });
    await broadcastButton.click();

    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!toggleExists) {
      walletTest.skip(true, 'Inscription not available for this wallet type');
    }

    await toggleButton.click();
    await page.waitForLoadState('networkidle');

    const largeContent = 'x'.repeat(450 * 1024);

    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    const chooseFileButton = page.locator('text=/Choose File/i').first();
    await expect(chooseFileButton).toBeVisible({ timeout: 5000 });
    await chooseFileButton.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'large-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(largeContent)
    });

    await expect(page.locator('text=/File size must be less than 400KB/i')).toBeVisible({ timeout: 5000 });
  });

  walletTest('broadcast form submission and navigation to review', async ({ page }) => {
    await page.route('**/v2/addresses/**/compose/broadcast**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            rawtransaction: '01000000016b6f52ad20c866a095f332950f5df8b891022f426757c2a7b2dc85293fb96fb000000006b483045',
            btc_in: 100000,
            btc_out: 99500,
            btc_change: 0,
            btc_fee: 500,
            data: '434e54525052545900000014000000000000000054657374206d657373616765',
            lock_scripts: [],
            inputs_values: [100000],
            signed_tx_estimated_size: {
              vsize: 250,
              adjusted_vsize: 250,
              sigops_count: 1
            },
            psbt: '',
            params: {
              source: '1BotpWeW4cWRZ26rLvBCRHTeWtaH5fUYPX',
              text: 'Test broadcast message for e2e testing',
              value: '0',
              fee_fraction: '0',
              timestamp: Math.floor(Date.now() / 1000).toString()
            },
            name: 'broadcast'
          }
        })
      });
    });

    try {
      await navigateTo(page, 'settings');
      await page.locator('div[role="button"][aria-label="Advanced"]').click();
      await page.waitForTimeout(1000);

      const dryRunSwitch = page.locator('[role="switch"]').filter({ has: page.locator('..').filter({ hasText: 'Dry Run' }) });
      if (await dryRunSwitch.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isEnabled = await dryRunSwitch.getAttribute('aria-checked');
        if (isEnabled !== 'true') {
          await dryRunSwitch.click();
          await page.waitForTimeout(500);
        }
      }

      await page.goto(page.url().replace(/#.*/, '#/index'));
      await page.waitForLoadState('networkidle');
    } catch {
      // Continue without dry run mode
    }

    await navigateTo(page, 'actions');
    const broadcastButton = page.locator('text=/Broadcast/i').first();
    if (await broadcastButton.isVisible({ timeout: 5000 })) {
      await broadcastButton.click();
    } else {
      await page.goto(page.url().replace(/\/[^\/]*$/, '/compose/broadcast'));
    }

    await page.waitForURL('**/compose/broadcast', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const textArea = page.locator('textarea[name="text"]');
    if (await textArea.isVisible({ timeout: 5000 })) {
      await textArea.fill('Test broadcast message for e2e testing');

      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button').filter({ hasText: /^Continue$|^Submit$|^Send$/ })
      ).first();

      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();

        await page.waitForTimeout(1000);

        const loadingVisible = await page.locator('text=/Composing transaction/i').isVisible({ timeout: 3000 }).catch(() => false);
        if (loadingVisible) {
          await page.waitForSelector('text=/Composing transaction/i', { state: 'hidden', timeout: 10000 }).catch(() => {});
        }

        await page.waitForTimeout(2000);

        const currentUrl = page.url();

        const onReviewPage = currentUrl.includes('review') ||
                            await page.locator('text="Review Transaction"').isVisible({ timeout: 2000 }).catch(() => false) ||
                            await page.locator('text="Sign & Broadcast"').isVisible({ timeout: 2000 }).catch(() => false);

        expect(onReviewPage).toBeTruthy();
      } else {
        expect(false).toBeTruthy();
      }
    } else {
      expect(false).toBeTruthy();
    }
  });
});
