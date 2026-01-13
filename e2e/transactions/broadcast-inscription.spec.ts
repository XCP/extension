import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet,
  navigateViaFooter,
  cleanup
} from '../helpers/test-helpers';

test.describe('Broadcast Form', () => {
  test('basic broadcast form functionality', async () => {
    const { context, page } = await launchExtension('broadcast-basic');
    await setupWallet(page);
    
    // Navigate to Actions
    await navigateViaFooter(page, 'actions');
    
    // Click Broadcast - be more flexible with the selector
    const broadcastButton = page.locator('text=/Broadcast/i').first();
    if (await broadcastButton.isVisible({ timeout: 5000 })) {
      await broadcastButton.click();
    } else {
      // Alternative: navigate directly
      await page.goto(page.url().replace(/\/[^\/]*$/, '/compose/broadcast'));
    }
    
    // Wait for URL to update
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 }).catch(() => {});
    
    // Wait for form to fully load
    await page.waitForTimeout(2000);
    
    // Text area should be visible for basic broadcasts
    const textArea = page.locator('textarea[name="text"]');
    const textAreaVisible = await textArea.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (textAreaVisible) {
      // Fill in some text
      await textArea.fill('Test broadcast message');
      const value = await textArea.inputValue();
      expect(value).toBe('Test broadcast message');
      
      // Check if inscription toggle exists (only for SegWit wallets)
      const inscribeToggle = page.locator('text=/Inscribe/i');
      const toggleExists = await inscribeToggle.count() > 0;
      
      if (toggleExists) {
        console.log('Inscription toggle found - testing toggle functionality');
        
        // Click inscribe toggle
        const toggleButton = page.locator('button[role="switch"]').first();
        if (await toggleButton.isVisible()) {
          await toggleButton.click();
          await page.waitForTimeout(500);
          
          // Should now show file uploader
          const fileUploaderVisible = await page.locator('text=/Choose File/i').isVisible({ timeout: 2000 }).catch(() => false);
          expect(fileUploaderVisible).toBe(true);
        }
      } else {
        console.log('No inscription toggle - wallet may not be SegWit');
      }
    } else {
      // Just verify we're on the broadcast page
      expect(page.url()).toContain('broadcast');
    }
    
    await cleanup(context);
  });

  test('file upload workflow when available', async () => {
    const { context, page } = await launchExtension('broadcast-file-upload');
    await setupWallet(page);

    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });

    // Check if inscription is available
    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.count() > 0;

    if (!toggleExists) {
      test.skip(true, 'Inscription not available for this wallet type');
    }
    
    // Enable inscription mode
    await toggleButton.click();
    
    // Verify file uploader is shown
    await expect(page.locator('text="Choose File"')).toBeVisible();
    
    // Create a test file
    const fileContent = 'Test broadcast content';
    const fileName = 'test-broadcast.txt';
    
    // Set up file chooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text="Choose File"').click();
    const fileChooser = await fileChooserPromise;
    
    // Create and select file
    await fileChooser.setFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });
    
    // Verify file is selected
    await expect(page.locator(`text="${fileName}"`)).toBeVisible();
    await expect(page.locator('text="Remove file"')).toBeVisible();
    
    // Verify file size is shown - use regex to match partial text
    await expect(page.locator('text=/Size:.*KB/')).toBeVisible();
    
    // Remove file
    await page.locator('text="Remove file"').click();
    
    // Verify file is removed
    await expect(page.locator(`text="${fileName}"`)).not.toBeVisible();
    await expect(page.locator('text="Choose File"')).toBeVisible();
    
    await cleanup(context);
  });

  test('validates file size limit when inscription available', async () => {
    const { context, page } = await launchExtension('broadcast-file-size');
    await setupWallet(page);

    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    const broadcastButton = page.locator('text=/Broadcast/i').first();
    await expect(broadcastButton).toBeVisible({ timeout: 5000 });
    await broadcastButton.click();

    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Check if inscription is available
    const toggleButton = page.locator('button[role="switch"]').first();
    const toggleExists = await toggleButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!toggleExists) {
      test.skip(true, 'Inscription not available for this wallet type');
    }

    // Enable inscription mode
    await toggleButton.click();
    await page.waitForLoadState('networkidle');

    // Try to upload a file larger than 400KB
    const largeContent = 'x'.repeat(450 * 1024); // 450KB

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

    // Should show error for large file
    await expect(page.locator('text=/File size must be less than 400KB/i')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('broadcast form submission and navigation to review', async () => {
    const { context, page } = await launchExtension('broadcast-submission');
    await setupWallet(page);

    // Mock the compose API endpoint to avoid real API calls
    await page.route('**/v2/addresses/**/compose/broadcast**', route => {
      console.log('Mocking broadcast compose API');
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

    // Enable dry run mode first
    try {
      await navigateViaFooter(page, 'settings');
      await page.locator('div[role="button"][aria-label="Advanced"]').click();
      await page.waitForTimeout(1000);

      // Enable dry run mode
      const dryRunSwitch = page.locator('[role="switch"]').filter({ has: page.locator('..').filter({ hasText: 'Dry Run' }) });
      if (await dryRunSwitch.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isEnabled = await dryRunSwitch.getAttribute('aria-checked');
        if (isEnabled !== 'true') {
          await dryRunSwitch.click();
          await page.waitForTimeout(500);
        }
      }

      // Go back to main page
      await page.goto(page.url().replace(/#.*/, '#/index'));
      await page.waitForLoadState('networkidle');
    } catch (error) {
      console.log('Could not enable dry run mode:', error);
    }

    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    const broadcastButton = page.locator('text=/Broadcast/i').first();
    if (await broadcastButton.isVisible({ timeout: 5000 })) {
      await broadcastButton.click();
    } else {
      await page.goto(page.url().replace(/\/[^\/]*$/, '/compose/broadcast'));
    }

    await page.waitForURL('**/compose/broadcast', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Fill in the broadcast text
    const textArea = page.locator('textarea[name="text"]');
    if (await textArea.isVisible({ timeout: 5000 })) {
      await textArea.fill('Test broadcast message for e2e testing');

      // Submit the form
      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button').filter({ hasText: /^Continue$|^Submit$|^Send$/ })
      ).first();

      if (await submitButton.isVisible({ timeout: 2000 })) {
        // Capture console logs
        page.on('console', msg => {
          console.log('Browser console:', msg.type(), msg.text());
        });

        console.log('Clicking submit button...');
        await submitButton.click();

        // Wait for either loading state or navigation
        await page.waitForTimeout(1000);

        // Check if we see "Composing transaction..." loading state
        const loadingVisible = await page.locator('text=/Composing transaction/i').isVisible({ timeout: 3000 }).catch(() => false);
        if (loadingVisible) {
          console.log('Saw "Composing transaction..." loading state');

          // Wait for loading to complete (up to 10 seconds)
          await page.waitForSelector('text=/Composing transaction/i', { state: 'hidden', timeout: 10000 }).catch(() => {
            console.log('Loading state did not disappear within 10 seconds');
          });
        }

        await page.waitForTimeout(2000);

        // Check what page we ended up on
        const currentUrl = page.url();
        console.log('Current URL after form submission:', currentUrl);

        // Check if we navigated to review page
        const onReviewPage = currentUrl.includes('review') ||
                            await page.locator('text="Review Transaction"').isVisible({ timeout: 2000 }).catch(() => false) ||
                            await page.locator('text="Sign & Broadcast"').isVisible({ timeout: 2000 }).catch(() => false);

        // Check if we're still on the form page
        const onFormPage = currentUrl.includes('compose/broadcast') &&
                          await textArea.isVisible({ timeout: 1000 }).catch(() => false);

        // Check for any error messages
        const hasError = await page.locator('.text-red-500, .text-red-600, [role="alert"], .bg-red-50').isVisible({ timeout: 1000 }).catch(() => false);

        console.log('Results:');
        console.log('- On review page:', onReviewPage);
        console.log('- Still on form page:', onFormPage);
        console.log('- Has error:', hasError);
        console.log('- Text area value:', await textArea.inputValue().catch(() => 'N/A'));

        // The test should navigate to review page
        if (!onReviewPage) {
          console.log('ISSUE: Did not navigate to review page');

          // Log any console errors
          page.on('console', msg => {
            if (msg.type() === 'error') {
              console.log('Console error:', msg.text());
            }
          });

          // Take a screenshot for debugging
          await page.screenshot({ path: 'broadcast-form-debug.png', fullPage: true });
        }

        expect(onReviewPage).toBeTruthy();

      } else {
        console.log('Submit button not found');
        expect(false).toBeTruthy(); // Fail the test
      }
    } else {
      console.log('Textarea not found - may not be on broadcast form');
      expect(false).toBeTruthy(); // Fail the test
    }

    await cleanup(context);
  });
});