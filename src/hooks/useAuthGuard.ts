import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

/**
 * Global auth guard hook that monitors wallet lock state changes and navigates immediately.
 * This ensures instant navigation when the wallet locks, regardless of where the user is.
 */
export function useAuthGuard() {
  const { authState, wallets } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const previousAuthState = useRef(authState);

  useEffect(() => {
    // Detect transition from UNLOCKED to LOCKED
    if (previousAuthState.current === 'UNLOCKED' && authState === 'LOCKED' && wallets.length > 0) {
      console.log('[Auth Guard] Wallet locked, navigating to unlock screen');
      navigate('/unlock-wallet', { 
        replace: true,
        state: { from: location.pathname }
      });
    }
    
    previousAuthState.current = authState;
  }, [authState, wallets.length, navigate, location.pathname]);

  return { isProtected: authState === 'UNLOCKED' };
}