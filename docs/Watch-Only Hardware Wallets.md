# Watch-Only Hardware Wallets

## Overview

This document proposes a feature to save hardware wallet configurations as "watch-only" wallets, allowing users to view balances and transaction history without their hardware device connected, while still requiring the device for signing transactions.

## Problem Statement

Currently, hardware wallets in XCP Wallet are session-only:
- Users must connect their device every time they open the extension
- Wallet data (addresses, xpub) is stored only in memory
- Closing the extension loses the hardware wallet state
- Users cannot quickly check balances without their device present

## Proposed Solution

Add an option to "Save as Watch-Only" for connected hardware wallets. This would:

1. **Persist the xpub and addresses** to encrypted storage (same as software wallets)
2. **Allow viewing without device** - Check balances, view history, generate addresses
3. **Require device for signing** - When a transaction needs signing, prompt user to connect their hardware wallet
4. **Limit to one per vendor** - Only one Trezor and one Ledger watch-only wallet to avoid confusion

## User Flow

### Saving as Watch-Only

```
User connects Trezor/Ledger
         │
         ▼
    Wallet appears in
    wallet list (session)
         │
         ▼
    User opens wallet menu
         │
         ▼
    Selects "Save as Watch-Only"
         │
         ▼
    ┌─────────────────────────┐
    │ Confirmation Dialog     │
    │                         │
    │ "Save this wallet as    │
    │ watch-only? You'll be   │
    │ able to view balances   │
    │ without your device,    │
    │ but signing will still  │
    │ require your Trezor."   │
    │                         │
    │ [Cancel]  [Save]        │
    └─────────────────────────┘
         │
         ▼
    Enter app password
    (for encryption)
         │
         ▼
    Wallet saved to storage
    with type: 'watch-only'
```

### Using Watch-Only Wallet

```
User opens extension
         │
         ▼
    Watch-only wallet appears
    in wallet list (persisted)
         │
         ▼
    User can:
    • View balances ✓
    • View transaction history ✓
    • Generate receiving addresses ✓
    • Copy addresses ✓
         │
         ▼
    User initiates a send/sign
         │
         ▼
    ┌─────────────────────────┐
    │ Connect Device          │
    │                         │
    │ "To sign this           │
    │ transaction, please     │
    │ connect your Trezor."   │
    │                         │
    │ [Cancel]  [Connect]     │
    └─────────────────────────┘
         │
         ▼
    Device connects and signs
         │
         ▼
    Transaction broadcast
```

## Data Model

### Current Wallet Types

```typescript
type WalletType = 'software' | 'hardware';
```

### Proposed Wallet Types

```typescript
type WalletType = 'software' | 'hardware' | 'watch-only';
```

### Watch-Only Wallet Data

```typescript
interface WatchOnlyWalletData {
  // Standard wallet fields
  id: string;
  name: string;
  type: 'watch-only';
  addressFormat: AddressFormat;
  addresses: WalletAddress[];

  // Hardware wallet origin info
  hardwareData: {
    vendor: HardwareWalletVendor;  // 'trezor' | 'ledger'
    xpub: string;
    accountIndex: number;
    derivationPath: string;
    // No device fingerprint - that's session-only
  };
}
```

### Storage Changes

```typescript
// Current storage structure
interface StoredWallets {
  wallets: (SoftwareWallet | HardwareWallet)[];
}

// Proposed storage structure
interface StoredWallets {
  wallets: (SoftwareWallet | WatchOnlyWallet)[];
  // Note: Session hardware wallets are NOT stored
}
```

## Implementation Details

### 1. Wallet Type Detection

```typescript
// Helper to check wallet capabilities
function canSign(wallet: Wallet): boolean {
  if (wallet.type === 'software') return true;
  if (wallet.type === 'hardware') return true;  // Device connected
  if (wallet.type === 'watch-only') return false;  // Need to connect device
  return false;
}

function needsDeviceForSigning(wallet: Wallet): boolean {
  return wallet.type === 'watch-only';
}
```

### 2. Signing Flow for Watch-Only

When user initiates a transaction from a watch-only wallet:

1. Detect wallet type is 'watch-only'
2. Show "Connect Device" prompt with vendor-specific instructions
3. Initialize hardware adapter for `wallet.hardwareData.vendor`
4. Connect device and verify it matches the wallet (same xpub)
5. Proceed with normal hardware signing flow
6. After signing, device state is not persisted (remains watch-only)

### 3. Vendor Limit Enforcement

```typescript
async function saveAsWatchOnly(wallet: HardwareWallet): Promise<void> {
  const existing = wallets.find(
    w => w.type === 'watch-only' &&
         w.hardwareData?.vendor === wallet.hardwareData?.vendor
  );

  if (existing) {
    throw new Error(
      `You already have a watch-only ${getVendorLabel(wallet.hardwareData?.vendor)} wallet. ` +
      `Remove "${existing.name}" first to save a different one.`
    );
  }

  // Proceed with saving...
}
```

### 4. xPub Verification on Signing

When connecting device for signing:

```typescript
async function verifyDeviceMatchesWallet(
  adapter: IHardwareWalletAdapter,
  wallet: WatchOnlyWallet
): Promise<boolean> {
  const deviceXpub = await adapter.getXpub(
    wallet.hardwareData.derivationPath
  );

  if (deviceXpub !== wallet.hardwareData.xpub) {
    throw new HardwareWalletError(
      'Device does not match this wallet. Please connect the correct device.',
      'DEVICE_MISMATCH',
      wallet.hardwareData.vendor
    );
  }

  return true;
}
```

## UI Changes

### Wallet List

```
┌────────────────────────────────┐
│ My Wallets                     │
├────────────────────────────────┤
│ 🔐 Main Wallet                 │  ← Software wallet
│    bc1q...xyz                  │
├────────────────────────────────┤
│ 👁 Trezor Watch-Only           │  ← Watch-only (eye icon)
│    bc1q...abc                  │
│    ⚡ Connect device to sign   │  ← Subtle hint
├────────────────────────────────┤
│ 🔌 Ledger (Connected)          │  ← Session hardware
│    bc1q...def                  │
└────────────────────────────────┘
```

### Wallet Menu Options

For watch-only wallets:
- View Addresses
- Show xPub
- **Remove Watch-Only Wallet** (replaces Disconnect)
- Rename

### Transaction Review

When signing from watch-only wallet, show additional step:

```
┌─────────────────────────────────┐
│ Step 1: Connect Your Trezor     │
│                                 │
│ To sign this transaction,       │
│ connect your Trezor device.     │
│                                 │
│ [Waiting for device...]         │
└─────────────────────────────────┘
         │
         ▼ (device connected)
┌─────────────────────────────────┐
│ Step 2: Review on Device        │
│                                 │
│ Review the transaction on       │
│ your Trezor screen.             │
│                                 │
│ Press Confirm to approve.       │
└─────────────────────────────────┘
```

## Security Considerations

### What's Stored

| Data | Stored? | Risk Level |
|------|---------|------------|
| xPub | Yes (encrypted) | Low - can derive addresses, see history |
| Addresses | Yes (encrypted) | Low - public information |
| Private Keys | Never | N/A - stays on device |
| Device ID | No | N/A |

### Password Protection

- Watch-only wallet data encrypted with user's app password
- Same encryption as software wallets
- xPub reveal requires password confirmation

### Device Verification

- Before signing, verify connected device produces same xpub
- Prevents signing with wrong device (e.g., different seed)
- Shows clear error if device doesn't match

## Migration Path

For users with existing hardware wallets:

1. **No automatic migration** - Users opt-in to save as watch-only
2. **Session wallets remain session** - Existing behavior unchanged
3. **Can have both** - Session hardware wallet + different watch-only wallet

## Future Considerations

### Multi-Account Watch-Only

Currently proposed: One watch-only per vendor.

Future possibility: Multiple accounts from same device as separate watch-only wallets.

### Address Gap Handling

Watch-only wallets need to track address derivation index:
- When generating new addresses, increment index
- Store highest used index for proper gap limit handling

### Sync with Device

Option to "Sync" watch-only wallet when device is connected:
- Verify xpub still matches
- Update device info if firmware changed
- Confirm addresses are still valid

## Implementation Checklist

- [ ] Add 'watch-only' to WalletType union
- [ ] Create WatchOnlyWallet interface
- [ ] Add "Save as Watch-Only" menu option
- [ ] Implement vendor limit check
- [ ] Create device connection flow for signing
- [ ] Implement xpub verification on device connect
- [ ] Update wallet list UI with watch-only indicators
- [ ] Add "Remove Watch-Only Wallet" option
- [ ] Update transaction flow to detect watch-only
- [ ] Add E2E tests for watch-only flow
- [ ] Update documentation
