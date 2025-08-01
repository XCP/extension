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
# Run E2E tests (main test suite)
npm test

# Run specific test types
npm run test:unit     # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
npm run test:all      # Build + E2E tests
```

### Key Testing Considerations
1. **Extension Architecture**: Tests use `chromium.launchPersistentContext()` for proper extension service initialization
2. **Storage**: Uses `chrome.storage.local` instead of cookies - requires extension environment
3. **Authentication**: Session-based with encrypted storage, not cookie-based
4. **Sequential Execution**: Tests run sequentially to avoid browser context conflicts

### Test Organization
- All E2E tests in `/e2e` directory as flat `.spec.ts` files
- Test data stored in `test-results/` (git-ignored)
- Screenshots automatically saved to `test-results/screenshots/` on failure
- No complex projects or global setup - simple and reliable

## Application Design Insights

### Security Architecture

1. **Multi-Layer Encryption**
   - Wallet secrets (mnemonics/private keys) are encrypted with user passwords using PBKDF2 (420,690 iterations) + AES-GCM
   - Each encrypted payload includes version info and authentication signatures to prevent tampering
   - Separate encryption methods for mnemonics vs private keys with different storage formats
   - Session manager holds decrypted secrets in memory only while wallet is unlocked

2. **Session Management**
   - Unlocked secrets are stored in-memory only (never persisted to disk)
   - Auto-lock mechanism based on inactivity timeout (configurable: 1m, 5m, 15m, 30m, or disabled)
   - Last active time tracking for implementing auto-lock
   - Clear separation between encrypted storage (persistent) and unlocked secrets (ephemeral)

### Wallet Architecture

1. **Wallet Types & Limits**
   - Two wallet types: mnemonic (HD wallets) and privateKey (single address)
   - Maximum 20 wallets per extension instance
   - Maximum 100 addresses per mnemonic wallet
   - Private key wallets limited to single address (cannot derive additional addresses)

2. **Address Type Support**
   - Legacy (P2PKH) - Traditional Bitcoin addresses
   - Native SegWit (P2WPKH) - Default for new wallets
   - Nested SegWit (P2SH-P2WPKH) - Compatibility format
   - Taproot (P2TR) - Latest Bitcoin address format
   - Counterwallet - Special format for Counterparty compatibility

3. **Wallet Identity**
   - Wallets are uniquely identified by SHA-256 hash of (mnemonic/privateKey + addressType)
   - This prevents duplicate wallets with same secret but different address types
   - Preview addresses shown for locked wallets without exposing secrets

### Storage Design

1. **Generic Storage Pattern**
   - All storage operations use a common pattern with typed records containing an `id` field
   - Deep cloning on read operations to prevent accidental mutations
   - Cache layer for frequently accessed data with proper invalidation
   - Graceful error handling with fallback to empty arrays/defaults

2. **Settings Management**
   - Singleton pattern for settings access across the application
   - Partial updates supported (only specified fields are modified)
   - Settings reload after each update to ensure consistency
   - Default settings provided for all configurable options

### Transaction Signing Architecture

1. **UTXO Management**
   - Fetches UTXOs for source address before signing
   - Validates each input has corresponding UTXO
   - Fetches previous transactions to build proper signing context
   - Supports both witness (SegWit) and non-witness transaction formats

2. **Address Type Handling**
   - Different signing logic per address type (P2PKH, P2WPKH, P2SH-P2WPKH, P2TR)
   - Automatic script generation based on wallet address type
   - Proper handling of compressed/uncompressed keys for different formats

### Data Validation & Constraints

1. **Password Requirements**
   - Cannot be empty for any encryption/decryption operation
   - Used to derive encryption keys via PBKDF2
   - Password changes require re-encryption of all wallet secrets

2. **Wallet Constraints**
   - Wallet names auto-generated as "Wallet N" if not specified
   - Renumbering occurs when wallets are deleted to maintain sequential naming
   - Active wallet preference persisted in settings
   - Wallet removal clears associated unlocked secrets

3. **Special Handling**
   - Empty strings in session storage return as null (security measure)
   - Private keys can be provided as hex (with/without 0x prefix) or WIF format
   - Counterwallet addresses use special derivation path for compatibility