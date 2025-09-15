# BIP-322 Implementation Notes

## Overview
This extension implements a clear separation between signing and verification:
- **Signing**: ONLY uses proper BIP-322 implementation for all address types
- **Verification**: Supports BIP-322, BIP-137, Legacy formats with cross-platform compatibility

## Signing vs Verification Strategy

### Signing (What We Create)
We **ONLY** sign messages using the proper BIP-322 standard:
- ✅ BIP-322 for P2PKH addresses
- ✅ BIP-322 for P2WPKH addresses
- ✅ BIP-322 for P2SH-P2WPKH addresses
- ✅ BIP-322 for P2TR addresses
- ❌ NO BIP-137/Legacy signing
- ❌ NO non-standard signing methods

This ensures our signatures are future-proof and follow the latest Bitcoin standards.

### Verification (What We Accept)
We verify signatures from multiple standards for maximum compatibility:
1. **BIP-322** - Primary verification method
2. **BIP-137** - With loose verification for wallet compatibility
3. **Legacy** - For older wallet implementations

This allows us to verify signatures from:
- Bitcore/FreeWallet (BIP-137/Legacy)
- Electrum (BIP-137)
- Ledger (BIP-137, including non-standard Taproot)
- Sparrow (BIP-137, including non-standard Taproot)
- Bitcoin Core (Strict BIP-137)
- Trezor (BIP-137)
- Our own extension (BIP-322)

## Implementation Features

### 1. Full BIP-322 Support
- **P2PKH** (Legacy addresses starting with `1`)
- **P2WPKH** (Native SegWit addresses starting with `bc1q`)
- **P2SH-P2WPKH** (Nested SegWit addresses starting with `3`)
- **P2TR** (Taproot addresses starting with `bc1p`)

### 2. BIP-137 Compatibility with Loose Verification
Our implementation includes "loose BIP-137 verification" which allows signatures with incorrect header flags to still be validated. This is crucial for compatibility with wallets like:
- **Ledger**: Signs Taproot addresses using BIP-137 format
- **Sparrow**: Uses BIP-137 for Taproot (non-standard)
- **Electrum**: Various implementations across versions
- **Trezor**: BIP-137 with specific header flags

### 3. Verification Fallback Chain
```
1. Try BIP-322 verification first
2. If fails, try BIP-137 with loose verification (default)
3. Support for strict BIP-137 verification (optional)
```

## Key Files

- `src/utils/blockchain/bitcoin/bip322.ts` - Complete BIP-322 implementation
- `src/utils/blockchain/bitcoin/messageVerifier.ts` - Verification with fallback chain
- `src/utils/blockchain/bitcoin/messageSigner.ts` - Signing implementation

## Test Files

- `__tests__/bip322-standardness.test.ts` - Tests from bip322-js reference implementation
- `__tests__/cross-platform-compatibility.test.ts` - Cross-wallet compatibility tests
- `__tests__/bip322-comprehensive.test.ts` - Comprehensive verification tests

## Known Compatibility Issues

### Ledger/Sparrow Taproot Signatures
Some wallets (Ledger, Sparrow) sign Taproot addresses using BIP-137 format instead of BIP-322. This means:
- The signature has a BIP-137 header flag (27-42)
- The public key is recovered from the signature
- The signature verifies against the P2PKH address derived from the same public key

**Our Solution**: Loose BIP-137 verification checks if the recovered public key can derive any standard address type that matches the target address.

### Header Flag Mismatches
Some wallet implementations use incorrect header flags:
- Using flag 27 (P2PKH uncompressed) for a Native SegWit address
- Using flag 31 (P2PKH compressed) for a Taproot address

**Our Solution**: With loose verification enabled (default), we ignore the header flag type and check if the public key matches.

## API Usage

### Basic Verification
```typescript
import { verifyMessage } from './messageVerifier';

const isValid = await verifyMessage(message, signature, address);
```

### Verification with Method Details
```typescript
import { verifyMessageWithMethod } from './messageVerifier';

const result = await verifyMessageWithMethod(message, signature, address);
// result = { valid: true, method: 'BIP-322 (Native SegWit)' }
```

### Explicit Loose/Strict BIP-137
```typescript
import { verifyMessageWithLooseBIP137 } from './messageVerifier';

// With loose verification (default)
const isValid = await verifyMessageWithLooseBIP137(message, signature, address, true);

// With strict verification
const isValidStrict = await verifyMessageWithLooseBIP137(message, signature, address, false);
```

## Testing

Run the tests:
```bash
# All BIP-322 tests
npm test -- src/utils/blockchain/bitcoin/__tests__/bip322

# Standardness tests
npm test -- src/utils/blockchain/bitcoin/__tests__/bip322-standardness.test.ts

# Cross-platform compatibility tests
npm test -- src/utils/blockchain/bitcoin/__tests__/cross-platform-compatibility.test.ts
```

## References

- [BIP-322 Specification](https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki)
- [BIP-137 Specification](https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki)
- [bip322-js Library](https://github.com/ACken2/bip322-js) - Reference implementation
- [BitonicNL verify-signed-message](https://github.com/BitonicNL/verify-signed-message) - Go implementation
- [bitcore-message](https://github.com/bitpay/bitcore-message) - Legacy signing

## Implementation Status

✅ **Completed:**
- Full BIP-322 signing for all address types
- Full BIP-322 verification for all address types
- BIP-137 legacy signature verification
- Loose BIP-137 verification for cross-wallet compatibility
- Comprehensive test suite
- Fallback verification chain

⚠️ **Known Limitations:**
- Some edge cases with specific wallet implementations may not verify
- Full BIP-322 "Full" and "Full (Proof-of-Funds)" signing not implemented (only "Simple" signing)
- Multi-signature address support not implemented

## Troubleshooting

If signatures from a specific wallet are not verifying:

1. Check the signature format (BIP-322 witness data vs BIP-137 65-byte format)
2. Try both loose and strict verification modes
3. Verify the address type matches what the wallet expects
4. Check if the wallet uses a non-standard implementation (like Ledger with Taproot)

For debugging, use `verifyMessageWithMethod()` to see which verification method succeeded or failed.