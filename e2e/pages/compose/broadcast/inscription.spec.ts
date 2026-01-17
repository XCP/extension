/**
 * Compose Broadcast Inscription Tests (/compose/broadcast)
 *
 * Tests for inscription (file upload) functionality in broadcast form.
 * This is available for SegWit wallet types.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose, actions } from '../../../selectors';

walletTest.describe('Compose Broadcast Inscription (/compose/broadcast)', () => {
  walletTest('inscription toggle shows file uploader', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!toggleExists) {
      walletTest.skip(true, 'Inscription not available for this wallet type');
      return;
    }

    await toggleButton.click();
    await page.waitForTimeout(500);

    const fileUploaderVisible = await page.locator('text=/Choose File/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(fileUploaderVisible).toBe(true);
  });

  walletTest('file upload workflow', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!toggleExists) {
      walletTest.skip(true, 'Inscription not available for this wallet type');
      return;
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

    // File should appear
    await expect(page.locator(`text="${fileName}"`)).toBeVisible();
    await expect(page.locator('text="Remove file"')).toBeVisible();

    // File size should show
    await expect(page.locator('text=/Size:.*KB/')).toBeVisible();

    // Remove file
    await page.locator('text="Remove file"').click();
    await expect(page.locator(`text="${fileName}"`)).not.toBeVisible();
    await expect(page.locator('text="Choose File"')).toBeVisible();
  });

  walletTest('validates file size limit', async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!toggleExists) {
      walletTest.skip(true, 'Inscription not available for this wallet type');
      return;
    }

    await toggleButton.click();
    await page.waitForLoadState('networkidle');

    // Create a file larger than 400KB limit
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

    // Should show error about file size
    await expect(page.locator('text=/File size must be less than 400KB/i')).toBeVisible({ timeout: 5000 });
  });

  walletTest('broadcast form submission navigates to review', async ({ page }) => {
    // Mock the compose endpoint
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
              text: 'Test broadcast message',
              value: '0',
              fee_fraction: '0',
              timestamp: Math.floor(Date.now() / 1000).toString()
            },
            name: 'broadcast'
          }
        })
      });
    });

    await navigateTo(page, 'actions');
    await actions.broadcastOption(page).click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    const messageInput = compose.broadcast.messageInput(page);
    if (await messageInput.isVisible({ timeout: 5000 })) {
      await messageInput.fill('Test broadcast message');

      const submitButton = compose.common.submitButton(page);

      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();

        // Wait for any loading state
        await page.waitForTimeout(1000);
        const loadingVisible = await page.locator('text=/Composing transaction/i').isVisible({ timeout: 3000 }).catch(() => false);
        if (loadingVisible) {
          await page.waitForSelector('text=/Composing transaction/i', { state: 'hidden', timeout: 10000 }).catch(() => {});
        }

        await page.waitForTimeout(2000);

        // Should be on review page
        const onReviewPage = page.url().includes('review') ||
                            await page.locator('text="Review Transaction"').isVisible({ timeout: 2000 }).catch(() => false) ||
                            await page.locator('text="Sign & Broadcast"').isVisible({ timeout: 2000 }).catch(() => false);

        expect(onReviewPage).toBeTruthy();
      }
    }
  });
});
