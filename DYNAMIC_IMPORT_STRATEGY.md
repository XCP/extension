# Dynamic Import Strategy for app.tsx

## Current Situation
- **91 page imports** in app.tsx (lines 8-97)
- **Main chunk size**: 1.29 MB (warning threshold: 500 KB)
- All pages are statically imported, loaded immediately

## Proposed Strategy

### Keep Static (Core Pages - Always Needed)
These pages are critical for initial load and user experience:

```typescript
// Core pages (< 10 imports)
import Index from '@/pages/index';
import NotFound from '@/pages/not-found';
import Onboarding from '@/pages/auth/onboarding';
import UnlockWallet from '@/pages/auth/unlock-wallet';
import Layout from '@/components/layout';
import AuthRequired from '@/middleware/auth-required';
```

**Rationale**: These are hit immediately on app load - no benefit from lazy loading.

### Convert to Dynamic (Compose Pages - 35+ imports)
These are transaction composition pages accessed through menus:

```typescript
// Instead of:
import ComposeSend from '@/pages/compose/send/page';

// Use:
const ComposeSend = lazy(() => import('@/pages/compose/send/page'));
const ComposeOrder = lazy(() => import('@/pages/compose/order/page'));
const ComposeIssuance = lazy(() => import('@/pages/compose/issuance/page'));
// ... etc for all compose/* pages
```

**Benefits**: 
- Reduces initial bundle by ~40%
- These pages are only accessed after user navigation
- Natural loading point when user clicks "Compose" actions

### Convert to Dynamic (Settings Pages - Secondary)
Settings are accessed less frequently:

```typescript
const Settings = lazy(() => import('@/pages/settings/settings'));
const SecuritySettings = lazy(() => import('@/pages/settings/security-settings'));
const AdvancedSettings = lazy(() => import('@/pages/settings/advanced-settings'));
// ... etc for all settings/* pages
```

### Convert to Dynamic (Wallet Management - Secondary)
Wallet operations after initial setup:

```typescript
const AddWallet = lazy(() => import('@/pages/wallet/add-wallet'));
const RemoveWallet = lazy(() => import('@/pages/wallet/remove-wallet'));
const ShowPassphrase = lazy(() => import('@/pages/secrets/show-passphrase'));
// ... etc for wallet/* and secrets/* pages
```

### Keep Static (Provider Pages)
Provider approval pages need immediate response:

```typescript
// Keep static for performance
import ApproveConnection from '@/pages/provider/approve-connection';
import ApproveTransaction from '@/pages/provider/approve-transaction';
```

**Rationale**: These are triggered by external dApps and need instant response.

## Implementation Pattern

### 1. Add React.lazy and Suspense
```typescript
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { FaSpinner } from "react-icons/fa";

// Static imports (core)
import Index from '@/pages/index';
import NotFound from '@/pages/not-found';

// Dynamic imports (compose)
const ComposeSend = lazy(() => import('@/pages/compose/send/page'));
const ComposeOrder = lazy(() => import('@/pages/compose/order/page'));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center h-full">
    <FaSpinner className="text-2xl text-primary-600 animate-spin" />
  </div>
);
```

### 2. Wrap Routes with Suspense
```typescript
<Route element={<AuthRequired />}>
  <Route element={<Layout />}>
    <Suspense fallback={<PageLoader />}>
      <Route path="/compose/send/:asset" element={<ComposeSend />} />
      <Route path="/compose/order/:asset?" element={<ComposeOrder />} />
      {/* ... other lazy routes */}
    </Suspense>
  </Route>
</Route>
```

### 3. Group Related Routes
Create route groups with shared Suspense boundaries:

```typescript
// Compose routes group
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/compose/*" element={<ComposeRoutes />} />
  </Routes>
</Suspense>

// Settings routes group  
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/settings/*" element={<SettingsRoutes />} />
  </Routes>
</Suspense>
```

## Expected Benefits

### Bundle Size Reduction
- **Initial bundle**: ~500-600 KB (down from 1.29 MB)
- **Lazy chunks**: Multiple 50-100 KB chunks
- **Total size**: Same, but distributed

### Performance Improvements
- **Initial load**: 50-60% faster
- **Time to Interactive (TTI)**: Significantly reduced
- **Memory usage**: Lower initial footprint

### User Experience
- **Faster extension popup opening**
- **Smooth navigation with loading states**
- **No blocking on unused code**

## Migration Steps

### Phase 1: Compose Pages (Highest Impact)
1. Convert all `/compose/*` imports to lazy
2. Add Suspense boundary around compose routes
3. Test all compose workflows
4. Measure bundle size reduction

### Phase 2: Settings & Wallet Pages
1. Convert settings pages to lazy
2. Convert wallet management pages to lazy
3. Add appropriate Suspense boundaries
4. Test settings and wallet flows

### Phase 3: Asset & Action Pages
1. Evaluate remaining pages for lazy loading
2. Keep frequently accessed pages static
3. Convert secondary pages to lazy

## Caveats & Considerations

### Don't Lazy Load:
1. **Initial routes** (/, /index, /unlock-wallet, /onboarding)
2. **404 page** (NotFound)
3. **Layout components**
4. **Provider approval pages** (need instant response)
5. **Frequently accessed pages** (Index, Market)

### Preload Critical Routes:
```typescript
// Preload commonly accessed routes
const preloadCommon = () => {
  import('@/pages/compose/send/page');
  import('@/pages/settings/settings');
};

// Call after initial render
useEffect(() => {
  // Preload after 2 seconds of idle
  const timer = setTimeout(preloadCommon, 2000);
  return () => clearTimeout(timer);
}, []);
```

## Monitoring

After implementation, monitor:
1. **Bundle sizes** via build output
2. **Load times** via Performance API
3. **User feedback** on perceived performance
4. **Error rates** from failed chunk loads

## Alternative Approach: Route-Based Code Splitting

Instead of individual page splitting, group by feature:

```typescript
const ComposeModule = lazy(() => import('@/modules/compose'));
const SettingsModule = lazy(() => import('@/modules/settings'));
const WalletModule = lazy(() => import('@/modules/wallet'));
```

This requires restructuring but provides cleaner boundaries.

## Recommendation

**Start with Phase 1** - Converting compose pages to dynamic imports will provide the biggest immediate benefit with minimal risk. This alone should reduce the main bundle by 30-40% and eliminate the build warning.