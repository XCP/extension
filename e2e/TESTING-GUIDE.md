# E2E Testing Guide

A cheatsheet for writing reliable, maintainable Playwright tests.

> **See also:** [E2E-STANDARDS.md](./E2E-STANDARDS.md) for comprehensive standards, infrastructure usage, and audit guidelines.

## Core Principles

1. **Test user-visible behavior** - Test what users see, not implementation details
2. **Tests must be able to fail** - If a test can't fail, it's not testing anything
3. **Use web-first assertions** - Let Playwright handle waiting and retrying
4. **Prefer semantic locators** - Use `getByRole`, `getByLabel`, `getByText` over CSS selectors

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

## Good Patterns to Follow

### 1. Web-First Assertions

```typescript
// These auto-wait and retry until timeout
await expect(page.getByRole('button')).toBeVisible();
await expect(page.getByRole('button')).toBeEnabled();
await expect(page.getByRole('textbox')).toHaveValue('expected');
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle('Home');
```

### 2. Semantic Locators (Priority Order)

```typescript
// 1. Role (best)
page.getByRole('button', { name: 'Submit' });
page.getByRole('textbox', { name: 'Email' });
page.getByRole('checkbox', { name: 'Remember me' });

// 2. Label
page.getByLabel('Password');

// 3. Placeholder
page.getByPlaceholder('Enter your email');

// 4. Text
page.getByText('Welcome back');

// 5. Test ID (when semantic locators aren't possible)
page.getByTestId('custom-component');
```

### 3. Chaining and Filtering

```typescript
// Narrow down to specific elements
const productCard = page.getByRole('listitem').filter({ hasText: 'Product A' });
await productCard.getByRole('button', { name: 'Add to cart' }).click();

// Filter by another locator
page.getByRole('listitem').filter({ has: page.getByRole('img') });
```

### 4. Proper Test Isolation

```typescript
// Use beforeEach for common setup
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/dashboard/);
});

test('can view profile', async ({ page }) => {
  // Page is already logged in
  await page.getByRole('link', { name: 'Profile' }).click();
});
```

### 5. Soft Assertions for Non-Critical Checks

```typescript
// Continue test even if these fail, report all failures at end
await expect.soft(page.getByTestId('status')).toHaveText('Active');
await expect.soft(page.getByTestId('count')).toHaveText('5');

// Critical assertion - stops test if fails
await page.getByRole('button', { name: 'Submit' }).click();
```

### 6. Testing One Thing Per Test

```typescript
// ❌ BAD - Testing multiple unrelated things
test('page works', async ({ page }) => {
  await expect(page.getByRole('heading')).toBeVisible();
  await expect(page.getByRole('button')).toBeEnabled();
  await expect(page.getByRole('link')).toHaveCount(5);
  // ... 20 more assertions
});

// ✅ GOOD - Focused tests
test('displays page heading', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('submit button is enabled when form is valid', async ({ page }) => {
  await page.getByLabel('Email').fill('test@example.com');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
});
```

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

1. **Use `--debug` flag**: `npx playwright test --debug`
2. **Use VS Code extension**: Set breakpoints, step through tests
3. **Use trace viewer**: `npx playwright test --trace on`
4. **Use `page.pause()`**: Pause test execution for debugging

---

## Audit Findings (inputs/ directory)

### Anti-Patterns Found and Fixed

#### 1. Silent Test Passing with Conditional Execution

```typescript
// ❌ BAD - If element isn't visible, test passes without testing anything
if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  await passwordInput.fill('testpassword123');
  const value = await passwordInput.inputValue();
  expect(value).toBe('testpassword123');
}

// ✅ GOOD - Test fails if element isn't visible (revealing actual bugs)
const passwordInput = getPasswordInput(page);
await expect(passwordInput).toBeVisible();
await passwordInput.fill('testpassword123');
await expect(passwordInput).toHaveValue('testpassword123');
```

**Impact:** This pattern was used 20+ times in password-input.spec.ts. Every test would silently pass if the page structure changed.

#### 2. Tautologies Hiding Real Behavior

```typescript
// ❌ BAD - Always true, masks actual validation behavior
const hasError = classes.includes('border-red-500');
expect(typeof hasError).toBe('boolean');  // Always passes!

// ✅ GOOD - Test actual expected behavior
await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
// Or if validation is deferred:
await expect(input).not.toHaveClass(/border-red-500/);
```

**Discovery:** Removing tautologies revealed that:
- P2TR (Taproot) address validation is not implemented (shows error for valid addresses)
- Checksum validation is deferred to server-side (no client-side error)

#### 3. waitForTimeout Before Assertions

```typescript
// ❌ BAD - Arbitrary delay, doesn't guarantee state
await page.waitForTimeout(500);
await expect(input).toHaveClass(/border-red-500/);

// ✅ GOOD - Web-first assertion handles waiting
await expect(input).toHaveClass(/border-red-500/, { timeout: 3000 });
```

#### 4. Proper beforeEach Setup

```typescript
// ❌ BAD - waitForTimeout in setup
walletTest.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
});

// ✅ GOOD - Wait for specific element that confirms page is ready
walletTest.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="memo"]').waitFor({ state: 'visible', timeout: 5000 });
});
```

### When to Skip vs Delete Tests

| Situation | Action | Example |
|-----------|--------|---------|
| Known app limitation | **Skip with TODO** | P2TR validation not implemented |
| Feature not yet built | **Skip with TODO** | Test for upcoming feature |
| Low-value test | **Delete** | Test for icon colors |
| Flaky test | **Fix it** | Never skip flaky tests |
| Duplicate coverage | **Delete** | Same behavior tested elsewhere |

```typescript
// ✅ Skip for known limitations (include issue number if available)
// TODO(#123): P2TR (bech32m) validation not yet implemented
walletTest.skip('accepts valid P2TR (Taproot) address', async ({ page }) => {
  // Test code here - will be enabled when feature is implemented
});

// ❌ Don't skip low-value or flaky tests - delete or fix them
```

**Key principle:** Skip tests only for known application limitations that will be fixed. Never skip tests to hide failures or because they're flaky.

### Selector Helpers

Extract repeated selectors into helpers for readability:

```typescript
// Define helpers at top of describe block
const getPasswordInput = (page: any) => page.locator('input[type="password"]').first();
const getToggleButton = (page: any) => page.locator('button[aria-label*="password" i]').first();

// Use in tests
walletTest('accepts password input', async ({ page }) => {
  const passwordInput = getPasswordInput(page);
  await expect(passwordInput).toBeVisible();
  // ...
});
```

### Using expect().toPass() for Async State Changes

For operations that take time (API calls, calculations):

```typescript
// ✅ Polls until condition is met or timeout
await expect(async () => {
  const value = await input.inputValue();
  expect(value.length).toBeGreaterThan(0);
}).toPass({ timeout: 5000 });
```

---

## False Confidence Anti-Patterns

These patterns create tests that pass without actually testing:

### 1. Silent Early Returns

```typescript
// ❌ BAD - Test passes without testing if element not found
test('verify feature works', async ({ page }) => {
  const button = page.locator('button');
  if (!await button.isVisible().catch(() => false)) {
    return; // Silent pass!
  }
  // ... actual test
});

// ✅ GOOD - Let the test fail if element not found
test('verify feature works', async ({ page }) => {
  const button = page.locator('button');
  await expect(button).toBeVisible();
  // ... actual test
});
```

### 2. Negative-Only Assertions

```typescript
// ❌ BAD - Only checks for absence of error
const hasError = await page.locator('.error').isVisible().catch(() => false);
expect(hasError).toBe(false);

// ✅ GOOD - Verify positive outcome
await expect(input).toHaveValue(expectedValue);
await expect(page.locator('[role="alert"]')).toBeHidden();
await expect(submitButton).toBeEnabled();
```

### 3. Deeply Nested Conditions

```typescript
// ❌ BAD - 4+ bypass paths where test silently passes
if (await button.count() > 0) {
  if (await button.isVisible()) {
    if (await menu.isVisible()) {
      expect(something).toBe(true); // Only assertion
    }
  }
}

// ✅ GOOD - Flat structure, fail if elements missing
await expect(button).toBeVisible();
await expect(menu).toBeVisible();
expect(something).toBe(true);
```

### 4. Overly Flexible OR Assertions

```typescript
// ❌ BAD - Unclear which condition passed
expect(hasTitle || hasContent || hasLoading).toBe(true);

// ✅ GOOD - Specific assertion for expected state
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
```

---

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Assertions Guide](https://playwright.dev/docs/test-assertions)
