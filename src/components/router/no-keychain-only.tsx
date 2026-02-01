import { type ReactElement, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

/**
 * NoKeychainOnly Component - Route guard for fresh install / no wallet state
 *
 * Allows access only when no keychain exists (fresh install).
 * Redirects appropriately based on state:
 * - Keychain exists + locked → /keychain/unlock
 * - Keychain exists + unlocked → /
 *
 * Use for: /keychain/onboarding
 *
 * @example
 * ```tsx
 * <Route element={<NoKeychainOnly />}>
 *   <Route path="/keychain/onboarding" element={<Onboarding />} />
 * </Route>
 * ```
 */
export function NoKeychainOnly(): ReactElement | null {
  const { authState, keychainExists, isLoading } = useWallet();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (keychainExists) {
      // Keychain exists - user shouldn't be on onboarding
      if (authState === 'UNLOCKED') {
        navigate('/', { replace: true });
      } else {
        // Locked - go unlock
        navigate('/keychain/unlock', { replace: true });
      }
    }
  }, [authState, keychainExists, isLoading, navigate]);

  if (isLoading) {
    return null;
  }

  // Only render if no keychain exists
  return !keychainExists ? <Outlet /> : null;
}
