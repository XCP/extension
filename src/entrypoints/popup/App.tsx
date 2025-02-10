import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { useWallet } from '@/contexts/wallet-context';
import { AuthRequired } from '@/middleware/auth-required';

// Updated imports based on your folder structure
import Index from '@/pages/index';
import NotFound from '@/pages/not-found';

// Auth-related pages
import Onboarding from '@/pages/auth/onboarding';

// Wallet-related pages
import CreateWallet from '@/pages/wallet/create-wallet';
import ImportWallet from '@/pages/wallet/import-wallet';
import UnlockWallet from '@/pages/wallet/unlock-wallet';

export default function App() {
  const { wallets, walletLocked, loaded } = useWallet();

  // Until the wallet metadata has been loaded from storage,
  // render a loading state.
  if (!loaded) {
    return <div className="p-4">Loading...</div>;
  }

  const walletExists = wallets.length > 0;

  return (
    <Routes>
      {/* Root route logic:
          - If no wallet exists, go to onboarding.
          - If a wallet exists but is locked, go to unlock-wallet.
          - Otherwise, go to the main page. */}
      <Route
        path="/"
        element={
          !walletExists ? (
            <Navigate to="/onboarding" replace />
          ) : walletLocked ? (
            <Navigate to="/unlock-wallet" replace />
          ) : (
            <Navigate to="/index" replace />
          )
        }
      />

      {/* Public routes using the global layout */}
      <Route element={<Layout />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/create-wallet" element={<CreateWallet />} />
        <Route path="/import-wallet" element={<ImportWallet />} />
        <Route path="/unlock-wallet" element={<UnlockWallet />} />
      </Route>

      {/* Protected routes (requires auth) */}
      <Route element={<AuthRequired />}>
        <Route element={<Layout />}>
          <Route path="/index" element={<Index />} />
        </Route>
      </Route>

      {/* Catch-all route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
