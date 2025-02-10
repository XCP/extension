import { Navigate, Outlet } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

export function AuthRequired() {
  const { walletLocked } = useWallet();

  // If the wallet is not unlocked, redirect
  if (walletLocked) {
    return <Navigate to="/unlock-wallet" replace />;
  }

  // Otherwise, render the nested routes
  return <Outlet />;
}
