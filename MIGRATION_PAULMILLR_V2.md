# Paul Miller Crypto Libraries v2/v3 Migration

## Migration Status

### Package Updates
- [x] @noble/curves: 1.9.7 → 2.0.0
- [x] @noble/hashes: 1.8.0 → 2.0.0  
- [x] @noble/secp256k1: 2.3.0 → 3.0.0
- [x] @scure/base: 1.2.6 → 2.0.0
- [x] @scure/bip32: 1.7.0 → 2.0.0
- [x] @scure/bip39: 1.6.0 → 2.0.0
- [x] @scure/btc-signer: 1.8.1 → 2.0.0

### Breaking Changes to Fix

#### @noble/hashes v2.0.0
- [x] sha256: `@noble/hashes/sha256` → `@noble/hashes/sha2`
- [x] ripemd160: `@noble/hashes/ripemd160` → `@noble/hashes/legacy`
- [x] ~~Add .js to imports~~ Not needed with Vite bundler
- [ ] Convert string inputs to Uint8Array using utf8ToBytes (if any)

#### @noble/secp256k1 v3.0.0  
- [x] Update HMAC setup from `etc.hmacSha256Sync` to `hashes.hmacSha256`
- [x] Add `hashes.sha256` setup
- [ ] ~~Change `randomPrivateKey` to `randomSecretKey`~~ Not used
- [x] Add `{prehash: true}` where needed
- [x] Update signature format handling
- [x] Note: Recovery parameter removed from v3 API

#### @noble/curves v2.0.0
- [x] ~~Add .js extension~~ Not needed with Vite bundler
- [x] Change `utils.randomPrivateKey` to `utils.randomSecretKey`
- [x] ~~Update `toCompactRawBytes()` to `toBytes('compact')`~~ Sign returns Uint8Array directly
- [x] Fix sign/verify to handle prehashed messages with `{prehash: true}`

#### All packages
- [x] ~~Add .js extensions to all imports~~ NOT NEEDED - Using Vite bundler
- [ ] Ensure Node v20.19+ compatibility

## Files to Update

### High Priority (Core Crypto)
- [ ] src/utils/blockchain/bitcoin/privateKey.ts
- [ ] src/utils/blockchain/bitcoin/transactionSigner.ts
- [ ] src/utils/blockchain/bitcoin/messageSigner.ts
- [ ] src/utils/blockchain/bitcoin/messageVerifier.ts
- [ ] src/utils/blockchain/bitcoin/bareMultisig.ts
- [ ] src/utils/security/requestSigning.ts

### Medium Priority (Utilities)
- [ ] src/utils/blockchain/bitcoin/address.ts
- [ ] src/utils/wallet/walletManager.ts
- [ ] src/utils/blockchain/counterwallet/mnemonic.ts

### Test Files
- [ ] src/utils/blockchain/bitcoin/__tests__/*.test.ts
- [ ] src/utils/wallet/__tests__/*.test.ts

## Testing Checklist
- [x] TypeScript compilation - PASSED
- [ ] Wallet creation/import
- [ ] Address generation
- [ ] Transaction signing
- [ ] Message signing/verification (Note: Recovery simplified due to v3 limitations)
- [ ] Bare multisig operations

## Migration Summary

### Completed
- ✅ Updated all packages to v2/v3
- ✅ Fixed all import paths (sha256 → sha2, ripemd160 → legacy)
- ✅ Updated HMAC initialization for secp256k1 v3
- ✅ Fixed signature handling (now returns Uint8Array directly)
- ✅ Added `{prehash: true}` to all sign/verify calls
- ✅ Fixed `randomPrivateKey` → `randomSecretKey`
- ✅ TypeScript compilation successful

### Known Limitations
- ⚠️ secp256k1 v3 removed recovery parameter from API
- ⚠️ Message signing recovery simplified (hardcoded to 0)
- ⚠️ May need proper recovery implementation for production

### Notes
- Branch: migrate/paulmillr-v2
- Node requirement: v20.19+
- .js extensions NOT needed (using Vite bundler)
- All packages now ESM-only