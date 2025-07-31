# Extension Testing Approach

## The Challenge

This Web3 wallet extension uses:
- Encrypted secrets stored in `chrome.storage.local`
- Proxy services for popup-to-background communication
- Session-based authentication (not cookies)
- Complex multi-context architecture (popup, background, content scripts)

Traditional Playwright approaches fail because:
1. Storage state persistence doesn't work with `chrome.storage.local`
2. Proxy service communication between contexts needs proper initialization
3. Background service worker must be running and connected

## Recommended Testing Strategy

### 1. Integration Test Approach
Instead of mocking, test the full user flow with proper extension initialization:

```typescript
// Ensure background service is ready
await waitForServiceWorker(context);

// Give proxy services time to initialize
await page.waitForTimeout(2000);

// Test actual user interactions
await createWallet(page, password);
```

### 2. Direct Storage Manipulation for Setup
For tests that need existing wallets, directly set up the storage:

```typescript
// In test setup
await page.evaluate((encryptedData) => {
  chrome.storage.local.set({
    appRecords: encryptedData,
    settings: { lastActiveWalletId: 'wallet-id' }
  });
}, testWalletData);
```

### 3. Session Management
Handle session timeouts explicitly:

```typescript
// Check if redirected to unlock screen
if (page.url().includes('unlock-wallet')) {
  await unlockWallet(page, password);
}
```

### 4. Test Categories

#### a) Fresh State Tests (Onboarding)
- No global setup needed
- Test wallet creation, import flows
- Verify storage is properly initialized

#### b) Authenticated State Tests
- Use a setup helper that:
  1. Creates a wallet via UI (ensuring all services work)
  2. Saves the storage state
  3. Restores it for each test
  
#### c) API/Service Tests
- Test background services directly
- Mock the frontend, test the service layer

### 5. Debugging Approach
When tests fail:
1. Take screenshots at each step
2. Log console errors
3. Check extension storage state
4. Verify service worker is running

## Implementation Example

```typescript
// test-helpers/wallet-setup.ts
export async function setupTestWallet(context: BrowserContext) {
  const page = await context.newPage();
  
  // Wait for extension to initialize
  const serviceWorker = await waitForServiceWorker(context);
  const extensionId = getExtensionId(serviceWorker.url());
  
  // Create wallet through UI
  await navigateToExtension(page, extensionId);
  await createWallet(page, 'TestPassword123!');
  
  // Verify and save state
  const storage = await getExtensionStorage(page, 'appRecords');
  await saveTestState({ storage, extensionId });
  
  await page.close();
  return { extensionId, storage };
}
```

## Next Steps

1. Create a reliable test harness that handles extension initialization
2. Build helpers for common operations (create wallet, unlock, etc.)
3. Implement storage state management specific to extensions
4. Add retry logic for proxy service communication
5. Create different test suites for different states (fresh, authenticated, etc.)