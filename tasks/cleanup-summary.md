# Test Cleanup Summary

**Date:** 2026-01-21
**Story:** US-006 - Compile Cleanup Summary
**Source Documents:** cleanup-hooks.md, cleanup-services.md, cleanup-validation.md, cleanup-storage.md, cleanup-blockchain.md

---

## Executive Summary

| Category | Tests Analyzed | REMOVE | REVIEW | KEEP |
|----------|---------------|--------|--------|------|
| Hooks | 78 | 9 | 19 | 60 |
| Services | ~138 | 5 | 22 | ~111 |
| Validation | ~268 | 0 | 28 | ~240 |
| Storage | ~126 | 4 | 12 | ~110 |
| Blockchain | ~400+ | 0 | 2 | ~400 |
| **TOTAL** | **~1,010** | **18** | **83** | **~921** |

---

## Tests to REMOVE (Score < 10)

### Priority: HIGH - Remove These Tests

| # | File | Test Name | Score | Reason | Effort |
|---|------|-----------|-------|--------|--------|
| 1 | useAssetUtxos.test.ts | should cleanup on unmount without errors | 6 | Tests React behavior, not our logic | S |
| 2 | useDragAndDrop.test.ts | should initialize with null drag states | 8 | Tests trivial initial state | S |
| 3 | useSearchQuery.test.ts | should return initial query | 8 | Trivial initial value test | S |
| 4 | useSearchQuery.test.ts | should allow setting error manually | 12 | Tests setter, minimal logic | S |
| 5 | useAssetBalance.test.ts | should cleanup on unmount without errors | 6 | Tests React cleanup | S |
| 6 | useAssetInfo.test.ts | should cleanup on unmount without errors | 6 | Tests React cleanup | S |
| 7 | useAssetInfo.test.ts | should prevent unnecessary state updates with smart diffing | 12 | Tests React optimization | S |
| 8 | useAssetDetails.test.ts | should cleanup on unmount | 6 | Tests React cleanup | S |
| 9 | useAuthGuard.test.ts | should not interfere with normal component unmount | 6 | Tests React cleanup | S |
| 10 | eventEmitterService.test.ts | getStats should return empty stats when cleared | 8 | Trivial check | S |
| 11 | eventEmitterService.test.ts | BaseService should return null for empty state | 12 | Trivial edge case | S |
| 12 | eventEmitterService.test.ts | BaseService should correct state version | 8 | Trivial check | S |
| 13 | providerService.lifecycle.test.ts | handle badge text for high counts | 8 | Edge case, UI only | S |
| 14 | providerService.test.ts | Event Emissions | 0 | Empty test body | S |
| 15 | signMessageRequestStorage.test.ts | should work on already empty storage | 12 | Unlikely scenario | S |
| 16 | signMessageRequestStorage.test.ts | should handle empty message | 12 | Edge case, no real-world occurrence | S |
| 17 | sessionMetadataStorage.test.ts | should handle clearing non-existent metadata | 12 | Just tests "doesn't throw" | S |
| 18 | serviceStateStorage.test.ts | serviceKeepAlive should complete without error | 4 | Only tests "doesn't throw" | S |

**Total: 18 tests to remove**

---

## Tests to STRENGTHEN (Weak Assertions)

### Priority: HIGH - Security-Related Weak Assertions

| # | File | Test/Location | Current Pattern | Should Be | Effort |
|---|------|---------------|-----------------|-----------|--------|
| 1 | amount.test.ts:61-64 | validateAmount - reject special values | `.toBe(false)` | Check error message | S |
| 2 | amount.test.ts:67-72 | validateAmount - reject invalid format | `.toBe(false)` | Check error message | S |
| 3 | fee.test.ts:67-70 | validateFeeRate - reject NaN/Infinity | `.toBe(false)` | Check error message | S |
| 4 | fee.test.ts:49-53 | validateFeeRate - reject empty/null | `.toBe(false)` | Check error message | S |

### Priority: MEDIUM - Input Validation Weak Assertions

| # | File | Test/Location | Current Pattern | Should Be | Effort |
|---|------|---------------|-----------------|-----------|--------|
| 5 | simple.test.ts:12-19 | Asset validation - basic names | `.toBe(true/false)` | Add error message checks | S |
| 6 | simple.test.ts:23-26 | Asset validation - subassets | `.toBe(true/false)` | Add error message checks | S |
| 7 | amount.test.ts:20-25 | validateAmount - valid amounts | `.toBe(true)` | Verify no error property | S |
| 8 | amount.test.ts:43-45 | validateAmount - reject empty/null | `.toBe(false)` | Check error message | S |
| 9 | amount.test.ts:117-121 | validateQuantity - valid | `.toBe(true)` | Verify no error property | S |
| 10 | amount.test.ts:132-136 | validateQuantity - reject empty/null | `.toBe(false)` | Check error message | S |
| 11 | amount.test.ts:150-161 | validateQuantity - reject special/invalid | `.toBe(false)` | Check error messages | S |
| 12 | privateKey.test.ts:194-197 | validatePrivateKeyLength - valid | `.toBe(true)` | Verify no error | S |
| 13 | assetOwner.test.ts:83 | shouldTriggerAssetLookup - short | `.toBe(false)` | Explain why (too short) | S |
| 14 | fee.test.ts:23-27 | validateFeeRate - valid rates | `.toBe(true)` | Verify no error | S |

### Priority: LOW - Fuzz-Like Tests (Acceptable as-is)

| # | File | Test/Location | Issue | Decision |
|---|------|---------------|-------|----------|
| 15 | qrCode.test.ts:106-118 | Random string handling | Type-only checks | KEEP - property test |
| 16 | qrCode.test.ts:199-215 | Random numeric inputs | Type-only checks | KEEP - property test |
| 17 | qrCode.test.ts:301-306 | Random dimension inputs | Type-only checks | KEEP - property test |
| 18 | privateKey.test.ts:87-96 | Random invalid inputs | Type-only checks | KEEP - property test |

**Total: 14 assertions to strengthen, 4 acceptable as-is**

---

## Tests to REFACTOR (Over-Mocked)

### Priority: CRITICAL - Delete or Rewrite

| # | File | Tests | Issue | Recommendation | Effort |
|---|------|-------|-------|----------------|--------|
| 1 | walletService.test.ts | 24 tests | All tests only verify mock returns mock value | **DELETE ENTIRE FILE** or rewrite as integration tests | L |

### Priority: MEDIUM - Consider Migrating Mocks

| # | File | Tests | Issue | Recommendation | Effort |
|---|------|-------|-------|----------------|--------|
| 2 | signMessageRequestStorage.test.ts | 27 tests | Uses manual mock instead of `fakeBrowser` | Low priority - TTL logic still tested | M |

### Priority: LOW - Weak "Was Called" Assertions

| # | File | Tests | Issue | Effort |
|---|------|-------|-------|--------|
| 3 | useDragAndDrop.test.ts | 4 tests | `toHaveBeenCalled()` without validating effect | S |
| 4 | connectionService.test.ts | 2 tests | Verify mock called, not actual behavior | S |
| 5 | providerService.test.ts | Rate Limiting test | Comment-only, no assertions | S |

**Total: 1 file to delete/rewrite (24 tests), 33 tests with minor mock issues**

---

## By Effort Level

### Small (S) - Single-line changes or test deletion

**REMOVE (18 tests):**
- 9 hook tests testing React behavior
- 5 service tests (trivial/empty)
- 4 storage tests (unlikely scenarios)

**STRENGTHEN (14 assertions):**
- 4 security-related (amount, fee validation)
- 10 input validation assertions

**Estimated time:** 1-2 hours

### Medium (M) - Multiple tests need updating

**REFACTOR:**
- signMessageRequestStorage.test.ts mock migration (optional)
- 6 tests with weak "was called" assertions

**Estimated time:** 2-3 hours

### Large (L) - Significant rewrite required

**DELETE/REWRITE:**
- walletService.test.ts (24 tests) - entire file tests mock behavior only

**Estimated time:** 4-6 hours (if rewriting)

---

## Prioritized Action Plan

### Phase 1: Quick Wins (1-2 hours)
1. Remove 18 low-value tests
2. Strengthen 4 security-related assertions

### Phase 2: Assertion Cleanup (2-3 hours)
3. Strengthen 10 input validation assertions
4. Fix 6 weak "was called" assertions

### Phase 3: Major Refactoring (4-6 hours)
5. Decision on walletService.test.ts:
   - Option A: Delete (recommended - provides false confidence)
   - Option B: Rewrite as integration tests with real storage

---

## Files Not Requiring Cleanup

### Exemplary Test Files (Do Not Modify)
- `session.test.ts` - Gold standard for validation assertions
- `mutex.test.ts` - Exemplary concurrency testing
- `walletStorage.test.ts` - Excellent data integrity validation
- `keyStorage.test.ts` - Good security-critical testing
- All blockchain/bitcoin tests - Well-designed with real crypto operations

### Good Quality Files (Minor Issues Only)
- `providerService.security.test.ts` - Security tests well-written
- `eventEmitterService.test.ts` - Core functionality solid
- `connectionService.test.ts` - Core tests good, minor review items
- `requestStorage.test.ts` - Thorough TTL and concurrency tests

---

## Total Counts

| Metric | Count |
|--------|-------|
| Tests to REMOVE | 18 |
| Assertions to STRENGTHEN | 14 |
| Tests with minor mock issues | 33 |
| Files potentially to delete | 1 (walletService.test.ts - 24 tests) |
| **Total tests affected** | **65** (+ 24 if walletService deleted) |

---

## Recommendations Summary

1. **Immediate Action**: Remove 18 low-value tests that test React/framework behavior
2. **Quick Win**: Strengthen 14 weak assertions in validation tests
3. **Decision Required**: Delete or rewrite walletService.test.ts (24 tests providing false confidence)
4. **No Action Needed**: Blockchain tests are excellent - no cleanup required
5. **Pattern to Follow**: Use session.test.ts as the model for validation test assertions
