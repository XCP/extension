import { type ReactElement, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useWallet } from '@/contexts/wallet-context';

/**
 * KeychainOpenOrNew Component - Route guard for setup/recovery flows
 *
 * This component allows access to wallet creation/import pages when:
 * - No keychain exists (fresh install, needs onboarding)
 * - User is fully authenticated (adding another wallet)
 *
 * Blocks access when:
 * - Keychain exists but is locked (must unlock first)
 *
 * @example
 * ```tsx
 * <Route element={<KeychainOpenOrNew />}>
 *   <Route path="/keychain/setup/create-mnemonic" element={<CreateMnemonic />} />
 *   <Route path="/keychain/setup/import-mnemonic" element={<ImportMnemonic />} />
 * </Route>
 * ```
 */
export function KeychainOpenOrNew(): ReactElement | null {
  const { authState, keychainExists, isLoading } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.pathname + location.search + location.hash;

  useEffect(() => {
    if (isLoading) return;

    // Keychain exists but locked - must unlock first
    if (keychainExists && authState === 'LOCKED') {
      void navigate('/keychain/unlock', { replace: true, state: {
        from: returnTo,
        ...(location.state != null ? { returnState: location.state } : {}),
      } });
    }
  }, [authState, keychainExists, isLoading, navigate, returnTo, location.state]);

  if (isLoading) {
    return null;
  }

  // Allow if: no keychain exists OR user is unlocked
  const canAccess = !keychainExists || authState === 'UNLOCKED';
  return canAccess ? <Outlet /> : null;
}
