import { Routes, Route, Navigate } from 'react-router-dom';
import { FaSpinner } from "react-icons/fa";
import { Layout } from '@/components/layout';
import { useWallet } from '@/contexts/wallet-context';
import { AuthRequired } from '@/middleware/auth-required';

// Core Pages
import Index from '@/pages/index';
import NotFound from '@/pages/not-found';

// Auth pages
import Onboarding from '@/pages/auth/onboarding';
import UnlockWallet from '@/pages/auth/unlock-wallet';

// Address pages
import SelectAddress from '@/pages/address/select-address';
import ViewAddress from '@/pages/address/view-address';

// Asset pages
import SelectAssets from '@/pages/assets/select-assets';

// Compose pages
import { ComposeSend } from '@/pages/compose/send/page';

// Wallet pages
import AddWallet from '@/pages/wallet/add-wallet';
import SelectWallet from '@/pages/wallet/select-wallet';
import CreateWallet from '@/pages/wallet/create-wallet';
import ImportWallet from '@/pages/wallet/import-wallet';
import ResetWallet from '@/pages/wallet/reset-wallet';
import RemoveWallet from '@/pages/wallet/remove-wallet';
import ImportPrivateKey from '@/pages/wallet/import-private-key';

// Reveal pages
import ShowPassphrase from '@/pages/secrets/show-passphrase';
import ShowPrivateKey from '@/pages/secrets/show-private-key';

// Settings pages
import Settings from '@/pages/settings/settings';
import AddressTypeSettings from '@/pages/settings/address-type-settings';
import AdvancedSettings from '@/pages/settings/advanced-settings';
import SecuritySettings from '@/pages/settings/security-settings';
import ConnectedSitesSettings from '@/pages/settings/connected-sites-settings';

export default function App() {
  const { wallets, walletLocked, loaded } = useWallet();

  // Until the wallet metadata has been loaded from storage,
  // render a loading state.
  if (!loaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
        <FaSpinner 
          className="text-4xl text-primary-600 animate-spin" 
          aria-label="Loading..."
        />
      </div>
    );
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

      {/* Public routes */}
      <Route element={<Layout />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/create-wallet" element={<CreateWallet />} />
        <Route path="/import-wallet" element={<ImportWallet />} />
        <Route path="/unlock-wallet" element={<UnlockWallet />} />
        <Route path="/import-private-key" element={<ImportPrivateKey />} />
      </Route>

      {/* Protected routes with footer */}
      <Route element={<AuthRequired />}>
        <Route element={<Layout showFooter={true} />}>
          <Route path="/index" element={<Index />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Protected routes */}
      <Route element={<AuthRequired />}>
        <Route element={<Layout />}>
          <Route path="/add-wallet" element={<AddWallet />} />
          <Route path="/select-wallet" element={<SelectWallet />} />
          <Route path="/reset-wallet" element={<ResetWallet />} />
          <Route path="/remove-wallet/:walletId" element={<RemoveWallet />} />
          <Route path="/show-passphrase/:walletId" element={<ShowPassphrase />} />
          <Route path="/show-private-key/:walletId/:addressPath?" element={<ShowPrivateKey />} />
          <Route path="/settings/address-type" element={<AddressTypeSettings />} />
          <Route path="/settings/advanced" element={<AdvancedSettings />} />
          <Route path="/settings/connected-sites" element={<ConnectedSitesSettings />} />
          <Route path="/settings/security" element={<SecuritySettings />} />
          <Route path="/select-address" element={<SelectAddress />} />
          <Route path="/view-address" element={<ViewAddress />} />
          <Route path="/select-assets" element={<SelectAssets />} />
          <Route path="/compose/send/:asset" element={<ComposeSend />} />
        </Route>
      </Route>

      {/* Catch-all route */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
