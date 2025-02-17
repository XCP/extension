import { Navigate, Outlet } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

export function AuthRequired() {
  const { walletLocked, wallets } = useWallet();

  // If no wallets exist, assume it's a new or reset state and allow the route.
  if (wallets.length === 0) return <Outlet />;

  // If wallets exist but are locked, redirect to unlock.
  if (walletLocked) {
    return <Navigate to="/unlock-wallet" replace />;
  }

  return <Outlet />;
}
