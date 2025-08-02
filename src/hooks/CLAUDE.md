# Hooks Directory

This directory contains custom React hooks for the XCP Wallet extension.

## Hook Patterns

### Naming Conventions
- Start with `use` prefix (React convention)
- Descriptive names indicating purpose
- CamelCase format
- Return consistent data structures

### Standard Hook Structure
```typescript
export function useHookName(params?: HookParams): HookReturn {
  // 1. Context consumption
  const { contextValue } = useContext(SomeContext);
  
  // 2. Local state
  const [state, setState] = useState<StateType>(initialState);
  
  // 3. Side effects
  useEffect(() => {
    // Effect logic
    return () => {
      // Cleanup
    };
  }, [dependencies]);
  
  // 4. Memoized values
  const memoizedValue = useMemo(() => {
    return computeExpensiveValue(state);
  }, [state]);
  
  // 5. Callbacks
  const handleAction = useCallback((param: ParamType) => {
    // Action logic
  }, [dependencies]);
  
  // 6. Return value
  return {
    data: memoizedValue,
    loading: false,
    error: null,
    actions: { handleAction }
  };
}
```

## Available Hooks

### useAssetDetails.ts
**Purpose**: Fetches and caches asset metadata from Counterparty API

**Usage**:
```typescript
const { asset, loading, error } = useAssetDetails('XCP');
```

**Features**:
- Automatic caching of asset data
- Loading and error states
- Refresh on asset change
- Null handling for BTC

### useBlockHeight.ts
**Purpose**: Provides current Bitcoin block height

**Usage**:
```typescript
const { blockHeight, loading, refresh } = useBlockHeight();
```

**Features**:
- Auto-refresh every 60 seconds
- Manual refresh capability
- Loading state management
- Error recovery

### useConsolidateAndBroadcast.ts
**Purpose**: Handles bare multisig UTXO consolidation

**Usage**:
```typescript
const { consolidate, broadcasting, error } = useConsolidateAndBroadcast();

await consolidate(utxos, destinationAddress);
```

**Features**:
- Complex transaction building
- Automatic fee calculation
- Broadcasting with retry
- Progress tracking

### useFeeRates.ts
**Purpose**: Provides current Bitcoin network fee rates

**Usage**:
```typescript
const { feeRates, loading, selectedRate, setSelectedRate } = useFeeRates();
```

**Features**:
- Multiple fee levels (slow, normal, fast)
- Real-time updates
- User selection persistence
- Fallback values

### useSearchQuery.ts
**Purpose**: Implements search and filtering for assets/balances

**Usage**:
```typescript
const { query, setQuery, filteredItems } = useSearchQuery(items);
```

**Features**:
- Debounced search input
- Case-insensitive matching
- Multiple field search
- Performance optimized

## Hook Categories

### Data Fetching Hooks
Pattern for API data fetching:
```typescript
export function useFetchData<T>(endpoint: string): DataHookReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await api.get<T>(endpoint);
        
        if (!cancelled) {
          setData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      cancelled = true;
    };
  }, [endpoint]);
  
  return { data, loading, error };
}
```

### State Management Hooks
Pattern for complex state logic:
```typescript
export function useComplexState(initialState: StateType) {
  const [state, dispatch] = useReducer(reducer, initialState);
  
  const actions = useMemo(() => ({
    action1: (payload: Payload1) => dispatch({ type: 'ACTION1', payload }),
    action2: (payload: Payload2) => dispatch({ type: 'ACTION2', payload }),
  }), []);
  
  return { state, ...actions };
}
```

### Form Hooks
Pattern for form handling:
```typescript
export function useForm<T>(initialValues: T, onSubmit: (values: T) => Promise<void>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  
  const handleChange = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);
  
  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      // Handle error
    } finally {
      setSubmitting(false);
    }
  }, [values, onSubmit]);
  
  return {
    values,
    errors,
    submitting,
    handleChange,
    handleSubmit,
  };
}
```

## Best Practices

### Dependency Arrays
```typescript
// ✅ Good - specific dependencies
useEffect(() => {
  fetchData(id);
}, [id]);

// ❌ Bad - missing dependencies
useEffect(() => {
  fetchData(id); // ESLint warning
}, []);

// ✅ Good - stable reference with useCallback
const stableFunction = useCallback(() => {
  doSomething(value);
}, [value]);

useEffect(() => {
  stableFunction();
}, [stableFunction]);
```

### Error Handling
```typescript
export function useApiCall() {
  const [error, setError] = useState<Error | null>(null);
  
  const execute = useCallback(async () => {
    try {
      setError(null);
      await apiCall();
    } catch (err) {
      setError(err as Error);
      // Don't throw - let consumer handle
    }
  }, []);
  
  return { execute, error };
}
```

### Cleanup
```typescript
export function useWebSocket(url: string) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  
  useEffect(() => {
    const ws = new WebSocket(url);
    setSocket(ws);
    
    // Cleanup function
    return () => {
      ws.close();
      setSocket(null);
    };
  }, [url]);
  
  return socket;
}
```

## Testing Hooks

### Test Setup
```typescript
import { renderHook, act } from '@testing-library/react';
import { useCustomHook } from './useCustomHook';

describe('useCustomHook', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useCustomHook());
    
    expect(result.current.value).toBe(defaultValue);
  });
  
  it('should update value when action is called', async () => {
    const { result } = renderHook(() => useCustomHook());
    
    await act(async () => {
      await result.current.updateValue(newValue);
    });
    
    expect(result.current.value).toBe(newValue);
  });
});
```

### Mocking Dependencies
```typescript
// Mock contexts
const MockProvider = ({ children }) => (
  <WalletContext.Provider value={mockWalletContext}>
    {children}
  </WalletContext.Provider>
);

// Test with provider
const { result } = renderHook(() => useWalletHook(), {
  wrapper: MockProvider,
});
```

## Performance Optimization

### Memoization
```typescript
// Memoize expensive computations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// Memoize callbacks to prevent re-renders
const stableCallback = useCallback((param: string) => {
  doSomething(param, dependency);
}, [dependency]);
```

### Debouncing
```typescript
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}
```

### Lazy Initialization
```typescript
// Expensive initial state
const [state, setState] = useState(() => {
  return computeExpensiveInitialState();
});
```

## Common Patterns

### Polling Hook
```typescript
export function usePolling(callback: () => Promise<void>, interval: number) {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let mounted = true;
    
    const poll = async () => {
      if (mounted) {
        await callback();
        timeoutId = setTimeout(poll, interval);
      }
    };
    
    poll();
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [callback, interval]);
}
```

### Previous Value Hook
```typescript
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}
```

### Window Event Hook
```typescript
export function useWindowEvent<K extends keyof WindowEventMap>(
  event: K,
  handler: (event: WindowEventMap[K]) => void
) {
  useEffect(() => {
    window.addEventListener(event, handler);
    return () => window.removeEventListener(event, handler);
  }, [event, handler]);
}
```

## Anti-Patterns to Avoid

1. **Don't call hooks conditionally**
```typescript
// ❌ Bad
if (condition) {
  useEffect(() => {});
}

// ✅ Good
useEffect(() => {
  if (condition) {
    // Effect logic
  }
}, [condition]);
```

2. **Don't forget cleanup**
```typescript
// ❌ Bad - memory leak
useEffect(() => {
  const timer = setInterval(callback, 1000);
  // Missing cleanup!
}, []);

// ✅ Good
useEffect(() => {
  const timer = setInterval(callback, 1000);
  return () => clearInterval(timer);
}, []);
```

3. **Don't ignore exhaustive deps**
```typescript
// ❌ Bad - stale closure
useEffect(() => {
  doSomething(value); // value might be stale
}, []); // Missing value in deps

// ✅ Good
useEffect(() => {
  doSomething(value);
}, [value]);
```