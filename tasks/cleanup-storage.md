# Storage Test Cleanup Audit

## Summary
- **Files analyzed**: 8
- **Total tests**: ~126
- **Tests to REMOVE**: 4
- **Tests to REVIEW**: 12
- **Tests to KEEP**: ~110

## Scoring Methodology
- **Impact** (1-10): How bad would it be if this failed in prod?
- **Probability** (1-10): How likely is this to catch a real bug?
- **Score** = Impact × Probability
- Threshold: Score < 15 = REMOVE, 15-29 = REVIEW, ≥30 = KEEP

---

## 1. signMessageRequestStorage.test.ts (27 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should store a new sign message request | 8 | 7 | 56 | KEEP |
| should append to existing requests | 8 | 6 | 48 | KEEP |
| should filter out expired requests when storing | 9 | 7 | 63 | KEEP |
| should handle unicode messages | 6 | 4 | 24 | REVIEW |
| should handle very long messages | 5 | 3 | 15 | REVIEW |
| should return a request by ID | 8 | 7 | 56 | KEEP |
| should return null for non-existent ID | 7 | 6 | 42 | KEEP |
| should return null for expired request | 9 | 7 | 63 | KEEP |
| should return null for empty storage | 6 | 6 | 36 | KEEP |
| should return all valid requests | 7 | 6 | 42 | KEEP |
| should filter out expired requests | 9 | 7 | 63 | KEEP |
| should return empty array when no requests exist | 6 | 6 | 36 | KEEP |
| should return empty array for undefined storage | 6 | 5 | 30 | KEEP |
| should remove a request by ID | 8 | 6 | 48 | KEEP |
| should handle removing non-existent ID gracefully | 5 | 4 | 20 | REVIEW |
| should handle empty storage (remove) | 5 | 4 | 20 | REVIEW |
| should clear all requests | 7 | 6 | 42 | KEEP |
| should work on already empty storage | 4 | 3 | 12 | REMOVE |
| should accept requests just under the TTL limit | 9 | 7 | 63 | KEEP |
| should reject requests exactly at TTL limit | 9 | 7 | 63 | KEEP |
| should handle multiple requests from same origin | 6 | 5 | 30 | KEEP |
| should handle requests from different origins | 5 | 4 | 20 | REVIEW |
| should handle empty message | 4 | 3 | 12 | REMOVE |
| should preserve message formatting | 6 | 5 | 30 | KEEP |

**Notes:**
- TTL boundary tests are excellent - critical for security
- Tests use manual mock storage which tests mock behavior, but still validates important logic
- Edge cases like "empty storage" and "empty message" are unlikely scenarios

### Weak Assertions
- None identified - assertions are specific

### Tests Over-Mocking Storage
- Uses manual mock `mockStorage` object instead of `fakeBrowser` from wxt/testing
- However, tests still verify important filtering/TTL logic

---

## 2. sessionMetadataStorage.test.ts (11 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should return null when no session exists | 7 | 7 | 49 | KEEP |
| should store session metadata | 9 | 8 | 72 | KEEP |
| should overwrite existing metadata | 7 | 6 | 42 | KEEP |
| should clear existing metadata | 9 | 7 | 63 | KEEP |
| should handle clearing non-existent metadata | 4 | 3 | 12 | REMOVE |
| should support full session lifecycle | 9 | 8 | 72 | KEEP |
| should store all required fields | 8 | 6 | 48 | KEEP |
| should handle 1 minute timeout | 5 | 4 | 20 | REVIEW |
| should handle 30 minute timeout | 5 | 4 | 20 | REVIEW |

**Notes:**
- Uses `fakeBrowser` from wxt/testing - good pattern
- "Full session lifecycle" test is excellent
- Timeout configuration tests don't test timeout *behavior*, just storage (low value)

### Weak Assertions
- None identified

### Missing Persistence Verification
- Good - uses fakeBrowser which tests actual storage behavior

---

## 3. serviceStateStorage.test.ts (18 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should return null when no state exists | 6 | 6 | 36 | KEEP |
| should return null for version mismatch | 9 | 8 | 72 | KEEP |
| should return state for matching version | 8 | 7 | 56 | KEEP |
| should store service state | 8 | 7 | 56 | KEEP |
| should overwrite existing state | 7 | 6 | 42 | KEEP |
| should store state with updated version | 9 | 7 | 63 | KEEP |
| should handle complex state objects | 6 | 5 | 30 | KEEP |
| should store state for different services independently | 8 | 7 | 56 | KEEP |
| should not affect other services when updating one | 8 | 7 | 56 | KEEP |
| serviceKeepAlive should complete without error | 2 | 2 | 4 | REMOVE |
| serviceKeepAlive should work for any service name | 2 | 2 | 4 | REMOVE (duplicate) |
| should support version bump for schema changes | 9 | 7 | 63 | KEEP |
| should handle null state | 5 | 4 | 20 | REVIEW |
| should handle string state | 5 | 4 | 20 | REVIEW |
| should handle number state | 5 | 4 | 20 | REVIEW |
| should handle boolean state | 5 | 4 | 20 | REVIEW |
| should handle empty object state | 5 | 4 | 20 | REVIEW |
| should handle empty array state | 5 | 4 | 20 | REVIEW |

**Notes:**
- Version mismatch tests are excellent - critical for state migrations
- `serviceKeepAlive` tests only verify "doesn't throw" - no meaningful assertion
- Primitive/edge case tests are marginally useful - storage already handles JSON serialization

### Weak Assertions
- `serviceKeepAlive` tests use `resolves.not.toThrow()` - doesn't test actual behavior

### Tests Over-Mocking Storage
- Good - uses `fakeBrowser`

---

## 4. updateStorage.test.ts (14 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should return null when no state exists | 6 | 6 | 36 | KEEP |
| should store update state | 7 | 7 | 49 | KEEP |
| should store state with pending version | 8 | 7 | 56 | KEEP |
| should overwrite existing state | 7 | 6 | 42 | KEEP |
| should clear existing state | 7 | 6 | 42 | KEEP |
| should handle clearing non-existent state | 4 | 3 | 12 | REVIEW |
| should track update detection and installation | 8 | 7 | 56 | KEEP |
| should handle semver versions | 5 | 4 | 20 | REVIEW |
| should handle pre-release versions | 5 | 4 | 20 | REVIEW |
| should preserve lastCheckTime accurately | 6 | 5 | 30 | KEEP |
| should update lastCheckTime on periodic checks | 6 | 5 | 30 | KEEP |

**Notes:**
- Lifecycle test is excellent
- Version format tests don't test version comparison logic, just storage (low value)

### Weak Assertions
- None identified

---

## 5. requestStorage.test.ts (15 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should store a request | 8 | 7 | 56 | KEEP |
| should store multiple requests | 7 | 6 | 42 | KEEP |
| should clean up expired requests on store | 9 | 8 | 72 | KEEP |
| should return null for non-existent request | 7 | 6 | 42 | KEEP |
| should return null for expired request | 9 | 8 | 72 | KEEP |
| should return request if not expired | 9 | 8 | 72 | KEEP |
| should return empty array when no requests | 6 | 6 | 36 | KEEP |
| should filter out expired requests | 9 | 8 | 72 | KEEP |
| should remove a request by ID | 8 | 6 | 48 | KEEP |
| should handle removing non-existent request | 5 | 4 | 20 | REVIEW |
| should remove all requests (clear) | 7 | 6 | 42 | KEEP |
| should handle clearing empty storage | 4 | 3 | 12 | REVIEW |
| should handle concurrent stores safely | 8 | 7 | 56 | KEEP |
| should handle concurrent removes safely | 8 | 7 | 56 | KEEP |
| should respect custom TTL | 9 | 8 | 72 | KEEP |

**Notes:**
- Excellent concurrency tests - critical for request queue integrity
- TTL tests are thorough and valuable
- Properly uses `vi.useFakeTimers()` for time-sensitive tests

### Weak Assertions
- None identified

---

## 6. mutex.test.ts (15 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| isExpired: should return false when timestamp is within TTL | 9 | 8 | 72 | KEEP |
| isExpired: should return true when timestamp equals TTL boundary | 9 | 8 | 72 | KEEP |
| isExpired: should return true when timestamp exceeds TTL | 9 | 8 | 72 | KEEP |
| isExpired: should return false for zero elapsed time | 8 | 7 | 56 | KEEP |
| isExpired: should treat NaN timestamp as expired (fail-safe) | 9 | 6 | 54 | KEEP |
| isExpired: should treat NaN ttl as expired (fail-safe) | 9 | 6 | 54 | KEEP |
| isExpired: should treat negative ttl as expired (fail-safe) | 9 | 6 | 54 | KEEP |
| isExpired: should treat Infinity timestamp as expired (fail-safe) | 8 | 5 | 40 | KEEP |
| createWriteLock: should create independent lock instances | 5 | 4 | 20 | REVIEW |
| createWriteLock: should execute single operation immediately | 7 | 6 | 42 | KEEP |
| createWriteLock: should serialize concurrent operations | 10 | 9 | 90 | KEEP |
| createWriteLock: should return results in correct order | 9 | 8 | 72 | KEEP |
| createWriteLock: should release lock after operation completes | 9 | 8 | 72 | KEEP |
| createWriteLock: should release lock even if operation throws | 10 | 8 | 80 | KEEP |
| createWriteLock: should handle async operations correctly | 10 | 9 | 90 | KEEP |
| createWriteLock: should allow independent locks to run concurrently | 8 | 6 | 48 | KEEP |

**Notes:**
- **Excellent test file** - mutex is critical infrastructure
- Fail-safe validation tests are well-designed
- Concurrency tests are thorough and important
- Tests actual behavior, not mock behavior

### Weak Assertions
- None identified

---

## 7. keyStorage.test.ts (12 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should return null when no key is cached | 7 | 7 | 49 | KEEP |
| should store and retrieve cached key | 10 | 8 | 80 | KEEP |
| should clear cached key | 10 | 8 | 80 | KEEP |
| should handle clearing non-existent key | 4 | 3 | 12 | REVIEW |
| hasSettingsMasterKey: should return false when no key is cached | 8 | 7 | 56 | KEEP |
| hasSettingsMasterKey: should return true when key is cached | 9 | 8 | 72 | KEEP |
| hasSettingsMasterKey: should return false after key is cleared | 9 | 8 | 72 | KEEP |
| Keychain: should return null when no keychain key is cached | 7 | 7 | 49 | KEEP |
| Keychain: should store and retrieve cached keychain key | 10 | 8 | 80 | KEEP |
| Keychain: should clear cached keychain key | 10 | 8 | 80 | KEEP |
| Independence: should store settings and keychain keys independently | 9 | 7 | 63 | KEEP |
| Independence: should clear settings key without affecting keychain key | 9 | 7 | 63 | KEEP |
| Independence: should clear keychain key without affecting settings key | 9 | 7 | 63 | KEEP |

**Notes:**
- **Security-critical** - key storage is essential for wallet security
- Independence tests are valuable - prevent key contamination
- All tests have high impact due to security implications

### Weak Assertions
- None identified

---

## 8. walletStorage.test.ts (14 tests)

| Test | Impact | Prob | Score | Decision |
|------|--------|------|-------|----------|
| should return null when no keychain exists | 8 | 7 | 56 | KEEP |
| should return keychain record when it exists | 10 | 8 | 80 | KEEP |
| should return null for invalid/corrupted data | 10 | 8 | 80 | KEEP |
| should save keychain record to storage | 10 | 8 | 80 | KEEP |
| should overwrite existing keychain record | 9 | 7 | 63 | KEEP |
| keychainExists: should return false when no keychain exists | 8 | 7 | 56 | KEEP |
| keychainExists: should return true when keychain exists | 9 | 8 | 72 | KEEP |
| keychainExists: should return false after keychain is deleted | 9 | 8 | 72 | KEEP |
| should delete existing keychain | 10 | 8 | 80 | KEEP |
| should not throw when deleting non-existent keychain | 5 | 4 | 20 | REVIEW |
| Validation: should validate version field | 9 | 8 | 72 | KEEP |
| Validation: should validate salt field | 9 | 8 | 72 | KEEP |
| Validation: should validate encryptedKeychain field | 9 | 8 | 72 | KEEP |
| Validation: should validate kdf.iterations field | 9 | 8 | 72 | KEEP |
| Validation: should accept valid keychain record | 9 | 8 | 72 | KEEP |

**Notes:**
- **Security-critical** - wallet/keychain storage is essential
- Validation tests are excellent - prevent corrupted data from being used
- Tests verify data integrity checks work properly

### Weak Assertions
- None identified

---

## Tests to REMOVE (Score < 15)

| File | Test | Score | Reason |
|------|------|-------|--------|
| signMessageRequestStorage.test.ts | should work on already empty storage (clear) | 12 | Unlikely scenario, low value |
| signMessageRequestStorage.test.ts | should handle empty message | 12 | Edge case with no real-world occurrence |
| sessionMetadataStorage.test.ts | should handle clearing non-existent metadata | 12 | Just tests "doesn't throw" |
| serviceStateStorage.test.ts | serviceKeepAlive should complete without error | 4 | Only tests "doesn't throw" |

**Note:** `serviceKeepAlive should work for any service name` is essentially a duplicate of the above and scored identically (4), but grouped into one removal.

---

## Tests to REVIEW (Score 15-29)

| File | Test | Score | Issue |
|------|------|-------|-------|
| signMessageRequestStorage.test.ts | should handle unicode messages | 24 | Storage handles this inherently |
| signMessageRequestStorage.test.ts | should handle very long messages | 15 | No practical limit tested |
| signMessageRequestStorage.test.ts | should handle removing non-existent ID gracefully | 20 | Just tests "doesn't throw" |
| signMessageRequestStorage.test.ts | should handle empty storage (remove) | 20 | Just tests "doesn't throw" |
| signMessageRequestStorage.test.ts | should handle requests from different origins | 20 | Doesn't test origin-specific behavior |
| sessionMetadataStorage.test.ts | should handle 1 minute timeout | 20 | Tests storage, not timeout behavior |
| sessionMetadataStorage.test.ts | should handle 30 minute timeout | 20 | Tests storage, not timeout behavior |
| serviceStateStorage.test.ts | Primitive type tests (6 tests) | 20 | JSON handles this inherently |
| updateStorage.test.ts | Version format tests (2 tests) | 20 | Storage doesn't do version comparison |
| requestStorage.test.ts | should handle removing non-existent request | 20 | Just tests "doesn't throw" |
| keyStorage.test.ts | should handle clearing non-existent key | 12 | Just tests "doesn't throw" |
| walletStorage.test.ts | should not throw when deleting non-existent keychain | 20 | Just tests "doesn't throw" |

---

## Tests Over-Mocking Storage

| File | Issue | Recommendation |
|------|-------|----------------|
| signMessageRequestStorage.test.ts | Uses manual `mockStorage` object instead of `fakeBrowser` | Consider migrating to `fakeBrowser` for consistency, but low priority since TTL logic is well-tested |

---

## Missing Persistence Verification

All files properly verify persistence through round-trip tests (save → retrieve).

---

## Overall Assessment

### Strengths
1. **mutex.test.ts** - Exemplary test file for concurrency-critical code
2. **walletStorage.test.ts** - Excellent validation tests for data integrity
3. **keyStorage.test.ts** - Good independence tests for security-critical keys
4. **requestStorage.test.ts** - Thorough TTL and concurrency testing

### Weaknesses
1. **serviceKeepAlive tests** - Only verify "doesn't throw", no meaningful assertion
2. **Edge case tests** - Some tests for unlikely scenarios (empty storage, edge values) provide low value
3. **Type variation tests** - Tests for different primitive types are low value since JSON serialization handles this

### Recommendations
1. Remove 4 low-value tests (Score < 15)
2. Consider consolidating REVIEW tests into fewer, more comprehensive tests
3. Keep all security-related storage tests (keyStorage, walletStorage) - high impact
4. Keep all mutex tests - critical infrastructure
