import { type ReactElement, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
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

  useEffect(() => {
    if (isLoading) return;

    // Keychain exists but locked - must unlock first
    if (keychainExists && authState === 'LOCKED') {
      navigate('/keychain/unlock', { replace: true });
    }
  }, [authState, keychainExists, isLoading, navigate]);

  if (isLoading) {
    return null;
  }

  // Allow if: no keychain exists OR user is unlocked
  const canAccess = !keychainExists || authState === 'UNLOCKED';
  return canAccess ? <Outlet /> : null;
}
