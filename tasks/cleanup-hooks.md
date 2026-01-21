# Hook Tests Audit - Usefulness Analysis

## Scoring Framework
- **Impact (I)**: How critical is the functionality being tested? (1-10)
- **Probability (P)**: How likely is this code to have bugs/regressions? (1-10)
- **Usefulness Score** = Impact × Probability (max 100)
- **Decision Threshold**: KEEP (≥30), REVIEW (15-29), REMOVE (<15)

---

## Test File Analysis

### 1. useAssetUtxos.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should return empty array for BTC without making API call | 8 | 6 | 48 | KEEP | Tests critical BTC edge case with specific assertions |
| should fetch UTXOs for Counterparty asset successfully | 9 | 7 | 63 | KEEP | Core functionality with data transformation verification |
| should handle empty UTXOs response | 7 | 5 | 35 | KEEP | Edge case with specific array assertion |
| should handle fetch error gracefully | 8 | 5 | 40 | KEEP | Error handling verification |
| should handle empty asset name | 6 | 4 | 24 | REVIEW | Guard clause test - moderate value |
| should cleanup on unmount without errors | 3 | 2 | 6 | REMOVE | Tests React behavior, not our logic |

**File Summary**: 5 KEEP, 1 REVIEW, 1 REMOVE

---

### 2. useDragAndDrop.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should initialize with null drag states | 4 | 2 | 8 | REMOVE | Tests initial state, minimal value |
| should handle drag start | 7 | 5 | 35 | KEEP | Tests state mutation and data transfer setup |
| should handle drag enter | 6 | 4 | 24 | REVIEW | Tests preventDefault and index tracking |
| should handle drag over | 6 | 4 | 24 | REVIEW | Tests event defaults |
| should handle drop and reorder items (drag down) | 9 | 7 | 63 | KEEP | Core logic - verifies array reordering algorithm |
| should handle drop and reorder items (drag up) | 9 | 7 | 63 | KEEP | Core logic - verifies reverse direction reordering |
| should not reorder when dropping at same position | 8 | 6 | 48 | KEEP | Important optimization check |
| should handle drag end | 5 | 3 | 15 | REVIEW | State cleanup test |
| should handle drag leave | 5 | 3 | 15 | REVIEW | State cleanup test |

**File Summary**: 4 KEEP, 4 REVIEW, 1 REMOVE

---

### 3. useFeeRates.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should fetch fee rates on mount | 9 | 6 | 54 | KEEP | Core functionality with specific value checks |
| should handle fetch error | 8 | 5 | 40 | KEEP | Error message verification |
| should provide unique preset options | 8 | 6 | 48 | KEEP | Business logic - preset generation with values |
| should handle deduplicated preset options | 8 | 6 | 48 | KEEP | Edge case - deduplication logic verification |
| should handle autoFetch false | 6 | 4 | 24 | REVIEW | Configuration option test |

**File Summary**: 4 KEEP, 1 REVIEW, 0 REMOVE

---

### 4. useIdleTimer.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should trigger onIdle after timeout | 9 | 6 | 54 | KEEP | Core security feature - idle detection |
| should reset timer on activity | 9 | 7 | 63 | KEEP | Core logic - activity detection resets |
| should not trigger when disabled | 8 | 5 | 40 | KEEP | Configuration verification |
| should stop listening after idle when stopOnIdle is true | 8 | 6 | 48 | KEEP | Option behavior verification |
| should call onActive when transitioning from idle to active | 8 | 5 | 40 | KEEP | Callback verification with state transition |

**File Summary**: 5 KEEP, 0 REVIEW, 0 REMOVE

---

### 5. useSearchQuery.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should return empty results when no search query | 5 | 3 | 15 | REVIEW | Initial state test |
| should return initial query | 4 | 2 | 8 | REMOVE | Trivial initial value test |
| should search when query is set | 9 | 7 | 63 | KEEP | Core functionality - API call and response parsing |
| should debounce search requests | 8 | 6 | 48 | KEEP | Core performance optimization verification |
| should handle search error | 8 | 5 | 40 | KEEP | Error handling with message verification |
| should handle non-ok response | 8 | 5 | 40 | KEEP | HTTP error handling |
| should clear results when query is cleared | 7 | 5 | 35 | KEEP | State cleanup behavior |
| should cancel previous search when new query is set | 8 | 6 | 48 | KEEP | Race condition prevention |
| should handle empty assets array in response | 6 | 4 | 24 | REVIEW | Edge case handling |
| should handle missing assets field in response | 6 | 4 | 24 | REVIEW | Defensive programming test |
| should encode search query properly | 7 | 5 | 35 | KEEP | Security - URL encoding verification |
| should clear error when new search starts | 7 | 5 | 35 | KEEP | UX - error state management |
| should allow setting error manually | 4 | 3 | 12 | REMOVE | Tests setter, minimal logic |

**File Summary**: 8 KEEP, 3 REVIEW, 2 REMOVE

---

### 6. useAssetBalance.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should fetch BTC balance successfully | 9 | 7 | 63 | KEEP | Core - BTC balance with satoshi conversion |
| should fetch Counterparty asset balance successfully | 9 | 7 | 63 | KEEP | Core - XCP asset balance fetching |
| should handle empty asset name | 6 | 4 | 24 | REVIEW | Guard clause verification |
| should handle BTC fetch error | 8 | 5 | 40 | KEEP | Error handling |
| should handle Counterparty asset fetch error | 8 | 5 | 40 | KEEP | Error handling |
| should cleanup on unmount without errors | 3 | 2 | 6 | REMOVE | Tests React cleanup, not our logic |

**File Summary**: 4 KEEP, 1 REVIEW, 1 REMOVE

---

### 7. useAssetInfo.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should return BTC asset info immediately without API call | 9 | 6 | 54 | KEEP | Core - BTC hardcoded info verification |
| should fetch Counterparty asset info successfully | 9 | 7 | 63 | KEEP | Core functionality |
| should handle fetch error gracefully | 8 | 5 | 40 | KEEP | Error handling |
| should handle empty asset name | 6 | 4 | 24 | REVIEW | Guard clause |
| should handle whitespace-only asset name | 5 | 4 | 20 | REVIEW | Edge case guard |
| should handle missing active address | 5 | 3 | 15 | REVIEW | Incomplete test - comment notes limitation |
| should refetch when asset changes | 8 | 6 | 48 | KEEP | Re-render behavior |
| should handle string errors gracefully | 7 | 5 | 35 | KEEP | Error type normalization |
| should handle asset with longname | 7 | 5 | 35 | KEEP | Feature verification |
| should handle indivisible assets | 7 | 5 | 35 | KEEP | Feature verification |
| should cleanup on unmount without errors | 3 | 2 | 6 | REMOVE | Tests React behavior |
| should prevent unnecessary state updates with smart diffing | 4 | 3 | 12 | REMOVE | Tests React optimization, not business logic |

**File Summary**: 7 KEEP, 3 REVIEW, 2 REMOVE

---

### 8. useAssetDetails.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should fetch asset details on mount | 9 | 7 | 63 | KEEP | Core functionality |
| should handle fetch error | 8 | 5 | 40 | KEEP | Error handling |
| should not fetch if asset name is empty | 6 | 4 | 24 | REVIEW | Guard clause |
| should not fetch if asset name is null | 6 | 4 | 24 | REVIEW | Guard clause |
| should refetch when asset name changes | 8 | 6 | 48 | KEEP | Re-render behavior |
| should handle BTC as special case | 9 | 6 | 54 | KEEP | Core - BTC special handling |
| should handle asset with longname | 7 | 5 | 35 | KEEP | Feature verification |
| should handle indivisible assets | 7 | 5 | 35 | KEEP | Feature verification |
| should cleanup on unmount | 3 | 2 | 6 | REMOVE | Tests React behavior |

**File Summary**: 6 KEEP, 2 REVIEW, 1 REMOVE

---

### 9. useBlockHeight.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should fetch block height on mount | 8 | 6 | 48 | KEEP | Core functionality |
| should handle fetch error with generic message | 8 | 5 | 40 | KEEP | Security - no info leakage |
| should auto-refresh block height when interval is set | 8 | 6 | 48 | KEEP | Interval functionality |
| should provide manual refresh function | 7 | 5 | 35 | KEEP | API verification |
| should not fetch on mount when autoFetch is false | 6 | 4 | 24 | REVIEW | Config option |
| should handle block height of 0 | 7 | 4 | 28 | REVIEW | Edge case |
| should cleanup interval on unmount | 6 | 5 | 30 | KEEP | Memory leak prevention |
| should handle rapid refresh calls | 6 | 5 | 30 | KEEP | Race condition prevention |
| should handle error messages without Error object | 6 | 4 | 24 | REVIEW | Defensive programming |
| should not set up interval when refreshInterval is null | 5 | 4 | 20 | REVIEW | Config edge case |
| should not set up interval when refreshInterval is 0 | 5 | 4 | 20 | REVIEW | Config edge case |

**File Summary**: 6 KEEP, 5 REVIEW, 0 REMOVE

---

### 10. useAuthGuard.test.ts
| Test | I | P | Score | Decision | Notes |
|------|---|---|-------|----------|-------|
| should return protection status when wallet is unlocked | 10 | 7 | 70 | KEEP | Security - auth state verification |
| should return protection status when wallet is locked but no navigation needed | 9 | 6 | 54 | KEEP | Security - locked state handling |
| should navigate to unlock screen when transitioning from UNLOCKED to LOCKED with wallets | 10 | 8 | 80 | KEEP | Security - auto-lock navigation |
| should NOT navigate when starting with LOCKED state | 9 | 7 | 63 | KEEP | Security - initial state handling |
| should NOT navigate when no wallets exist even on UNLOCKED -> LOCKED transition | 9 | 6 | 54 | KEEP | Edge case - empty wallet handling |
| should NOT navigate when transitioning from ONBOARDING_NEEDED to LOCKED | 8 | 6 | 48 | KEEP | State machine correctness |
| should NOT navigate when transitioning from LOCKED to UNLOCKED | 8 | 6 | 48 | KEEP | State transition correctness |
| should preserve location path in navigation state | 8 | 6 | 48 | KEEP | UX - return navigation |
| should handle rapid auth state changes correctly | 8 | 6 | 48 | KEEP | Race condition handling |
| should handle wallet array changes without triggering navigation | 7 | 5 | 35 | KEEP | Stability - no false triggers |
| should return correct protection status for all auth states | 8 | 6 | 48 | KEEP | Comprehensive state coverage |
| should not interfere with normal component unmount | 3 | 2 | 6 | REMOVE | Tests React behavior |

**File Summary**: 11 KEEP, 0 REVIEW, 1 REMOVE

---

## Summary

### Tests to REMOVE (Score < 15)
| File | Test | Score | Reason |
|------|------|-------|--------|
| useAssetUtxos | should cleanup on unmount without errors | 6 | Tests React behavior, not our logic |
| useDragAndDrop | should initialize with null drag states | 8 | Tests trivial initial state |
| useSearchQuery | should return initial query | 8 | Trivial initial value test |
| useSearchQuery | should allow setting error manually | 12 | Tests setter, minimal logic |
| useAssetBalance | should cleanup on unmount without errors | 6 | Tests React cleanup |
| useAssetInfo | should cleanup on unmount without errors | 6 | Tests React cleanup |
| useAssetInfo | should prevent unnecessary state updates with smart diffing | 12 | Tests React optimization |
| useAssetDetails | should cleanup on unmount | 6 | Tests React cleanup |
| useAuthGuard | should not interfere with normal component unmount | 6 | Tests React cleanup |

**Total: 9 tests to remove**

### Tests Needing Assertion Strengthening
| File | Test | Issue |
|------|------|-------|
| useDragAndDrop | should handle drag enter | Uses `toHaveBeenCalled()` without validating effect |
| useDragAndDrop | should handle drag over | Tests event.preventDefault called, not actual behavior |
| useDragAndDrop | should handle drag end | Tests event.preventDefault called, not actual behavior |
| useDragAndDrop | should handle drag leave | Tests event.preventDefault called, not actual behavior |

### Tests Duplicating E2E Coverage
| File | Test | E2E Overlap |
|------|------|-------------|
| useAuthGuard | All navigation tests | E2E tests cover auth flow navigation |
| useSearchQuery | API response handling tests | E2E tests cover search functionality |

### Hooks Testing React Behavior (Not Our Logic)
- Multiple `cleanup on unmount` tests across files
- `prevent unnecessary state updates with smart diffing` in useAssetInfo
- `initialize with null drag states` in useDragAndDrop

---

## Recommendations

1. **Remove 9 low-value tests** that test React/framework behavior rather than business logic
2. **Strengthen 4 weak assertions** in useDragAndDrop that only verify `preventDefault` was called
3. **Consider consolidating** repetitive guard clause tests (empty/null asset name) into parameterized tests
4. **High-value hooks to keep comprehensive coverage**:
   - useAuthGuard (security-critical)
   - useIdleTimer (security-critical)
   - useAssetBalance (financial data)
   - useAssetUtxos (financial data)

## Statistics
- **Total tests analyzed**: 78
- **Tests to KEEP**: 60 (77%)
- **Tests to REVIEW**: 19 (24%)
- **Tests to REMOVE**: 9 (12%)
