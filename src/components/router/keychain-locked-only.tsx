import { type ReactElement, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

/**
 * KeychainLockedOnly Component - Route guard for unlock screen
 *
 * Allows access only when keychain exists but is locked.
 * Redirects appropriately based on state:
 * - No keychain → /keychain/onboarding
 * - Unlocked → / (or returnTo location if provided)
 *
 * Use for: /keychain/unlock
 *
 * @example
 * ```tsx
 * <Route element={<KeychainLockedOnly />}>
 *   <Route path="/keychain/unlock" element={<Unlock />} />
 * </Route>
 * ```
 */
export function KeychainLockedOnly(): ReactElement | null {
  const { authState, keychainExists, isLoading } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;

    if (!keychainExists) {
      // No keychain - go to onboarding
      navigate('/keychain/onboarding', { replace: true });
      return;
    }

    if (authState === 'UNLOCKED') {
      // Already unlocked - redirect to intended destination or home
      const returnTo = (location.state as { from?: string })?.from || '/';
      navigate(returnTo, { replace: true });
    }
  }, [authState, keychainExists, isLoading, navigate, location.state]);

  if (isLoading) {
    return null;
  }

  // Only render if keychain exists AND is locked
  return keychainExists && authState === 'LOCKED' ? <Outlet /> : null;
}
