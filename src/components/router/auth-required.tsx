import { type ReactElement, useEffect, useCallback, useMemo } from 'react';
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
  UNLOCK: '/unlock-wallet',
  ONBOARDING: '/onboarding',
} as const;

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
  const { authState, wallets, loaded } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  // Monitor for real-time lock events (e.g., auto-lock timer, manual lock)
  useAuthGuard();

  /**
   * Determines if a redirect is needed based on current auth state
   */
  const getRedirectPath = useCallback((
    authState: AuthState,
    hasWallets: boolean
  ): string | null => {
    // No wallets or needs onboarding
    if (authState === 'ONBOARDING_NEEDED' || !hasWallets) {
      return AUTH_ROUTES.ONBOARDING;
    }
    
    // Has wallets but locked
    if (authState === 'LOCKED' && hasWallets) {
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

  /**
   * Handle authentication-based navigation
   */
  useEffect(() => {
    // Don't navigate while wallet context is loading
    if (!loaded) {
      return;
    }
    
    const redirectPath = getRedirectPath(authState, wallets.length > 0);
    
    if (redirectPath) {
      // Use appropriate navigation options based on redirect type
      const options = redirectPath === AUTH_ROUTES.UNLOCK 
        ? navigationOptions 
        : { replace: true };
        
      navigate(redirectPath, options);
    }
  }, [authState, wallets.length, navigate, loaded, getRedirectPath, navigationOptions]);

  /**
   * Only render child routes when:
   * 1. Wallet context is loaded
   * 2. User is fully authenticated
   */
  if (!loaded) {
    // Could return a loading spinner here if desired
    return null;
  }

  return authState === 'UNLOCKED' ? <Outlet /> : null;
}