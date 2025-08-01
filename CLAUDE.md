# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Counterparty Web3 Wallet browser extension built with:
- WXT (Web Extension Toolkit) for cross-browser extension development
- React 19 with TypeScript
- Tailwind CSS v4 with Vite plugin integration
- Vite as the build tool with advanced optimization
- Vitest for unit testing (24+ test suites)
- Playwright for E2E testing with extension-specific patterns
- React Router v7 for navigation and routing
- @headlessui/react for accessible UI components
- @hello-pangea/dnd for drag-and-drop functionality
- react-idle-timer for auto-lock implementation
- Fathom Analytics for privacy-aware usage tracking

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
npm run test:unit        # Run unit tests only
npm run test:e2e         # Run E2E tests only
npm run test:all         # Build + run all tests
npm run compile          # TypeScript type checking
```

## Architecture

### Core Services Architecture
The extension uses a service-based architecture with proxy services for cross-context communication:

- **Background Service** (`src/entrypoints/background.ts`): Manages wallet operations and provider API with keep-alive mechanism
- **Wallet Service** (`src/services/walletService.ts`): Core wallet functionality via proxy service pattern
- **Provider Service** (`src/services/providerService.ts`): EIP-1193-like Web3 provider API for dApp integration
- **Content Script** (`src/entrypoints/content.ts`): Selective injection on xcp.io domains for provider access

### Key Contexts & Components

1. **Context Architecture** (7 contexts for state management):
   - **Wallet Context** (`src/contexts/wallet-context.tsx`): Authentication states and wallet management
   - **Composer Context** (`src/contexts/composer-context.tsx`): Transaction composition workflow
   - **Settings Context** (`src/contexts/settings-context.tsx`): Application preferences
   - **Price Context** (`src/contexts/price-context.tsx`): Bitcoin price feeds
   - **Loading Context** (`src/contexts/loading-context.tsx`): Global loading states
   - **Header Context** (`src/contexts/header-context.tsx`): Header UI state

2. **Blockchain Integration** (`src/utils/blockchain/`):
   - Bitcoin utilities: address generation, UTXO management, transaction signing
   - Counterparty API (`src/utils/blockchain/counterparty/api.ts`): 40+ endpoints for tokens, orders, dispensers
   - External APIs: Price feeds, fee rates, block height, transaction broadcasting
   - Support for multiple address types (Legacy, Native SegWit, Nested SegWit, Taproot, Counterwallet)

3. **Storage Layer** (`src/utils/storage/`):
   - Encrypted wallet storage with browser.storage.local
   - Settings persistence with migration support
   - Session management for auto-lock functionality
   - Caching layer with invalidation patterns

4. **Custom Hooks** (`src/hooks/`):
   - `useConsolidateAndBroadcast`: Bare multisig consolidation
   - `useAssetDetails`: Asset metadata fetching
   - `useFeeRates`: Dynamic fee estimation
   - `useBlockHeight`: Current block tracking
   - `useSearchQuery`: Asset/balance filtering

### Testing Structure
- **Unit Tests**: 24+ test suites using Vitest
  - Test files in `__tests__` directories alongside source
  - Coverage for encryption, storage, blockchain utilities, wallet management
  - WXT testing utilities for extension-specific testing
- **E2E Tests**: Playwright with extension context
  - Tests in `/e2e` directory as flat `.spec.ts` files
  - Persistent context testing for service worker initialization
  - Test data references in `e2e/test-data/`
  - Screenshots on failure to `test-results/screenshots/`

## Important Implementation Notes

1. **Security**: 
   - Multi-layer encryption with PBKDF2 (420,690 iterations) + AES-GCM
   - Version control and tampering protection in encrypted payloads
   - In-memory secret storage (never persisted when unlocked)
   - Privacy-aware analytics with Fathom (path sanitization, user consent)

2. **Address Types**: 
   - Legacy (P2PKH), Native SegWit (P2WPKH), Nested SegWit (P2SH-P2WPKH)
   - Taproot (P2TR), Counterwallet (special derivation path)
   - Automatic script generation per address type

3. **State Management**: 
   - 7 specialized React contexts for different domains
   - Complex form-to-transaction workflow in Composer context
   - Session-based authentication with auto-lock

4. **Background Keep-Alive**: 
   - Service worker keep-alive to prevent termination
   - Alarm-based heartbeat mechanism

5. **Cross-Context Communication**: 
   - webext-bridge for background-popup-content messaging
   - Proxy service pattern for wallet operations

6. **Routing Architecture**:
   - React Router v7 with 50+ route definitions
   - AuthRequired middleware for route protection
   - Authentication-based redirects and guards

7. **External Integrations**:
   - Counterparty API with comprehensive endpoint coverage
   - Bitcoin network APIs for fees, prices, broadcasting
   - Fathom Analytics with privacy controls
   - XCP.io domain-specific content script injection

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

## Development Environment

### Configuration Files
- **wxt.config.ts**: Extension manifest and permissions configuration
- **vite.config.mts**: Build optimization and module handling
- **tailwind.config.js**: Tailwind v4 with Vite plugin
- **tsconfig.json**: TypeScript configuration with strict mode

### Performance Optimizations
- Service worker keep-alive mechanism
- Lazy loading with code splitting
- Storage caching with invalidation
- Bundle optimization for extension size
- Console removal in production builds

### Error Handling Patterns
- Centralized error component (`src/components/error-alert.tsx`)
- Graceful API degradation and fallbacks
- Form validation with user-friendly messages
- Extension reload recovery mechanisms

### Analytics & Privacy
- Fathom Analytics integration (`src/utils/fathom.ts`)
- User consent required for tracking
- Path sanitization for sensitive data
- No personal data collection