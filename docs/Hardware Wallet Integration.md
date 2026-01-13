# Hardware Wallet Integration - Deep Analysis

> **Last Updated**: 2026-01-12
> **Status**: Complete - Full Trezor and Ledger support
> **Scope**: Hardware wallet adapters, device communication, signing operations

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File-by-File Analysis](#file-by-file-analysis)
4. [Consumer Analysis](#consumer-analysis)
5. [Pattern Consistency Review](#pattern-consistency-review)
6. [Security Analysis](#security-analysis)
7. [Integration Patterns](#integration-patterns)
8. [Quick Reference](#quick-reference)
9. [Future Enhancements](#future-enhancements)
10. [Changelog](#changelog)

---

## Overview

The hardware wallet module provides integration with Trezor and Ledger hardware wallets, enabling secure key storage and transaction signing without exposing private keys to the browser.

### Key Responsibilities
- Device connection and initialization
- Address derivation with on-device verification
- Extended public key (xpub) retrieval
- Transaction signing (raw and PSBT)
- Message signing (BIP-322 compatible)
- Device detection and status monitoring
- Operation timeout and error handling

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Adapter pattern | Consistent API across vendors, easy to add new devices |
| Singleton adapters | Prevents multiple connections, simplifies state |
| Session-only storage | Hardware wallets not persisted (security) |
| xpub-based derivation | Derive addresses without device after initial setup |
| 30-second timeouts | Balance UX with allowing time for device interaction |
| Observable → Promise | Ledger SDK uses RxJS, we convert for consistency |

### File Inventory

| File | Purpose | Lines |
|------|---------|-------|
| `types.ts` | Shared types, error class, derivation helpers | ~205 |
| `interface.ts` | `IHardwareWalletAdapter` contract | ~114 |
| `helpers.ts` | Vendor display helpers | ~28 |
| `trezorAdapter.ts` | Trezor Connect integration | ~450 |
| `ledgerAdapter.ts` | Ledger Device SDK integration | ~500 |
| `deviceDetection.ts` | WebHID device enumeration | ~250 |
| `operationManager.ts` | Timeouts, firmware validation | ~180 |
| `index.ts` | Factory and exports | ~74 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Hardware Wallet Module                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Public API (index.ts)                        │ │
│  │                                                                 │ │
│  │  getHardwareAdapter(vendor) → IHardwareWalletAdapter           │ │
│  │  isVendorSupported(vendor) → boolean                           │ │
│  │  getSupportedVendors() → ['trezor', 'ledger']                  │ │
│  │  getVendorLabel(vendor) → "Trezor" | "Ledger"                  │ │
│  │  getVendorConfirmInstructions(vendor) → string                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│              ┌───────────────┴───────────────┐                      │
│              ▼                               ▼                       │
│  ┌─────────────────────┐         ┌─────────────────────┐            │
│  │   TrezorAdapter     │         │   LedgerAdapter     │            │
│  │                     │         │                     │            │
│  │ @trezor/connect-    │         │ @ledgerhq/device-   │            │
│  │ webextension        │         │ management-kit      │            │
│  │                     │         │                     │            │
│  │ - USB/WebUSB        │         │ - WebHID            │            │
│  │ - Trezor Bridge     │         │ - Native USB        │            │
│  └─────────────────────┘         └─────────────────────┘            │
│              │                               │                       │
│              └───────────────┬───────────────┘                      │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                 IHardwareWalletAdapter Interface                │ │
│  │                                                                 │ │
│  │  init()              - Initialize device connection             │ │
│  │  getDeviceInfo()     - Get model, firmware, label               │ │
│  │  getAddress()        - Derive address, optionally show on device│ │
│  │  getAddresses()      - Batch address derivation                 │ │
│  │  getXpub()          - Get extended public key                   │ │
│  │  signTransaction()   - Sign raw transaction                     │ │
│  │  signMessage()       - Sign message (BIP-322)                   │ │
│  │  signPsbt()         - Sign PSBT                                 │ │
│  │  dispose()          - Cleanup resources                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Support Modules                              │ │
│  │                                                                 │ │
│  │  deviceDetection.ts     operationManager.ts      types.ts       │ │
│  │  - detectAllDevices()   - withTimeout()          - Types        │ │
│  │  - detectTrezor()       - managedOperation()     - Errors       │ │
│  │  - detectLedger()       - validateFirmware()     - Paths        │ │
│  │  - requestAccess()      - abortAll()             - Interfaces   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Dependencies

**External Packages:**
- `@trezor/connect-webextension` - Trezor communication
- `@ledgerhq/device-management-kit` - Ledger device management
- `@ledgerhq/device-signer-kit-bitcoin` - Ledger Bitcoin signing
- `@ledgerhq/device-transport-kit-web-hid` - Ledger WebHID transport

**Internal Dependencies:**
- Layer 6 (Blockchain): `AddressFormat`, address utilities
- Layer 3 (Storage): `HardwareWalletData` type

---

## File-by-File Analysis

### types.ts

**Purpose**: Core type definitions for hardware wallet operations.

| Export | Type | Description |
|--------|------|-------------|
| `HardwareWalletVendor` | Type | `'trezor' \| 'ledger'` |
| `HardwareConnectionStatus` | Type | Connection state enum |
| `HardwareDeviceInfo` | Interface | Device model, firmware, label |
| `HardwareAddress` | Interface | Address, publicKey, path |
| `HardwareSignInput` | Interface | Transaction input for signing |
| `HardwareSignOutput` | Interface | Transaction output for signing |
| `HardwareSignRequest` | Interface | Full signing request |
| `HardwarePsbtSignRequest` | Interface | PSBT signing request |
| `HardwareMessageSignRequest` | Interface | Message signing request |
| `HardwareWalletError` | Class | Custom error with code, vendor |
| `DerivationPaths` | Object | BIP44 path helpers |

**Key Patterns:**
```typescript
// Derivation path helpers
DerivationPaths.getBip44Path(AddressFormat.P2WPKH, 0, 0, 0)
// → [84 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]

DerivationPaths.pathToString([0x8000002C, 0x80000000, 0x80000000, 0, 0])
// → "m/44'/0'/0'/0/0"
```

---

### interface.ts

**Purpose**: Defines the adapter contract that all hardware wallet implementations must follow.

```typescript
export interface IHardwareWalletAdapter {
  init(): Promise<void>;
  isInitialized(): boolean;
  getConnectionStatus(): HardwareConnectionStatus;
  getDeviceInfo(): Promise<HardwareDeviceInfo | null>;
  getAddress(format, account?, index?, showOnDevice?, usePassphrase?): Promise<HardwareAddress>;
  getAddresses(format, account, startIndex, count, usePassphrase?): Promise<HardwareAddress[]>;
  getXpub(format, account?, usePassphrase?): Promise<string>;
  signTransaction(request): Promise<HardwareSignResult>;
  signMessage(request): Promise<HardwareMessageSignResult>;
  signPsbt(request): Promise<{ signedPsbtHex: string }>;
  dispose(): Promise<void>;
}
```

---

### helpers.ts

**Purpose**: Display and UX helper functions.

```typescript
// Get vendor display name
getVendorLabel('trezor')     // → "Trezor"
getVendorLabel('ledger')     // → "Ledger"
getVendorLabel(undefined)    // → "Hardware Wallet"

// Get device-specific instructions
getVendorConfirmInstructions('trezor')  // → "Press Confirm to approve"
getVendorConfirmInstructions('ledger')  // → "Press both buttons to approve"
```

**Usage**: These helpers ensure consistent vendor labeling and instructions across all UI components.

---

### trezorAdapter.ts

**Purpose**: Trezor hardware wallet integration using `@trezor/connect-webextension`.

**Initialization:**
```typescript
TrezorConnect.init({
  manifest: { email: 'support@xcpwallet.com', appUrl: 'https://xcpwallet.com' },
  lazyLoad: false,
  transports: ['BridgeTransport', 'WebUsbTransport'],
});
```

**Key Implementation Details:**
- Uses singleton pattern (`getTrezorAdapter()`)
- Supports Trezor Bridge and WebUSB transports
- Handles all address formats including Taproot
- Firmware validation for Taproot (Model T: 2.4.3+, Model One: 1.10.4+)
- Auto-confirm support for E2E testing

**Supported Operations:**
- `getAddress()` - All BIP44 formats
- `getXpub()` - Extended public key
- `signTransaction()` - Raw transaction signing
- `signMessage()` - Bitcoin message signing
- `signPsbt()` - PSBT signing (converted to Trezor format)

---

### ledgerAdapter.ts

**Purpose**: Ledger hardware wallet integration using Ledger Device Management Kit.

**Initialization:**
```typescript
const dmk = new DeviceManagementKitBuilder()
  .addTransport(webHidTransportFactory)
  .build();
await dmk.startDiscovering();
```

**Key Implementation Details:**
- Uses singleton pattern (`getLedgerAdapter()`)
- Converts RxJS Observables to Promises
- Maps address formats to Ledger descriptor templates
- Handles device session management
- Supports all Ledger devices (Nano S, Nano X, Nano S Plus, Stax, Flex)

**Observable → Promise Conversion:**
```typescript
async function executeSignerAction<T>(observable: Observable<DeviceActionState<T>>): Promise<T> {
  const finalState = await firstValueFrom(
    observable.pipe(
      filter(state => state.status === 'completed' || state.status === 'error')
    )
  );
  // Handle result...
}
```

---

### deviceDetection.ts

**Purpose**: Detect connected hardware wallets using WebHID.

**Vendor IDs:**
```typescript
const VENDOR_IDS = {
  LEDGER: 0x2c97,
  TREZOR: 0x1209,
  TREZOR_ALT: 0x534c,  // SatoshiLabs
};
```

**Functions:**
- `detectAllDevices()` - Check for all connected devices
- `detectTrezorDevices()` - Enumerate Trezor devices
- `detectLedgerDevices()` - Enumerate Ledger devices
- `requestLedgerAccess()` - Prompt user for device permission
- `getDeviceDisplayName()` - Pretty device name from detection info
- `getConnectionInstructions()` - Help text based on detection state

---

### operationManager.ts

**Purpose**: Operation lifecycle management, timeouts, and firmware validation.

**Timeout Handling:**
```typescript
const DEFAULT_TIMEOUT = 30000; // 30 seconds

await withTimeout(
  adapter.signTransaction(request),
  'trezor',
  'signTransaction',
  30000
);
```

**Firmware Requirements:**
```typescript
const FIRMWARE_REQUIREMENTS = {
  taproot: {
    trezor: { modelT: '2.4.3', modelOne: '1.10.4' },
    ledger: { bitcoinApp: '2.0.0' },
  },
};
```

**Abort Management:**
- `managedOperation()` - Wrap operations with abort signal
- `abortAllOperations()` - Cancel all pending operations (on disconnect)

---

## Consumer Analysis

### Who Imports What

```
walletManager.ts
├── getHardwareAdapter()     - Get adapter for signing
├── HardwareWalletData       - Type for wallet record
└── DerivationPaths          - Path utilities

connect-hardware.tsx
├── detectAllDevices()       - Check for connected devices
├── getConnectionInstructions()
├── getVendorConfirmInstructions()
└── HardwareWalletVendor     - Type

wallet-menu.tsx
└── (indirect via wallet.hardwareData.vendor)

sign-message.tsx
├── getVendorLabel()
└── getVendorConfirmInstructions()

composer.tsx / review-screen.tsx
├── getVendorLabel()
└── getVendorConfirmInstructions()
```

### Data Flow

```
User clicks "Connect Hardware Wallet"
         │
         ▼
┌─────────────────────────────────┐
│  connect-hardware.tsx           │
│  - Detect devices               │
│  - Select vendor/format         │
│  - Call createHardwareWallet()  │
└─────────────────┬───────────────┘
                  │
                  ▼
┌─────────────────────────────────┐
│  walletManager.createHardware   │
│  Wallet()                       │
│  1. getHardwareAdapter(vendor)  │
│  2. adapter.init()              │
│  3. adapter.getXpub()           │
│  4. adapter.getAddress()        │
│  5. Store in memory (not disk)  │
└─────────────────┬───────────────┘
                  │
                  ▼
┌─────────────────────────────────┐
│  Hardware wallet usable         │
│  - View addresses/balances      │
│  - Sign transactions            │
│  - Sign messages                │
└─────────────────────────────────┘
```

---

## Pattern Consistency Review

### Hardware Check Pattern

**Consistent across codebase:**
```typescript
// Type check
wallet.type === 'hardware'

// With data verification (for operations)
wallet.type === 'hardware' && wallet.hardwareData

// Vendor access
wallet.hardwareData?.vendor  // ✓ CORRECT
wallet?.vendor               // ✗ WRONG (was a bug, now fixed)
```

### Vendor Label Pattern

**Centralized via helpers:**
```typescript
// ✓ CORRECT - Use helper
getVendorLabel(wallet.hardwareData?.vendor)

// ✗ AVOID - Inline ternary
wallet.hardwareData?.vendor === 'ledger' ? 'Ledger' : 'Trezor'
```

### Error Handling

| Operation | Error Type | User Message |
|-----------|------------|--------------|
| Device not found | `HardwareWalletError` | Connection instructions |
| Timeout | `HardwareWalletError` | "Check device is unlocked" |
| User rejected | `HardwareWalletError` | "Action cancelled on device" |
| Firmware too old | `HardwareWalletError` | "Update firmware for Taproot" |

---

## Security Analysis

### Trust Boundaries

1. **Device → Browser**: All signing happens on device, only public data returned
2. **Browser → Device**: Only transaction data sent, never private keys
3. **Storage**: Hardware wallets stored in memory only (not persisted)

### Security Properties

| Property | Implementation |
|----------|---------------|
| Key isolation | Private keys never leave device |
| Address verification | Display on device before use |
| Transaction review | User must confirm on device |
| Session-only | Hardware wallets not persisted to storage |
| xpub exposure | Public key can derive addresses (not spend) |

### Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Malicious transaction | Device displays full details for review |
| Address substitution | Verify address on device screen |
| Man-in-the-middle | Device authenticates to wallet software |
| Replay attacks | Standard Bitcoin transaction signing |

---

## Integration Patterns

### Adding Hardware Wallet Support to a Component

```typescript
import { getVendorLabel, getVendorConfirmInstructions } from '@/utils/hardware';

// In component:
const isHardwareWallet = activeWallet?.type === 'hardware';
const vendor = activeWallet?.hardwareData?.vendor;

// Display:
{isHardwareWallet && (
  <div>
    Check your {getVendorLabel(vendor)}
    <p>{getVendorConfirmInstructions(vendor)}</p>
  </div>
)}
```

### Signing Flow with Hardware Wallet

```typescript
// In walletManager.ts
if (wallet.type === 'hardware' && wallet.hardwareData) {
  const adapter = getHardwareAdapter(wallet.hardwareData.vendor);
  await adapter.init();

  const result = await adapter.signPsbt({
    psbtHex,
    inputPaths: pathMap,
  });

  return result.signedPsbtHex;
}
```

---

## Quick Reference

### Supported Features

| Feature | Trezor | Ledger |
|---------|--------|--------|
| P2PKH (Legacy) | ✓ | ✓ |
| P2SH-P2WPKH (Nested SegWit) | ✓ | ✓ |
| P2WPKH (Native SegWit) | ✓ | ✓ |
| P2TR (Taproot) | ✓ (fw 2.4.3+) | ✓ (app 2.0.0+) |
| Message signing | ✓ | ✓ |
| PSBT signing | ✓ | ✓ |
| Passphrase (hidden wallet) | ✓ | ✓ |
| Multiple accounts | ✓ | ✓ |

### Default Configuration

| Setting | Value |
|---------|-------|
| Operation timeout | 30 seconds |
| Default account | 0 |
| Address display | Show on device |

### Import Patterns

```typescript
// Types only
import type { HardwareWalletVendor, HardwareDeviceInfo } from '@/utils/hardware/types';

// Factory and helpers
import { getHardwareAdapter, getVendorLabel } from '@/utils/hardware';

// Detection
import { detectAllDevices, getConnectionInstructions } from '@/utils/hardware';
```

---

## Future Enhancements

### Watch-Only Wallet Support

A potential v2 feature would allow saving hardware wallets as watch-only:

```
Current Hardware Wallet (memory-only)
         │
         │ "Save as Watch-Only"
         ▼
Watch-Only Wallet (persisted)
├── type: 'watchOnly'
├── xpub: 'xpub...'           ← Stored (public, safe)
├── linkedVendor: 'trezor'    ← Which device to prompt
└── addresses: [...]          ← Derived from xpub
```

**Benefits:**
- View balances without device connected
- Prompt to connect device only when signing needed
- One watch-only wallet per vendor (avoid confusion)

**Implementation Path:**
1. Add `'watchOnly'` to `WalletType`
2. Store `xpub` + `linkedVendor` in wallet record
3. Update signing flow to handle watch-only → hardware handoff

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-12 | Added helpers.ts with getVendorLabel() and getVendorConfirmInstructions() |
| 2026-01-12 | Fixed vendor access bug (wallet.vendor → wallet.hardwareData.vendor) |
| 2026-01-12 | Documentation created |
| 2026-01-12 | Added operation timeouts and firmware validation |
| 2026-01-12 | Added device detection via WebHID |
| 2026-01-12 | Completed Ledger adapter with full signing support |
| 2026-01-11 | Initial Trezor adapter implementation |
