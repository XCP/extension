import { type ReactElement, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';
import { useAuthGuard } from '@/hooks/useAuthGuard';

/**
 * Authentication states that determine routing behavior
 */
type AuthState = 'UNLOCKED' | 'LOCKED' | 'ONBOARDING_NEEDED';

/**
 * Route paths for authentication flows
 */
const AUTH_ROUTES = {
  UNLOCK: '/keychain/unlock',
  ONBOARDING: '/keychain/onboarding',
} as const;

/**
 * Paths that are NOT safe for deep linking (popup reopen with session alive).
 * These pages depend on ephemeral state (form data, query params, compose flow)
 * that is lost when the popup closes.
 *
 * Each entry maps an unsafe prefix to a fallback route.
 * Anything not listed here is considered safe.
 */
const UNSAFE_DEEP_LINK_ROUTES: Array<{ prefix: string; fallback: string }> = [
  // Compose forms — lose form state, API response, review data
  { prefix: '/compose/', fallback: '/index' },

  // Consolidate flow — multi-step with ephemeral state
  { prefix: '/actions/consolidate/', fallback: '/actions' },

  // Swap listing form — needs ?utxo= query param context
  { prefix: '/market/swaps/list', fallback: '/index' },

  // Swap manage page — safe to redirect to market swaps tab
  { prefix: '/market/swaps/manage', fallback: '/market?tab=swaps' },

  // Swap buy page — listing may have changed
  { prefix: '/market/swaps/buy/', fallback: '/market?tab=swaps' },

  // Approval windows — ephemeral request data from provider, never valid on reopen
  { prefix: '/requests/', fallback: '/index' },
];

/**
 * Check if a path is safe for deep linking. If not, return a fallback path.
 * Returns null if the path is safe (no redirect needed).
 */
function getDeepLinkFallback(pathname: string): string | null {
  for (const { prefix, fallback } of UNSAFE_DEEP_LINK_ROUTES) {
    if (pathname.startsWith(prefix)) {
      return fallback;
    }
  }
  return null; // Safe, no redirect
}

/**
 * AuthRequired Component - Route guard for protected routes
 * 
 * This component serves as a security barrier for routes that require authentication.
 * It monitors the wallet's authentication state and redirects users appropriately:
 * 
 * - **UNLOCKED**: Renders child routes via `<Outlet />`
 * - **LOCKED**: Redirects to unlock screen (preserves return location)
 * - **ONBOARDING_NEEDED**: Redirects to onboarding flow
 * 
 * ## Architecture
 * 
 * Works in tandem with `useAuthGuard` hook:
 * - **AuthRequired**: Handles initial state-based routing
 * - **useAuthGuard**: Monitors real-time lock transitions
 * 
 * ## Security Considerations
 * 
 * - Only renders protected content when fully authenticated
 * - Preserves user location for post-unlock navigation
 * - Prevents flash of protected content during loading
 * - Handles race conditions between wallet state updates
 * 
 * @example
 * ```tsx
 * // In your router configuration
 * <Route element={<AuthRequired />}>
 *   <Route path="/dashboard" element={<Dashboard />} />
 *   <Route path="/settings" element={<Settings />} />
 * </Route>
 * ```
 * 
 * @returns {ReactElement | null} Outlet for child routes when authenticated, null otherwise
 */
export function AuthRequired(): ReactElement | null {
  const { authState, keychainExists, isLoading } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  // Monitor for real-time lock events (e.g., auto-lock timer, manual lock)
  useAuthGuard();

  /**
   * Determines if a redirect is needed based on current auth state
   */
  const getRedirectPath = useCallback((
    authState: AuthState,
    keychainExists: boolean
  ): string | null => {
    // No keychain or needs onboarding
    if (authState === 'ONBOARDING_NEEDED' || !keychainExists) {
      return AUTH_ROUTES.ONBOARDING;
    }

    // Has keychain but locked
    if (authState === 'LOCKED' && keychainExists) {
      return AUTH_ROUTES.UNLOCK;
    }

    // Authenticated - no redirect needed
    return null;
  }, []);

  /**
   * Navigation options for redirects
   */
  const navigationOptions = useMemo(() => ({
    replace: true,
    state: location.pathname !== '/' ? { from: location.pathname } : undefined
  }), [location.pathname]);

  // Track whether we've done the initial deep-link safety check
  const hasCheckedDeepLink = useRef(false);

  /**
   * Handle authentication-based navigation
   */
  useEffect(() => {
    // Don't navigate while wallet context is loading
    if (isLoading) {
      return;
    }

    const redirectPath = getRedirectPath(authState, keychainExists);

    if (redirectPath) {
      // Use appropriate navigation options based on redirect type
      const options = redirectPath === AUTH_ROUTES.UNLOCK
        ? navigationOptions
        : { replace: true };

      navigate(redirectPath, options);
      return;
    }

    // On first render when unlocked, check if the current deep URL is safe.
    // Unsafe routes (compose forms, swap list with params) lose their context
    // when the popup closes and reopens — redirect to a sensible fallback.
    if (authState === 'UNLOCKED' && !hasCheckedDeepLink.current) {
      hasCheckedDeepLink.current = true;
      const fallback = getDeepLinkFallback(location.pathname);
      if (fallback) {
        navigate(fallback, { replace: true });
      }
    }
  }, [authState, keychainExists, navigate, isLoading, getRedirectPath, navigationOptions, location.pathname]);

  /**
   * Only render child routes when:
   * 1. Wallet context has finished loading
   * 2. User is fully authenticated
   */
  if (isLoading) {
    // Could return a loading spinner here if desired
    return null;
  }

  return authState === 'UNLOCKED' ? <Outlet /> : null;
}