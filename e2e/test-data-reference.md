# E2E Test Data Reference

## Test Credentials

### Password
- Standard test password: `test123456`

### Test Mnemonics
- **BIP39 Test Mnemonic**: `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
  - First address (P2PKH): `1HZ9j7jGcNDG8xFbM8LqnPHYBEny1HYRfb`
  - First address (P2WPKH): `bc1qz6xwp2lv7qsxfvnww3j6g40cepqj9zfqcqvl6y`
  - First address (P2TR): `bc1pq5wc0fmvqrz5y84d5vpjptdkc4xketqd5t0gyvrkzxdx2r5v4eps8ku9xy`

### Test Private Keys
- **Well-known test private key (WIF)**: `5KYZdUEo39z3FPrtuX2QbbwGnNP5zTd7yyr2SC1j299sBCnWjss`
  - Address (P2PKH): `1HZwkjkeaoZfTSaJxDw6aKkxp45agDiEzN`
  - This is a widely-used test private key with no value

## Wallet Lock/Unlock Test Coverage

The `wallet-lock-unlock.spec.ts` file tests:

1. **Locking Wallet**
   - Using the lock button in header (right button on index)
   - Lock all wallets option
   - Lock state persists on reload

2. **Unlocking Wallet**
   - Unlock with correct password
   - Error handling for incorrect password
   - Multiple unlock attempts
   - Unlock state persists on reload

3. **Security Features**
   - Auto-lock settings in security preferences
   - Reset wallet option when locked
   - Password validation

## Address Management Test Coverage

The `address-management.spec.ts` file tests:

1. **Blue Address Button on Index**
   - Copy address to clipboard by clicking main area
   - Navigate to address selection via chevron on right side

2. **Address Operations**
   - Adding new addresses (HD wallets only)
   - Copying addresses from address cards
   - Showing private keys for addresses
   - Renaming addresses
   - Switching between addresses

3. **Address Limits & Types**
   - Address limit enforcement (100 for HD wallets)
   - Single address limit for private key wallets
   - Address type display (Legacy, SegWit, Taproot)

4. **State Persistence**
   - Selected address persists after lock/unlock
   - Last used address loads on unlock (not defaulting to address 1)

## Index Page Features Test Coverage

The `index-page-features.spec.ts` file tests:

1. **Action Buttons**
   - Receive button → QR code display
   - Send button → Send form navigation
   - History button → Transaction history

2. **Tab Navigation**
   - Assets/Balances tab switching
   - Tab state persistence
   - Search functionality in Assets tab

3. **Balance/Asset Lists**
   - Balance item interactions
   - Asset search and filtering
   - Empty state messages
   - Scroll to load more items
   - Balance menu actions

4. **Navigation**
   - Footer navigation (Wallet, Market, Actions, Settings)
   - External links (XChain)
   - Pinned assets management

## Wallet Management Test Coverage

The `wallet-management.spec.ts` file tests:

1. **Initial Wallet Creation**
   - Creating first wallet from onboarding
   - Accessing wallet management via header button

2. **Adding Wallets**
   - Creating new HD wallet
   - Importing wallet from mnemonic
   - Importing private key

3. **Wallet Operations**
   - Switching between wallets
   - Renaming wallets
   - Showing passphrase/private keys
   - Removing wallets from keychain

4. **Address Management**
   - Viewing addresses for HD wallets
   - Adding new addresses (for HD wallets only)

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run specific test file
npx playwright test e2e/wallet-management.spec.ts

# Run in debug mode
npx playwright test e2e/wallet-management.spec.ts --debug

# Run with UI mode
npx playwright test e2e/wallet-management.spec.ts --ui
```