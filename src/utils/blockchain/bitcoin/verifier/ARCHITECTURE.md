# Bitcoin Message Verifier Architecture

## Design Principles

1. **Spec Compliance First**: Our BIP-322 and BIP-137 implementations are strictly spec-compliant
2. **Compatibility Layer Separate**: Cross-platform quirks are handled in a separate layer
3. **No Contamination**: Platform-specific workarounds never modify the core spec implementations

## Structure

```
verifier/
├── specs/                    # PURE SPEC IMPLEMENTATIONS (DO NOT MODIFY FOR COMPATIBILITY)
│   ├── bip322.ts            # Strictly compliant BIP-322
│   ├── bip137.ts            # Strictly compliant BIP-137
│   └── legacy.ts            # Bitcoin Core legacy format
│
├── compatibility/            # CROSS-PLATFORM COMPATIBILITY LAYER
│   ├── bitcoinjs.ts         # Match bitcoinjs-message behavior
│   ├── bitcore.ts           # Match bitcore-message behavior
│   ├── freewallet.ts        # FreeWallet-specific quirks
│   ├── ledger.ts            # Ledger hardware wallet quirks
│   ├── sparrow.ts           # Sparrow wallet quirks
│   └── electrum.ts          # Electrum-specific handling
│
└── verifier.ts              # Main orchestrator
```

## Verification Flow

```
verifyMessage(message, signature, address, options)
    │
    ├── If options.strict = true
    │   └── Use ONLY spec-compliant verifiers
    │       ├── Try BIP-322 (specs/bip322.ts)
    │       ├── Try BIP-137 (specs/bip137.ts)
    │       └── Try Legacy (specs/legacy.ts)
    │
    └── If options.strict = false (default)
        ├── Try spec-compliant first (same as above)
        └── If failed, try compatibility layer
            ├── bitcoinjs compatibility
            ├── bitcore compatibility
            ├── Platform-specific quirks
            └── etc.
```

## Important Notes

### What belongs in specs/:
- Exact implementation of the BIP specifications
- No workarounds or hacks
- Should match the reference implementations
- If a wallet doesn't follow the spec, that's THEIR bug, not ours

### What belongs in compatibility/:
- Workarounds for known wallet bugs
- Alternative message formatting
- Different recovery algorithms
- Platform-specific quirks
- "Loose" verification modes

### Testing Strategy:
1. **Spec Tests**: Verify our implementations match the specifications exactly
2. **Compatibility Tests**: Verify we can handle real-world signatures from various wallets
3. **Keep them separate**: Don't mix spec tests with compatibility tests

## Example Usage

```typescript
// Strict mode - only use spec-compliant verification
const strictResult = await verifyMessage(message, signature, address, {
  strict: true
});

// Compatibility mode - try everything
const compatResult = await verifyMessage(message, signature, address, {
  strict: false,  // default
  platform: 'freewallet'  // optional hint
});
```

## Why This Matters

1. **Correctness**: Our spec implementations remain correct and can be audited against the BIPs
2. **Compatibility**: We can still verify signatures from buggy wallets
3. **Maintainability**: When wallets fix their bugs, we can easily remove workarounds
4. **Clarity**: It's clear what's spec-compliant and what's a workaround