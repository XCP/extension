# Trezor Real Device Test Plan

## Prerequisites

- [ ] Trezor device connected via USB
- [ ] Trezor Bridge installed and running (check http://localhost:21325/)
- [ ] Device unlocked with PIN
- [ ] Extension loaded in Chrome (`chrome://extensions` → Load unpacked → `.output/chrome-mv3-dev`)

---

## Test 1: Connection Flow

### Steps
1. Open extension popup
2. Create a new wallet (if needed) or unlock existing
3. Navigate to: **Menu → Add Wallet → Use Trezor Connect**
4. Click **Connect Trezor**

### Expected
- [ ] Trezor Connect popup appears
- [ ] Device shows "Export public key for BTC?" or similar
- [ ] After confirming on device, see "Wallet Found" with address

### Record
- Address shown: `____________________`
- Address format: [ ] bc1q (Native SegWit) [ ] bc1p (Taproot) [ ] 1... (Legacy) [ ] 3... (Nested)
- Any errors: ____________________

---

## Test 2: Address Verification

### Steps
1. After connecting, note the address shown
2. Compare with Trezor Suite or another wallet using same seed

### Expected
- [ ] Address matches what Trezor Suite shows for same derivation path
- [ ] m/84'/0'/0' for Native SegWit (bc1q...)
- [ ] m/86'/0'/0' for Taproot (bc1p...)

### Record
- Extension address: `____________________`
- Trezor Suite address: `____________________`
- Match: [ ] Yes [ ] No

---

## Test 3: Message Signing

### Steps
1. With hardware wallet active, navigate to **Actions → Sign Message** (or similar)
2. Enter message: `Test message from XCP Wallet`
3. Click Sign
4. Confirm on Trezor device (may need multiple confirmations)

### Expected
- [ ] Device shows message text
- [ ] Device shows signing address
- [ ] After confirm, signature appears in extension

### Record
- Message signed: [ ] Yes [ ] No
- Signature (first 20 chars): `____________________`
- Any errors: ____________________

---

## Test 4: Cancel on Device

### Steps
1. Navigate to **Add Wallet → Use Trezor Connect**
2. Click Connect Trezor
3. When device prompts, press **Cancel/X** on Trezor

### Expected
- [ ] Extension shows user-friendly error message
- [ ] No crash or hang
- [ ] Can retry connection

### Record
- Error message shown: `____________________`
- Graceful handling: [ ] Yes [ ] No

---

## Test 5: Device Disconnect Mid-Operation

### Steps
1. Start a connection or signing operation
2. Physically unplug the Trezor USB cable

### Expected
- [ ] Extension detects disconnection
- [ ] Shows appropriate error message
- [ ] Doesn't hang indefinitely

### Record
- Error message: `____________________`
- Recovery possible: [ ] Yes [ ] No

---

## Test 6: Passphrase Wallet (Optional)

### Steps
1. Navigate to **Add Wallet → Use Trezor Connect**
2. Expand **Advanced options**
3. Check **Use passphrase**
4. Click Connect Trezor
5. Enter passphrase on device (or in popup if device configured that way)

### Expected
- [ ] Different address than standard wallet
- [ ] Passphrase prompt appears (on device or popup)

### Record
- Standard address: `____________________`
- Passphrase address: `____________________`
- Different: [ ] Yes [ ] No

---

## Test 7: Wallet Persistence (Session-Only)

### Steps
1. Connect hardware wallet successfully
2. Note the address
3. Close the extension popup completely
4. Reopen extension

### Expected
- [ ] Hardware wallet still accessible (session persists while browser open)
- [ ] OR prompts to reconnect (acceptable behavior)

### Record
- Behavior after reopen: ____________________

---

## Test 8: Switch Between Wallets

### Steps
1. Have both software wallet and hardware wallet connected
2. Navigate to wallet list
3. Switch to software wallet
4. Switch back to hardware wallet

### Expected
- [ ] Can switch between wallets
- [ ] Each wallet shows correct addresses
- [ ] No confusion between wallet types

### Record
- Switch works: [ ] Yes [ ] No
- Issues: ____________________

---

## Test 9: Receive Address Display

### Steps
1. With hardware wallet active, go to Receive
2. Click "Verify on Device" or similar (if available)

### Expected
- [ ] Address displayed in extension
- [ ] Device shows same address for verification
- [ ] Addresses match exactly

### Record
- Feature available: [ ] Yes [ ] No
- Addresses match: [ ] Yes [ ] No

---

## Test 10: Transaction Signing (If you have testnet BTC)

### Steps
1. With hardware wallet active, go to Send
2. Enter a destination address
3. Enter small amount
4. Click Send/Sign
5. Confirm on device

### Expected
- [ ] Device shows transaction details (amount, address, fee)
- [ ] After confirm, transaction is signed
- [ ] Transaction broadcasts successfully

### Record
- TX details shown on device: [ ] Yes [ ] No
- Signed successfully: [ ] Yes [ ] No
- Broadcast: [ ] Yes [ ] No
- TXID: `____________________`

---

## Summary

| Test | Pass | Fail | Notes |
|------|------|------|-------|
| 1. Connection Flow | [ ] | [ ] | |
| 2. Address Verification | [ ] | [ ] | |
| 3. Message Signing | [ ] | [ ] | |
| 4. Cancel on Device | [ ] | [ ] | |
| 5. Disconnect Mid-Op | [ ] | [ ] | |
| 6. Passphrase Wallet | [ ] | [ ] | |
| 7. Session Persistence | [ ] | [ ] | |
| 8. Wallet Switching | [ ] | [ ] | |
| 9. Receive Verification | [ ] | [ ] | |
| 10. Transaction Signing | [ ] | [ ] | |

## Issues Found

1. ____________________
2. ____________________
3. ____________________

## Device Info

- Model: [ ] Trezor One [ ] Trezor T [ ] Trezor Safe 3
- Firmware: ____________________
- Trezor Bridge version: ____________________
