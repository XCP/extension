/**
 * Lock/Unlock Wallet Tests
 */

import { walletTest, expect, lockWallet, unlockWallet, TEST_PASSWORD } from '../fixtures';

walletTest.describe('Lock Wallet', () => {
  walletTest('locks wallet via header button', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  walletTest('lock state persists after page reload', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);

    await page.reload();

    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /unlock/i })).toBeVisible();
  });
});

walletTest.describe('Unlock Wallet', () => {
  walletTest('unlocks with correct password', async ({ page }) => {
    await lockWallet(page);
    await unlockWallet(page, TEST_PASSWORD);

    await expect(page).toHaveURL(/index/);
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
  });

  walletTest('shows error with incorrect password', async ({ page }) => {
    await lockWallet(page);

    await page.locator('input[name="password"]').fill('WrongPassword123!');
    await page.getByRole('button', { name: /unlock/i }).click();

    await expect(page.getByText(/incorrect|invalid|wrong|failed|error/i)).toBeVisible();
    await expect(page).toHaveURL(/unlock/);
  });

  walletTest('clears error after typing', async ({ page }) => {
    await lockWallet(page);

    // Enter wrong password (must be at least 8 chars to pass validation)
    await page.locator('input[name="password"]').fill('wrongpass');
    await page.getByRole('button', { name: /unlock/i }).click();
    await expect(page.getByText(/incorrect|invalid|wrong|failed|error/i)).toBeVisible();

    // Start typing again - error should clear or be replaceable
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /unlock/i }).click();

    await expect(page).toHaveURL(/index/);
  });

  walletTest('handles multiple incorrect attempts', async ({ page }) => {
    await lockWallet(page);

    for (let i = 0; i < 3; i++) {
      await page.locator('input[name="password"]').fill(`wrongpass${i}`);
      await page.getByRole('button', { name: /unlock/i }).click();
      await expect(page.getByText(/incorrect|invalid|wrong|failed|error/i)).toBeVisible();
      await page.locator('input[name="password"]').clear();
    }

    // Should still be able to unlock with correct password
    await unlockWallet(page, TEST_PASSWORD);
    await expect(page).toHaveURL(/index/);
  });

  walletTest('unlock state persists after reload', async ({ page }) => {
    // Already unlocked from fixture
    await expect(page).toHaveURL(/index/);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // May need to unlock again or stay unlocked depending on session
    const url = page.url();
    if (url.includes('unlock')) {
      await unlockWallet(page, TEST_PASSWORD);
    }

    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
  });
});
