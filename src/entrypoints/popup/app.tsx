import { lazy, Suspense } from 'react';
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

// Action pages (lazy loaded)
const Actions = lazy(() => import('@/pages/actions/actions'));
const Consolidate = lazy(() => import('@/pages/actions/consolidate/page'));
const SignMessage = lazy(() => import('@/pages/actions/sign-message'));
const VerifyMessage = lazy(() => import('@/pages/actions/verify-message'));

// Address pages (lazy loaded)
const AddressHistory = lazy(() => import('@/pages/address/address-history'));
const SelectAddress = lazy(() => import('@/pages/address/select-address'));
const ViewAddress = lazy(() => import('@/pages/address/view-address'));

// Asset pages (lazy loaded)
const SelectAssets = lazy(() => import('@/pages/assets/select-assets'));
const ViewAsset = lazy(() => import('@/pages/assets/view-asset'));
const ViewBalance = lazy(() => import('@/pages/assets/view-balance'));
const ViewUtxo = lazy(() => import('@/pages/assets/view-utxo'));

// Transaction pages (lazy loaded)
const ViewTransaction = lazy(() => import('@/pages/transaction/view-transaction'));

// Provider pages (keep static for instant response)
import ApproveConnection from '@/pages/provider/approve-connection';
import ApproveTransaction from '@/pages/provider/approve-transaction';
import ApproveCompose from '@/pages/provider/approve-compose';
import ApprovalQueue from '@/pages/provider/approval-queue';
import PhishingWarning from '@/pages/provider/phishing-warning-page';

// Compose pages (lazy loaded)
const ComposeBet = lazy(() => import('@/pages/compose/bet/page'));
const ComposeWeeklyBet = lazy(() => import('@/pages/compose/bet/weekly/page'));
const ComposeBroadcast = lazy(() => import('@/pages/compose/broadcast/page'));
const ComposeBroadcastAddressOptions = lazy(() => import('@/pages/compose/broadcast/address-options/page'));
const ComposeBTCPay = lazy(() => import('@/pages/compose/order/btcpay/page'));
const ComposeCancel = lazy(() => import('@/pages/compose/order/cancel/page'));
const ComposeDestroy = lazy(() => import('@/pages/compose/issuance/destroy-supply/page'));
const ComposeDispenser = lazy(() => import('@/pages/compose/dispenser/page'));
const ComposeDispenserClose = lazy(() => import('@/pages/compose/dispenser/close/page'));
const ComposeDispenserCloseByHash = lazy(() => import('@/pages/compose/dispenser/close-by-hash/page'));
const ComposeDispenserDispense = lazy(() => import('@/pages/compose/dispenser/dispense/page'));
const ComposeDividend = lazy(() => import('@/pages/compose/dividend/page'));
const ComposeIssuance = lazy(() => import('@/pages/compose/issuance/page'));
const ComposeIssuanceIssueSupply = lazy(() => import('@/pages/compose/issuance/issue-supply/page'));
const ComposeIssuanceLockSupply = lazy(() => import('@/pages/compose/issuance/lock-supply/page'));
const ComposeIssuanceResetSupply = lazy(() => import('@/pages/compose/issuance/reset-supply/page'));
const ComposeIssuanceTransferOwnership = lazy(() => import('@/pages/compose/issuance/transfer-ownership/page'));
const ComposeIssuanceUpdateDescription = lazy(() => import('@/pages/compose/issuance/update-description/page'));
const ComposeIssuanceLockDescription = lazy(() => import('@/pages/compose/issuance/lock-description/page'));
const ComposeFairminter = lazy(() => import('@/pages/compose/fairminter/page'));
const ComposeFairmint = lazy(() => import('@/pages/compose/fairminter/fairmint/page'));
const ComposeSend = lazy(() => import('@/pages/compose/send/page'));
const ComposeMPMA = lazy(() => import('@/pages/compose/send/mpma/page'));
const ComposeSweep = lazy(() => import('@/pages/compose/sweep/page'));
const ComposeUtxoAttach = lazy(() => import('@/pages/compose/utxo/attach/page'));
const ComposeUtxoDetach = lazy(() => import('@/pages/compose/utxo/detach/page'));
const ComposeUtxoMove = lazy(() => import('@/pages/compose/utxo/move/page'));
const ComposeOrder = lazy(() => import('@/pages/compose/order/page'));

// Dispenser pages (lazy loaded)
const DispenserManagement = lazy(() => import('@/pages/dispensers/manage'));

// Wallet pages (lazy loaded)
const AddWallet = lazy(() => import('@/pages/wallet/add-wallet'));
const SelectWallet = lazy(() => import('@/pages/wallet/select-wallet'));
const CreateWallet = lazy(() => import('@/pages/wallet/create-wallet'));
const ImportWallet = lazy(() => import('@/pages/wallet/import-wallet'));
const ResetWallet = lazy(() => import('@/pages/wallet/reset-wallet'));
const RemoveWallet = lazy(() => import('@/pages/wallet/remove-wallet'));
const ImportPrivateKey = lazy(() => import('@/pages/wallet/import-private-key'));

// Reveal pages (lazy loaded)
const ShowPassphrase = lazy(() => import('@/pages/secrets/show-passphrase'));
const ShowPrivateKey = lazy(() => import('@/pages/secrets/show-private-key'));

// Settings pages (lazy loaded)
const Settings = lazy(() => import('@/pages/settings/settings'));
const AddressTypeSettings = lazy(() => import('@/pages/settings/address-type-settings'));
const AdvancedSettings = lazy(() => import('@/pages/settings/advanced-settings'));
const SecuritySettings = lazy(() => import('@/pages/settings/security-settings'));
const ConnectedSites = lazy(() => import('@/pages/settings/connected-sites'));
const PinnedAssetsSettings = lazy(() => import('@/pages/settings/pinned-assets-settings'));

// Market page (lazy loaded)
const Market = lazy(() => import('@/pages/market'));

// Import the Spinner component
import { Spinner } from '@/components/spinner';

// Page loader component for lazy loaded routes
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <Spinner />
  </div>
);

// LazyRoute component that wraps lazy-loaded components with Suspense
interface LazyRouteProps {
  path: string;
  element: React.LazyExoticComponent<React.ComponentType<any>>;
  [key: string]: any; // Allow other Route props
}

const LazyRoute: React.FC<LazyRouteProps> = ({ path, element: Component, ...rest }) => (
  <Route 
    path={path} 
    element={
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    } 
    {...rest}
  />
);

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
          <Route path="/unlock-wallet" element={<UnlockWallet />} />
          {/* Wallet creation routes with lazy loading */}
          <LazyRoute path="/create-wallet" element={CreateWallet} />
          <LazyRoute path="/import-wallet" element={ImportWallet} />
          <LazyRoute path="/import-private-key" element={ImportPrivateKey} />
        </Route>

        {/* Protected routes */}
        <Route element={<AuthRequired />}>
          <Route element={<Layout showFooter={true} />}>
            <Route path="/index" element={<Index />} />
            <LazyRoute path="/market" element={Market} />
            <LazyRoute path="/actions" element={Actions} />
            <LazyRoute path="/settings" element={Settings} />
          </Route>
          <Route element={<Layout />}>
            {/* Wallet management routes with lazy loading */}
            <LazyRoute path="/add-wallet" element={AddWallet} />
            <LazyRoute path="/select-wallet" element={SelectWallet} />
            <LazyRoute path="/reset-wallet" element={ResetWallet} />
            <LazyRoute path="/remove-wallet/:walletId" element={RemoveWallet} />
            <LazyRoute path="/show-passphrase/:walletId" element={ShowPassphrase} />
            <LazyRoute path="/show-private-key/:walletId/:addressPath?" element={ShowPrivateKey} />
            
            <LazyRoute path="/consolidate" element={Consolidate} />
            <LazyRoute path="/actions/sign-message" element={SignMessage} />
            <LazyRoute path="/actions/verify-message" element={VerifyMessage} />
            
            {/* Settings routes with lazy loading */}
            <LazyRoute path="/settings/address-type" element={AddressTypeSettings} />
            <LazyRoute path="/settings/advanced" element={AdvancedSettings} />
            <LazyRoute path="/settings/connected-sites" element={ConnectedSites} />
            <LazyRoute path="/settings/security" element={SecuritySettings} />
            <LazyRoute path="/settings/pinned-assets" element={PinnedAssetsSettings} />
            
            {/* Address and asset routes with lazy loading */}
            <LazyRoute path="/address-history" element={AddressHistory} />
            <LazyRoute path="/select-address" element={SelectAddress} />
            <LazyRoute path="/view-address" element={ViewAddress} />
            <LazyRoute path="/select-assets" element={SelectAssets} />
            <LazyRoute path="/asset/:asset" element={ViewAsset} />
            <LazyRoute path="/balance/:asset" element={ViewBalance} />
            
            {/* Compose routes with lazy loading using LazyRoute */}
            <LazyRoute path="/compose/bet" element={ComposeBet} />
            <LazyRoute path="/compose/weekly-bet" element={ComposeWeeklyBet} />
            <LazyRoute path="/compose/broadcast" element={ComposeBroadcast} />
            <LazyRoute path="/compose/broadcast/address-options" element={ComposeBroadcastAddressOptions} />
            <LazyRoute path="/compose/btcpay" element={ComposeBTCPay} />
            <LazyRoute path="/compose/cancel/:hash?" element={ComposeCancel} />
            <LazyRoute path="/compose/send/mpma" element={ComposeMPMA} />
            <LazyRoute path="/compose/send/:asset" element={ComposeSend} />
            <LazyRoute path="/compose/sweep/:address?" element={ComposeSweep} />
            <LazyRoute path="/compose/destroy/:asset" element={ComposeDestroy} />
            <LazyRoute path="/compose/dispenser/close/:asset?" element={ComposeDispenserClose} />
            <LazyRoute path="/compose/dispenser/close-by-hash/:tx_hash?" element={ComposeDispenserCloseByHash} />
            <LazyRoute path="/compose/dispenser/:asset" element={ComposeDispenser} />
            <LazyRoute path="/compose/dispenser/dispense/:address?" element={ComposeDispenserDispense} />
            <LazyRoute path="/compose/dividend/:asset" element={ComposeDividend} />
            <LazyRoute path="/compose/issuance/:asset?" element={ComposeIssuance} />
            <LazyRoute path="/compose/issuance/issue-supply/:asset" element={ComposeIssuanceIssueSupply} />
            <LazyRoute path="/compose/issuance/lock-supply/:asset" element={ComposeIssuanceLockSupply} />
            <LazyRoute path="/compose/issuance/reset-supply/:asset" element={ComposeIssuanceResetSupply} />
            <LazyRoute path="/compose/issuance/transfer-ownership/:asset" element={ComposeIssuanceTransferOwnership} />
            <LazyRoute path="/compose/issuance/update-description/:asset" element={ComposeIssuanceUpdateDescription} />
            <LazyRoute path="/compose/issuance/lock-description/:asset" element={ComposeIssuanceLockDescription} />
            <LazyRoute path="/compose/issuance/destroy/:asset" element={ComposeDestroy} />
            <LazyRoute path="/compose/fairminter/:asset?" element={ComposeFairminter} />
            <LazyRoute path="/compose/fairmint/:asset?" element={ComposeFairmint} />
            <LazyRoute path="/compose/utxo/attach/:asset" element={ComposeUtxoAttach} />
            <LazyRoute path="/compose/utxo/detach/:txid" element={ComposeUtxoDetach} />
            <LazyRoute path="/compose/utxo/move/:txid" element={ComposeUtxoMove} />
            <LazyRoute path="/compose/order/:asset?" element={ComposeOrder} />
            
            <LazyRoute path="/utxo/:txid" element={ViewUtxo} />
            <LazyRoute path="/transaction/:txHash" element={ViewTransaction} />
            <LazyRoute path="/dispensers/manage" element={DispenserManagement} />
            
            {/* Provider approval routes */}
            <Route path="/provider/approve-connection" element={<ApproveConnection />} />
            <Route path="/provider/approve-transaction" element={<ApproveTransaction />} />
            <Route path="/provider/approve-compose" element={<ApproveCompose />} />
            <Route path="/provider/approval-queue" element={<ApprovalQueue />} />
            <Route path="/provider/phishing-warning" element={<PhishingWarning />} />
          </Route>
        </Route>

        {/* Catch-all route */}
        <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
