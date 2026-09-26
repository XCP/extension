# E2E Testing Guide

How this repository's Playwright tests are built and run, and the mistakes that make a test pass
without testing anything. Unit tests are Vitest files next to the code under `src`; everything
here is about the browser tests under `e2e/`. Setup, CI and the other test environments are in
[CONTRIBUTING.md](../CONTRIBUTING.md#testing).

## Running tests

The tests load the unpacked extension from `.output/chrome-mv3`, so build it first. Use the e2e
build, which grants the optional Trezor Suite host permission up front (automation cannot answer
Chrome's permission prompt):

```bash
npm run build:e2e
npx playwright test e2e/tests/provider-message-signing.spec.ts
```

Rebuild after every source change; Playwright does not rebuild for you. Run the specs your change
affects, not the whole suite: the full suite runs in CI.

**Run one Playwright job at a time.** Each test launches its own persistent Chromium profile with
the extension loaded, and `playwright.config.ts` already uses a single worker. Two Playwright
processes at once compete for the same build output and `test-results/` directory (each run wipes
it) and fail in ways that look like flaky tests.

Every page runs at the popup's size, a 350x600 viewport (`playwright.config.ts`). A screen that
only works in a larger viewport is broken for users.

## Principles

1. **Test user-visible behavior** - Test what users see, not implementation details
2. **Tests must be able to fail** - If a test can't fail, it's not testing anything
3. **Use web-first assertions** - Let Playwright handle waiting and retrying
4. **Prefer semantic locators** - Use `getByRole`, `getByLabel`, `getByText` over CSS selectors
5. **An approval test must complete the approval** - see below

## Fixtures

Import `test`, `walletTest` and `expect` from [`e2e/fixtures.ts`](fixtures.ts), never from
`@playwright/test` directly:

| Fixture | Gives you |
|---|---|
| `test` | `extensionContext`, `extensionPage` and `extensionId`: the extension loaded with no wallet, on the unlock or onboarding screen |
| `walletTest` | `context`, `page` and `extensionId`: a wallet already imported from `TEST_MNEMONIC` with `TEST_PASSWORD`, on the dashboard |
| `walletTest` + `browserLocale` | The same wallet in a Chromium launched with that UI language (`'ja'`, `'zh-CN'`, `'zh-TW'`, `'zh-HK'`); onboarding is driven with that locale's catalog text |

```typescript
import { walletTest, expect, navigateTo } from '../fixtures';

walletTest('opens settings from the footer', async ({ page }) => {
  await navigateTo(page, 'settings');
  await expect(page).toHaveURL(/settings/);
});
```

```typescript
import { walletTest, expect } from '../fixtures';

walletTest.use({ browserLocale: 'ja' });

walletTest('dashboard renders in Japanese', async ({ page }) => {
  // Look up expected text in public/_locales/ja/messages.json rather than hard-coding it.
});
```

`fixtures.ts` also exports helpers for the common flows (`createWallet`, `importMnemonic`,
`importPrivateKey`, `unlockWallet`, `lockWallet`, `navigateTo`, `getCurrentAddress`,
`grantClipboardPermissions`) and the test credentials (`TEST_PASSWORD`, `TEST_MNEMONIC`,
`TEST_PRIVATE_KEY`). Shared selectors are in [`e2e/selectors.ts`](selectors.ts), and test data in
[`e2e/test-data.ts`](test-data.ts). `sleep()` is deliberately not exported.

## Approval tests

Browser approval tests must initialize the wallet fixture, require a successful decision and
result, and run with normal browser security enabled. Merely observing a popup or an error does
not demonstrate a working approval flow ([ARCHITECTURE.md](../ARCHITECTURE.md#reviewing-changes)).

The approval galleries (`e2e/tests/approval-gallery.spec.ts`, `e2e/tests/marketplace-gallery.spec.ts`)
render every approval state for review; how to read them is in
[Approval screens](../docs/approval-screens.md#review-the-galleries-screen-by-screen).

## Other environments

- **Trezor**: `e2e/hardware/` runs against the Trezor emulator and is skipped unless
  `TREZOR_EMULATOR_AVAILABLE=1`. Hardware wallet pages need the side panel
  (`launchExtension(testId, { useSidepanel: true })`). Setup is in
  [CONTRIBUTING.md](../CONTRIBUTING.md#trezor-emulator).
- **ZELD regtest**: `e2e/zeld/` holds Vitest proofs against Bitcoin Core and Counterparty Core on
  regtest, skipped unless `ZELD_REGTEST=1`. Setup is in
  [CONTRIBUTING.md](../CONTRIBUTING.md#zeld-regtest).

---

## Anti-Patterns to Avoid

### 1. Always-True Conditions (`|| true`)

```typescript
// ❌ BAD - This test ALWAYS passes, it tests nothing
expect(hasButton || true).toBe(true);
expect(hasSpinner || hasOptions || true).toBe(true);

// ✅ GOOD - Actually tests that the button exists
await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
```

**Why it's bad:** The `|| true` makes the entire condition always evaluate to `true`. The test passes whether the element exists or not.

---

### 2. Tautologies (Always-True Logic)

```typescript
// ❌ BAD - A boolean is ALWAYS either true or false
expect(isVisible === true || isVisible === false).toBe(true);

// ✅ GOOD - Test the specific behavior you expect
await expect(element).toBeVisible();
// or
await expect(element).toBeHidden();
```

**Why it's bad:** This is logically equivalent to `expect(true).toBe(true)`. It can never fail.

---

### 3. Swallowing Errors with `.catch(() => false)`

```typescript
// ❌ BAD - Silently converts errors to false, then checks boolean
const isVisible = await button.isVisible({ timeout: 5000 }).catch(() => false);
expect(isVisible).toBe(true);

// ✅ GOOD - Web-first assertion with proper error messages
await expect(button).toBeVisible({ timeout: 5000 });
```

**Why it's bad:**
- Hides the real error message
- Makes debugging difficult
- The `isVisible()` check doesn't auto-wait properly

---

### 4. Manual Boolean Assertions

```typescript
// ❌ BAD - await is inside expect, no auto-waiting
expect(await page.getByText('welcome').isVisible()).toBe(true);

// ✅ GOOD - Web-first assertion, auto-waits and retries
await expect(page.getByText('welcome')).toBeVisible();
```

**Why it's bad:** `isVisible()` returns immediately without waiting. Web-first assertions like `toBeVisible()` automatically wait and retry.

---

### 5. Fragile CSS Class Selectors

```typescript
// ❌ BAD - Breaks when styling changes
page.locator('button.bg-green-500');
page.locator('.buttonIcon.episode-actions-later');

// ✅ GOOD - Semantic, resilient to styling changes
page.getByRole('button', { name: 'Add Wallet' });
page.getByLabel('Username');
page.getByTestId('submit-button');
```

**Why it's bad:** CSS classes are implementation details that change frequently. Semantic locators are more stable.

---

### 6. Overly Flexible Assertions

```typescript
// ❌ BAD - Accepts too many conditions, hard to know what's being tested
expect(hasError || hasLoading || hasContent || redirected).toBe(true);

// ✅ GOOD - Test one specific behavior
await expect(page.getByRole('alert')).toBeVisible();
// In a separate test:
await expect(page.getByText('Loading')).toBeVisible();
```

**Why it's bad:** When this test passes, you don't know which condition was true. When it fails, you don't know which was expected.

---

### 7. Using `waitForTimeout` for Synchronization

```typescript
// ❌ BAD - Arbitrary delays, slow and flaky
await page.waitForTimeout(2000);
await expect(element).toBeVisible();

// ✅ GOOD - Wait for specific conditions
await expect(element).toBeVisible({ timeout: 5000 });
await page.waitForURL(/dashboard/);
await page.waitForLoadState('networkidle');
```

**Why it's bad:** Arbitrary timeouts are either too short (flaky) or too long (slow). Wait for specific conditions instead.

---

## Quick Reference

| Instead of... | Use... |
|---------------|--------|
| `expect(x \|\| true).toBe(true)` | `await expect(element).toBeVisible()` |
| `isVisible().catch(() => false)` | `await expect(element).toBeVisible()` |
| `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` |
| `page.locator('.css-class')` | `page.getByRole('button', { name: '...' })` |
| `page.waitForTimeout(2000)` | `await expect(el).toBeVisible()` |
| `expect(a \|\| b \|\| c).toBe(true)` | Separate tests for each case |

---

## Debugging Tips

1. **Use `--debug` flag**: `npx playwright test e2e/tests/<spec>.ts --debug`
2. **Use trace viewer**: `npx playwright test e2e/tests/<spec>.ts --trace on`
3. **Use `page.pause()`**: Pause test execution for debugging
4. **Read `test-results/`** before the next run: each run replaces it

---

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Assertions Guide](https://playwright.dev/docs/test-assertions)
