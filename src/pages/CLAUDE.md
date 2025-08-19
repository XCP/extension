# Pages Directory

This directory contains page components for the XCP Wallet extension's routing system.

## Routing Architecture

### React Router v7 Setup
The extension uses React Router v7 with a nested route structure:

```typescript
// Route structure
<Routes>
  <Route element={<Layout />}>
    <Route element={<AuthRequired />}>
      <Route path="/" element={<Index />} />
      <Route path="/settings/*" element={<Settings />} />
      <Route path="/wallet/*" element={<Wallet />} />
      <Route path="/compose/*" element={<Compose />} />
    </Route>
    <Route path="/onboarding/*" element={<Onboarding />} />
  </Route>
</Routes>
```

## Page Categories

### Main Pages

#### index.tsx
**Purpose**: Main wallet dashboard
**Features**:
- Balance display with tabs (Assets/Balances)
- Send/Receive/History buttons
- Asset search and filtering
- Pinned assets management
- Infinite scroll for balances

**Key Components**:
```typescript
export default function Index() {
  const { activeWallet, activeAddress } = useWalletContext();
  const [activeTab, setActiveTab] = useState<'assets' | 'balances'>('balances');
  
  return (
    <div className="flex flex-col h-full">
      {/* Address selector */}
      {/* Balance display */}
      {/* Action buttons */}
      {/* Asset/Balance list */}
    </div>
  );
}
```

#### market.tsx
**Purpose**: Marketplace and DEX interface
**Features**:
- Order book display
- Trade history
- Create orders
- Dispenser interactions

#### not-found.tsx
**Purpose**: 404 error page
**Features**:
- User-friendly error message
- Navigation back to home
- Consistent styling

### Nested Route Pages

#### Settings Pages (`/settings/*`)
- General settings
- Security settings
- Network configuration
- Connected sites
- About page

#### Wallet Pages (`/wallet/*`)
- Wallet management
- Address management
- Import/Export
- Wallet details

#### Compose Pages (`/compose/*`)
- Send transactions
- Create orders
- Issue assets
- Advanced operations

#### Onboarding Pages (`/onboarding/*`)
- Welcome screen
- Create wallet
- Import wallet
- Setup complete

## Page Structure Pattern

### Standard Page Template
```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletContext } from '@/contexts/wallet-context';
import { useHeaderContext } from '@/contexts/header-context';
import { Layout } from '@/components/layout';

export default function PageName() {
  // 1. Routing
  const navigate = useNavigate();
  
  // 2. Context consumption
  const { walletData } = useWalletContext();
  const { setTitle } = useHeaderContext();
  
  // 3. Local state
  const [localState, setLocalState] = useState(initialValue);
  
  // 4. Data fetching
  const { data, loading, error } = useFetchData();
  
  // 5. Header configuration
  useEffect(() => {
    setTitle('Page Title');
    return () => setTitle(''); // Cleanup
  }, [setTitle]);
  
  // 6. Event handlers
  const handleAction = async () => {
    try {
      // Action logic
      navigate('/success');
    } catch (error) {
      // Error handling
    }
  };
  
  // 7. Loading state
  if (loading) {
    return <Spinner />;
  }
  
  // 8. Error state
  if (error) {
    return <ErrorAlert error={error} />;
  }
  
  // 9. Main render
  return (
    <div className="page-container">
      {/* Page content */}
    </div>
  );
}
```

## Data Fetching Patterns

### On Mount Fetching
```typescript
export default function DataPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.getData();
        setData(result);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  if (loading) return <Spinner />;
  return <div>{/* Display data */}</div>;
}
```

### Route Parameter Based
```typescript
export default function DetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  
  useEffect(() => {
    if (id) {
      fetchItem(id).then(setItem);
    }
  }, [id]);
  
  return <div>{/* Display item */}</div>;
}
```

### Form Submission
```typescript
export default function FormPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  
  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await api.submitForm(values);
      navigate('/success');
    } catch (error) {
      // Handle error
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button disabled={submitting}>Submit</button>
    </form>
  );
}
```

## Navigation Patterns

### Programmatic Navigation
```typescript
const navigate = useNavigate();

// Navigate to route
navigate('/settings');

// Navigate with state
navigate('/compose/send', { state: { asset: 'XCP' } });

// Go back
navigate(-1);

// Replace current entry
navigate('/home', { replace: true });
```

### Conditional Navigation
```typescript
export default function ProtectedPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, navigate]);
  
  return <div>{/* Protected content */}</div>;
}
```

### Navigation Guards
```typescript
export default function FormPage() {
  const [hasChanges, setHasChanges] = useState(false);
  
  // Prevent navigation if unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);
}
```

## State Management

### Page-Level State
```typescript
// Keep state local when only used in one page
export default function LocalStatePage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // State is local to this page
  return <div>{/* Use local state */}</div>;
}
```

### Cross-Page State
```typescript
// Use context for state needed across pages
export default function SharedStatePage() {
  const { sharedData, updateSharedData } = useAppContext();
  
  // State is available to all pages
  return <div>{/* Use shared state */}</div>;
}
```

### URL State
```typescript
// Use URL params for shareable state
export default function URLStatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filter = searchParams.get('filter') || 'all';
  const page = parseInt(searchParams.get('page') || '1');
  
  const updateFilter = (newFilter: string) => {
    setSearchParams(prev => {
      prev.set('filter', newFilter);
      return prev;
    });
  };
  
  return <div>{/* State in URL */}</div>;
}
```

## Layout Integration

### With Layout
```typescript
// Pages wrapped in Layout automatically
export default function StandardPage() {
  return (
    <div className="p-4">
      {/* Page content - Layout applied automatically */}
    </div>
  );
}
```

### Custom Layout
```typescript
// Override default layout
export default function CustomLayoutPage() {
  return (
    <div className="custom-layout">
      <CustomHeader />
      <main>{/* Content */}</main>
      <CustomFooter />
    </div>
  );
}
```

## Performance Optimization

### Code Splitting
```typescript
// Lazy load heavy pages
const HeavyPage = lazy(() => import('./HeavyPage'));

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/heavy" element={<HeavyPage />} />
      </Routes>
    </Suspense>
  );
}
```

### Memoization
```typescript
export default function OptimizedPage() {
  const expensiveData = useMemo(() => {
    return processLargeDataset(rawData);
  }, [rawData]);
  
  const handleClick = useCallback(() => {
    doSomething(expensiveData);
  }, [expensiveData]);
  
  return <div onClick={handleClick}>{/* Content */}</div>;
}
```

## Testing Pages

### Page Component Test
```typescript
describe('IndexPage', () => {
  it('should display wallet balance', () => {
    render(
      <MockProviders>
        <Index />
      </MockProviders>
    );
    
    expect(screen.getByText('Balance')).toBeInTheDocument();
  });
  
  it('should navigate to send page', async () => {
    const { user } = render(<Index />);
    
    await user.click(screen.getByText('Send'));
    
    expect(mockNavigate).toHaveBeenCalledWith('/compose/send');
  });
});
```

## Accessibility

### Page Accessibility Checklist
- [ ] Page has a descriptive title
- [ ] Headings follow hierarchy (h1 -> h2 -> h3)
- [ ] Interactive elements are keyboard accessible
- [ ] Forms have proper labels
- [ ] Error messages are announced
- [ ] Loading states are communicated
- [ ] Focus management on route changes

## Common Patterns

### Infinite Scroll
```typescript
export default function InfiniteScrollPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMore = useCallback(async () => {
    const newItems = await fetchItems(page);
    if (newItems.length === 0) {
      setHasMore(false);
    } else {
      setItems(prev => [...prev, ...newItems]);
      setPage(prev => prev + 1);
    }
  }, [page]);
  
  return (
    <InfiniteScroll
      dataLength={items.length}
      next={loadMore}
      hasMore={hasMore}
      loader={<Spinner />}
    >
      {items.map(item => <ItemCard key={item.id} item={item} />)}
    </InfiniteScroll>
  );
}
```

### Tab Navigation
```typescript
export default function TabbedPage() {
  const [activeTab, setActiveTab] = useState<'tab1' | 'tab2'>('tab1');
  
  return (
    <div>
      <div className="tabs">
        <button 
          className={activeTab === 'tab1' ? 'active' : ''}
          onClick={() => setActiveTab('tab1')}
        >
          Tab 1
        </button>
        <button 
          className={activeTab === 'tab2' ? 'active' : ''}
          onClick={() => setActiveTab('tab2')}
        >
          Tab 2
        </button>
      </div>
      
      <div className="tab-content">
        {activeTab === 'tab1' && <Tab1Content />}
        {activeTab === 'tab2' && <Tab2Content />}
      </div>
    </div>
  );
}
```

## Anti-Patterns to Avoid

1. **Don't fetch in render** - Use useEffect
2. **Don't ignore loading states** - Show feedback
3. **Don't forget error boundaries** - Handle crashes gracefully
4. **Don't block UI** - Use async operations
5. **Don't skip accessibility** - Make pages usable for all
6. **Don't overuse global state** - Keep state local when possible