# Testing Plan - XCP Wallet Extension

## Objective
Systematically test and fix all test suites after dependency updates, ensuring the extension is stable and ready for production.

## Testing Strategy

### Priority Levels
1. **CRITICAL** - Core wallet functionality (must pass before merge)
2. **HIGH** - Service layer and blockchain operations
3. **MEDIUM** - UI components and utilities
4. **LOW** - Helper functions and edge cases

## Test Execution Plan

### Phase 1: Critical Path Testing (PRIORITY: CRITICAL)
Test core wallet and security functions first.

#### 1.1 Wallet Service Tests ✅
```bash
npx vitest src/services/__tests__/walletService.test.ts --run
```
- [x] **PASSING** - 27/27 tests pass
- [x] Test wallet creation/import
- [x] Test encryption/decryption
- [x] Test address management
- [x] Test signing operations

#### 1.2 Storage Tests ✅
```bash
npx vitest src/utils/storage/__tests__ --run
```
- [x] **PASSING** - 14/14 tests pass
- [x] Wallet storage
- [x] Settings persistence
- [x] Session management

#### 1.3 Encryption Tests ✅
```bash
npx vitest src/utils/encryption/__tests__ --run
```
- [x] **PASSING** - 45/45 tests pass (2 files)
- [x] Test mnemonic encryption
- [x] Test private key encryption
- [x] Test password hashing
- [x] Test version migration

### Phase 2: Service Layer Testing (PRIORITY: HIGH)
Test all service implementations.

#### 2.1 Provider Service Tests (Currently Skipped)
```bash
# Remove skip directive first
sed -i 's/describe.skip(/describe(/g' src/services/__tests__/providerService.test.ts
npx vitest src/services/__tests__/providerService.test.ts --run
```
- [ ] Enable tests (remove skip)
- [ ] Test dApp connection
- [ ] Test method handlers
- [ ] Test authorization

#### 2.2 Connection Service Tests ✅
```bash
npx vitest src/services/connection/__tests__ --run
```
- [x] **PASSING** - 14/14 tests pass
- [x] Test permission management
- [x] Test origin validation
- [x] Test connection state

#### 2.3 Approval Service Tests ✅
```bash
npx vitest src/services/approval/__tests__ --run
```
- [x] **PASSING** - 15/15 tests pass
- [x] Test approval queue
- [x] Test user consent flow
- [x] Test timeout handling

#### 2.4 Transaction Service Tests ✅
```bash
npx vitest src/services/transaction/__tests__ --run
```
- [x] **PASSING** - 19/19 tests pass
- [x] Test transaction composition
- [x] Test signing flow
- [x] Test broadcasting

#### 2.5 Blockchain Service Tests ✅
```bash
npx vitest src/services/blockchain/__tests__ --run
```
- [x] **PASSING** - 19/20 tests pass (1 skipped)
- [x] Test API integration
- [x] Test caching layer
- [x] Test error handling

### Phase 3: Utility Testing (PRIORITY: MEDIUM)
Test utility functions and helpers.

#### 3.1 Bitcoin Utilities
```bash
npx vitest src/utils/blockchain/bitcoin/__tests__ --run
```
- [ ] Test address generation
- [ ] Test transaction signing
- [ ] Test UTXO management
- [ ] Test fee calculation

#### 3.2 Counterparty Utilities
```bash
npx vitest src/utils/blockchain/counterparty/__tests__ --run
```
- [ ] Test API calls
- [ ] Test message composition
- [ ] Test data parsing

#### 3.3 Format Utilities
```bash
npx vitest src/utils/__tests__ --run
```
- [ ] Test number formatting
- [ ] Test address formatting
- [ ] Test data validation

### Phase 4: Component Testing (PRIORITY: MEDIUM)
Test UI components.

#### 4.1 Input Components
```bash
npx vitest src/components/inputs/__tests__ --run
```
- [ ] Test form inputs
- [ ] Test validation
- [ ] Test event handlers

#### 4.2 Card Components
```bash
npx vitest src/components/cards/__tests__ --run
```
- [ ] Test data display
- [ ] Test interactions
- [ ] Test responsive behavior

#### 4.3 List Components
```bash
npx vitest src/components/lists/__tests__ --run
```
- [ ] Test data rendering
- [ ] Test pagination
- [ ] Test filtering

### Phase 5: Integration Testing (PRIORITY: HIGH)
Test extension entrypoints and message passing.

#### 5.1 Background Script Tests
```bash
npx vitest src/entrypoints/__tests__/background.test.ts --run
```
- [ ] Test service worker lifecycle
- [ ] Test message handling
- [ ] Test keep-alive mechanism

#### 5.2 Content Script Tests ✅
```bash
npx vitest src/entrypoints/__tests__/content.test.ts --run
```
- [x] **PASSING** - 13/13 tests pass
- [x] Test injection
- [x] Test message relay
- [x] Test cleanup

#### 5.3 Message Passing Tests ✅
```bash
npx vitest src/entrypoints/__tests__/message-passing.test.ts --run
```
- [x] **PASSING** - 13/13 tests pass
- [x] Test cross-context communication
- [x] Test error handling
- [x] Test timeout scenarios

## Execution Timeline

### Day 1 (Today)
1. ✅ Document testing issues
2. ✅ Create testing plan
3. [ ] Run Phase 1 tests (Critical Path)
4. [ ] Document failures
5. [ ] Begin fixing critical failures

### Day 2
1. [ ] Complete Phase 1 fixes
2. [ ] Run Phase 2 tests (Service Layer)
3. [ ] Fix service layer issues
4. [ ] Run Phase 5 tests (Integration)

### Day 3
1. [ ] Run Phase 3 tests (Utilities)
2. [ ] Run Phase 4 tests (Components)
3. [ ] Fix remaining issues
4. [ ] Final verification run

## Test Result Tracking

### Template for Recording Results
```markdown
## Test Suite: [Name]
- **File**: `path/to/test.ts`
- **Total Tests**: X
- **Passing**: Y
- **Failing**: Z
- **Skipped**: S

### Failures:
1. **Test Name**: Error description
   - **Fix**: What needs to be done
   - **Priority**: CRITICAL/HIGH/MEDIUM/LOW
```

## Success Criteria

### Must Pass (Before Merge)
- [ ] All wallet operations tests pass
- [ ] All encryption tests pass
- [ ] All storage tests pass ✅
- [ ] No security vulnerabilities in tests
- [ ] Core service tests pass

### Should Pass (Before Release)
- [ ] 90%+ test coverage on critical paths
- [ ] All service layer tests pass
- [ ] Integration tests pass
- [ ] No console errors in tests

### Nice to Have
- [ ] 100% component test coverage
- [ ] All utility tests pass
- [ ] Performance benchmarks pass

## Commands Cheatsheet

```bash
# Run specific test file
npx vitest path/to/test.ts --run

# Run with watch mode
npx vitest path/to/test.ts --watch

# Run with coverage
npx vitest path/to/test.ts --coverage

# Run with verbose output
npx vitest path/to/test.ts --reporter=verbose --run

# Debug a test
node --inspect-brk ./node_modules/.bin/vitest path/to/test.ts
```

## Known Issues to Fix

1. **Import Paths**: Keep using `'wxt/testing'` until WXT fixes exports
2. **Provider Tests**: Remove `describe.skip()` to enable
3. **TypeScript Strictness**: Some tests may need null handling updates
4. **Mock Updates**: Browser mocks may need adjustments for new WXT version

## Next Steps

1. Start with Phase 1 (Critical Path Testing)
2. Document all failures in this file
3. Fix failures by priority
4. Re-run tests after each fix
5. Update this document with results