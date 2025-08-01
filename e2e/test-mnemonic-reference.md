# Test Mnemonic Reference

## Standard Test Mnemonic
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

This is a well-known test mnemonic used throughout the Bitcoin/cryptocurrency community for testing purposes.

## Expected Addresses

When using the test mnemonic with derivation path m/84'/0'/0'/0/0 (first address), the following addresses should be generated:

### Address Types
- **Legacy (P2PKH)**: `1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA`
- **Native SegWit (P2WPKH)**: `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`
- **Nested SegWit (P2SH-P2WPKH)**: `37Lx99uaGn5avKBxiW26HjedQE3LrDCZru`
- **Taproot (P2TR)**: `bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr`

## Benefits of Using This Test Mnemonic

1. **Deterministic**: Always generates the same addresses
2. **Well-Known**: Widely recognized in the Bitcoin community
3. **Safe**: Everyone knows this is a test wallet - no risk of accidental use
4. **Verifiable**: Can verify address generation against known values

## Test Scenarios

This mnemonic is perfect for testing:
- Address type switching
- Wallet import functionality
- Address derivation correctness
- Multi-wallet management (same mnemonic, different address types)
- Backup and restore flows