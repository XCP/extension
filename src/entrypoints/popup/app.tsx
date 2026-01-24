import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FaSpinner } from "@/components/icons";
import { Layout } from '@/components/layout';
import { useWallet } from '@/contexts/wallet-context';
import { AuthRequired } from '@/components/router/auth-required';
import { ErrorBoundary } from '@/components/error-boundary';
import { analytics } from '@/utils/fathom';
import { sanitizePath } from '@/utils/fathom';

// Auth
import Onboarding from '@/pages/auth/onboarding';
import UnlockWallet from '@/pages/auth/unlock-wallet';

// Main navigation
import Index from '@/pages/index';
import Market from '@/pages/market/index';
import Actions from '@/pages/actions';
import Settings from '@/pages/settings';

// Market
import DispenserManagement from '@/pages/market/dispensers/manage';
import AssetDispensers from '@/pages/market/asset-dispensers';
import AssetOrders from '@/pages/market/asset-orders';
import BtcPrice from '@/pages/market/btc-price';

// Actions
import Consolidate from '@/pages/actions/consolidate';
import ConsolidateSuccess from '@/pages/actions/consolidate/success';
import ConsolidateStatus from '@/pages/actions/consolidate/status';
import SignMessage from '@/pages/actions/sign-message';
import VerifyMessage from '@/pages/actions/verify-message';

// Settings
import AddressTypeSettings from '@/pages/settings/address-type-settings';
import AdvancedSettings from '@/pages/settings/advanced-settings';
import SecuritySettings from '@/pages/settings/security-settings';
import ConnectedSites from '@/pages/settings/connected-sites';
import PinnedAssetsSettings from '@/pages/settings/pinned-assets-settings';

// Wallet management
import AddWallet from '@/pages/wallet/add';
import SelectWallet from '@/pages/wallet/select';
import CreateWallet from '@/pages/wallet/create';
import ImportWallet from '@/pages/wallet/import';
import ImportPrivateKey from '@/pages/wallet/import-private-key';
import ImportTestAddress from '@/pages/wallet/import-test-address';
import ResetWallet from '@/pages/wallet/reset';
import RemoveWallet from '@/pages/wallet/remove';
import ShowPassphrase from '@/pages/wallet/secrets/show-passphrase';
import ShowPrivateKey from '@/pages/wallet/secrets/show-private-key';

// Viewing
import AddressHistory from '@/pages/address/history';
import SelectAddress from '@/pages/address/select';
import ViewAddress from '@/pages/address/view';
import SelectAssets from '@/pages/assets/select';
import ViewAsset from '@/pages/assets/[asset]';
import ViewBalance from '@/pages/assets/balance';
import ViewUtxo from '@/pages/assets/utxo/[txHash]';
import ViewTransaction from '@/pages/transaction/view-transaction';

// Provider/dApp integration
import ApproveConnection from '@/pages/provider/approve-connection';
import ApproveTransaction from '@/pages/provider/approve-transaction';
import ApprovePsbt from '@/pages/provider/approve-psbt';

// Compose - Send & Transfer
import ComposeSend from '@/pages/compose/send';
import ComposeMPMA from '@/pages/compose/send/mpma';
import ComposeSweep from '@/pages/compose/sweep';

// Compose - Trading
import ComposeOrder from '@/pages/compose/order';
import ComposeOrderBTCPay from '@/pages/compose/order/btcpay';
import ComposeOrderCancel from '@/pages/compose/order/cancel';

// Compose - Issuance
import ComposeIssuance from '@/pages/compose/issuance';
import ComposeIssuanceIssueSupply from '@/pages/compose/issuance/issue-supply';
import ComposeIssuanceLockSupply from '@/pages/compose/issuance/lock-supply';
import ComposeIssuanceResetSupply from '@/pages/compose/issuance/reset-supply';
import ComposeIssuanceTransferOwnership from '@/pages/compose/issuance/transfer-ownership';
import ComposeIssuanceUpdateDescription from '@/pages/compose/issuance/update-description';
import ComposeIssuanceLockDescription from '@/pages/compose/issuance/lock-description';
import ComposeIssuanceDestroy from '@/pages/compose/issuance/destroy-supply';

// Compose - Dispensers
import ComposeDispenser from '@/pages/compose/dispenser';
import ComposeDispenserClose from '@/pages/compose/dispenser/close';
import ComposeDispenserCloseByHash from '@/pages/compose/dispenser/close-by-hash';
import ComposeDispenserDispense from '@/pages/compose/dispenser/dispense';

// Compose - Fairminting
import ComposeFairminter from '@/pages/compose/fairminter';
import ComposeFairmint from '@/pages/compose/fairminter/fairmint';

// Compose - Other
import ComposeDividend from '@/pages/compose/dividend';
import ComposeBroadcast from '@/pages/compose/broadcast';
import ComposeBroadcastAddressOptions from '@/pages/compose/broadcast/address-options';

// Compose - UTXO
import ComposeUtxoAttach from '@/pages/compose/utxo/attach';
import ComposeUtxoDetach from '@/pages/compose/utxo/detach';
import ComposeUtxoMove from '@/pages/compose/utxo/move';


// Utility
import NotFound from '@/pages/not-found';

export default function App() {
  const { keychainExists, keychainLocked, isLoading } = useWallet();
  const location = useLocation();

  // Track page views when route changes
  useEffect(() => {
    // Sanitize the path to remove sensitive information
    const sanitizedPath = sanitizePath(location.pathname);
    // WXT Analytics page() expects just a string URL, not an object
    analytics.page(sanitizedPath);
  }, [location.pathname]);

  // Until the wallet metadata has been loaded from storage,
  // render a loading state.
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
        <FaSpinner 
          className="text-4xl text-primary-600 animate-spin" 
          aria-label="Loading…"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        {/* Root route logic:
            - If no keychain exists, go to onboarding.
            - If keychain exists but is locked, go to unlock-wallet.
            - Otherwise, go to the main page. */}
        <Route
          path="/"
          element={
            !keychainExists ? (
              <Navigate to="/onboarding" replace />
            ) : keychainLocked ? (
              <Navigate to="/unlock-wallet" replace />
            ) : (
              <Navigate to="/index" replace />
            )
          }
        />

        {/* Public routes */}
        <Route element={<Layout />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/wallet/create" element={<CreateWallet />} />
          <Route path="/wallet/import" element={<ImportWallet />} />
          <Route path="/unlock-wallet" element={<UnlockWallet />} />
        </Route>

        {/* Protected routes */}
        <Route element={<AuthRequired />}>
          <Route element={<Layout showFooter={true} />}>
            <Route path="/index" element={<Index />} />
            <Route path="/market" element={<Market />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route element={<Layout />}>
            {/* Market - specific routes before parameterized routes */}
            <Route path="/market/btc" element={<BtcPrice />} />
            <Route path="/market/dispensers/manage" element={<DispenserManagement />} />
            <Route path="/market/dispensers/:asset" element={<AssetDispensers />} />
            <Route path="/market/orders/:baseAsset/:quoteAsset" element={<AssetOrders />} />

            {/* Actions */}
            <Route path="/actions/consolidate" element={<Consolidate />} />
            <Route path="/actions/consolidate/success" element={<ConsolidateSuccess />} />
            <Route path="/actions/consolidate/status" element={<ConsolidateStatus />} />
            <Route path="/actions/sign-message" element={<SignMessage />} />
            <Route path="/actions/verify-message" element={<VerifyMessage />} />
            
            {/* Settings */}
            <Route path="/settings/address-type" element={<AddressTypeSettings />} />
            <Route path="/settings/advanced" element={<AdvancedSettings />} />
            <Route path="/settings/connected-sites" element={<ConnectedSites />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="/settings/pinned-assets" element={<PinnedAssetsSettings />} />
            
            {/* Wallet management */}
            <Route path="/wallet/add" element={<AddWallet />} />
            <Route path="/wallet/select" element={<SelectWallet />} />
            <Route path="/wallet/reset" element={<ResetWallet />} />
            <Route path="/wallet/import-private-key" element={<ImportPrivateKey />} />
            <Route path="/wallet/import-test-address" element={<ImportTestAddress />} />
            <Route path="/wallet/remove/:walletId" element={<RemoveWallet />} />
            <Route path="/wallet/secrets/show-passphrase/:walletId" element={<ShowPassphrase />} />
            <Route path="/wallet/secrets/show-private-key/:walletId/:addressPath?" element={<ShowPrivateKey />} />
            
            {/* Viewing (specific routes before parameterized routes) */}
            <Route path="/address/history" element={<AddressHistory />} />
            <Route path="/address/select" element={<SelectAddress />} />
            <Route path="/address/view" element={<ViewAddress />} />
            <Route path="/assets/select" element={<SelectAssets />} />
            <Route path="/assets/utxo/:txHash" element={<ViewUtxo />} />
            <Route path="/assets/:asset/balance" element={<ViewBalance />} />
            <Route path="/assets/:asset" element={<ViewAsset />} />
            <Route path="/transaction/:txHash" element={<ViewTransaction />} />
            
            {/* Compose - Send & Transfer */}
            <Route path="/compose/send/mpma" element={<ComposeMPMA />} />
            <Route path="/compose/send/:asset" element={<ComposeSend />} />
            <Route path="/compose/sweep/:address?" element={<ComposeSweep />} />
            
            {/* Compose - Trading (specific routes before parameterized) */}
            <Route path="/compose/order/btcpay" element={<ComposeOrderBTCPay />} />
            <Route path="/compose/order/cancel/:hash?" element={<ComposeOrderCancel />} />
            <Route path="/compose/order/:asset?" element={<ComposeOrder />} />
            
            {/* Compose - Issuance (specific routes before parameterized) */}
            <Route path="/compose/issuance/issue-supply/:asset" element={<ComposeIssuanceIssueSupply />} />
            <Route path="/compose/issuance/lock-supply/:asset" element={<ComposeIssuanceLockSupply />} />
            <Route path="/compose/issuance/reset-supply/:asset" element={<ComposeIssuanceResetSupply />} />
            <Route path="/compose/issuance/transfer-ownership/:asset" element={<ComposeIssuanceTransferOwnership />} />
            <Route path="/compose/issuance/update-description/:asset" element={<ComposeIssuanceUpdateDescription />} />
            <Route path="/compose/issuance/lock-description/:asset" element={<ComposeIssuanceLockDescription />} />
            <Route path="/compose/issuance/destroy/:asset" element={<ComposeIssuanceDestroy />} />
            <Route path="/compose/issuance/:asset?" element={<ComposeIssuance />} />
            
            {/* Compose - Dispensers (specific routes before parameterized) */}
            <Route path="/compose/dispenser/close/:asset?" element={<ComposeDispenserClose />} />
            <Route path="/compose/dispenser/close-by-hash/:tx_hash?" element={<ComposeDispenserCloseByHash />} />
            <Route path="/compose/dispenser/dispense/:address?" element={<ComposeDispenserDispense />} />
            <Route path="/compose/dispenser/:asset" element={<ComposeDispenser />} />
            
            {/* Compose - Fairminting */}
            <Route path="/compose/fairminter/:asset?" element={<ComposeFairminter />} />
            <Route path="/compose/fairmint/:asset?" element={<ComposeFairmint />} />
            
            {/* Compose - Other (specific routes before parameterized routes) */}
            <Route path="/compose/dividend/:asset" element={<ComposeDividend />} />
            <Route path="/compose/broadcast/address-options" element={<ComposeBroadcastAddressOptions />} />
            <Route path="/compose/broadcast" element={<ComposeBroadcast />} />
            
            {/* Compose - UTXO */}
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
            <Route path="/compose/utxo/detach/:txid" element={<ComposeUtxoDetach />} />
            <Route path="/compose/utxo/move/:txid" element={<ComposeUtxoMove />} />

          </Route>
        </Route>

        {/* Provider approval routes - outside AuthRequired so they can handle their own auth state */}
        <Route element={<Layout />}>
          <Route path="/provider/approve-connection" element={<ApproveConnection />} />
          <Route path="/provider/approve-transaction" element={<ApproveTransaction />} />
          <Route path="/provider/approve-psbt" element={<ApprovePsbt />} />
        </Route>

        {/* Catch-all route */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
