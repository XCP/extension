import { useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

export function AuthRequired() {
  const { authState, wallets } = useWallet();
  const navigate = useNavigate();

  useEffect(() => {
    if (authState === 'LOCKED' && wallets.length > 0) {
      navigate('/unlock-wallet', { replace: true });
    } else if (authState === 'ONBOARDING_NEEDED' || !authState) {
      navigate('/onboarding', { replace: true });
    }
  }, [authState, wallets, navigate]);

  return authState === 'UNLOCKED' ? <Outlet /> : null;
}
