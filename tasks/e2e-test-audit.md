# E2E Test Audit Report

**Date:** January 21, 2026
**Branch:** e2e-test-audit
**Auditor:** Ralph (autonomous agent)

## Executive Summary

The e2e test suite has **critical quality issues** that undermine its value as automated QA:

| Metric | Count | Assessment |
|--------|-------|------------|
| Total Test Files | 112 | Good coverage |
| Total Test Cases | ~1278 | Comprehensive |
| **Always-Pass Tests** | **97** | **CRITICAL - Meaningless** |
| **Permissive Patterns** | **337** | **HIGH - Too lenient** |
| Provider Tests | 3 files | Thin - page load only |
| Compose Tests | 26 files | Good structure, weak assertions |

## Critical Finding: Always-Pass Tests (|| true)

These tests ALWAYS pass regardless of actual behavior - they provide **zero value**:

### Top Offenders by File

| File | Count | Action Required |
|------|-------|-----------------|
| `e2e/pages/actions/consolidate.spec.ts` | 5 | Fix or remove |
| `e2e/tests/form-edge-cases.spec.ts` | 4 | Fix - critical path |
| `e2e/pages/market.spec.ts` | 4 | Fix or remove |
| `e2e/pages/assets/view-utxo.spec.ts` | 4 | Fix or remove |
| `e2e/pages/secrets/show-private-key.spec.ts` | 3 | **Fix - Security (P25)** |
| `e2e/pages/compose/utxo/move.spec.ts` | 3 | Fix - Money path |
| `e2e/pages/compose/issuance/destroy-supply.spec.ts` | 3 | Fix |
| `e2e/pages/compose/fairminter/*.spec.ts` | 6 | Fix |
| `e2e/pages/compose/dispenser/dispense.spec.ts` | 3 | Fix - Money path |
| `e2e/inputs/*.spec.ts` | 12+ | Review - lower priority |

### Example Anti-Patterns

```typescript
// MEANINGLESS - always passes
expect(hasFee || true).toBe(true);

// MEANINGLESS - always passes
expect(hasMax || true).toBe(true);

// MEANINGLESS - passes if anything is visible
expect(hasUtxoInfo || hasEmpty || hasLoading || true).toBe(true);
```

## High Finding: Permissive Test Patterns

337 tests use `expect(a || b || c).toBe(true)` which are too lenient:

### Top Offenders by File

| File | Count | Priority |
|------|-------|----------|
| `e2e/pages/market.spec.ts` | 13 | P15 |
| `e2e/tests/flow-market-subpages.spec.ts` | 9 | P15 |
| `e2e/pages/market/asset-dispensers.spec.ts` | 9 | P15 |
| `e2e/tests/wallet-operations.spec.ts` | 8 | **P20** |
| `e2e/tests/form-edge-cases.spec.ts` | 8 | **P20** |
| `e2e/pages/wallet/import-private-key.spec.ts` | 8 | **P25 Security** |
| `e2e/pages/market/asset-orders.spec.ts` | 8 | P15 |
| `e2e/pages/assets/view-utxo.spec.ts` | 8 | P15 |
| `e2e/pages/actions/consolidate.spec.ts` | 8 | P15 |
| `e2e/pages/secrets/show-private-key.spec.ts` | 7 | **P25 Security** |

### Problematic Patterns

```typescript
// TOO BROAD - matches any error-like text
const hasError = await page.locator('text=/incorrect|invalid|wrong|error|failed|password/i').isVisible();

// TOO PERMISSIVE - accepts many different states
expect(hasBalance || hasZero || hasError || hasLoading || redirected).toBe(true);

// WEAK - doesn't verify specific error message
const hasError = await page.locator('text=/invalid|error|format/i').isVisible();
```

## Risk Priority Assessment

Using Risk-Based Testing: **Priority = Impact (1-5) × Probability (1-5)**

### Priority 25 (Critical - Must Test)

| Category | Files | Current State | Action |
|----------|-------|---------------|--------|
| **Security - Provider Approval** | 3 | Page load only | **Add real approval tests** |
| **Security - Private Key/Passphrase** | 2 | Weak assertions | **Strengthen** |
| **Money - Compose Send** | 2 | Uses validation bypass | **Add real API test** |
| **Money - Compose Order** | 4 | Permissive | **Specific assertions** |

### Priority 20 (High - Should Test)

| Category | Files | Current State | Action |
|----------|-------|---------------|--------|
| Core Auth - Unlock | 1 | Weak error checks | Strengthen |
| Core Auth - Import | 2 | Permissive patterns | Fix |
| Wallet Operations | 1 | 8 permissive patterns | Fix |
| Form Edge Cases | 1 | 8 permissive patterns | Fix |

### Priority 15 (Medium)

| Category | Files | Current State | Action |
|----------|-------|---------------|--------|
| Market Pages | 4 | Many permissive | Review |
| Asset Views | 4 | 7+ permissive each | Review |
| Input Components | 19 | Lower priority | Last |

### Priority <10 (Low Value - Consider Removing)

Tests that only verify "page loads without crashing" or "has some content":
- `e2e/pages/provider/approve-*.spec.ts` - Currently just page load checks
- Many input tests that only check "component exists"

## Provider Tests Analysis

**Location:** `e2e/pages/provider/`

| File | Tests | Current Coverage | Risk Priority |
|------|-------|------------------|---------------|
| approve-connection.spec.ts | 3 | Page load only | **P25** |
| approve-transaction.spec.ts | 3 | Page load only | **P25** |
| approve-psbt.spec.ts | 3 | Page load only | **P25** |

**Current Tests Are Meaningless:**
```typescript
// This test provides NO value
walletTest('page loads without crashing', async ({ page }) => {
  await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
  await page.waitForLoadState('networkidle');
  const url = page.url();
  expect(url).toBeTruthy(); // ALWAYS TRUE
});
```

**What Should Be Tested:**
1. Origin display is correct
2. Transaction details match request
3. Approve button triggers callback
4. Reject button triggers callback
5. Multiple request queue handling

## Compose Tests Analysis

**Location:** `e2e/pages/compose/`

### Strengths
- Uses `compose-test-helpers.ts` with enableValidationBypass/enableDryRun
- Tests form→review→back cycle
- Uses selectors.ts for some elements

### Weaknesses
1. Review page assertions are too broad:
```typescript
// BAD - just checks "review exists"
expect(reviewContent).toMatch(/review|confirm|sign/i);

// GOOD - should verify exact values
expect(await page.locator('[data-testid="review-destination"]').textContent()).toBe(testAddress);
```

2. No tests that exercise real Counterparty API
3. Signing tests skip actual signing (dry run mode)

### Compose Test Priority

| Compose Type | Priority | Current Tests | Recommendation |
|--------------|----------|---------------|----------------|
| Send | P25 | Good structure | Add value verification |
| Order | P25 | Present | Add price verification |
| Dispenser | P20 | Present | Add rate verification |
| PSBT Sign | P25 | Skipped | **Critical gap** |
| Issuance | P15 | Present | Lower priority |
| Broadcast | P15 | Present | Lower priority |

## Selector Usage Analysis

**Good:** `e2e/selectors.ts` is comprehensive with 500+ lines

**Bad:** Many tests use inline locators instead:

```typescript
// INLINE - hard to maintain
await page.locator('text=/BTC|Balance|Assets/i').first();

// SELECTOR - preferred
import { index } from '../selectors';
await index.btcBalanceRow(page);
```

### Files Using Selectors Well
- `e2e/pages/compose/send/index.spec.ts`
- `e2e/pages/actions/sign-message.spec.ts`

### Files Needing Selector Migration
- `e2e/tests/flow-*.spec.ts` (heavy inline usage)
- `e2e/pages/market/*.spec.ts`
- `e2e/inputs/*.spec.ts`

## Recommendations

### Immediate Actions (P1)

1. **Remove all `|| true` patterns** - 97 instances
   - Either make test meaningful OR delete it
   - Start with security-related files

2. **Fix provider tests** - Priority 25
   - Add proper context setup
   - Test approve/reject flow
   - Verify data displayed

3. **Fix compose send assertions** - Priority 25
   - Verify exact address on review
   - Verify exact amount on review

### Short-Term Actions (P2)

4. **Reduce permissive patterns** from 337 to <50
   - Add comments justifying remaining ones
   - Replace broad regex with specific text

5. **Add integration test** for form→review→back cycle
   - Use specific assertions
   - Test data preservation

### Medium-Term Actions (P3)

6. **Standardize selector usage**
   - Document conventions
   - Migrate inline locators

7. **Add real API integration tests**
   - Test compose with real Counterparty API (testnet)
   - Verify response data

## Files to Modify (Priority Order)

### Phase 1: Remove Always-Pass (P25 Security First)
1. `e2e/pages/secrets/show-private-key.spec.ts`
2. `e2e/pages/secrets/show-passphrase.spec.ts`
3. `e2e/pages/wallet/import-private-key.spec.ts`
4. `e2e/pages/compose/send/index.spec.ts`

### Phase 2: Fix Provider Tests
1. `e2e/pages/provider/approve-connection.spec.ts`
2. `e2e/pages/provider/approve-transaction.spec.ts`
3. `e2e/pages/provider/approve-psbt.spec.ts`

### Phase 3: Fix Compose Assertions
1. `e2e/pages/compose/send/index.spec.ts`
2. `e2e/pages/compose/order/index.spec.ts`
3. `e2e/pages/compose/dispenser/index.spec.ts`

### Phase 4: Remaining Permissive Patterns
1. `e2e/tests/wallet-operations.spec.ts`
2. `e2e/tests/form-edge-cases.spec.ts`
3. `e2e/pages/market.spec.ts`
4. `e2e/pages/market/*.spec.ts`
5. `e2e/inputs/*.spec.ts`

## Appendix: Test Quality Scoring

Using Usefulness Score = Impact × Probability:

| Score | Decision | Count | % |
|-------|----------|-------|---|
| ≥15 | KEEP | ~900 | 70% |
| 10-14 | REVIEW | ~280 | 22% |
| <10 | REMOVE | ~100 | 8% |

**Goal:** After cleanup, 0 tests with Score <10
