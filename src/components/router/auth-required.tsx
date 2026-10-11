import { type ReactElement, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useWallet } from '@/contexts/wallet-context';

/** Protect both initial visits and live lock transitions using the wallet context's auth state. */
export function AuthRequired(): ReactElement | null {
  const { authState, keychainExists, isLoading } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.pathname + location.search + location.hash;
  // Status can be rebuilt from the API. Only the result screen requires navigation state.
  const missingResults = location.pathname.replace(/\/$/, '') === '/actions/consolidate/success'
    && !Array.isArray((location.state as { results?: unknown } | null)?.results);

  useEffect(() => {
    if (isLoading) return;
    if (authState === 'ONBOARDING_NEEDED' || !keychainExists) {
      void navigate('/keychain/onboarding', { replace: true });
    } else if (authState === 'LOCKED') {
      void navigate('/keychain/unlock', {
        replace: true,
        state: returnTo === '/' ? undefined : {
          from: returnTo,
          ...(location.state != null ? { returnState: location.state } : {}),
        },
      });
    } else if (missingResults) {
      void navigate('/actions', { replace: true });
    }
  }, [authState, keychainExists, isLoading, navigate, returnTo, location.state, missingResults]);

  // Hide protected content in the same render as a lock, before the redirect effect runs.
  return !isLoading && keychainExists && authState === 'UNLOCKED' && !missingResults ? <Outlet /> : null;
}
