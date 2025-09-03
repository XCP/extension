# Contexts Directory

This directory contains React Context providers for state management in the XCP Wallet extension. The architecture includes **5 app-level contexts** and **1 component-level context** for optimal performance and state isolation.

## Context Architecture (Updated)

### Provider Hierarchy (6 Contexts Total)
The app uses **5 app-level contexts** + **1 component-level context**:

```tsx
// App-Level Contexts (5) - Globally provided via app-providers.tsx
<AppProviders>
  <SettingsProvider>
    <WalletProvider>
      <PriceProvider>
        <LoadingProvider>
          <HeaderProvider>
            {children} // ComposerProvider NOT here!
          </HeaderProvider>
        </LoadingProvider>
      </PriceProvider>
    </WalletProvider>
  </SettingsProvider>
</AppProviders>

// Component-Level Context (1) - Per-use instantiation
<ComposerProvider composeApi={composeMethod}>
  <ComposerInner />
</ComposerProvider>
```

**Key Architecture Update**: Composer context is **NOT app-wide** but instantiated per-component for state isolation.

## Context Files

### App-Level Contexts (5) - Globally Provided

These contexts are provided globally via `app-providers.tsx` and available throughout the application:

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

#### composer-context.tsx (Component-Level Context)
**Purpose**: Orchestrates transaction composition workflow with isolated state per-use
**Architecture**: Per-component instantiation, not globally provided

**Key State**:
```typescript
interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
  error: string | null;
  isComposing: boolean;
  isSigning: boolean;
  showAuthModal: boolean;
}
```

**Advanced Features**:
- **State Isolation**: Each compose workflow has independent state
- **Auto-Reset Logic**: Clears state on address/wallet/auth changes
- **Change Detection**: Uses refs to efficiently track state changes
- **Multi-Step Workflow**: form → review → success pattern
- **Background Integration**: webext-bridge for wallet operations
- **Help Text Management**: Local help state with global settings fallback

**Usage Pattern**:
```typescript
// Each form gets its own ComposerProvider instance
export function SendForm() {
  return (
    <ComposerProvider<SendFormData> 
      composeApi={composeSend} 
      initialTitle="Send Transaction"
    >
      <SendFormInner />
      <ReviewScreen />
      <SuccessScreen />
    </ComposerProvider>
  );
}
```

### Component-Level Context (1) - Per-Use Instantiation

#### composer-context.tsx (Detailed Analysis)
**Purpose**: Manages isolated transaction composition workflows
**Instantiation**: Per-component, not global
**State Management**: Complex state with automatic cleanup

```typescript
// Complex state management with refs for change detection
const previousAddressRef = useRef<string | undefined>(activeAddress?.address);
const previousWalletRef = useRef<string | undefined>(activeWallet?.id);
const previousAuthStateRef = useRef<string>(authState);
const currentComposeTypeRef = useRef<string | undefined>(undefined);
```

**Auto-Reset Logic**:
```typescript
// Resets state when critical dependencies change
useEffect(() => {
  if (activeAddress?.address !== previousAddressRef.current ||
      activeWallet?.id !== previousWalletRef.current ||
      authState !== previousAuthStateRef.current) {
    // Reset composer state
    setState(initialState);
  }
}, [activeAddress, activeWallet, authState]);
```

**Form-to-Transaction Workflow**:
1. **Form Step**: Collect user input, validate, normalize data
2. **Review Step**: Display composed transaction for approval  
3. **Success Step**: Show broadcast result and navigation options

**Background Service Integration**:
```typescript
// Uses wallet service for signing and broadcasting
const { signTransaction, broadcastTransaction } = useWallet();
const signedTx = await signTransaction(rawTx, activeAddress.address);
const result = await broadcastTransaction(signedTx);
```

### Additional Support Contexts

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
**Purpose**: Combines app-level providers in correct dependency order
**Features**:
- Single import for 5 app-level contexts
- Ensures proper dependency order (Settings → Wallet → others)
- **Does NOT include ComposerProvider** (component-level context)
- Enhanced error boundaries and React 19 patterns
- Handles provider composition with performance optimizations

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

## Context Dependencies (Updated)

```typescript
// App-Level Context Dependencies (5 contexts):
// Settings -> Wallet -> Price, Loading, Header (parallel)

// Dependency graph:
Settings (foundational)
    ↓
Wallet (auth & wallet state)
    ↓
Price, Loading, Header (parallel, independent)

// Component-Level Context (1 context):
// Composer depends on Wallet context but is instantiated per-use
ComposerProvider (per-component)
    ↓ 
    uses: Wallet, Settings, Loading, Header (via hooks)
```

**Key Insight**: Composer context is **not in the dependency chain** but **consumes** app-level contexts through hooks when instantiated.

## Debugging Tips

1. Use React DevTools to inspect context values
2. Add console logs in providers during development
3. Use strict mode to catch side effects
4. Monitor re-renders with React DevTools Profiler
5. Check for memory leaks in cleanup functions