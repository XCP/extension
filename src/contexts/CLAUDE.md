# Contexts Directory

This directory contains React Context providers for global state management in the XCP Wallet extension.

## Context Architecture

### Provider Hierarchy
The app uses a nested provider structure with specialized contexts:
```tsx
<AppProviders>
  <SettingsProvider>
    <WalletProvider>
      <PriceProvider>
        <LoadingProvider>
          <HeaderProvider>
            <ComposerProvider>
              {children}
            </ComposerProvider>
          </HeaderProvider>
        </LoadingProvider>
      </PriceProvider>
    </WalletProvider>
  </SettingsProvider>
</AppProviders>
```

## Context Files

### Core Contexts

#### wallet-context.tsx
**Purpose**: Manages wallet authentication, encryption, and active wallet/address state
**Key State**:
- `authState`: 'onboarding' | 'locked' | 'unlocked'
- `wallets`: Array of encrypted wallet records
- `activeWallet`: Currently selected wallet
- `activeAddress`: Currently selected address
**Critical Functions**:
- `createWallet()`: Creates new HD wallet
- `importWallet()`: Imports mnemonic/private key
- `unlockWallet()`: Decrypts wallet with password
- `lockWallet()`: Clears decrypted secrets
- `signTransaction()`: Signs Bitcoin transactions

#### settings-context.tsx
**Purpose**: Manages user preferences and app configuration
**Key State**:
- `autoLockTimer`: Inactivity timeout setting
- `activeWalletId`: Persisted wallet selection
- `analytics`: Fathom tracking consent
- `pinnedAssets`: User's pinned tokens
**Features**:
- Partial updates with `updateSettings()`
- Persistent storage sync
- Migration handling for schema changes

#### composer-context.tsx
**Purpose**: Orchestrates transaction composition workflow
**Key State**:
- `composerState`: Current transaction being composed
- `formData`: Transaction parameters
- `signedTransaction`: Signed tx ready for broadcast
**Workflow**:
1. `setFormData()`: Set transaction parameters
2. `composeTransaction()`: Build unsigned transaction
3. `signTransaction()`: Sign with wallet
4. `broadcastTransaction()`: Submit to network

### Support Contexts

#### price-context.tsx
**Purpose**: Provides Bitcoin price data
**Key State**:
- `btcPrice`: Current BTC/USD price
- `lastUpdated`: Timestamp of last update
**Features**:
- Auto-refresh every 60 seconds
- Fallback to cached values
- Multiple price source support

#### loading-context.tsx
**Purpose**: Global loading state management
**Key State**:
- `isLoading`: Global loading indicator
- `loadingMessage`: Optional status text
**Usage**:
- Wrap async operations with `setLoading(true/false)`
- Display spinner overlay when loading

#### header-context.tsx
**Purpose**: Controls header UI state
**Key State**:
- `title`: Current page title
- `showBack`: Back button visibility
- `showMenu`: Menu button visibility
**Features**:
- Dynamic header based on route
- Custom actions per page

#### app-providers.tsx
**Purpose**: Combines all providers in correct order
**Features**:
- Single import for all contexts
- Ensures proper dependency order
- Handles provider composition

## Context Patterns

### Creating a Context
```typescript
// 1. Define the context shape
interface ContextType {
  state: StateType;
  actions: {
    updateState: (newState: StateType) => void;
  };
}

// 2. Create context with undefined default
const MyContext = createContext<ContextType | undefined>(undefined);

// 3. Create provider component
export function MyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StateType>(initialState);
  
  const value = useMemo(() => ({
    state,
    actions: {
      updateState: setState,
    },
  }), [state]);
  
  return (
    <MyContext.Provider value={value}>
      {children}
    </MyContext.Provider>
  );
}

// 4. Create typed hook
export function useMyContext() {
  const context = useContext(MyContext);
  if (!context) {
    throw new Error('useMyContext must be used within MyProvider');
  }
  return context;
}
```

### Best Practices

#### State Management
- Keep context focused on a single domain
- Use multiple contexts instead of one large context
- Memoize context values to prevent unnecessary re-renders
- Split state and dispatch when appropriate

#### Performance
- Use `useMemo` for complex context values
- Split frequently changing state into separate contexts
- Consider using reducers for complex state logic
- Avoid putting functions in dependency arrays

#### Error Handling
- Always check for undefined context in hooks
- Provide meaningful error messages
- Handle async errors within providers
- Use error boundaries for critical failures

## Testing Contexts

### Mock Providers
```typescript
// Create test wrapper with mock values
export function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <WalletContext.Provider value={mockWalletContext}>
      <SettingsContext.Provider value={mockSettingsContext}>
        {children}
      </SettingsContext.Provider>
    </WalletContext.Provider>
  );
}
```

### Testing Hooks
```typescript
// Test context hooks with renderHook
const { result } = renderHook(() => useWalletContext(), {
  wrapper: TestWrapper,
});

expect(result.current.authState).toBe('unlocked');
```

## Common Patterns

### Async Operations in Contexts
```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<Error | null>(null);

const fetchData = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const data = await api.getData();
    setState(data);
  } catch (err) {
    setError(err as Error);
  } finally {
    setLoading(false);
  }
}, []);
```

### Context with Storage Sync
```typescript
// Sync with chrome.storage on mount
useEffect(() => {
  loadFromStorage().then(setState);
}, []);

// Persist on state change
useEffect(() => {
  saveToStorage(state);
}, [state]);
```

### Protected Context Access
```typescript
// Require authentication for context access
export function useAuthenticatedContext() {
  const wallet = useWalletContext();
  
  if (wallet.authState !== 'unlocked') {
    throw new Error('Wallet must be unlocked');
  }
  
  return wallet;
}
```

## Anti-Patterns to Avoid

1. **Don't put all state in one context** - Split by domain
2. **Don't forget to memoize** - Prevents unnecessary renders
3. **Don't mutate state directly** - Always create new objects
4. **Don't use contexts for local state** - Keep it component-local
5. **Don't ignore TypeScript** - Fully type context values

## Context Dependencies

```typescript
// Wallet depends on Settings
// Composer depends on Wallet
// Price is independent
// Loading is independent
// Header is independent

// Dependency graph:
// Settings -> Wallet -> Composer
//          -> Price
//          -> Loading
//          -> Header
```

## Debugging Tips

1. Use React DevTools to inspect context values
2. Add console logs in providers during development
3. Use strict mode to catch side effects
4. Monitor re-renders with React DevTools Profiler
5. Check for memory leaks in cleanup functions