import { type ReactElement, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useWallet } from '@/contexts/wallet-context';
import { awaitsContinuation } from '@/platform/popup';

/**
 * How long an unlock window a request continues in waits for the background to navigate it on
 * before giving up and going home. The background either places the request's screen or sends the
 * window home itself within moments; this only covers a background that died in between.
 */
export const CONTINUATION_FALLBACK_MS = 5000;

/**
 * KeychainLockedOnly Component - Route guard for unlock screen
 *
 * Allows access only when keychain exists but is locked.
 * Redirects appropriately based on state:
 * - No keychain → /keychain/onboarding
 * - Unlocked → / (or returnTo location if provided)
 * - Unlocked in a window a pending request continues in (see `awaitsContinuation`) → stays put,
 *   showing the unlock screen's busy state, until the background loads the request's screen into
 *   this window as a new document. Navigating home here would flash the home page first, and in a
 *   same-document navigation could even win over the request's screen.
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

  const continuing = keychainExists && authState === 'UNLOCKED' && awaitsContinuation();

  useEffect(() => {
    if (isLoading) return;

    if (!keychainExists) {
      // No keychain - go to onboarding
      navigate('/keychain/onboarding', { replace: true });
      return;
    }

    if (!continuing) {
      if (authState === 'UNLOCKED') {
        // Already unlocked - redirect to intended destination or home
        const returnTo = (location.state as { from?: string })?.from || '/';
        navigate(returnTo, { replace: true });
      }
      return;
    }

    const fallback = setTimeout(() => {
      // A new document without the continuation marker, so a later lock/unlock here goes home.
      window.location.replace(`${window.location.pathname}#/index`);
    }, CONTINUATION_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [authState, keychainExists, isLoading, navigate, location.state, continuing]);

  if (isLoading) {
    return null;
  }

  // Only render if keychain exists AND is locked, or while waiting to continue after unlock
  return (keychainExists && authState === 'LOCKED') || continuing ? <Outlet /> : null;
}
