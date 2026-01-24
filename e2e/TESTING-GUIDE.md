# E2E Testing Guide

A cheatsheet for writing reliable, maintainable Playwright tests.

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

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Assertions Guide](https://playwright.dev/docs/test-assertions)
