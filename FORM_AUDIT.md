# Comprehensive Form.tsx Audit for Normalization

This document audits EVERY form.tsx file in src/pages/compose to ensure proper normalization implementation.

## Audit Criteria
1. **No manual satoshi conversion** - Forms should NOT multiply by 1e8, use toSatoshis(), etc.
2. **Pass user-friendly values** - Forms should pass decimal values as entered by users
3. **Clean input only** - Forms can remove commas/spaces but shouldn't convert units
4. **Proper field names** - Ensure field names match what the compose functions expect
5. **No unnecessary comments** - Remove comments about normalization being handled elsewhere

## Audit Summary

**Result: ALL 28 FORMS PASS USER-FRIENDLY VALUES CORRECTLY ✅**

Key findings:
1. All forms that handle quantities pass decimal/user-friendly values
2. Forms correctly display initial data by converting FROM satoshis (dividing by 1e8)
3. Forms submit user-entered decimal values WITHOUT converting to satoshis
4. The normalization layer in composer-context handles all satoshi conversion
5. No redundant normalization found after our cleanup

## Forms to Audit (28 total)

### 1. bet/form.tsx
- [x] Checked
- Fields: wager_quantity, counterwager_quantity, deadline, bet_type, target_value, leverage, expiration, feed_address
- Status: ✅ Passes user-friendly values correctly
- Notes: Displays initial values by converting from satoshis (value / 1e8) which is correct for display. Submission passes user values.

### 2. bet/weekly/form.tsx
- [x] Checked
- Fields: wager_quantity, counterwager_quantity, deadline, bet_type, target_value, leverage, expiration, feed_address
- Status: ✅ Passes user-friendly values correctly
- Notes: Simple form, passes wager as float string directly.

### 3. broadcast/form.tsx
- [x] Checked
- Fields: text, value, fee_fraction, timestamp, inscription (optional), mime_type (optional)
- Status: ✅ OK - no quantity fields
- Notes: Handles text broadcasts, sets defaults for value/fee_fraction if empty.

### 4. broadcast/address-options/form.tsx
- [x] Checked
- Fields: text, value, address_settings
- Status: ✅ OK - no quantity fields
- Notes: Handles address-specific broadcast options.

### 5. broadcast/inscription/form.tsx
- [x] Checked
- Fields: text, inscription, mime_type
- Status: ✅ OK - no quantity fields
- Notes: Handles file upload and base64 encoding.

### 6. dispenser/form.tsx
- [x] Checked
- Fields: asset, give_quantity, escrow_quantity, mainchainrate, status
- Status: ✅ Passes user-friendly values
- Notes: Uses getCleanValue to remove commas/spaces, passes decimal values.

### 7. dispenser/close/form.tsx
- [x] Checked
- Fields: dispenser selection for closing
- Status: ✅ OK - no quantity fields
- Notes: Selects existing dispenser to close.

### 8. dispenser/close-by-hash/form.tsx
- [x] Checked
- Fields: dispenser_hash
- Status: ✅ OK - no quantity fields
- Notes: Closes dispenser by hash lookup.

### 9. dispenser/dispense/form.tsx
- [x] Checked
- Fields: dispenser, quantity
- Status: ✅ Passes user-friendly values
- Notes: Passes BTC quantity as decimal string.

### 10. dividend/form.tsx
- [x] Checked
- Fields: asset, dividend_asset, quantity_per_unit
- Status: ✅ Passes user-friendly values
- Notes: Cleans input (removes commas) and passes decimal values.

### 11. fairminter/form.tsx
- [x] Checked
- Fields: asset, price, quantity_by_price, max_mint_per_tx, hard_cap, premint_quantity, start_block, end_block, etc.
- Status: ✅ Passes user-friendly values
- Notes: Complex form with many fields, all pass as entered.

### 12. fairminter/fairmint/form.tsx
- [x] Checked
- Fields: asset, quantity
- Status: ✅ Passes user-friendly values
- Notes: Simple mint form, passes quantity as string.

### 13. issuance/form.tsx
- [x] Checked
- Fields: asset, quantity, divisible, lock, reset, description
- Status: ✅ Passes user-friendly values
- Notes: Displays initial quantity by dividing by 1e8 if divisible, but passes raw form values on submit.

### 14. issuance/destroy-supply/form.tsx
- [x] Checked
- Fields: asset, quantity, tag
- Status: ✅ Passes user-friendly values
- Notes: Cleans amount (removes commas), passes decimal.

### 15. issuance/issue-supply/form.tsx
- [x] Checked
- Fields: asset, quantity, description
- Status: ✅ Passes user-friendly values
- Notes: Displays by dividing by 1e8, submits raw values.

### 16. issuance/lock-supply/form.tsx
- [x] Checked
- Fields: asset, quantity (set to 0)
- Status: ✅ OK - no user quantity input
- Notes: Sets quantity to "0" for lock operation.

### 17. issuance/reset-supply/form.tsx
- [x] Checked
- Fields: asset, quantity (set to 0), reset (true)
- Status: ✅ OK - no user quantity input
- Notes: Sets quantity to "0" for reset operation.

### 18. issuance/transfer-ownership/form.tsx
- [x] Checked
- Fields: asset, transfer_destination, quantity (set to 0)
- Status: ✅ OK - no user quantity input
- Notes: Sets quantity to "0" for ownership transfer.

### 19. issuance/update-description/form.tsx
- [x] Checked
- Fields: asset, description, quantity (set to 0)
- Status: ✅ OK - no user quantity input
- Notes: Sets quantity to "0" for description update.

### 20. order/form.tsx
- [x] Checked
- Fields: give_asset, give_quantity, get_asset, get_quantity, expiration, fee_required
- Status: ✅ Correctly calculates and passes decimal values
- Notes: Uses BigNumber for calculations, passes decimal values for both quantities.

### 21. order/btcpay/form.tsx
- [x] Checked
- Fields: order_match_id
- Status: ✅ OK - no quantity fields
- Notes: Only handles order match ID.

### 22. order/cancel/form.tsx
- [x] Checked
- Fields: offer_hash
- Status: ✅ OK - no quantity fields
- Notes: Only handles order hash for cancellation.

### 23. send/form.tsx
- [x] Checked
- Fields: destination, asset, quantity, memo
- Status: ✅ Passes user-friendly values
- Notes: Displays initial by converting from satoshis, passes raw amount on submit.

### 24. send/mpma/form.tsx
- [x] Checked
- Fields: assets[], destinations[], quantities[], memos[]
- Status: ✅ Passes user-friendly values
- Notes: CSV parsing keeps decimal values, passes as comma-separated strings.

### 25. sweep/form.tsx
- [x] Checked
- Fields: destination, flags, memo
- Status: ✅ OK - no quantity fields
- Notes: Only handles flags (numeric) and addresses/memos. No asset quantities.

### 26. utxo/attach/form.tsx
- [x] Checked
- Fields: asset, quantity, destination_vout
- Status: ✅ Passes user-friendly values
- Notes: Uses AmountWithMaxInput, passes decimal value directly as entered.

### 27. utxo/detach/form.tsx
- [x] Checked
- Fields: sourceUtxo, destination
- Status: ✅ OK - no quantity fields
- Notes: Only handles UTXO reference and optional destination address.

### 28. utxo/move/form.tsx
- [x] Checked
- Fields: sourceUtxo, destination
- Status: ✅ OK - no quantity fields
- Notes: Only handles UTXO reference and destination address.