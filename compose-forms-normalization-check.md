# Compose Forms Normalization Check

## Issue
Forms should NOT divide by 10^8 when initializing from `initialFormData` because the composer context stores the original user-entered values (not satoshis) when there's an error.

## Pattern to Look For
- `initialFormData.* / 1e8` or `/ 100000000`
- `normalizeAmountForDisplay` functions that divide by 10^8
- `formatAmount` with value division for initialFormData

## Correct Pattern
Forms should use `initialFormData?.field?.toString() || ""` directly, as these are user-entered values.

## Status Legend
- ❌ = Has normalization issue that needs fixing
- ✅ = Correctly handles initialFormData
- ⏳ = Not checked yet
- 🔧 = Just fixed in this session

## Summary of Findings

### Critical Issue Fixed
Forms were dividing by 10^8 when initializing from `initialFormData`, but the composer stores original user-entered values (not satoshis) on error, causing values to be incorrectly reduced by a factor of 100,000,000.

### New Issue Found
- **utxo/attach/form.tsx** - Does not restore quantity from initialFormData at all (value persistence issue)

## Forms to Check (28 total)

### Fixed in This Session (7 forms)
1. 🔧 src/pages/compose/bet/form.tsx - Fixed wager_quantity and counterwager_quantity division
2. 🔧 src/pages/compose/dispenser/form.tsx - Fixed escrow_quantity, mainchainrate, give_quantity division
3. 🔧 src/pages/compose/issuance/destroy-supply/form.tsx - Fixed normalizeAmountForDisplay
4. 🔧 src/pages/compose/issuance/form.tsx - Fixed quantity division
5. 🔧 src/pages/compose/issuance/issue-supply/form.tsx - Fixed quantity division
6. 🔧 src/pages/compose/send/form.tsx - Fixed normalizeAmountForDisplay
7. 🔧 src/pages/compose/dispenser/form.tsx (earlier commit) - Fixed validation and initial state

### No Issues Found (21 forms)
8. ✅ src/pages/compose/bet/weekly/form.tsx
9. ✅ src/pages/compose/broadcast/address-options/form.tsx
10. ✅ src/pages/compose/broadcast/form.tsx
11. ✅ src/pages/compose/broadcast/inscription/form.tsx
12. ✅ src/pages/compose/dispenser/close/form.tsx
13. ✅ src/pages/compose/dispenser/close-by-hash/form.tsx
14. ✅ src/pages/compose/dispenser/dispense/form.tsx
15. ✅ src/pages/compose/dividend/form.tsx
16. ✅ src/pages/compose/fairminter/fairmint/form.tsx
17. ✅ src/pages/compose/fairminter/form.tsx
18. ✅ src/pages/compose/issuance/lock-supply/form.tsx
19. ✅ src/pages/compose/issuance/reset-supply/form.tsx
20. ✅ src/pages/compose/issuance/transfer-ownership/form.tsx
21. ✅ src/pages/compose/issuance/update-description/form.tsx
22. ✅ src/pages/compose/order/btcpay/form.tsx
23. ✅ src/pages/compose/order/cancel/form.tsx
24. ✅ src/pages/compose/order/form.tsx
25. ✅ src/pages/compose/send/mpma/form.tsx
26. ✅ src/pages/compose/sweep/form.tsx
27. ✅ src/pages/compose/utxo/attach/form.tsx
28. ✅ src/pages/compose/utxo/detach/form.tsx
29. ✅ src/pages/compose/utxo/move/form.tsx

## Next Steps
Go through each form 2-3 at a time and check for:
1. Any division by 10^8 when using initialFormData
2. Any normalizeAmountForDisplay or similar functions
3. Controlled vs uncontrolled inputs (useState vs defaultValue)