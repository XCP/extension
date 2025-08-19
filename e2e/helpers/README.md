# E2E Test Helpers

This directory contains helper functions, page objects, and utilities to make e2e tests more maintainable and reduce code duplication.

## Structure

- **test-helpers.ts** - Common helper functions for test setup, wallet operations, and navigation
- **page-objects.ts** - Page Object Model classes for common pages
- **test-config.ts** - Test configuration and constants

## Usage

### Basic Test Setup

```typescript
import { test, expect } from '@playwright/test';
import { launchExtension, setupWallet, cleanup } from './helpers/test-helpers';

test('my test', async () => {
  // Launch extension with unique test name
  const { context, page, extensionId } = await launchExtension('my-test-name');
  
  // Setup wallet (creates or unlocks as needed)
  await setupWallet(page);
  
  // Your test logic here
  
  // Clean up
  await cleanup(context);
});
```

### Using Page Objects

```typescript
import { SignMessagePage, FooterNav } from './helpers/page-objects';

test('sign message test', async () => {
  const { context, page } = await launchExtension('sign-test');
  await setupWallet(page);
  
  // Initialize page objects
  const footer = new FooterNav(page);
  const signPage = new SignMessagePage(page);
  
  // Navigate using footer
  await footer.navigateTo('actions');
  
  // Use page object methods
  const signature = await signPage.signMessage('Hello World');
  
  await cleanup(context);
});
```

## Available Helpers

### Setup Functions

- `launchExtension(testName)` - Launch browser with extension
- `setupWallet(page, password?)` - Create or unlock wallet
- `createWallet(page, password?)` - Create new wallet
- `importWallet(page, mnemonic?, password?)` - Import wallet from mnemonic
- `importPrivateKey(page, key?, password?)` - Import wallet from private key
- `unlockWallet(page, password?)` - Unlock existing wallet
- `lockWallet(page)` - Lock the wallet

### Navigation

- `navigateViaFooter(page, target)` - Navigate using footer buttons
- `switchWallet(page, walletName)` - Switch to different wallet
- `addAddress(page, label?)` - Add new address to wallet

### Transaction Operations

- `sendTransaction(page, recipient, amount, asset?)` - Send a transaction
- `waitForBalance(page, asset, expectedBalance?)` - Wait for balance to appear

### Utility Functions

- `getCurrentAddress(page)` - Get current address from page
- `hasError(page, errorText?)` - Check for error messages
- `fillForm(page, formData)` - Fill form with data
- `takeScreenshot(page, name)` - Take a screenshot
- `grantClipboardPermissions(context)` - Grant clipboard access
- `waitForElementToDisappear(page, selector)` - Wait for element to hide

### Constants

- `TEST_PASSWORD` - Default test password
- `TEST_MNEMONIC` - Default test mnemonic
- `TEST_PRIVATE_KEY` - Default test private key
- `TEST_ADDRESSES` - Common test addresses

## Page Objects

### Available Page Objects

- `BasePage` - Base class with common functionality
- `IndexPage` - Main dashboard page
- `SignMessagePage` - Sign message functionality
- `VerifyMessagePage` - Verify message functionality
- `SettingsPage` - Settings pages
- `SendPage` - Send/compose transaction page
- `FooterNav` - Footer navigation helper
- `HeaderNav` - Header navigation helper

### Page Object Methods

Each page object provides:
- **Locators** - Element selectors as properties
- **Actions** - Methods that perform common operations
- **Assertions** - Built-in validation methods

## Best Practices

1. **Use unique test names** for `launchExtension()` to avoid conflicts
2. **Always call `cleanup()`** at the end of tests
3. **Use page objects** for complex interactions
4. **Reuse helper functions** instead of duplicating code
5. **Add new helpers** when you find repeated patterns

## Adding New Helpers

When you identify repeated code patterns:

1. Add the helper function to `test-helpers.ts`
2. If it's page-specific, consider adding a page object
3. Document the function with JSDoc comments
4. Update this README with usage examples

## Migration Guide

To migrate existing tests to use helpers:

1. Replace extension launch code with `launchExtension()`
2. Replace wallet setup code with `setupWallet()`
3. Replace navigation code with `navigateViaFooter()` or page objects
4. Replace cleanup code with `cleanup()`

### Before
```typescript
const context = await chromium.launchPersistentContext(...);
// ... lots of setup code ...
```

### After
```typescript
const { context, page } = await launchExtension('test-name');
await setupWallet(page);
```

## Environment Variables

- `TEST_ENV` - Set to 'ci' for CI builds, 'debug' for debugging
- `TEST_PASSWORD` - Override default test password
- `HEADLESS` - Set to 'true' to run in headless mode (not recommended for extensions)