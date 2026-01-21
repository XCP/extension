# Service Tests Usefulness Audit

## Summary

| Metric | Count |
|--------|-------|
| Total Test Files | 10 |
| Total Tests | ~138 |
| Tests to REMOVE | 5 |
| Tests to REVIEW | 22 |
| Tests to KEEP | ~111 |

## Scoring Methodology

**Usefulness Score = Impact × Probability**

- **Impact (1-10)**: How critical is the bug this test would catch?
- **Probability (1-10)**: How likely is this bug to occur?
- **Score < 15**: REMOVE - Low value test
- **Score 15-29**: REVIEW - Consider strengthening or removing
- **Score >= 30**: KEEP - High value test

---

## Test Analysis by File

### 1. eventEmitterService.test.ts (37 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| on/emit - should register and call event listeners | 8 | 7 | 56 | KEEP | Core functionality |
| on/emit - should call multiple listeners for same event | 7 | 6 | 42 | KEEP | Multi-listener is common |
| on/emit - should not call listeners for different events | 7 | 5 | 35 | KEEP | Event isolation critical |
| on/emit - should handle listener errors without affecting others | 8 | 4 | 32 | KEEP | Error resilience |
| off - should remove a specific listener | 7 | 6 | 42 | KEEP | Cleanup functionality |
| off - should only remove the specified listener | 7 | 5 | 35 | KEEP | Precision removal |
| off - should handle removing non-existent listener gracefully | 4 | 3 | 12 | REVIEW | Edge case, low impact |
| off - should clean up empty listener sets | 5 | 3 | 15 | REVIEW | Memory cleanup |
| emitProviderEvent - origin-specific listeners | 9 | 7 | 63 | KEEP | Security-critical |
| emitProviderEvent - not emit to different origins | 9 | 7 | 63 | KEEP | Security-critical |
| emitProviderEvent - wildcard listeners along with origin | 8 | 5 | 40 | KEEP | Important pattern |
| emitProviderEvent - both origin-specific and wildcard | 8 | 5 | 40 | KEEP | Combined behavior |
| emitProviderEvent - emit to all when origin is null | 7 | 4 | 28 | REVIEW | Edge case |
| onWithTimeout - should register a listener with timeout | 7 | 5 | 35 | KEEP | Timeout feature |
| onWithTimeout - auto-cleanup after timeout | 8 | 6 | 48 | KEEP | Memory leak prevention |
| onWithTimeout - should not auto-cleanup before timeout | 6 | 4 | 24 | REVIEW | Timing edge case |
| onWithTimeout - should clear timeout when manually removed | 7 | 4 | 28 | REVIEW | Edge case |
| onWithTimeout - should track timed listeners in stats | 5 | 3 | 15 | REVIEW | Observability |
| pendingRequests - store and resolve | 8 | 7 | 56 | KEEP | Core request flow |
| pendingRequests - return false for non-existent request | 6 | 4 | 24 | REVIEW | Edge case |
| pendingRequests - remove request after resolving | 8 | 6 | 48 | KEEP | Prevents double-resolve |
| pendingRequests - clear without resolving | 7 | 5 | 35 | KEEP | Cleanup path |
| pendingRequests - track pending request count | 6 | 4 | 24 | REVIEW | Observability |
| clear - should clear all listeners | 8 | 5 | 40 | KEEP | Cleanup functionality |
| clear - should clear all pending requests | 8 | 5 | 40 | KEEP | Cleanup functionality |
| clear - should clear timed listener timeouts | 7 | 4 | 28 | REVIEW | Memory cleanup |
| getStats - should return correct statistics | 5 | 3 | 15 | REVIEW | Observability only |
| getStats - should return empty stats when cleared | 4 | 2 | 8 | REMOVE | Trivial check |
| BaseService implementation - serializable state | 6 | 4 | 24 | REVIEW | Integration point |
| BaseService implementation - return null for empty state | 4 | 3 | 12 | REMOVE | Trivial edge case |
| BaseService implementation - correct state version | 4 | 2 | 8 | REMOVE | Trivial check |
| edge cases - same callback for multiple events | 6 | 4 | 24 | REVIEW | Edge case |
| edge cases - registering same callback twice | 6 | 4 | 24 | REVIEW | Dedup behavior |
| edge cases - emitting with no listeners | 5 | 5 | 25 | REVIEW | Graceful handling |
| edge cases - handle various data types | 5 | 3 | 15 | REVIEW | Type flexibility |

### 2. connectionService.test.ts (13 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| hasPermission - should return false for unknown origin | 9 | 7 | 63 | KEEP | Security-critical |
| hasPermission - should return true for connected origin | 8 | 7 | 56 | KEEP | Core functionality |
| connect - successfully connect new origin | 8 | 7 | 56 | KEEP | Core functionality |
| connect - return existing connection if already connected | 7 | 5 | 35 | KEEP | Efficiency |
| connect - reject when user denies | 9 | 6 | 54 | KEEP | Security-critical |
| connect - validate origin format | 8 | 5 | 40 | KEEP | Input validation |
| connect - validate address format | 6 | 4 | 24 | REVIEW | Test comment says no validation |
| disconnect - successfully disconnect | 8 | 6 | 48 | KEEP | Core functionality |
| disconnect - handle non-connected origin | 5 | 3 | 15 | REVIEW | Edge case |
| getConnectedWebsites - return list | 7 | 5 | 35 | KEEP | Core functionality |
| getConnectedWebsites - return empty array | 5 | 4 | 20 | REVIEW | Edge case |
| state persistence - persist across restarts | 9 | 5 | 45 | KEEP | Critical for UX |
| rate limiting - enforce limits | 9 | 5 | 45 | KEEP | Security-critical |

### 3. providerService.lifecycle.test.ts (14 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| Request Expiration - auto-expire after timeout | 8 | 5 | 40 | KEEP | Memory leak prevention |
| Request Expiration - handle multiple expired | 7 | 4 | 28 | REVIEW | Batch cleanup |
| Tab/Window Cleanup - clean up on navigate away | 8 | 5 | 40 | KEEP | Resource cleanup |
| Queue Overflow - handle overflow gracefully | 7 | 3 | 21 | REVIEW | Edge case |
| Queue Overflow - prevent memory exhaustion | 8 | 3 | 24 | REVIEW | Security edge case |
| Concurrent Request - multiple from same origin | 7 | 5 | 35 | KEEP | Concurrency handling |
| Concurrent Request - from multiple origins | 7 | 5 | 35 | KEEP | Concurrency handling |
| Window State - track approval window state | 6 | 4 | 24 | REVIEW | State tracking |
| Badge - update badge count correctly | 5 | 4 | 20 | REVIEW | UI feedback |
| Badge - handle badge text for high counts | 4 | 2 | 8 | REMOVE | Edge case, UI only |
| Emergency Cleanup - provide capability | 8 | 4 | 32 | KEEP | Recovery mechanism |

### 4. providerService.security.test.ts (17 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| Authorization - reject sensitive methods when not connected | 10 | 8 | 80 | KEEP | Security-critical |
| Authorization - allow non-sensitive without auth | 8 | 6 | 48 | KEEP | Public API behavior |
| Authorization - not allow bypassing | 10 | 6 | 60 | KEEP | Security-critical |
| Rate Limiting - connection attempts | 9 | 6 | 54 | KEEP | DoS protection |
| Rate Limiting - transaction rate limiting | 9 | 5 | 45 | KEEP | DoS protection |
| Rate Limiting - separate limits per origin | 8 | 5 | 40 | KEEP | Fair usage |
| Input Validation - validate transaction params | 9 | 7 | 63 | KEEP | Security-critical |
| Input Validation - validate parameter types | 9 | 7 | 63 | KEEP | Security-critical |
| Input Validation - not expose sensitive data in errors | 10 | 5 | 50 | KEEP | Security-critical |
| Approval Flow - require user approval for signing | 10 | 7 | 70 | KEEP | Security-critical |
| Approval Flow - require auth for broadcast | 10 | 6 | 60 | KEEP | Security-critical |
| Origin Validation - handle malformed origins | 8 | 4 | 32 | KEEP | Security edge case |
| Data Exposure - not expose wallet data unconnected | 10 | 7 | 70 | KEEP | Privacy-critical |
| Data Exposure - only expose active address | 9 | 6 | 54 | KEEP | Privacy-critical |
| Data Exposure - hide accounts when locked | 10 | 6 | 60 | KEEP | Privacy-critical |

### 5. approvalService.test.ts (14 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| requestApproval - create pending and open popup | 8 | 7 | 56 | KEEP | Core functionality |
| requestApproval - resolve when granted | 8 | 7 | 56 | KEEP | Core functionality |
| requestApproval - reject when denied | 9 | 7 | 63 | KEEP | Core functionality |
| requestApproval - supersede existing pending | 8 | 5 | 40 | KEEP | Important UX pattern |
| resolveApproval - resolve with success | 8 | 7 | 56 | KEEP | Core functionality |
| resolveApproval - reject when approved:false | 8 | 6 | 48 | KEEP | Core functionality |
| resolveApproval - return false for non-existent | 5 | 4 | 20 | REVIEW | Edge case handling |
| getCurrentApproval - return null when no pending | 5 | 4 | 20 | REVIEW | State query |
| getCurrentApproval - return current when pending | 7 | 5 | 35 | KEEP | State query |
| badge management - update based on pending | 5 | 4 | 20 | REVIEW | UI feedback |
| state persistence - initialize fresh on restart | 7 | 4 | 28 | REVIEW | Stateless design |

### 6. providerService.test.ts (25 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| xcp_requestAccounts - return if connected | 8 | 7 | 56 | KEEP | Core functionality |
| xcp_requestAccounts - request permission if not | 8 | 7 | 56 | KEEP | Core functionality |
| xcp_accounts - return empty if not connected | 9 | 7 | 63 | KEEP | Privacy protection |
| xcp_accounts - return if connected and unlocked | 8 | 7 | 56 | KEEP | Core functionality |
| xcp_accounts - return empty if locked | 9 | 6 | 54 | KEEP | Privacy protection |
| xcp_chainId - return 0x0 for mainnet | 6 | 5 | 30 | KEEP | Standard compliance |
| unsupported methods - throw error | 7 | 5 | 35 | KEEP | API boundary |
| unauthorized - xcp_signMessage | 10 | 7 | 70 | KEEP | Security-critical |
| unauthorized - xcp_signPsbt | 10 | 7 | 70 | KEEP | Security-critical |
| unauthorized - xcp_signTransaction | 10 | 7 | 70 | KEEP | Security-critical |
| unauthorized - xcp_broadcastTransaction | 10 | 7 | 70 | KEEP | Security-critical |
| xcp_signPsbt - require authorization | 10 | 7 | 70 | KEEP | Security-critical |
| xcp_signPsbt - require hex parameter | 8 | 6 | 48 | KEEP | Input validation |
| xcp_broadcastTransaction - require auth | 10 | 7 | 70 | KEEP | Security-critical |
| xcp_broadcastTransaction - require signed tx | 8 | 6 | 48 | KEEP | Input validation |
| xcp_getBalances - require authorization | 9 | 7 | 63 | KEEP | Privacy protection |
| xcp_getBalances - require active address | 7 | 5 | 35 | KEEP | State requirement |
| xcp_getAssets - not be supported | 6 | 4 | 24 | REVIEW | API boundary |
| xcp_getHistory - require authorization | 9 | 6 | 54 | KEEP | Privacy protection |
| isConnected - return true if connected | 7 | 6 | 42 | KEEP | State query |
| isConnected - return false if not | 7 | 6 | 42 | KEEP | State query |
| disconnect - remove from connected | 8 | 6 | 48 | KEEP | Core functionality |
| disconnect - handle non-connected | 5 | 4 | 20 | REVIEW | Edge case |
| Sign Message Request - handle with storage | 7 | 5 | 35 | KEEP | Storage integration |
| Sign PSBT Request - handle with storage | 7 | 5 | 35 | KEEP | Storage integration |
| Critical Operations - register during signing | 7 | 4 | 28 | REVIEW | Update safety |
| Error Handling - missing parameters | 8 | 6 | 48 | KEEP | Input validation |
| Error Handling - invalid parameters | 8 | 6 | 48 | KEEP | Input validation |
| Error Handling - wallet lock during operation | 8 | 5 | 40 | KEEP | State handling |
| Event Emissions - empty test | 0 | 0 | 0 | REMOVE | Empty test body |
| Rate Limiting - empty test | 0 | 0 | 0 | REVIEW | Missing implementation |

### 7. walletService.test.ts (24 tests)

**Critical Issue**: These tests only test mock behavior, not actual wallet service logic.

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| All tests in this file | 2 | 1 | 2 | REVIEW | **Over-mocked** - tests mock and then verify mock was called |

**Detailed Issues**:
- Every test creates a mock, calls the mock, and verifies the mock was called with expected args
- No actual business logic is tested
- Example: "should sign transaction" just verifies mock returns mock value
- These tests provide **false confidence** - they don't test real code

### 8. BaseService.test.ts (21 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| constructor - throw on empty serviceName | 7 | 4 | 28 | REVIEW | Input validation |
| constructor - throw on whitespace serviceName | 6 | 3 | 18 | REVIEW | Edge case |
| constructor - throw on tab-only serviceName | 5 | 2 | 10 | REMOVE | Trivial edge case |
| constructor - accept valid serviceName | 6 | 5 | 30 | KEEP | Happy path |
| lifecycle - initialize successfully | 8 | 7 | 56 | KEEP | Core functionality |
| lifecycle - restore state during init | 8 | 6 | 48 | KEEP | State persistence |
| lifecycle - handle init errors gracefully | 8 | 5 | 40 | KEEP | Error resilience |
| lifecycle - destroy and cleanup | 8 | 6 | 48 | KEEP | Resource cleanup |
| lifecycle - prevent double initialization | 6 | 4 | 24 | REVIEW | Idempotence |
| lifecycle - handle destroy on uninitialized | 5 | 3 | 15 | REVIEW | Edge case |
| state persistence - persist periodically | 8 | 5 | 40 | KEEP | State durability |
| state persistence - throw on persistence errors | 8 | 5 | 40 | KEEP | Error handling |
| state persistence - create keep-alive alarm | 6 | 4 | 24 | REVIEW | Background behavior |
| state persistence - handle alarm events | 6 | 4 | 24 | REVIEW | Background behavior |
| state persistence - ignore other service alarms | 5 | 3 | 15 | REVIEW | Isolation |
| metadata - track name and start time | 5 | 4 | 20 | REVIEW | Observability |
| error handling - handle hydration errors | 7 | 4 | 28 | REVIEW | Corruption recovery |
| error handling - handle serialization errors | 7 | 4 | 28 | REVIEW | Error handling |
| version tracking - handle mismatches | 7 | 4 | 28 | REVIEW | Migration safety |
| version tracking - include in serialized state | 6 | 4 | 24 | REVIEW | Migration support |
| concurrent - handle concurrent init | 6 | 4 | 24 | REVIEW | Race condition |
| concurrent - handle concurrent destroy | 6 | 4 | 24 | REVIEW | Race condition |

### 9. RequestManager.integration.test.ts (16 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| add validation - throw on empty id | 7 | 5 | 35 | KEEP | Input validation |
| add validation - throw on non-string id | 7 | 4 | 28 | REVIEW | Type safety |
| add validation - throw on non-function resolve | 7 | 4 | 28 | REVIEW | Type safety |
| add validation - throw on non-function reject | 7 | 4 | 28 | REVIEW | Type safety |
| add validation - accept valid params | 6 | 5 | 30 | KEEP | Happy path |
| constructor - throw on zero timeout | 6 | 3 | 18 | REVIEW | Edge case |
| constructor - throw on negative timeout | 6 | 3 | 18 | REVIEW | Edge case |
| constructor - throw on NaN timeout | 5 | 2 | 10 | REMOVE | Unlikely |
| constructor - throw on Infinity timeout | 5 | 2 | 10 | REMOVE | Unlikely |
| constructor - throw on zero cleanup interval | 5 | 2 | 10 | REMOVE | Unlikely |
| constructor - throw on zero maxRequests | 5 | 2 | 10 | REMOVE | Unlikely |
| constructor - throw on negative maxRequests | 5 | 2 | 10 | REMOVE | Unlikely |
| constructor - throw on non-integer maxRequests | 5 | 2 | 10 | REMOVE | Unlikely |
| constructor - accept valid params | 6 | 5 | 30 | KEEP | Happy path |
| orphaned callback - reject old request when replacing | 9 | 6 | 54 | KEEP | Memory leak fix |
| orphaned callback - allow new after superseded | 8 | 5 | 40 | KEEP | Proper replacement |
| integration - concurrent requests without leak | 9 | 6 | 54 | KEEP | Memory safety |
| integration - auto clean up expired | 8 | 6 | 48 | KEEP | Memory cleanup |
| integration - useful statistics | 5 | 3 | 15 | REVIEW | Observability |
| integration - handle edge cases | 7 | 5 | 35 | KEEP | Error handling |

### 10. MessageBus.test.ts (22 tests)

| Test | Impact | Prob | Score | Decision | Notes |
|------|--------|------|-------|----------|-------|
| ensureBackgroundReady - mark ready on success | 8 | 6 | 48 | KEEP | Startup flow |
| ensureBackgroundReady - retry with backoff | 8 | 5 | 40 | KEEP | Resilience |
| ensureBackgroundReady - fail after max attempts | 7 | 4 | 28 | REVIEW | Error handling |
| ensureBackgroundReady - skip when option set | 7 | 5 | 35 | KEEP | Feature behavior |
| ensureBackgroundReady - cache successful check | 7 | 5 | 35 | KEEP | Performance |
| ensureBackgroundReady - clear failed for retry | 7 | 4 | 28 | REVIEW | Recovery |
| send - to specified target | 8 | 7 | 56 | KEEP | Core functionality |
| send - timeout after duration | 8 | 5 | 40 | KEEP | Error handling |
| send - resolve before timeout | 7 | 6 | 42 | KEEP | Happy path |
| send - retry on failure | 8 | 5 | 40 | KEEP | Resilience |
| send - throw after retries exhausted | 7 | 5 | 35 | KEEP | Error handling |
| send - no readiness check for non-background | 6 | 4 | 24 | REVIEW | Optimization |
| sendOneWay - not throw on timeout | 7 | 5 | 35 | KEEP | Fire-and-forget |
| sendOneWay - not throw on handler not registered | 7 | 5 | 35 | KEEP | Graceful handling |
| sendOneWay - 5 second timeout | 6 | 4 | 24 | REVIEW | Timing detail |
| onMessage - register handler | 7 | 6 | 42 | KEEP | Core functionality |
| onMessage - wrap handler to extract data | 7 | 5 | 35 | KEEP | Data handling |
| onMessage - propagate handler errors | 7 | 5 | 35 | KEEP | Error handling |
| broadcastEvent - send to popup and content-script | 8 | 6 | 48 | KEEP | Core functionality |
| broadcastEvent - send to custom targets | 7 | 5 | 35 | KEEP | Flexibility |
| broadcastEvent - not throw if some fail | 7 | 5 | 35 | KEEP | Resilience |
| sendProviderRequest - construct and send | 8 | 6 | 48 | KEEP | Core functionality |
| sendProviderRequest - throw on failed response | 8 | 6 | 48 | KEEP | Error handling |
| sendProviderRequest - throw generic error | 6 | 4 | 24 | REVIEW | Error handling |
| notifyKeychainLocked - send one-way to popup | 7 | 5 | 35 | KEEP | Notification |
| resolveApprovalRequest - send resolution | 8 | 6 | 48 | KEEP | Core functionality |
| resolveApprovalRequest - work with rejection | 8 | 6 | 48 | KEEP | Core functionality |
| getServiceHealth - request for all services | 6 | 4 | 24 | REVIEW | Observability |
| getServiceHealth - request for specific | 5 | 3 | 15 | REVIEW | Observability |

---

## Critical Issues Summary

### 1. Over-Mocked Tests (HIGH PRIORITY)

**walletService.test.ts** - All 24 tests only verify mock behavior:
```typescript
// Current pattern - tests nothing real:
it('should sign transaction', async () => {
  walletService.signTransaction.mockResolvedValue('0x123signed');
  const signedTx = await walletService.signTransaction('0x123raw');
  expect(signedTx).toBe('0x123signed'); // Only tests mock returns mock
});
```

**Recommendation**: Either:
- Delete this file entirely (tests provide false confidence)
- Rewrite tests to test actual WalletService implementation
- Create integration tests with real storage mocks

### 2. Tests with Weak Assertions

| File | Test | Issue |
|------|------|-------|
| eventEmitterService.test.ts | getStats returns empty when cleared | Only checks length, not structure |
| providerService.test.ts | Event Emissions test | Empty test body |
| providerService.test.ts | Rate Limiting test | Comment-only, no assertions |

### 3. Tests Just Verifying "Function Was Called"

Several tests in providerService.test.ts and connectionService.test.ts only verify that a mock was called, without validating actual behavior:

```typescript
// Pattern to avoid:
expect(mockConnectionService.disconnect).toHaveBeenCalledWith('https://site1.com');
// This doesn't verify the disconnect actually worked
```

### 4. Tests for Unlikely Edge Cases

Many constructor validation tests check for extremely unlikely inputs:
- `new RequestManager(NaN)`
- `new RequestManager(Infinity)`
- `new TestService('\t\t')`

These provide low value and could be removed.

---

## Recommendations

### Tests to REMOVE (5 tests)

1. `eventEmitterService.test.ts`: "getStats returns empty when cleared" (Score: 8)
2. `eventEmitterService.test.ts`: "return null for empty state" (Score: 12)
3. `eventEmitterService.test.ts`: "correct state version" (Score: 8)
4. `providerService.lifecycle.test.ts`: "handle badge text for high counts" (Score: 8)
5. `providerService.test.ts`: "Event Emissions" (Score: 0 - empty test)

### Tests to REVIEW/REFACTOR (22 tests)

See individual file analysis tables above for tests marked REVIEW.

### walletService.test.ts - Special Recommendation

**DELETE ENTIRE FILE** or completely rewrite. Current tests are:
- Testing mock returns mock value
- Providing false confidence
- Not catching real bugs

If wallet service proxy pattern is intentional, these tests should be integration tests that verify the proxy correctly forwards to the real implementation.

---

## Assertion Patterns to Strengthen

### Weak Pattern: `toHaveBeenCalled()`
```typescript
// Weak
expect(mockFunction).toHaveBeenCalled();

// Strong - verify correct arguments
expect(mockFunction).toHaveBeenCalledWith(expectedArg1, expectedArg2);
```

### Weak Pattern: `toBeDefined()` / `toBeTruthy()`
```typescript
// Weak
expect(result).toBeDefined();

// Strong - verify expected value
expect(result).toEqual({ expected: 'value' });
```

### Missing Pattern: Error Message Validation
```typescript
// Current
expect(promise).rejects.toThrow('Unauthorized');

// Better - verify full error details
expect(promise).rejects.toMatchObject({
  message: 'Unauthorized - not connected to wallet',
  code: 4100
});
```

---

## Test Coverage vs. Quality

While coverage may be high, quality issues remain:
- Security tests are well-written (providerService.security.test.ts)
- Core functionality tests are solid (eventEmitterService, connectionService)
- Proxy/mock pattern tests are problematic (walletService)
- Some edge case tests are over-specified (constructor validation)

**Focus effort on**:
1. Removing/rewriting walletService.test.ts
2. Removing empty/trivial tests
3. Strengthening assertions where noted
