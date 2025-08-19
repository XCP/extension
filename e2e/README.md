# E2E Tests

End-to-end tests for the Counterparty Wallet browser extension using Playwright.

## Running Tests

```bash
# Run specific test file (RECOMMENDED)
npx playwright test e2e/wallet-creation.spec.ts

# Run test by name pattern
npx playwright test -g "create wallet"

# Debug mode with browser UI
npx playwright test e2e/wallet-creation.spec.ts --debug

# Never run all tests at once - too time consuming
# npm test  # DON'T DO THIS
```

## Test Structure

Our E2E tests cover critical user workflows:

- **wallet-creation.spec.ts** - New wallet creation flow
- **wallet-import.spec.ts** - Import via mnemonic/private key
- **wallet-management.spec.ts** - Multiple wallets, switching, removal
- **wallet-lock-unlock.spec.ts** - Security and session management
- **address-management.spec.ts** - Address creation and switching
- **compose-transactions.spec.ts** - Transaction composition
- **sign-message.spec.ts** - Message signing functionality
- **verify-message.spec.ts** - Message verification
- **provider.spec.ts** - Web3 provider API testing
- **settings-headless-ui.spec.ts** - Settings and UI components
- **error-handling.spec.ts** - Error states and recovery

## Testing Approach

1. **Extension Context**: Tests use `chromium.launchPersistentContext()` to properly initialize the extension environment
2. **Sequential Execution**: Tests run sequentially to avoid browser context conflicts
3. **Isolated State**: Each test creates its own user data directory for clean state
4. **Helper Functions**: Common operations abstracted in `helpers/` for maintainability

## Test Data

### Standard Test Mnemonic
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

This well-known test mnemonic generates predictable addresses for verification:
- **Native SegWit**: `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`
- **Legacy**: `1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA`

## Debugging Tips

- Screenshots saved to `test-results/screenshots/` on failure
- Use `--debug` flag to see browser interactions
- Check `test-results/` for traces and videos
- Use `page.pause()` to inspect state during test development