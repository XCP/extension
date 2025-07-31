# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Counterparty Web3 Wallet browser extension built with:
- WXT (Web Extension Toolkit) for cross-browser extension development
- React 19 with TypeScript
- Tailwind CSS for styling
- Vite as the build tool
- Vitest for unit testing
- Playwright for E2E testing

## Development Commands

```bash
# Development
npm run dev              # Start development server
npm run dev:firefox      # Start development server for Firefox

# Building
npm run build            # Build for production
npm run build:firefox    # Build for Firefox
npm run zip              # Create ZIP package
npm run zip:firefox      # Create Firefox ZIP package

# Testing & Quality
npm test                 # Run Vitest unit tests
npm run compile          # TypeScript type checking
```

## Architecture

### Core Services Architecture
The extension uses a service-based architecture with proxy services for cross-context communication:

- **Background Service** (`src/entrypoints/background.ts`): Manages wallet operations and provider API
- **Wallet Service** (`src/services/walletService.ts`): Core wallet functionality via proxy service pattern
- **Provider Service** (`src/services/providerService.ts`): Web3 provider API for dApp integration

### Key Contexts & Components

1. **Wallet Management** (`src/contexts/wallet-context.tsx`):
   - Authentication states: Onboarding, Locked, Unlocked
   - Active wallet/address management
   - Password-based encryption using wallet encryption utilities

2. **Blockchain Integration** (`src/utils/blockchain/`):
   - Bitcoin utilities: address generation, UTXO management, transaction signing
   - Counterparty API integration for token operations
   - Support for multiple address types (Legacy, Native SegWit, Taproot)

3. **Storage Layer** (`src/utils/storage/`):
   - Encrypted wallet storage with browser.storage.local
   - Settings persistence
   - Session management for auto-lock functionality

### Testing Structure
- Unit tests use Vitest with test files alongside source files (`__tests__` directories)
- E2E tests in `/e2e` directory with separate Playwright projects for onboarding, created, and imported wallet states
- Test utilities include encryption tests, storage tests, and blockchain utility tests

## Important Implementation Notes

1. **Security**: All wallet data is encrypted using the encryption utilities in `src/utils/encryption/`
2. **Address Types**: The wallet supports Legacy (P2PKH), Native SegWit (P2WPKH), and Taproot (P2TR) addresses
3. **State Management**: Uses React Context API with custom hooks for wallet state
4. **Background Keep-Alive**: Background script includes a keep-alive mechanism to prevent service worker termination
5. **Cross-Context Communication**: Uses webext-bridge for message passing between contexts

## E2E Testing

The extension uses a custom testing approach due to its unique architecture:

### Running Tests
```bash
# Run with new improved setup
node e2e/run-tests.js

# Or directly with new config
npx playwright test --config playwright.config.v2.ts
```

### Key Testing Considerations
1. **Proxy Services**: Tests must wait for background service and proxy connections to initialize
2. **Storage**: Uses `chrome.storage.local` instead of cookies - standard Playwright storage state doesn't work
3. **Authentication**: Session-based with encrypted storage, not cookie-based
4. **Test Helpers**: See `e2e/helpers/` for auth and initialization utilities

### Test Structure
- `e2e/helpers/extension-init.ts`: Ensures extension services are ready
- `e2e/helpers/auth-helpers.ts`: Handles wallet creation and unlock flows
- `e2e/fixtures-v2.ts`: Provides `authenticatedPage` fixture for tests that need wallet access