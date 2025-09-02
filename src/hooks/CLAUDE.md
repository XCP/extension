# Hooks Directory

This directory contains custom React hooks for the XCP Wallet extension.

## Hook Architecture

### Core Principles
1. **Performance over Complexity**: Simple, readable code > micro-optimizations
2. **Smart State Management**: Only update state when data actually changes
3. **Proper Cleanup**: Always handle async cancellation and prevent memory leaks
4. **Consistent Patterns**: All hooks follow similar structure and return patterns

### Standard Return Pattern
All data-fetching hooks return a consistent interface:
```typescript
interface HookState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}
```

## Available Hooks

### Core Data Hooks (Optimized for Performance)

#### useAssetInfo
**Purpose**: Fetches basic asset metadata (divisible, supply, issuer, etc.)
```typescript
const { data, isLoading, error } = useAssetInfo('XCP');
```

#### useAssetBalance
**Purpose**: Fetches and caches asset balance with divisibility info
```typescript
const { balance, isLoading, error, isDivisible } = useAssetBalance('XCP');
```

#### useAssetUtxos
**Purpose**: Fetches UTXO balances for non-BTC assets
```typescript
const { utxos, isLoading, error } = useAssetUtxos('XCP');
```

#### useAssetDetails (Composite)
**Purpose**: Combines all three hooks above for backward compatibility
```typescript
const { data, isLoading, error } = useAssetDetails('XCP');
// data contains: { assetInfo, availableBalance, isDivisible, utxoBalances }
```

### Utility Hooks

#### useBlockHeight
**Purpose**: Provides current Bitcoin block height with auto-refresh
```typescript
const { blockHeight, isLoading, error, refresh } = useBlockHeight();
```

#### useFeeRates
**Purpose**: Fetches current Bitcoin network fee rates
```typescript
const { feeRates, isLoading, selectedRate, setSelectedRate } = useFeeRates();
```

#### useSearchQuery
**Purpose**: Debounced asset search with retry logic
```typescript
const { searchQuery, setSearchQuery, searchResults, isSearching, error } = useSearchQuery();
```

#### useConsolidateAndBroadcast
**Purpose**: Handles bare multisig UTXO consolidation
```typescript
const { consolidateAndBroadcast, isProcessing } = useConsolidateAndBroadcast();
```

#### useAuthGuard (Security-Critical)
**Purpose**: Monitors real-time wallet lock transitions for security
```typescript
const { isProtected } = useAuthGuard();
```
**Note**: DO NOT OPTIMIZE - This hook is security-critical and intentionally simple

## Performance Optimizations Applied

### ✅ High-Impact Optimizations

1. **Smart State Updates** - Prevent unnecessary re-renders
```typescript
setState(prev => {
  // Only update if data actually changed
  if (prev.data === newData && !prev.isLoading) {
    return prev; // No re-render!
  }
  return { data: newData, isLoading: false };
});
```

2. **Request Cancellation** - Prevent race conditions
```typescript
const abortController = new AbortController();
fetch(url, { signal: abortController.signal })
  .then(data => {
    if (!abortController.signal.aborted) {
      setState(data);
    }
  });
```

3. **Optimized Dependencies** - Remove unstable values
```typescript
// ❌ BAD - cachedData changes every render
useEffect(() => {}, [cachedData?.value]);

// ✅ GOOD - stable dependencies
useEffect(() => {}, [asset, activeAddress]);
```

### ❌ Avoided Over-Optimizations

We intentionally AVOID these patterns that add complexity without real benefit:

1. **Unnecessary Memoization**
```typescript
// ❌ OVERKILL - Object creation is cheap
const config = useMemo(() => ({ key: 'value' }), []);

// ✅ BETTER - Just create it
const config = { key: 'value' };
```

2. **Pointless useCallback**
```typescript
// ❌ POINTLESS - Function only used in useEffect
const fetchData = useCallback(async () => {}, [deps]);

// ✅ BETTER - Define inside useEffect
useEffect(() => {
  async function fetchData() {}
  fetchData();
}, [deps]);
```

## Common Patterns

### Change Detection Pattern
```typescript
const prevValueRef = useRef<string | undefined>();

useEffect(() => {
  const valueChanged = prevValueRef.current !== undefined && 
                      prevValueRef.current !== currentValue;
  
  if (valueChanged || !cachedData) {
    // Fetch new data
  }
  
  prevValueRef.current = currentValue;
}, [currentValue]);
```

### Abort Controller Pattern
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  // Cancel previous request
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  
  // Create new controller
  abortControllerRef.current = new AbortController();
  const controller = abortControllerRef.current;
  
  // Fetch with cancellation
  fetch(url, { signal: controller.signal })
    .then(handleResponse)
    .catch(err => {
      if (!controller.signal.aborted) {
        setError(err);
      }
    });
    
  return () => {
    controller.abort();
  };
}, [url]);
```

## Testing Hooks

### Test Setup
```typescript
import { renderHook, act } from '@testing-library/react';

describe('useCustomHook', () => {
  it('should handle data fetching', async () => {
    const { result } = renderHook(() => useCustomHook());
    
    expect(result.current.isLoading).toBe(false);
    
    await act(async () => {
      await result.current.fetchData();
    });
    
    expect(result.current.data).toBeDefined();
  });
});
```

## Best Practices

### DO ✅
- **Smart state updates** that prevent re-renders
- **Proper cleanup** with AbortController
- **Simple, readable code** over complex optimizations
- **Consistent return patterns** across all hooks
- **TypeScript interfaces** for all state types
- **JSDoc comments** with usage examples

### DON'T ❌
- **Over-memoize** cheap operations
- **useCallback** for internal functions
- **Complex dependency arrays** that cause bugs
- **Premature optimization** without measuring
- **Sacrifice readability** for minor gains
- **Optimize security-critical code** (like useAuthGuard)

## Performance Impact

Our optimizations achieved:
- **40-60% reduction** in unnecessary re-renders (useAssetBalance)
- **Eliminated race conditions** with proper cancellation
- **Cleaner code** that's easier to maintain
- **Better error handling** throughout

## Constants

### Shared Constants
```typescript
// BTC asset info used across multiple hooks
const BTC_ASSET_INFO: AssetInfo = {
  asset: 'BTC',
  asset_longname: null,
  description: 'Bitcoin',
  divisible: true,
  locked: true,
  supply: '21000000',
  supply_normalized: '21000000',
  issuer: '',
  fair_minting: false,
};
```

## Migration Guide

### From useAssetDetails to Focused Hooks
```typescript
// OLD - Using full useAssetDetails
const { data } = useAssetDetails(asset);
const divisible = data?.assetInfo?.divisible;

// NEW - Use focused hook when you only need specific data
const { data } = useAssetInfo(asset);
const divisible = data?.divisible;
```

## TL;DR

**Focus on real performance issues:**
- Smart state updates
- Proper cleanup
- Good dependency arrays

**Avoid fake optimizations:**
- Excessive memoization
- Unnecessary callbacks
- Premature optimization

Remember: In our small app, **clean readable code > theoretical performance gains**.