import { useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';
import { useAuthGuard } from '@/hooks/useAuthGuard';

export function AuthRequired() {
  const { authState, wallets } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  // Monitor for real-time lock events
  useAuthGuard();

  useEffect(() => {
    // Don't navigate while loading
    if (authState === 'LOADING') {
      return;
    }
    
    // Simple, direct navigation based on auth state
    if (authState === 'LOCKED' && wallets.length > 0) {
      navigate('/unlock-wallet', { 
        replace: true,
        state: { from: location.pathname }
      });
    } else if (authState === 'ONBOARDING_NEEDED' || wallets.length === 0) {
      navigate('/onboarding', { replace: true });
    }
  }, [authState, wallets.length, navigate, location.pathname]);

  // Only render outlet when fully authenticated
  return authState === 'UNLOCKED' ? <Outlet /> : null;
}
