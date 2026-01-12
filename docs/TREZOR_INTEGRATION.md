# Trezor Hardware Wallet Integration

This document describes the Trezor hardware wallet integration in XCP Wallet, including what has been implemented, tested, and what needs further verification.

## Overview

The Trezor integration allows users to:
- Connect their Trezor device to XCP Wallet
- Derive addresses using BIP44/49/84/86 paths
- Sign Bitcoin transactions (including Counterparty OP_RETURN transactions)
- Sign PSBT (Partially Signed Bitcoin Transactions)
- Sign messages

## Architecture

### TrezorAdapter (`src/utils/hardware/trezorAdapter.ts`)

The main interface for Trezor communication, implementing `IHardwareWalletAdapter`.

**Key Features:**
- Uses `@trezor/connect-webextension` for browser extension service worker compatibility
- Supports two modes:
  - **Production mode**: Opens Trezor Connect popup for user confirmation
  - **Test mode**: Direct BridgeTransport communication for automated testing
- String-based derivation paths to avoid JavaScript signed integer issues

### Configuration Options

```typescript
interface TrezorAdapterOptions {
  testMode?: boolean;        // Use direct bridge communication (no popup)
  connectSrc?: string;       // Custom Trezor Connect source URL
  debug?: boolean;           // Enable debug logging
  onButtonRequest?: (code: string) => void;  // Callback for auto-confirm in tests
}
```

## What Works (Tested)

### Unit Tests (31 tests passing)

| Feature | Status | Notes |
|---------|--------|-------|
| Initialization (production mode) | ✅ Tested | WebUsbTransport, popup enabled |
| Initialization (test mode) | ✅ Tested | BridgeTransport, popup disabled |
| Get single address | ✅ Tested | All address formats (P2PKH, P2WPKH, P2SH-P2WPKH, P2TR) |
| Get batch addresses | ✅ Tested | Multiple addresses in single call |
| Get xpub | ✅ Tested | Account-level extended public keys |
| Sign transaction | ✅ Tested | Including OP_RETURN for Counterparty |
| Sign PSBT | ✅ Tested | Parses PSBT, converts to Trezor format |
| Sign message | ✅ Tested | BIP-322 compatible |
| Device events | ✅ Tested | Connect/disconnect handling |
| Error handling | ✅ Tested | HardwareWalletError with proper codes |

### E2E Tests (7 tests)

| Test | Status | Notes |
|------|--------|-------|
| Navigate to connect page | ⏸️ Skipped | Requires emulator |
| Connect and derive address | ⏸️ Skipped | Requires emulator |
| Trezor popup detection | ⏸️ Skipped | Requires emulator |
| SDK validation | ⏸️ Skipped | Requires emulator |
| Full integration proof | ⏸️ Skipped | Requires emulator |
| Test mode config | ✅ Passing | Verifies configuration |
| Derivation path format | ✅ Passing | Verifies string paths |

## Derivation Paths

All paths use string format to avoid JavaScript signed integer issues with hardened values:

| Address Format | Path | Example |
|---------------|------|---------|
| Legacy (P2PKH) | `m/44'/0'/0'/0/{index}` | `m/44'/0'/0'/0/0` |
| Nested SegWit (P2SH-P2WPKH) | `m/49'/0'/0'/0/{index}` | `m/49'/0'/0'/0/0` |
| Native SegWit (P2WPKH) | `m/84'/0'/0'/0/{index}` | `m/84'/0'/0'/0/0` |
| Taproot (P2TR) | `m/86'/0'/0'/0/{index}` | `m/86'/0'/0'/0/0` |

### Why String Paths?

JavaScript uses signed 32-bit integers for bitwise operations. The hardened bit (0x80000000) would be interpreted as a negative number:

```javascript
// Numeric array - PROBLEMATIC
[84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]
// Results in: [-2147483564, -2147483648, -2147483648, 0, 0]

// String path - CORRECT
"m/84'/0'/0'/0/0"
```

## Expected Test Addresses

Using the test mnemonic `all all all all all all all all all all all all`:

| Format | Address |
|--------|---------|
| P2WPKH (m/84'/0'/0'/0/0) | `bc1qannfxke2tfd4l7vhepehpvt05y83v3qsf6nfkk` |
| P2PKH (m/44'/0'/0'/0/0) | `1JAd7XCBzGudGpJQSDSfpmJhiygtLQWaGL` |
| P2SH-P2WPKH (m/49'/0'/0'/0/0) | `3L6TyTisPBmrDAj6RoKmDzNnj4eQi54gD2` |
| P2TR (m/86'/0'/0'/0/0) | `bc1pswrqtykue8r89t9u4rprjs0gt4qzkdfuursfnvqaa3f2yql07zmq8s8a5u` |

## Testing with Trezor Emulator

### Prerequisites

1. **trezor-user-env container** - Provides:
   - Trezor Bridge on `localhost:21325`
   - Emulator HTTP API on `localhost:9001`
   - WebSocket control on `localhost:21326`

2. **Environment variable**: `TREZOR_EMULATOR_AVAILABLE=1`

### Running E2E Tests in CI

The GitHub Actions workflow (`.github/workflows/trezor-emulator-tests.yml`) sets up the emulator environment automatically.

### Local Emulator Testing

```bash
# Start trezor-user-env (Docker required)
docker run -it -p 21325:21325 -p 9001:9001 -p 21326:21326 trezor/trezor-user-env

# Set environment variable
export TREZOR_EMULATOR_AVAILABLE=1

# Run tests
npx playwright test e2e/hardware/trezor.spec.ts
npx playwright test e2e/hardware/trezor-direct.spec.ts
```

### Emulator Control API

Helper functions in `e2e/helpers/trezor-emulator.ts`:

```typescript
// Press Yes/No on emulator
await emulatorPressYes();
await emulatorPressNo();

// Auto-confirm multiple times
await autoConfirm(5, 500);  // 5 times, 500ms delay

// Start background auto-confirm loop
const stop = startAutoConfirm(300);  // 300ms interval
// ... do operations ...
stop();  // Stop loop

// Check status
const status = await getEmulatorStatus();
console.log(status);  // { available, bridgeAvailable, deviceConnected }
```

## Known Limitations

### 1. Popup Mode in Extensions

The Trezor Connect popup (`connect.trezor.io`) cannot communicate with localhost-hosted emulators in browser extension context. This is why test mode uses direct BridgeTransport.

### 2. PSBT Finalization

Trezor's `signTransaction` returns a fully signed raw transaction, not a PSBT. The `signPsbt` method returns this raw transaction as `signedPsbtHex` - callers should be aware this is finalized.

### 3. Passphrase Entry

Passphrase entry happens on the Trezor device, not in the extension. The extension passes `useEmptyPassphrase: false` to trigger device passphrase entry.

### 4. Taproot (P2TR) Support

Taproot requires Trezor firmware 2.4.3+ (Model T) or 1.10.4+ (Model One). Older firmware will reject P2TR operations.

## Feature Support Matrix

| Feature | Support | Notes |
|---------|---------|-------|
| Address derivation | Full | All formats (P2PKH, P2WPKH, P2SH-P2WPKH, P2TR) |
| Message signing | Full | Works via `/actions/sign-message` page |
| Transaction signing | Full | Including OP_RETURN for Counterparty |
| PSBT signing | Partial | Returns finalized tx, not PSBT |
| Address type switching | Not supported | Must reconnect with new format |
| Multiple formats | Full | Same Trezor can be added multiple times |
| Passphrase (hidden wallet) | Full | Enabled via checkbox on connect |

## Address Type Switching

**Hardware wallets cannot change address type after connection.**

This is by design because:
- Address format determines the derivation path (m/44' vs m/84' vs m/86')
- Each format uses a different xpub from the device
- Changing format would require re-connecting to get a new xpub

**User workflow for different formats:**
1. Connect Trezor with Native SegWit (bc1q addresses)
2. To also use Legacy addresses, go to Add Wallet
3. Connect the same Trezor again, selecting Legacy format
4. Both wallets appear in the wallet list, same device, different formats

The settings page shows an informational message for hardware wallets explaining this behavior.

## What Needs More Testing

### 1. Real Device Testing

- [ ] Test with physical Trezor Model T
- [ ] Test with physical Trezor Model One
- [ ] Verify addresses match expected values
- [ ] Test transaction signing with real UTXOs

### 2. Counterparty Operations

- [ ] Sign Counterparty send (OP_RETURN + regular outputs)
- [ ] Sign dispenser creation
- [ ] Sign UTXO attach operation
- [ ] Verify OP_RETURN data is preserved correctly

### 3. Edge Cases

- [ ] Multiple accounts (account > 0)
- [ ] High address indices (index > 100)
- [ ] Very large transactions (many inputs/outputs)
- [ ] Passphrase-protected wallets

### 4. Error Recovery

- [ ] Device disconnection during operation
- [ ] User cancellation handling
- [ ] PIN entry failures
- [ ] Firmware version incompatibilities

## Future Improvements

1. **Better Popup Handling**: Investigate if we can detect popup closure vs. user cancellation
2. **Watch-Only Mode**: Allow viewing balances without device connected
3. **Multi-Device Support**: Handle multiple Trezor devices
4. **Ledger Support**: Implement similar adapter for Ledger devices

## Files Reference

| File | Purpose |
|------|---------|
| `src/utils/hardware/trezorAdapter.ts` | Main Trezor adapter implementation |
| `src/utils/hardware/interface.ts` | Hardware wallet interface definition |
| `src/utils/hardware/types.ts` | Type definitions |
| `src/utils/hardware/__tests__/trezorAdapter.test.ts` | Unit tests (31 tests) |
| `src/pages/wallet/connect-hardware.tsx` | UI for connecting hardware wallet |
| `e2e/hardware/trezor.spec.ts` | UI-based E2E tests |
| `e2e/hardware/trezor-direct.spec.ts` | Direct API E2E tests |
| `e2e/helpers/trezor-emulator.ts` | Emulator control helpers |
| `.github/workflows/trezor-emulator-tests.yml` | CI workflow for emulator tests |

## Dependencies

```json
{
  "@trezor/connect-webextension": "^9.7.1"
}
```

Required manifest permissions:
```json
{
  "permissions": ["scripting"],
  "host_permissions": ["*://connect.trezor.io/9/*"]
}
```
