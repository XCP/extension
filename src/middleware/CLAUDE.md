# Middleware Directory

This directory contains route middleware components for the XCP Wallet extension.

## Middleware Architecture

### React Router Middleware Pattern
Middleware components wrap routes to provide authentication, authorization, and other cross-cutting concerns.

```typescript
// Route structure with middleware
<Routes>
  <Route element={<Layout />}>
    <Route element={<AuthRequired />}>  {/* Middleware */}
      <Route path="/" element={<Index />} />
      <Route path="/settings" element={<Settings />} />
    </Route>
    <Route path="/login" element={<Login />} />
  </Route>
</Routes>
```

## Available Middleware

### auth-required.tsx

**Purpose**: Protects routes that require wallet authentication
**Behavior**:
- Redirects to onboarding if no wallets exist
- Redirects to unlock screen if wallet is locked
- Allows access only when wallet is unlocked

**Implementation**:
```typescript
export function AuthRequired() {
  const { authState } = useWalletContext();
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    switch (authState) {
      case 'onboarding':
        navigate('/onboarding', { 
          replace: true,
          state: { from: location }
        });
        break;
        
      case 'locked':
        navigate('/unlock', { 
          replace: true,
          state: { from: location }
        });
        break;
        
      case 'unlocked':
        // Allow access
        break;
    }
  }, [authState, navigate, location]);
  
  // Show loading while checking auth
  if (authState === 'loading') {
    return <Spinner />;
  }
  
  // Render child routes when authenticated
  if (authState === 'unlocked') {
    return <Outlet />;
  }
  
  // Prevent flash of protected content
  return null;
}
```

**Usage**:
```typescript
// Wrap protected routes
<Route element={<AuthRequired />}>
  <Route path="/wallet" element={<Wallet />} />
  <Route path="/send" element={<Send />} />
</Route>
```

## Middleware Patterns

### Basic Middleware Template
```typescript
export function MiddlewareName() {
  // 1. Get required context/state
  const { requiredState } = useRequiredContext();
  const navigate = useNavigate();
  const location = useLocation();
  
  // 2. Check conditions
  useEffect(() => {
    if (!conditionMet) {
      // Redirect or handle accordingly
      navigate('/redirect-path', {
        replace: true,
        state: { from: location }
      });
    }
  }, [conditionMet, navigate, location]);
  
  // 3. Handle loading states
  if (isLoading) {
    return <LoadingComponent />;
  }
  
  // 4. Handle error states
  if (error) {
    return <ErrorComponent error={error} />;
  }
  
  // 5. Render child routes when conditions are met
  if (conditionMet) {
    return <Outlet />;
  }
  
  // 6. Prevent content flash
  return null;
}
```

### Permission-Based Middleware
```typescript
export function RequirePermission({ permission }: { permission: string }) {
  const { permissions } = useUserContext();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!permissions.includes(permission)) {
      navigate('/unauthorized', { replace: true });
    }
  }, [permissions, permission, navigate]);
  
  if (permissions.includes(permission)) {
    return <Outlet />;
  }
  
  return null;
}

// Usage
<Route element={<RequirePermission permission="admin" />}>
  <Route path="/admin" element={<AdminPanel />} />
</Route>
```

### Network Status Middleware
```typescript
export function RequireNetwork() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  if (!isOnline) {
    return (
      <div className="offline-message">
        <h2>No Internet Connection</h2>
        <p>Please check your connection and try again.</p>
      </div>
    );
  }
  
  return <Outlet />;
}
```

### Feature Flag Middleware
```typescript
export function FeatureFlag({ flag }: { flag: string }) {
  const { features } = useFeatureFlags();
  
  if (!features[flag]) {
    return (
      <div className="feature-unavailable">
        <h2>Coming Soon</h2>
        <p>This feature is not yet available.</p>
      </div>
    );
  }
  
  return <Outlet />;
}

// Usage
<Route element={<FeatureFlag flag="betaFeature" />}>
  <Route path="/beta" element={<BetaFeature />} />
</Route>
```

## Composing Middleware

### Sequential Middleware
```typescript
// Apply multiple middleware in sequence
<Route element={<RequireAuth />}>
  <Route element={<RequireNetwork />}>
    <Route element={<RequirePermission permission="send" />}>
      <Route path="/send" element={<Send />} />
    </Route>
  </Route>
</Route>
```

### Combined Middleware
```typescript
export function CombinedMiddleware() {
  // Combine multiple checks in one middleware
  const { isAuthenticated } = useAuth();
  const { isNetworkAvailable } = useNetwork();
  const { hasPermission } = usePermissions();
  
  const canAccess = isAuthenticated && isNetworkAvailable && hasPermission;
  
  if (!canAccess) {
    return <AccessDenied />;
  }
  
  return <Outlet />;
}
```

## State Preservation

### Preserving Location for Redirect
```typescript
export function AuthMiddleware() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    if (!isAuthenticated) {
      // Preserve attempted location
      navigate('/login', {
        replace: true,
        state: { from: location.pathname + location.search }
      });
    }
  }, [isAuthenticated, navigate, location]);
  
  return isAuthenticated ? <Outlet /> : null;
}

// In login component
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const handleLogin = async () => {
    await login();
    
    // Redirect to preserved location or home
    const from = location.state?.from || '/';
    navigate(from, { replace: true });
  };
}
```

## Error Handling

### Error Boundary Middleware
```typescript
export function ErrorBoundaryMiddleware() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      <Outlet />
    </ErrorBoundary>
  );
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="error-page">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}
```

## Testing Middleware

### Unit Testing
```typescript
describe('AuthRequired middleware', () => {
  it('should redirect to onboarding when no wallets', () => {
    const mockNavigate = jest.fn();
    
    renderWithRouter(
      <AuthRequired />,
      {
        walletContext: { authState: 'onboarding' },
        navigate: mockNavigate
      }
    );
    
    expect(mockNavigate).toHaveBeenCalledWith(
      '/onboarding',
      expect.objectContaining({ replace: true })
    );
  });
  
  it('should render outlet when authenticated', () => {
    const { container } = renderWithRouter(
      <AuthRequired />,
      {
        walletContext: { authState: 'unlocked' }
      }
    );
    
    expect(container.querySelector('.outlet')).toBeInTheDocument();
  });
});
```

### Integration Testing
```typescript
describe('Protected route flow', () => {
  it('should redirect through auth flow', async () => {
    const { user } = render(
      <Routes>
        <Route element={<AuthRequired />}>
          <Route path="/protected" element={<Protected />} />
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
    
    // Navigate to protected route
    navigate('/protected');
    
    // Should redirect to login
    expect(screen.getByText('Login')).toBeInTheDocument();
    
    // Login
    await user.click(screen.getByText('Login'));
    
    // Should now show protected content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Preventing Unnecessary Re-renders
```typescript
export const OptimizedMiddleware = memo(function OptimizedMiddleware() {
  const authState = useAuthState(); // Only subscribes to auth changes
  
  // Memoize navigation logic
  const shouldRedirect = useMemo(() => {
    return authState !== 'authenticated';
  }, [authState]);
  
  if (shouldRedirect) {
    return <Navigate to="/login" replace />;
  }
  
  return <Outlet />;
});
```

### Lazy Loading Protected Routes
```typescript
const LazyProtectedRoute = lazy(() => import('./ProtectedRoute'));

export function LazyMiddleware() {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <Suspense fallback={<Loading />}>
      <LazyProtectedRoute />
    </Suspense>
  );
}
```

## Common Use Cases

### Session Timeout Middleware
```typescript
export function SessionTimeout({ timeout = 900000 }: { timeout?: number }) {
  const { logout } = useAuth();
  const [lastActivity, setLastActivity] = useState(Date.now());
  
  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    
    // Track user activity
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    
    // Check for timeout
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > timeout) {
        logout();
      }
    }, 60000); // Check every minute
    
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      clearInterval(interval);
    };
  }, [lastActivity, timeout, logout]);
  
  return <Outlet />;
}
```

### Maintenance Mode Middleware
```typescript
export function MaintenanceMode() {
  const { isMaintenanceMode } = useAppConfig();
  
  if (isMaintenanceMode) {
    return (
      <div className="maintenance">
        <h1>Under Maintenance</h1>
        <p>We'll be back shortly!</p>
      </div>
    );
  }
  
  return <Outlet />;
}
```

## Best Practices

1. **Keep middleware focused** - Single responsibility principle
2. **Handle loading states** - Don't show blank screens
3. **Preserve navigation state** - Remember where users wanted to go
4. **Use proper redirects** - Replace history when appropriate
5. **Test edge cases** - Loading, errors, race conditions
6. **Document behavior** - Clear comments on what middleware does
7. **Compose carefully** - Order matters when stacking middleware

## Anti-Patterns to Avoid

1. **Don't cause redirect loops** - Always check conditions carefully
2. **Don't block the UI** - Use loading states instead of waiting
3. **Don't forget cleanup** - Remove event listeners and timers
4. **Don't expose sensitive routes** - Always check auth first
5. **Don't ignore errors** - Handle and display appropriately
6. **Don't over-middleware** - Keep the chain simple and clear