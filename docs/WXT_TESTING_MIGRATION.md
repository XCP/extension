# WXT Testing Migration & Issues

## Current Status (September 12, 2025)

### The Breaking Change
- **WXT Version**: Updated from `0.20.10` → `0.20.11`
- **Issue**: WXT split testing utilities to resolve jsdom/happy-dom conflicts
- **Impact**: Tests were failing due to missing `happy-dom` dependency

### Import Path Changes (Future Migration)

#### Current (Working but Deprecated)
```typescript
import { fakeBrowser } from 'wxt/testing';
import { WxtVitest } from 'wxt/testing';
```

#### Future (Not Yet Properly Exported)
```typescript
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
```

**Note**: The new paths are NOT currently exported in WXT's package.json, so we must use the old imports for now.

### Fixed Issues
1. ✅ Added missing `happy-dom@18.0.1` dependency
2. ✅ Tests now run with original import paths
3. ✅ Fixed TypeScript issues from `@headlessui/react` update (null handling)

### Known Issues
1. ⚠️ `src/services/__tests__/providerService.test.ts` has `describe.skip()` (27 tests)
2. ⚠️ Import paths will need updating when WXT fixes exports
3. ⚠️ Some tests may fail due to dependency updates (not import issues)

## Testing Infrastructure

### Configuration
- **Test Runner**: Vitest 3.2.4
- **Environment**: happy-dom 18.0.1
- **Framework**: WXT 0.20.11 with WxtVitest plugin

### Test Organization
```
src/
├── components/           # Component tests
├── services/            # Service layer tests
│   ├── __tests__/      # Legacy service tests
│   ├── approval/       # Approval service tests
│   ├── blockchain/     # Blockchain service tests
│   ├── connection/     # Connection service tests
│   └── transaction/    # Transaction service tests
├── utils/              # Utility function tests
└── entrypoints/        # Extension entrypoint tests
```

## Migration Timeline

### Phase 1: Current (Completed)
- ✅ Fix immediate test execution issues
- ✅ Add missing dependencies
- ✅ Document the situation

### Phase 2: Testing & Fixes (In Progress)
- Run all test suites systematically
- Document failures
- Fix actual test failures (not import-related)

### Phase 3: Future WXT Update
- Monitor WXT for proper export implementation
- Update to new import paths when available
- Remove deprecated import warnings

## Commands Reference

### DO NOT USE
```bash
# These run ALL tests - too slow and verbose
npm test
npm run test:unit
npm run test:e2e
```

### USE THESE INSTEAD
```bash
# Run specific test file
npx vitest src/utils/storage/__tests__/storage.test.ts --run

# Run tests in a directory
npx vitest src/services --run

# Run with watch mode for development
npx vitest src/components --watch

# Run with coverage
npx vitest src/utils --coverage
```

## Test Categories & Status

| Category | Path | Files | Status | Notes |
|----------|------|-------|--------|-------|
| Storage | `src/utils/storage/__tests__` | 1 | ✅ PASSING | 14/14 tests pass |
| Provider Service | `src/services/__tests__/providerService.test.ts` | 1 | ⏭️ SKIPPED | Has describe.skip() |
| Approval Service | `src/services/approval/__tests__` | 1 | 🔍 UNTESTED | Needs verification |
| Connection Service | `src/services/connection/__tests__` | 1 | 🔍 UNTESTED | Needs verification |
| Transaction Service | `src/services/transaction/__tests__` | 1 | 🔍 UNTESTED | Needs verification |
| Blockchain Service | `src/services/blockchain/__tests__` | 2 | 🔍 UNTESTED | Needs verification |
| Components | `src/components/**/__tests__` | Many | 🔍 UNTESTED | Needs verification |
| Utils | `src/utils/**/__tests__` | Several | 🔍 UNTESTED | Needs verification |
| Entrypoints | `src/entrypoints/__tests__` | 2 | 🔍 UNTESTED | Needs verification |

## Common Test Failures & Solutions

### Import Errors
**Error**: `Cannot find module 'wxt/testing/fake-browser'`
**Solution**: Use old import path `'wxt/testing'` until WXT fixes exports

### Missing Dependencies
**Error**: `Cannot find dependency 'happy-dom'`
**Solution**: Already fixed - added `happy-dom@18.0.1` to devDependencies

### TypeScript Errors
**Error**: `Type 'T | null' is not assignable to type 'T'`
**Solution**: Update onChange handlers to accept null (from @headlessui/react update)

### Provider Test Skipped
**Issue**: Tests marked with `describe.skip()`
**Solution**: Remove `.skip` when ready to run these tests

## Action Items

- [ ] Run all test suites systematically
- [ ] Document which tests fail and why
- [ ] Fix failing tests (prioritize critical paths)
- [ ] Remove `describe.skip()` from provider tests
- [ ] Monitor WXT GitHub for export fixes
- [ ] Update imports when WXT releases fix
- [ ] Add to CI/CD pipeline once stable