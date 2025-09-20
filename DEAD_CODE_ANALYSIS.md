# Dead Code Analysis - Knip Report

Generated using knip v5.63.1

## Configuration
- Entry points: `src/entrypoints/**/*.{ts,tsx}`
- Scanned: All TypeScript files in `src/`
- Excluded: Test files and type definitions

## Unused Files (3)
These files are not imported anywhere and can potentially be removed:

1. **`src/hooks/useAddressSync.ts`** - Unused React hook
2. **`src/components/inputs/expiration-input.tsx`** - Unused input component
3. **`src/services/core/index.ts`** - Barrel file with no imports

## Unused Exports (34)
Functions and constants exported but never imported:

### API Functions
- `fetchCredits` - src/utils/blockchain/counterparty/api.ts
- `fetchDebits` - src/utils/blockchain/counterparty/api.ts

### Bitcoin Utilities
- `isAddressFormat` - src/utils/blockchain/bitcoin/address.ts
- `getAddressFormatLabel` - src/utils/blockchain/bitcoin/address.ts
- `getAddressFormatHint` - src/utils/blockchain/bitcoin/address.ts
- `signBIP322Universal` - src/utils/blockchain/bitcoin/bip322.ts
- `signBIP322` - src/utils/blockchain/bitcoin/bip322.ts
- `formatTaprootSignatureExtended` - src/utils/blockchain/bitcoin/bip322.ts
- `signMessageTaproot` - src/utils/blockchain/bitcoin/messageSigner.ts
- `signAllInputsWithUncompressedKey` - src/utils/blockchain/bitcoin/uncompressedSigner.ts

### Message Verifier
- `isSpecCompliant` - src/utils/blockchain/bitcoin/messageVerifier/verifier.ts
- `getVerificationReport` - src/utils/blockchain/bitcoin/messageVerifier/verifier.ts

### Memo Utilities
- `validateMemo` - src/utils/blockchain/counterparty/memo.ts
- `hexToText` - src/utils/blockchain/counterparty/memo.ts
- `textToHex` - src/utils/blockchain/counterparty/memo.ts

### Error Handling
- `getErrorMessage` - src/utils/axios.ts & src/utils/constants/errorCodes.ts
- `isApiError` - src/utils/axios.ts
- `isUserRejection` - src/utils/constants/errorCodes.ts
- `isConnectionError` - src/utils/constants/errorCodes.ts
- `isRecoverableError` - src/utils/constants/errorCodes.ts

### Browser Utilities
- `checkForLastErrorAndWarn` - src/utils/browser.ts
- `canReceiveMessages` - src/utils/browser.ts
- `pingTab` - src/utils/browser.ts
- `sendMessageWithTimeout` - src/utils/browser.ts
- `setupSafeMessageHandler` - src/utils/browser.ts

### Other Utilities
- `requestWithTimeout` - src/utils/axios.ts
- `watchStorageChanges` - src/utils/storage/storage.ts
- `withErrorBoundary` - src/components/error-boundary.tsx
- `withLock` - src/utils/wallet/stateLockManager.ts
- `areDestinationsComplete` - src/utils/validation/destinations.ts
- `validateDestinationCount` - src/utils/validation/destinations.ts
- `isValidWalletId` - src/utils/validation/session.ts
- `isValidTimeout` - src/utils/validation/session.ts

## Unused Types (6)
Type definitions that are exported but never imported:

1. `QRMatrix` - src/utils/qr-code/index.ts
2. `ConnectionPermissionRequest` - src/services/connection/ConnectionService.ts
3. `WalletLockMessage` - src/services/core/MessageBus.ts
4. `Keychain` - src/utils/wallet/types.ts
5. `DividendFormData` - src/pages/compose/dividend/form.tsx
6. `SignatureInfo` - src/utils/blockchain/bitcoin/messageVerifier/types.ts

## Recommendations

### Immediate Actions
1. Remove the 3 unused files
2. Remove obviously unused utility functions

### Consider Keeping
1. API functions that might be used in future features
2. Validation utilities that provide completeness
3. Type definitions that document the API structure

### Next Steps
1. Review each unused export to determine if it's:
   - Dead code that should be removed
   - Part of a public API that should be kept
   - A utility that might be useful in the future
2. Add `// @public` comments to exports that are intentionally public
3. Configure knip to ignore intentionally public APIs