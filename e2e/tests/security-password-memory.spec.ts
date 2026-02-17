/**
 * Password Memory Security Test
 *
 * Verifies that the plaintext encryption password is not stored in React
 * component state. Before the fix, password inputs used controlled useState
 * which pinned the password string in React's fiber tree (memoizedState).
 * After the fix, only a boolean is stored in state — the password is read
 * from the DOM ref only at submit time.
 *
 * Uses React's internal __reactFiber$ / __reactContainer$ to walk the fiber
 * tree and inspect each hook's memoizedState. This is a direct, deterministic
 * check that is not affected by Chrome's autofill agent or other browser
 * internals that may independently retain input values.
 */

import { test, expect, createWallet, lockWallet, TEST_PASSWORD } from '../fixtures';

test.describe('Password Memory Security', () => {
  test('password is not stored in React state on unlock page', async ({
    extensionPage,
  }) => {
    // Create wallet and lock → arrive at the unlock page
    await createWallet(extensionPage, TEST_PASSWORD);
    await lockWallet(extensionPage);

    // Type the password into the unlock input
    const passwordInput = extensionPage.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.pressSequentially(TEST_PASSWORD);

    // Walk React's fiber tree and check if the password string exists
    // in any component's hook state (memoizedState chain)
    const passwordInReactState = await extensionPage.evaluate((pwd) => {
      function checkHooks(fiber: any): boolean {
        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.memoizedState === pwd) return true;
          if (hook.queue?.lastRenderedState === pwd) return true;
          hook = hook.next;
        }
        return false;
      }

      function walkFiber(fiber: any, depth = 0): boolean {
        if (!fiber || depth > 100) return false;

        // Check this fiber's hooks (function components store hooks in memoizedState)
        if (typeof fiber.type === 'function' && fiber.memoizedState) {
          if (checkHooks(fiber)) return true;
        }

        // Also check the alternate fiber (previous render's state)
        if (fiber.alternate && typeof fiber.alternate.type === 'function' && fiber.alternate.memoizedState) {
          if (checkHooks(fiber.alternate)) return true;
        }

        // Recurse into children and siblings
        if (walkFiber(fiber.child, depth + 1)) return true;
        if (walkFiber(fiber.sibling, depth + 1)) return true;

        return false;
      }

      const rootEl = document.getElementById('root');
      if (!rootEl) throw new Error('Root element #root not found');

      const fiberKey = Object.keys(rootEl).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer')
      );
      if (!fiberKey) throw new Error('React fiber not found on root element');

      const rootFiber = (rootEl as any)[fiberKey];
      const fiber = rootFiber?.stateNode?.current || rootFiber?.current || rootFiber;

      return walkFiber(fiber);
    }, TEST_PASSWORD);

    // The password must NOT be stored in any React component's state
    expect(passwordInReactState).toBe(false);
  });
});
