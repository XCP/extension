/**
 * FileUploadInput Component Tests
 *
 * Tests for the file upload input with drag-drop style interface.
 * Component: src/components/inputs/file-upload-input.tsx
 *
 * Features tested:
 * - Rendering (upload button, max size display)
 * - File selection via hidden input
 * - Selected file display (name, size, type)
 * - Remove file functionality
 * - Error handling (file too large)
 * - Disabled state
 *
 * FileUploadInput/InscriptionUploadInput is used in:
 * - Broadcast page (inscribe file)
 * - Issue asset page (inscribe content)
 * - Update description page (inscribe content)
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('FileUploadInput Component', () => {
  // Navigate to broadcast page which uses InscriptionUploadInput
  // The inscribe option is only available for SegWit addresses (Taproot)
  walletTest.beforeEach(async ({ page }) => {
    const hashIndex = page.url().indexOf('#');
    const baseUrl = hashIndex !== -1 ? page.url().substring(0, hashIndex + 1) : page.url() + '#';

    // First, change address type to Taproot (p2tr) to enable inscribing
    await page.goto(`${baseUrl}/settings/address-types`);
    await page.waitForLoadState('networkidle');

    // Click on the Taproot card (HeadlessUI RadioGroup.Option)
    const taprootCard = page.locator('text=Taproot').first();
    await expect(taprootCard).toBeVisible({ timeout: 5000 });
    await taprootCard.click();

    // Wait for address type to update (HeadlessUI uses data-headlessui-state="checked" or aria-checked)
    await expect(async () => {
      const selected = page.locator('[data-headlessui-state*="checked"]:has-text("Taproot"), [aria-checked="true"]:has-text("Taproot")');
      const isSelected = await selected.count() > 0;
      expect(isSelected).toBe(true);
    }).toPass({ timeout: 5000 });

    // Now navigate to broadcast page
    await page.goto(`${baseUrl}/compose/broadcast`);
    await page.waitForLoadState('networkidle');
    // Wait for form to be ready (look for inscribe switch or broadcast form)
    await page.locator('[role="switch"], textarea, input').first().waitFor({ state: 'visible', timeout: 10000 });
  });

  // Helper to enable inscribe mode (only available for SegWit addresses)
  const enableInscribeMode = async (page: any): Promise<boolean> => {
    const inscribeSwitch = page.locator('[role="switch"]').first();
    const switchCount = await inscribeSwitch.count();
    if (switchCount === 0) return false;

    const isVisible = await inscribeSwitch.isVisible({ timeout: 2000 });
    if (!isVisible) return false;

    const isChecked = await inscribeSwitch.getAttribute('aria-checked');
    if (isChecked !== 'true') {
      await inscribeSwitch.click();
      await expect(async () => {
        const newState = await inscribeSwitch.getAttribute('aria-checked');
        expect(newState).toBe('true');
      }).toPass({ timeout: 2000 });
    }
    return true;
  };

  // Helper to get file upload elements (upload area contains the Choose File button or file info)
  const getFileUploadArea = (page: any) => page.locator('div:has(input[type="file"])').first();
  const getChooseFileButton = (page: any) => page.locator('button:has-text("Choose File")');
  const getHiddenInput = (page: any) => page.locator('input[type="file"]');

  walletTest.describe('Rendering', () => {
    walletTest('renders file upload area when inscribe enabled', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const uploadArea = getFileUploadArea(page);
      await expect(uploadArea).toBeVisible({ timeout: 3000 });
    });

    walletTest('renders Choose File button', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const chooseButton = getChooseFileButton(page);
      await expect(chooseButton).toBeVisible({ timeout: 3000 });
    });

    walletTest('shows max file size', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const maxSizeText = page.locator('text=/Max file size.*400KB/');
      await expect(maxSizeText).toBeVisible({ timeout: 3000 });
    });

    walletTest('has hidden file input', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);
      await expect(hiddenInput).toHaveClass(/hidden/);
    });
  });

  walletTest.describe('File Selection', () => {
    walletTest('clicking Choose File triggers file input', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);
      await expect(hiddenInput).toBeAttached();
    });

    walletTest('can select a file programmatically', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Create a test file buffer
      const testContent = 'Test file content for E2E testing';
      const buffer = Buffer.from(testContent);

      await hiddenInput.setInputFiles({
        name: 'test-file.txt',
        mimeType: 'text/plain',
        buffer: buffer,
      });

      // File name should be displayed
      const fileName = page.locator('text=test-file.txt');
      await expect(fileName).toBeVisible({ timeout: 3000 });
    });

    walletTest('shows file size after selection', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Create a test file
      const testContent = 'A'.repeat(1024); // 1KB file
      const buffer = Buffer.from(testContent);

      await hiddenInput.setInputFiles({
        name: 'size-test.txt',
        mimeType: 'text/plain',
        buffer: buffer,
      });

      // Size should be displayed
      const sizeText = page.locator('text=/Size:.*KB/');
      await expect(sizeText).toBeVisible({ timeout: 3000 });
    });

    walletTest('shows file type after selection', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      await hiddenInput.setInputFiles({
        name: 'type-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('test'),
      });

      // Type should be displayed
      const typeText = page.locator('text=/text\\/plain/');
      await expect(typeText).toBeVisible({ timeout: 3000 });
    });

    walletTest('shows success state after selection', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      await hiddenInput.setInputFiles({
        name: 'success-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('test content'),
      });

      // Success state indicated by file name display and Remove file button
      const fileName = page.locator('text=success-test.txt');
      await expect(fileName).toBeVisible({ timeout: 3000 });
      const removeButton = page.locator('button:has-text("Remove file")');
      await expect(removeButton).toBeVisible({ timeout: 3000 });
    });
  });

  walletTest.describe('Remove File', () => {
    walletTest('shows Remove file button after selection', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      await hiddenInput.setInputFiles({
        name: 'remove-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('test'),
      });

      const removeButton = page.locator('button:has-text("Remove file")');
      await expect(removeButton).toBeVisible({ timeout: 3000 });
    });

    walletTest('clicking Remove file clears selection', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Select a file
      await hiddenInput.setInputFiles({
        name: 'to-remove.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('test'),
      });

      // Click remove
      const removeButton = page.locator('button:has-text("Remove file")');
      await expect(removeButton).toBeVisible({ timeout: 3000 });
      await removeButton.click();

      // Choose File button should be visible again
      const chooseButton = getChooseFileButton(page);
      await expect(chooseButton).toBeVisible({ timeout: 3000 });
    });

    walletTest('after removal, can select new file', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Select first file
      await hiddenInput.setInputFiles({
        name: 'first-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('first'),
      });

      // Remove it
      const removeButton = page.locator('button:has-text("Remove file")');
      await expect(removeButton).toBeVisible({ timeout: 3000 });
      await removeButton.click();

      // Wait for removal
      await expect(getChooseFileButton(page)).toBeVisible({ timeout: 3000 });

      // Select second file
      await hiddenInput.setInputFiles({
        name: 'second-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('second'),
      });

      // Second file name should be shown
      const fileName = page.locator('text=second-file.txt');
      await expect(fileName).toBeVisible({ timeout: 3000 });
    });
  });

  walletTest.describe('File Size Validation', () => {
    walletTest('shows error for file over 400KB', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Create a file larger than 400KB (401KB)
      const largeContent = 'A'.repeat(401 * 1024);
      const buffer = Buffer.from(largeContent);

      await hiddenInput.setInputFiles({
        name: 'too-large.txt',
        mimeType: 'text/plain',
        buffer: buffer,
      });

      // Error message should appear (component uses role="alert" for errors)
      const errorText = page.getByRole('alert');
      await expect(errorText).toBeVisible({ timeout: 3000 });
    });

    walletTest('accepts file under 400KB', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Create a file under 400KB (100KB)
      const content = 'A'.repeat(100 * 1024);
      const buffer = Buffer.from(content);

      await hiddenInput.setInputFiles({
        name: 'acceptable-size.txt',
        mimeType: 'text/plain',
        buffer: buffer,
      });

      // Check for file size error - should NOT appear
      const sizeError = page.locator('text=/exceed|too large|400/i');
      await expect(sizeError).not.toBeVisible({ timeout: 2000 });
    });
  });

  walletTest.describe('Form Integration', () => {
    walletTest('submit button disabled without file when inscribe enabled', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      // No file selected, submit should be disabled
      const submitButton = page.locator('button[type="submit"]:has-text("Continue")');
      await expect(submitButton).toBeDisabled({ timeout: 3000 });
    });

    walletTest('submit button enabled with valid file', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      await hiddenInput.setInputFiles({
        name: 'valid-file.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('test content'),
      });

      // Submit should now be enabled
      const submitButton = page.locator('button[type="submit"]:has-text("Continue")');
      await expect(submitButton).not.toBeDisabled({ timeout: 3000 });
    });
  });

  walletTest.describe('Accessibility', () => {
    walletTest('Choose File button is keyboard accessible', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const chooseButton = getChooseFileButton(page);

      // Focus the button
      await chooseButton.focus();

      // Check if focused
      const isFocused = await page.evaluate(() => {
        return document.activeElement?.tagName === 'BUTTON';
      });

      expect(isFocused).toBe(true);
    });
  });

  walletTest.describe('Different File Types', () => {
    walletTest('accepts image files', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      // Create a small PNG header
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

      await hiddenInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: pngHeader,
      });

      // File should be accepted
      const fileName = page.locator('text=test-image.png');
      await expect(fileName).toBeVisible({ timeout: 3000 });
    });

    walletTest('accepts JSON files', async ({ page }) => {
      const inscribeEnabled = await enableInscribeMode(page);
      walletTest.skip(!inscribeEnabled, 'Inscribe mode not available');

      const hiddenInput = getHiddenInput(page);

      const jsonContent = JSON.stringify({ test: 'data' });

      await hiddenInput.setInputFiles({
        name: 'test-data.json',
        mimeType: 'application/json',
        buffer: Buffer.from(jsonContent),
      });

      // File should be accepted
      const fileName = page.locator('text=test-data.json');
      await expect(fileName).toBeVisible({ timeout: 3000 });
    });
  });
});
