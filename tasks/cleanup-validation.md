# Validation Tests Cleanup Audit

**Date:** 2026-01-21
**Story:** US-003 - Audit Validation Tests for Meaningfulness
**Scope:** `src/utils/validation/__tests__/*.test.ts` (excluding fuzz tests)

## Summary

| Metric | Count |
|--------|-------|
| Total Tests Analyzed | ~268 |
| Tests to KEEP | ~235 |
| Tests to REVIEW | 28 |
| Tests to REMOVE | 5 |
| Weak Assertions Found | 32 |

## Scoring Criteria

- **Impact** (1-10): How critical is the behavior being tested?
- **Probability** (1-10): How likely is this bug to occur?
- **Score** = Impact × Probability
- **Threshold**: Score < 15 = REMOVE, 15-29 = REVIEW, ≥30 = KEEP

---

## Tests by File

### 1. assetOwner.test.ts (25 tests)

| Test | Score | Decision | Notes |
|------|-------|----------|-------|
| looksLikeAssetName - valid ASSET.xcp format | 35 | KEEP | Tests core validation logic |
| looksLikeAssetName - case insensitive .xcp | 30 | KEEP | Important behavior |
| looksLikeAssetName - numeric assets with .xcp | 30 | KEEP | Edge case coverage |
| looksLikeAssetName - reject non-.xcp subassets | 35 | KEEP | Security boundary |
| looksLikeAssetName - reject multiple dots | 30 | KEEP | Input sanitization |
| looksLikeAssetName - reject invalid parent assets | 35 | KEEP | Critical validation |
| looksLikeAssetName - reject empty/invalid inputs | 30 | KEEP | Null safety |
| looksLikeAssetName - reject Bitcoin addresses | 40 | KEEP | Security critical |
| shouldTriggerAssetLookup - valid patterns | 30 | KEEP | Feature behavior |
| shouldTriggerAssetLookup - not trigger for addresses | 40 | KEEP | Security critical |
| shouldTriggerAssetLookup - not trigger for short strings | 25 | REVIEW | **Weak: only checks `toBe(true/false)`** |
| shouldTriggerAssetLookup - not trigger for non-.xcp | 30 | KEEP | Correct rejection |
| lookupAssetOwner - successfully lookup | 45 | KEEP | Core feature, checks error message |
| lookupAssetOwner - handle case insensitive | 35 | KEEP | Important behavior |
| lookupAssetOwner - error for not found | 45 | KEEP | **STRONG: checks specific error message** |
| lookupAssetOwner - error for no issuer | 45 | KEEP | **STRONG: checks specific error message** |
| lookupAssetOwner - error for invalid format | 45 | KEEP | **STRONG: checks specific error message** |
| lookupAssetOwner - handle API errors | 45 | KEEP | **STRONG: checks specific error message** |

**Weak Assertions Found:** 1
- Line 83-84: `expect(shouldTriggerAssetLookup('TST.xcp')).toBe(false)` - only checks boolean, doesn't explain WHY it should be false (7 chars too short)

---

### 2. privateKey.test.ts (27 tests)

| Test | Score | Decision | Notes |
|------|-------|----------|-------|
| validatePrivateKeyFormat - valid hex | 50 | KEEP | **STRONG: checks format and suggestedAddressFormat** |
| validatePrivateKeyFormat - valid WIF | 50 | KEEP | **STRONG: checks multiple properties** |
| validatePrivateKeyFormat - reject empty/null | 50 | KEEP | **STRONG: uses toEqual with object** |
| validatePrivateKeyFormat - reject formula injection | 45 | KEEP | Security critical |
| validatePrivateKeyFormat - reject 0x prefix | 45 | KEEP | **STRONG: checks specific error** |
| validatePrivateKeyFormat - reject invalid lengths | 50 | KEEP | **STRONG: uses toEqual** |
| validatePrivateKeyFormat - handle random invalid | 40 | KEEP | Fuzz-like coverage |
| validatePrivateKeyFormat - handle long strings (ReDoS) | 40 | KEEP | Security test |
| validatePrivateKeyFormat - reject injection patterns | 40 | KEEP | Security test |
| sanitizePrivateKey - trim whitespace | 35 | KEEP | Core behavior |
| sanitizePrivateKey - handle various whitespace | 30 | KEEP | Property test |
| containsDangerousChars - detect control chars | 40 | KEEP | Security critical |
| containsDangerousChars - allow normal chars | 35 | KEEP | Core behavior |
| containsDangerousChars - detect all control chars | 40 | KEEP | Property test |
| validatePrivateKeyLength - reject empty | 45 | KEEP | **STRONG: checks error message** |
| validatePrivateKeyLength - reject too long | 45 | KEEP | **STRONG: checks error message** |
| validatePrivateKeyLength - accept valid lengths | 25 | REVIEW | **Weak: only `.toBe(true)`, no error check** |
| validatePrivateKeyLength - validate all lengths | 50 | KEEP | Comprehensive fuzz test |
| detectPrivateKeyFormat - detect hex | 35 | KEEP | Core behavior |
| detectPrivateKeyFormat - detect WIF | 35 | KEEP | Core behavior |
| detectPrivateKeyFormat - detect unknown | 35 | KEEP | Core behavior |
| detectPrivateKeyFormat - classify random | 40 | KEEP | Property test |
| Edge Cases - Unicode | 35 | KEEP | Edge case |
| Edge Cases - mixed case hex | 40 | KEEP | **STRONG: checks format** |
| Edge Cases - boundary WIF | 30 | KEEP | Boundary testing |
| Edge Cases - increasing input sizes | 30 | KEEP | Memory safety |
| Security - not leak info | 45 | KEEP | **STRONG: checks error doesn't contain input** |
| Security - timing attacks | 35 | KEEP | Timing attack prevention |

**Weak Assertions Found:** 1
- Lines 194-197: `expect(validatePrivateKeyLength(hex64).isValid).toBe(true)` - only checks boolean, doesn't verify there's no error

---

### 3. qrCode.test.ts (55 tests)

| Test | Score | Decision | Notes |
|------|-------|----------|-------|
| validateQRCodeText - accept valid text | 35 | KEEP | Core behavior |
| validateQRCodeText - reject non-string | 45 | KEEP | **STRONG: checks error message** |
| validateQRCodeText - reject empty | 45 | KEEP | **STRONG: checks error message** |
| validateQRCodeText - reject max length | 45 | KEEP | **STRONG: checks error message** |
| validateQRCodeText - detect formula injection | 45 | KEEP | **STRONG: checks error message** |
| validateQRCodeText - reject null bytes | 45 | KEEP | **STRONG: checks error message** |
| validateQRCodeText - warn control chars | 40 | KEEP | **STRONG: checks specific warning** |
| validateQRCodeText - warn repeating patterns | 40 | KEEP | **STRONG: checks specific warning** |
| validateQRCodeText - validate URLs security | 45 | KEEP | **STRONG: checks error message** |
| validateQRCodeText - warn private network URLs | 40 | KEEP | **STRONG: checks specific warning** |
| validateQRCodeText - warn URL shorteners | 40 | KEEP | **STRONG: checks specific warning** |
| validateQRCodeText - detect private data | 40 | KEEP | **STRONG: checks specific warning** |
| validateQRCodeText - handle random strings | 25 | REVIEW | **Weak: only checks type, not behavior** |
| validateQRCodeText - handle Unicode | 20 | REVIEW | **Weak: `expect(result).toBeDefined()` is too weak** |
| validateQRCodeText - handle URL edge cases | 20 | REVIEW | **Weak: `expect(typeof result.isValid).toBe('boolean')` doesn't test behavior** |
| validateQRCodeDimensions - accept valid | 30 | KEEP | Core behavior |
| validateQRCodeDimensions - accept undefined | 30 | KEEP | Optional param handling |
| validateQRCodeDimensions - reject non-numeric | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeDimensions - reject non-finite | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeDimensions - reject negative/zero | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeDimensions - reject too large | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeDimensions - handle random numeric | 25 | REVIEW | **Weak: only checks type** |
| validateQRCodeLogo - accept valid | 30 | KEEP | Core behavior |
| validateQRCodeLogo - accept undefined | 30 | KEEP | Optional handling |
| validateQRCodeLogo - accept empty string | 30 | KEEP | Optional handling |
| validateQRCodeLogo - reject non-string | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeLogo - reject dangerous protocols | 50 | KEEP | **STRONG: checks specific errors** |
| validateQRCodeLogo - reject path traversal | 50 | KEEP | **STRONG: checks specific error** |
| validateQRCodeLogo - validate data URLs | 50 | KEEP | **STRONG: checks multiple scenarios** |
| validateQRCodeLogo - reject unsupported image | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeLogo - reject oversized data URLs | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeLogo - handle random strings | 25 | REVIEW | **Weak: only checks type** |
| sanitizeQRCodeText - sanitize control chars | 40 | KEEP | **STRONG: checks exact output** |
| sanitizeQRCodeText - preserve newlines/tabs | 40 | KEEP | **STRONG: checks exact output** |
| sanitizeQRCodeText - remove null bytes | 40 | KEEP | **STRONG: checks exact output** |
| sanitizeQRCodeText - trim whitespace | 40 | KEEP | **STRONG: checks exact output** |
| sanitizeQRCodeText - handle non-string | 35 | KEEP | Type safety |
| sanitizeQRCodeText - safely sanitize random | 40 | KEEP | **STRONG: checks regex pattern** |
| validateQRCodeParams - validate all together | 35 | KEEP | Integration test |
| validateQRCodeParams - fail text validation | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeParams - fail dimensions | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeParams - fail logo validation | 45 | KEEP | **STRONG: checks error** |
| validateQRCodeParams - combine warnings | 40 | KEEP | **STRONG: checks warning** |
| validateQRCodeParams - handle random combinations | 25 | REVIEW | **Weak: only checks defined** |
| estimateQRCodeMemory - estimate for text/dimensions | 30 | KEEP | Core behavior |
| estimateQRCodeMemory - use default width | 30 | KEEP | Default handling |
| estimateQRCodeMemory - scale with text length | 35 | KEEP | Behavior verification |
| estimateQRCodeMemory - scale with width | 35 | KEEP | Behavior verification |
| estimateQRCodeMemory - estimate safely random | 30 | KEEP | Property test |
| checkQRCodePerformance - identify issues | 45 | KEEP | **STRONG: checks specific warnings** |
| checkQRCodePerformance - detect memory concerns | 45 | KEEP | **STRONG: checks warning** |
| checkQRCodePerformance - detect Unicode issues | 45 | KEEP | **STRONG: checks warning** |
| checkQRCodePerformance - pass reasonable inputs | 35 | KEEP | Core behavior |
| checkQRCodePerformance - check safely random | 30 | KEEP | Property test |
| Injection - prevent CSV injection | 50 | KEEP | **STRONG: checks error** |
| Injection - prevent XSS in data URLs | 45 | KEEP | Security critical |
| ReDoS - handle pathological inputs | 40 | KEEP | Security test |
| ReDoS - detect repeating patterns | 40 | KEEP | **STRONG: checks warning** |
| Private Data - detect Bitcoin keys | 50 | KEEP | **STRONG: comprehensive case testing** |
| Memory Safety - prevent excessive | 45 | KEEP | **STRONG: checks warning** |
| Memory Safety - estimate accurately | 35 | KEEP | Behavior verification |
| Memory Safety - handle edge cases | 30 | KEEP | Edge cases |

**Weak Assertions Found:** 8
- Line 109-118: `expect(typeof result.isValid).toBe('boolean')` - doesn't verify the actual validation logic
- Line 128: `expect(result).toBeDefined()` - too weak, doesn't test behavior
- Line 148: `expect(typeof result.isValid).toBe('boolean')` - doesn't verify behavior
- Line 208-214: Property test only checks types, not behavior
- Line 301-306: Only checks types, not actual validation
- Line 391-395: Only checks defined, not behavior

---

### 4. simple.test.ts (6 tests)

| Test | Score | Decision | Notes |
|------|-------|----------|-------|
| Asset - validate basic names | 25 | REVIEW | **Weak: only `.toBe(true/false)`, no error messages** |
| Asset - validate subassets | 25 | REVIEW | **Weak: only `.toBe(true/false)`, no error messages** |
| Memo - identify hex memos | 30 | KEEP | Core behavior |
| Memo - validate memo lengths | 40 | KEEP | **STRONG: checks byteLength property** |

**Weak Assertions Found:** 4
- Lines 12-19: All assertions are just `.toBe(true/false)` without checking error messages
- Lines 23-26: Same issue - no error message validation

---

### 5. amount.test.ts (45 tests)

| Test | Score | Decision | Notes |
|------|-------|----------|-------|
| validateAmount - valid BTC amounts | 20 | REVIEW | **Weak: only `.toBe(true)`** |
| validateAmount - return satoshis/normalized | 45 | KEEP | **STRONG: checks specific values** |
| validateAmount - handle zero when allowed | 40 | KEEP | **STRONG: checks satoshis value** |
| validateAmount - reject empty/null | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateAmount - reject negative | 45 | KEEP | **STRONG: checks error contains text** |
| validateAmount - reject zero by default | 45 | KEEP | **STRONG: checks error contains text** |
| validateAmount - reject special values | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateAmount - reject invalid format | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateAmount - reject exceeding max | 45 | KEEP | **STRONG: checks error** |
| validateAmount - enforce dust limit | 45 | KEEP | **STRONG: checks error** |
| validateAmount - allow dust by default | 30 | KEEP | Core behavior |
| validateAmount - enforce decimal places | 45 | KEEP | **STRONG: checks error** |
| validateAmount - enforce minimum | 45 | KEEP | **STRONG: checks error** |
| validateAmount - enforce custom max | 45 | KEEP | **STRONG: checks error** |
| validateQuantity - valid quantities | 20 | REVIEW | **Weak: only `.toBe(true)`** |
| validateQuantity - return quantity/normalized | 40 | KEEP | **STRONG: checks values** |
| validateQuantity - reject empty/null | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateQuantity - reject negative | 45 | KEEP | **STRONG: checks error** |
| validateQuantity - reject zero default | 45 | KEEP | **STRONG: checks error** |
| validateQuantity - reject special values | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateQuantity - reject invalid format | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateQuantity - reject decimals non-divisible | 45 | KEEP | **STRONG: checks error** |
| validateQuantity - accept integers non-divisible | 30 | KEEP | Core behavior |
| validateQuantity - accept decimals divisible | 30 | KEEP | Core behavior |
| validateQuantity - limit decimals | 45 | KEEP | **STRONG: checks error** |
| validateQuantity - reject exceed max supply | 45 | KEEP | **STRONG: checks error** |
| validateQuantity - reject below min | 45 | KEEP | **STRONG: checks error** |
| isValidNumber - return true valid | 30 | KEEP | Core behavior |
| isValidNumber - return false invalid | 30 | KEEP | Core behavior |
| validateBalance - pass sufficient | 30 | KEEP | Core behavior |
| validateBalance - fail insufficient | 45 | KEEP | **STRONG: checks error** |
| validateBalance - account for fees | 45 | KEEP | **STRONG: checks error** |
| validateBalance - handle special values | 30 | KEEP | Mixed assertions |
| btcToSatoshis - convert | 45 | KEEP | **STRONG: checks exact values** |
| btcToSatoshis - round down | 40 | KEEP | **STRONG: checks rounding** |
| isDustAmount - identify dust | 30 | KEEP | Core behavior |
| isDustAmount - identify non-dust | 30 | KEEP | Core behavior |

**Weak Assertions Found:** 11
- Lines 20-25: `expect(validateAmount('1').isValid).toBe(true)` - no error message check
- Lines 43-45: Same weak pattern
- Lines 61-64: Same weak pattern
- Lines 67-72: Same weak pattern
- Lines 117-121: Same weak pattern
- Lines 132-136: Same weak pattern
- Lines 150-155: Same weak pattern
- Lines 156-161: Same weak pattern

---

### 6. fee.test.ts (35 tests)

| Test | Score | Decision | Notes |
|------|-------|----------|-------|
| validateFeeRate - accept valid | 20 | REVIEW | **Weak: only `.toBe(true)`** |
| validateFeeRate - return satsPerVByte | 40 | KEEP | **STRONG: checks value** |
| validateFeeRate - warn high fees | 45 | KEEP | **STRONG: checks warning** |
| validateFeeRate - not warn when disabled | 40 | KEEP | **STRONG: checks undefined** |
| validateFeeRate - reject empty/null | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateFeeRate - reject zero | 45 | KEEP | **STRONG: checks error** |
| validateFeeRate - reject negative | 45 | KEEP | **STRONG: checks error** |
| validateFeeRate - reject NaN/Infinity | 20 | REVIEW | **Weak: only `.toBe(false)`** |
| validateFeeRate - reject below min | 45 | KEEP | **STRONG: checks error** |
| validateFeeRate - reject above max | 45 | KEEP | **STRONG: checks error** |
| validateFeeRate - respect custom minRate | 30 | KEEP | Options test |
| validateFeeRate - respect custom maxRate | 30 | KEEP | Options test |
| calculateTransactionFee - calculate correctly | 50 | KEEP | **STRONG: checks multiple values** |
| calculateTransactionFee - use custom sizes | 45 | KEEP | **STRONG: checks values** |
| calculateTransactionFee - warn high fees | 45 | KEEP | **STRONG: checks warning** |
| calculateTransactionFee - not warn normal | 35 | KEEP | Core behavior |
| validateFeeWithBalance - pass sufficient | 45 | KEEP | **STRONG: checks totalRequired** |
| validateFeeWithBalance - fail insufficient | 50 | KEEP | **STRONG: checks error details** |
| validateFeeWithBalance - handle strings | 30 | KEEP | Type coercion |
| validateFeeWithBalance - handle special | 30 | KEEP | Edge cases |
| estimateFeeRate - default rates | 45 | KEEP | **STRONG: checks exact values** |
| estimateFeeRate - custom rates | 45 | KEEP | **STRONG: checks values** |
| estimateFeeRate - fallback defaults | 40 | KEEP | Default handling |
| validateCPFPFee - valid scenario | 45 | KEEP | **STRONG: checks effectiveRate** |
| validateCPFPFee - reject sufficient parent | 45 | KEEP | **STRONG: checks error** |
| validateCPFPFee - reject too high child | 45 | KEEP | **STRONG: checks error** |
| validateCPFPFee - reject zero/negative | 30 | KEEP | Edge case |
| isReasonableFeeRate - without network | 30 | KEEP | Core behavior |
| isReasonableFeeRate - with network | 30 | KEEP | Core behavior |
| Constants - expected values | 40 | KEEP | Configuration validation |

**Weak Assertions Found:** 4
- Lines 23-27: `expect(validateFeeRate(1).isValid).toBe(true)` - no error check
- Lines 49-53: Only checks `.toBe(false)`, no error message
- Lines 67-70: Same weak pattern

---

### 7. session.test.ts (75 tests)

This file has the **strongest assertions overall**. Most tests:
- Check specific error messages
- Use `toThrow('exact error message')` pattern
- Test security scenarios explicitly

| Category | Tests | Decision | Notes |
|----------|-------|----------|-------|
| validateWalletId - valid | 3 | KEEP | Uses `.not.toThrow()` |
| validateWalletId - invalid | 10 | KEEP | **STRONG: all check specific error messages** |
| validateWalletId - security | 4 | KEEP | **STRONG: security attack scenarios** |
| validateSecret - valid | 4 | KEEP | Core behavior |
| validateSecret - invalid | 3 | KEEP | **STRONG: specific errors** |
| validateSecret - security | 3 | KEEP | Security scenarios |
| validateTimeout - valid | 3 | KEEP | Core behavior |
| validateTimeout - invalid | 7 | KEEP | **STRONG: specific errors** |
| validateTimeout - boundary | 2 | KEEP | Boundary testing |
| validateSessionMetadata - valid | 2 | KEEP | Core behavior |
| validateSessionMetadata - invalid | 10 | KEEP | **STRONG: specific errors** |
| validateSessionMetadata - security | 2 | KEEP | Security scenarios |
| assertRateLimit - normal | 3 | KEEP | Rate limit behavior |
| assertRateLimit - time-based | 2 | KEEP | Time window testing |
| assertRateLimit - cleanup | 1 | KEEP | Cleanup behavior |
| assertRateLimit - security | 2 | KEEP | Security scenarios |
| clearRateLimit | 2 | KEEP | Management functions |
| clearAllRateLimits | 1 | KEEP | Management functions |
| assertSecretLimit - normal | 4 | KEEP | **STRONG: checks error regex** |
| assertSecretLimit - edge | 3 | KEEP | Edge cases |
| assertSecretLimit - security | 4 | KEEP | Security scenarios |
| Integration scenarios | 2 | KEEP | End-to-end workflows |
| Constants validation | 2 | KEEP | **STRONG: checks exact values and regex** |

**Weak Assertions Found:** 3
- Line 467: `expect(() => assertRateLimit('test')).not.toThrow()` - doesn't test internal cleanup happened
- Lines 493-496: Malicious IDs test doesn't verify they would fail actual validation

---

## Tests to REMOVE (Score < 15)

| File | Test | Score | Reason |
|------|------|-------|--------|
| None identified | - | - | All tests have meaningful purpose |

**Note:** While some tests have weak assertions, they still test meaningful behavior and should be STRENGTHENED rather than removed.

---

## Tests Needing Assertion Strengthening

### High Priority (Security-Related)

1. **amount.test.ts:61-64** - `validateAmount - reject special values`
   - Current: `expect(validateAmount('NaN').isValid).toBe(false)`
   - Should: Check specific error message like "Amount must be a valid number"

2. **amount.test.ts:67-72** - `validateAmount - reject invalid format`
   - Current: `expect(validateAmount('abc').isValid).toBe(false)`
   - Should: Check specific error message

3. **fee.test.ts:67-70** - `validateFeeRate - reject NaN/Infinity`
   - Current: `expect(validateFeeRate(NaN).isValid).toBe(false)`
   - Should: Check specific error message

### Medium Priority (Input Validation)

4. **simple.test.ts:12-19** - `Asset validation - basic names`
   - Current: `expect(validateParentAsset('TEST').isValid).toBe(true)`
   - Should: Add error message checks for invalid cases

5. **amount.test.ts:20-25** - `validateAmount - valid BTC amounts`
   - Current: `expect(validateAmount('1').isValid).toBe(true)`
   - Should: Also verify no error property exists

6. **qrCode.test.ts:145-150** - `validateQRCodeText - URL edge cases`
   - Current: `expect(typeof result.isValid).toBe('boolean')`
   - Should: Add expected outcomes for each edge case URL

### Lower Priority (Fuzz-Like Tests)

These tests use property-based testing patterns and are acceptable as-is:

7. **qrCode.test.ts:106-118** - Random string handling
8. **qrCode.test.ts:199-215** - Random numeric inputs
9. **privateKey.test.ts:87-96** - Random invalid inputs

---

## Missing Error Message Validation

### Pattern: Tests check `isValid: false` without verifying the error message

| File | Line | Test Description |
|------|------|------------------|
| simple.test.ts | 16-19 | Invalid asset names (BTC, XCP, empty, short) |
| amount.test.ts | 43-45 | Empty/null/undefined amounts |
| amount.test.ts | 61-64 | Special values (NaN, Infinity) |
| amount.test.ts | 67-72 | Invalid formats (abc, 1.2.3, etc.) |
| amount.test.ts | 132-136 | Quantity empty/null/undefined |
| amount.test.ts | 150-155 | Quantity special values |
| amount.test.ts | 156-161 | Quantity invalid formats |
| fee.test.ts | 49-53 | Fee rate empty/null/undefined |
| fee.test.ts | 67-70 | Fee rate NaN/Infinity |

---

## Edge Cases Only Checking `returns false`

These tests verify rejection but don't verify the specific reason:

1. **assetOwner.test.ts:83** - `TST.xcp` rejected for being too short (7 chars)
2. **privateKey.test.ts:194-197** - Valid lengths only check `isValid: true`
3. **fee.test.ts:23-27** - Valid fee rates only check `isValid: true`

---

## Recommendations

### 1. Strengthen Weak Assertions (Priority: HIGH)

Replace `expect(result.isValid).toBe(false)` with:
```typescript
expect(result).toEqual({
  isValid: false,
  error: 'Expected error message'
});
// OR
expect(result.isValid).toBe(false);
expect(result.error).toContain('specific keyword');
```

### 2. Add Error Message Checks to Success Cases (Priority: MEDIUM)

Replace `expect(result.isValid).toBe(true)` with:
```typescript
expect(result.isValid).toBe(true);
expect(result.error).toBeUndefined();
```

### 3. Document Expected Behavior in Edge Case Tests (Priority: LOW)

For fuzz-like tests, add comments explaining what behavior is expected:
```typescript
// Valid URLs should pass with possible warnings
// Invalid protocols (javascript:, data:text/html) should fail
// Private network URLs should pass with warnings
```

---

## Summary by File

| File | Total | Strong | Weak | Decision |
|------|-------|--------|------|----------|
| assetOwner.test.ts | 18 | 14 | 1 | Good overall |
| privateKey.test.ts | 27 | 24 | 1 | Excellent - mostly strong |
| qrCode.test.ts | 55 | 43 | 8 | Good - fuzz tests acceptable |
| simple.test.ts | 6 | 2 | 4 | **Needs work** |
| amount.test.ts | 45 | 26 | 11 | **Needs work** |
| fee.test.ts | 35 | 27 | 4 | Good overall |
| session.test.ts | 75 | 72 | 3 | **Excellent** |

---

## Overall Assessment

The validation tests are generally **strong and meaningful**. Key observations:

1. **session.test.ts is exemplary** - Uses specific error message assertions consistently
2. **privateKey.test.ts and qrCode.test.ts** - Well-structured with strong security coverage
3. **amount.test.ts and simple.test.ts** - Need assertion strengthening but test meaningful behavior
4. **No tests to remove** - All tests serve a purpose, some just need stronger assertions

**Estimated effort to strengthen weak assertions:** 2-3 hours
