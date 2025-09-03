# Components Directory

This directory contains React components for the XCP Wallet extension UI.

## Architecture Overview

### Current Structure (62 Components) - Updated Architecture
```
src/components/
├── cards/           (11) - Specialized display cards (major expansion)
├── headers/         (3)  - Page headers (balance, compose, wallet) 
├── inputs/          (22) - Form inputs (largest category, expanded)
├── lists/           (6)  - Data list displays + new ActionList/DispenserList
├── menus/           (5)  - BaseMenu pattern + 4 specialized menus
├── router/          (1)  - Route guards (AuthRequired)
├── screens/         (3)  - Screen templates (expanded with ReviewScreen)
└── root level       (11) - Core/shared components including new AssetIcon
```

### Recent Architecture Changes (PRs #61, #65)
- **Eliminated `/forms` directory**: `ComposeForm` → `ComposerForm` moved to root
- **Removed `/modals`, `/provider`, `/security`**: Unused/incomplete components deleted
- **Expanded `/cards`**: From 3 to 11 components with focused responsibilities
- **Standardized `/menus`**: New `BaseMenu` pattern for consistency
- **Enhanced `/screens`**: Added `ReviewScreen` and `SuccessScreen`

### Test Coverage
- **295+ test files** with comprehensive coverage (up from 52)
- **100% component test coverage** - all 62 components have corresponding tests
- Tests follow `ComponentName.test.tsx` naming convention
- Test files organized in `__tests__` subdirectories alongside components

## Component Style Guide

### Component Size Guidelines

**Keep Components Focused:**
- **Ideal**: 50-150 lines
- **Acceptable**: Up to 200 lines for complex UI
- **Refactor**: 200+ lines indicates SRP violation

**Current Status (Post-Refactoring):**
- **Major improvements completed**: Card-based architecture, menu standardization
- **Some large components remain**: Certain input components still >200 lines
- **Component decomposition successful**: Broke down complex UI into focused cards
- **React 19 patterns adopted**: Modern optimization patterns implemented
- **Composer context isolated**: Now component-level, not app-wide

### TypeScript Patterns

```typescript
// ✅ GOOD: Well-defined props with clear optionality
interface ComponentProps {
  // Required props first
  value: string;
  onChange: (value: string) => void;
  
  // Optional props with defaults
  disabled?: boolean;
  placeholder?: string;
  
  // Complex types properly defined
  validator?: (value: string) => ValidationResult;
  
  // Children if applicable
  children?: React.ReactNode;
}

// ✅ GOOD: Default props in destructuring
export default function Component({ 
  value,
  onChange,
  disabled = false,
  placeholder = "Enter value"
}: ComponentProps): ReactElement {
  return <div>{/* component */}</div>;
}

// ❌ AVOID: Too many props (>10 indicates poor encapsulation)
interface BadProps {
  prop1: string;
  prop2: string;
  // ... 18 more props
}
```

### State Management Patterns

```typescript
// ✅ GOOD: Grouped related state
interface FormState {
  values: Record<string, string>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}
const [formState, setFormState] = useState<FormState>(initialState);

// ❌ AVOID: Too many useState hooks (max 3-4 per component)
const [value1, setValue1] = useState('');
const [value2, setValue2] = useState('');
// ... 6 more useState calls
```

### Async Operations Pattern

```typescript
// ✅ GOOD: Proper cleanup with AbortController
useEffect(() => {
  const abortController = new AbortController();
  
  async function fetchData() {
    try {
      const response = await fetch(url, { 
        signal: abortController.signal 
      });
      
      if (!abortController.signal.aborted) {
        const data = await response.json();
        setData(data);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setError(error);
      }
    }
  }
  
  fetchData();
  
  return () => abortController.abort();
}, [url]);

// ❌ AVOID: No cleanup (causes memory leaks)
useEffect(() => {
  fetch(url).then(data => setData(data));
}, [url]);
```

## Component Patterns

### Input Component Pattern

All input components should follow this structure:

```typescript
// 1. Base input interface
interface BaseInputProps<T> {
  value: T;
  onChange: (value: T) => void;
  onBlur?: () => void;
  disabled?: boolean;
  error?: string;
  helpText?: string;
  label?: string;
  required?: boolean;
}

// 2. Specialized input with validation
export function ValidatedInput<T>({ 
  value, 
  onChange,
  validator,
  ...baseProps 
}: BaseInputProps<T> & { validator?: Validator<T> }) {
  const [localError, setLocalError] = useState<string>();
  
  const handleChange = (newValue: T) => {
    if (validator) {
      const result = validator(newValue);
      setLocalError(result.error);
    }
    onChange(newValue);
  };
  
  return (
    <div>
      <Input 
        value={value} 
        onChange={handleChange}
        error={localError || baseProps.error}
        {...baseProps}
      />
    </div>
  );
}
```

### List Component Pattern

```typescript
// ✅ GOOD: Virtualized list with proper loading states
export function DataList<T>({ 
  items,
  renderItem,
  onLoadMore,
  hasMore 
}: DataListProps<T>) {
  const observerRef = useRef<IntersectionObserver>();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!hasMore) return;
    
    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );
    
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
    
    return () => observerRef.current?.disconnect();
  }, [hasMore, onLoadMore]);
  
  return (
    <div>
      {items.map(renderItem)}
      {hasMore && <div ref={loadMoreRef}>Loading...</div>}
    </div>
  );
}
```

### Error Boundary Pattern

```typescript
// Use specific error boundaries for different failure modes
export function FormErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <ErrorAlert 
          error={error}
          message="Form submission failed"
          onRetry={() => window.location.reload()}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```

## Naming Conventions

### File Naming
- **Components**: `kebab-case.tsx` (e.g., `asset-name-input.tsx`)
- **Tests**: `ComponentName.test.tsx` (e.g., `AssetNameInput.test.tsx`)
- **Types**: `types.ts` in component folder
- **Utils**: `utils.ts` or `helpers.ts` in component folder

### Prop Naming
```typescript
// ✅ GOOD: Consistent boolean naming
interface Props {
  isLoading: boolean;    // "is" prefix for states
  hasError: boolean;     // "has" prefix for possession
  canEdit: boolean;      // "can" prefix for permissions
  shouldValidate: boolean; // "should" prefix for behavior flags
  onSave: () => void;    // "on" prefix for event handlers
}

// ❌ AVOID: Inconsistent naming
interface BadProps {
  loading: boolean;      // Missing "is" prefix
  showError: boolean;    // Inconsistent with hasError
  editable: boolean;     // Should be canEdit
}
```

## Performance Guidelines

### When to Use Memoization

```typescript
// ✅ USE React.memo when:
// 1. Component re-renders frequently with same props
// 2. Component has expensive render logic
// 3. Component is in a list
export const ExpensiveComponent = React.memo(({ data }: Props) => {
  // Complex rendering logic
  return <ComplexVisualization data={data} />;
});

// ✅ USE useMemo when:
// 1. Computing expensive derived state
// 2. Creating objects/arrays used in dependencies
const expensiveValue = useMemo(() => {
  return heavyComputation(data);
}, [data]);

// ❌ AVOID: Over-memoization of simple values
const simpleValue = useMemo(() => x + y, [x, y]); // Just use x + y directly
```

### Code Splitting

```typescript
// ✅ GOOD: Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  return (
    <Suspense fallback={<Spinner />}>
      <HeavyChart />
    </Suspense>
  );
}

// ✅ GOOD: Route-based splitting (already implemented)
const ComposeRoute = lazy(() => import('@/pages/compose'));
```

## Accessibility Requirements

### Required Attributes

```typescript
// ✅ GOOD: Fully accessible input
<div>
  <label htmlFor="amount" className="sr-only">
    Amount
  </label>
  <input
    id="amount"
    type="number"
    aria-label="Enter amount"
    aria-describedby="amount-error"
    aria-invalid={!!error}
    aria-required={required}
  />
  {error && (
    <span id="amount-error" role="alert">
      {error}
    </span>
  )}
</div>
```

### Focus Management

```typescript
// ✅ GOOD: Proper focus management for modals
export function Modal({ isOpen, onClose, children }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);
  
  return (
    <Dialog open={isOpen} onClose={onClose} initialFocus={closeButtonRef}>
      {/* Modal content */}
    </Dialog>
  );
}
```

## Common UI Libraries Used

### HeadlessUI Components
- **Dialog**: Modals and overlays
- **Menu**: Dropdown menus
- **Listbox**: Select inputs
- **Switch**: Toggle switches
- **Transition**: Animation wrappers

### Icon Library
- Primary: `react-icons/fi` (Feather icons)
- Secondary: `react-icons/fa` (Font Awesome)
- Bitcoin: `react-icons/bi`

## Anti-Patterns to Avoid

### ❌ Component Anti-Patterns

```typescript
// ❌ AVOID: Direct DOM manipulation
document.getElementById('myDiv').style.color = 'red';

// ✅ USE: React state
const [color, setColor] = useState('red');
<div style={{ color }}>

// ❌ AVOID: Inline function definitions
<button onClick={() => handleClick(item.id)}>

// ✅ USE: Stable function references
const handleItemClick = useCallback((id: string) => {
  handleClick(id);
}, [handleClick]);
<button onClick={() => handleItemClick(item.id)}>

// ❌ AVOID: Using array index as key in dynamic lists
{items.map((item, index) => <Item key={index} />)}

// ✅ USE: Stable unique IDs
{items.map(item => <Item key={item.id} />)}

// ❌ AVOID: Mixing concerns in one component
function BadComponent() {
  // API calls
  // Complex business logic  
  // Form validation
  // UI rendering
  // All in one 400+ line component
}

// ✅ USE: Separation of concerns
function GoodComponent() {
  const data = useApiData();        // Custom hook for API
  const form = useFormValidation(); // Custom hook for validation
  return <UI {...data} {...form} />; // Pure UI component
}
```

## Component Development Checklist

When creating or modifying components:

### Planning
- [ ] Component has single, clear responsibility
- [ ] Props interface is minimal and focused
- [ ] Consider composition vs configuration

### Implementation  
- [ ] TypeScript props interface defined
- [ ] Props have JSDoc comments for complex types
- [ ] Default props defined for optional values
- [ ] Error states handled gracefully
- [ ] Loading states implemented
- [ ] Empty states considered

### Performance
- [ ] No unnecessary re-renders
- [ ] Expensive operations memoized appropriately
- [ ] Async operations have cleanup
- [ ] Large lists virtualized or paginated

### Accessibility
- [ ] Semantic HTML used
- [ ] ARIA labels for interactive elements
- [ ] Keyboard navigation works
- [ ] Focus management correct
- [ ] Screen reader tested

### Quality
- [ ] No console errors or warnings
- [ ] Component under 200 lines
- [ ] Test file exists with meaningful tests
- [ ] Responsive design implemented
- [ ] Dark mode supported (if applicable)

## Component Architecture Insights

### Card Component Pattern (New Architecture)
The new card-based architecture includes 11 specialized components:

```typescript
// Specialized card components with focused responsibilities:
- BalanceCard, AssetCard, TransactionCard (data display)
- ConnectedSiteCard, SelectionCard, ActionCard (interaction)
- SearchResultCard, PinnableAssetCard (specialized display)
- DispenserCard, WalletCard, AddressCard (domain-specific)
```

**Key Features**:
- **Single Responsibility**: Each card handles one specific data/interaction type
- **Consistent API**: Standardized props interface across all cards
- **Composable**: Cards can be combined in various layouts
- **Performance Optimized**: Individual memoization per card type

### Menu Standardization Pattern
```typescript
// BaseMenu provides consistent behavior
export function BaseMenu({ trigger, children, ...props }) {
  return (
    <Menu as="div" {...props}>
      <Menu.Button>{trigger}</Menu.Button>
      <Menu.Items>{children}</Menu.Items>
    </Menu>
  );
}

// Specialized menus inherit consistent behavior
export function AssetMenu({ asset }) {
  return (
    <BaseMenu trigger={<AssetButton asset={asset} />}>
      <AssetMenuItems asset={asset} />
    </BaseMenu>
  );
}
```

### Composer Context Integration
Components now work with isolated composer contexts:

```typescript
// Composer context is component-level, not app-wide
function TransactionForm() {
  return (
    <ComposerProvider composeApi={composeSend}>
      <ComposerForm />
      <ReviewScreen />
      <SuccessScreen />
    </ComposerProvider>
  );
}
```

### Current Refactoring Status

### Recently Completed ✅
1. **Card architecture implementation** - 11 focused card components
2. **Menu standardization** - BaseMenu pattern with 4 specialized menus
3. **Component cleanup** - Removed unused/incomplete components
4. **React 19 adoption** - Modern patterns implemented across codebase
5. **Composer isolation** - Context properly scoped to component level

### Remaining Priorities
1. **Large input refinement** - Some inputs still need decomposition
2. **Performance optimization** - List components could benefit from virtualization
3. **Enhanced error handling** - Standardize error boundary patterns

## React 19 Integration Status

### Already Implemented ✅
- **use() hook pattern** - Adopted in contexts for modern promise handling
- **Selective memoization** - Applied React 19 best practices across components
- **Form optimization** - Enhanced form handling patterns
- **Performance improvements** - 30% faster Button component rendering
- **Component cleanup** - Eliminated unnecessary re-renders

### Future Opportunities
- **Server Components** - For static asset information display
- **Enhanced form actions** - Further transaction submission improvements
- **Compiler optimizations** - Additional automatic memoization opportunities
- **Streaming capabilities** - For large transaction history lists