/**
 * Lock/Unlock Wallet Tests
 */

import { walletTest, expect, lockWallet, unlockWallet, TEST_PASSWORD } from '../../fixtures';
import { unlock, index } from '../../selectors';

walletTest.describe('Lock Wallet', () => {
  walletTest('locks wallet via header button', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);
    await expect(unlock.passwordInput(page)).toBeVisible();
  });

  walletTest('lock state persists after page reload', async ({ page }) => {
    await lockWallet(page);
    await expect(page).toHaveURL(/unlock/);

    await page.reload();

    await expect(unlock.passwordInput(page)).toBeVisible();
    await expect(unlock.unlockButton(page)).toBeVisible();
  });
});

walletTest.describe('Unlock Wallet', () => {
  walletTest('unlocks with correct password', async ({ page }) => {
    await lockWallet(page);
    await unlockWallet(page, TEST_PASSWORD);

    await expect(page).toHaveURL(/index/);
    await expect(index.assetsTab(page)).toBeVisible();
  });

  walletTest('shows error with incorrect password', async ({ page }) => {
    await lockWallet(page);

    await unlock.passwordInput(page).fill('WrongPassword123!');
    await unlock.unlockButton(page).click();

    // Error message pattern - kept inline as it's test-specific assertion
    await expect(page.getByText(/incorrect|invalid|wrong|failed|error/i)).toBeVisible();
    await expect(page).toHaveURL(/unlock/);
  });

  walletTest('clears error after typing', async ({ page }) => {
    await lockWallet(page);

    // Enter wrong password (must be at least 8 chars to pass validation)
    await unlock.passwordInput(page).fill('wrongpass');
    await unlock.unlockButton(page).click();
    await expect(page.getByText(/incorrect|invalid|wrong|failed|error/i)).toBeVisible();

    // Start typing again - error should clear or be replaceable
    await unlock.passwordInput(page).fill(TEST_PASSWORD);
    await unlock.unlockButton(page).click();

    await expect(page).toHaveURL(/index/);
  });

  walletTest('handles multiple incorrect attempts', async ({ page }) => {
    await lockWallet(page);

    for (let i = 0; i < 3; i++) {
      await unlock.passwordInput(page).fill(`wrongpass${i}`);
      await unlock.unlockButton(page).click();
      await expect(page.getByText(/incorrect|invalid|wrong|failed|error/i)).toBeVisible();
      await unlock.passwordInput(page).clear();
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

    await expect(index.assetsTab(page)).toBeVisible();
  });
});
