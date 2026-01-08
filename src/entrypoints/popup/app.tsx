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
import Market from '@/pages/market';
import Actions from '@/pages/actions';
import Settings from '@/pages/settings';

// Market
import DispenserManagement from '@/pages/dispensers/manage';

// Actions
import Consolidate from '@/pages/actions/consolidate';
import ConsolidationSuccess from '@/pages/actions/consolidate/success';
import ConsolidationStatus from '@/pages/actions/consolidate/status';
import SignMessage from '@/pages/actions/sign-message';
import VerifyMessage from '@/pages/actions/verify-message';

// Settings
import AddressTypeSettings from '@/pages/settings/address-type-settings';
import AdvancedSettings from '@/pages/settings/advanced-settings';
import SecuritySettings from '@/pages/settings/security-settings';
import ConnectedSites from '@/pages/settings/connected-sites';
import PinnedAssetsSettings from '@/pages/settings/pinned-assets-settings';

// Wallet management
import AddWallet from '@/pages/wallet/add-wallet';
import SelectWallet from '@/pages/wallet/select-wallet';
import CreateWallet from '@/pages/wallet/create-wallet';
import ImportWallet from '@/pages/wallet/import-wallet';
import ImportPrivateKey from '@/pages/wallet/import-private-key';
import ImportTestAddress from '@/pages/wallet/import-test-address';
import ResetWallet from '@/pages/wallet/reset-wallet';
import RemoveWallet from '@/pages/wallet/remove-wallet';
import ShowPassphrase from '@/pages/secrets/show-passphrase';
import ShowPrivateKey from '@/pages/secrets/show-private-key';

// Viewing
import AddressHistory from '@/pages/address/address-history';
import SelectAddress from '@/pages/address/select-address';
import ViewAddress from '@/pages/address/view-address';
import SelectAssets from '@/pages/assets/select-assets';
import ViewAsset from '@/pages/assets/view-asset';
import ViewBalance from '@/pages/assets/view-balance';
import ViewUtxo from '@/pages/assets/view-utxo';
import ViewTransaction from '@/pages/transaction/view-transaction';

// Provider/dApp integration
import ApproveConnection from '@/pages/provider/approve-connection';
import ApproveTransaction from '@/pages/provider/approve-transaction';
import ApproveCompose from '@/pages/provider/approve-compose';
import ApprovalQueue from '@/pages/provider/approval-queue';

// Compose - Send & Transfer
import ComposeSend from '@/pages/compose/send';
import ComposeMPMA from '@/pages/compose/send/mpma';
import ComposeSweep from '@/pages/compose/sweep';

// Compose - Trading
import ComposeOrder from '@/pages/compose/order';
import ComposeBTCPay from '@/pages/compose/order/btcpay';
import ComposeCancel from '@/pages/compose/order/cancel';

// Compose - Issuance
import ComposeIssuance from '@/pages/compose/issuance';
import ComposeIssuanceIssueSupply from '@/pages/compose/issuance/issue-supply';
import ComposeIssuanceLockSupply from '@/pages/compose/issuance/lock-supply';
import ComposeIssuanceResetSupply from '@/pages/compose/issuance/reset-supply';
import ComposeIssuanceTransferOwnership from '@/pages/compose/issuance/transfer-ownership';
import ComposeIssuanceUpdateDescription from '@/pages/compose/issuance/update-description';
import ComposeIssuanceLockDescription from '@/pages/compose/issuance/lock-description';
import ComposeDestroy from '@/pages/compose/issuance/destroy-supply';

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
import ComposeBet from '@/pages/compose/bet';
import ComposeWeeklyBet from '@/pages/compose/bet/weekly';
import ComposeBroadcast from '@/pages/compose/broadcast';
import ComposeBroadcastAddressOptions from '@/pages/compose/broadcast/address-options';

// Compose - UTXO
import ComposeUtxoAttach from '@/pages/compose/utxo/attach';
import ComposeUtxoDetach from '@/pages/compose/utxo/detach';
import ComposeUtxoMove from '@/pages/compose/utxo/move';


// Utility
import NotFound from '@/pages/not-found';

export default function App() {
  const { wallets, walletLocked, loaded } = useWallet();
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
    <ErrorBoundary>
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
            {/* Market */}
            <Route path="/dispensers/manage" element={<DispenserManagement />} />
            
            {/* Actions */}
            <Route path="/consolidate" element={<Consolidate />} />
            <Route path="/consolidation-success" element={<ConsolidationSuccess />} />
            <Route path="/consolidation-status" element={<ConsolidationStatus />} />
            <Route path="/actions/sign-message" element={<SignMessage />} />
            <Route path="/actions/verify-message" element={<VerifyMessage />} />
            
            {/* Settings */}
            <Route path="/settings/address-type" element={<AddressTypeSettings />} />
            <Route path="/settings/advanced" element={<AdvancedSettings />} />
            <Route path="/settings/connected-sites" element={<ConnectedSites />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="/settings/pinned-assets" element={<PinnedAssetsSettings />} />
            
            {/* Wallet management */}
            <Route path="/add-wallet" element={<AddWallet />} />
            <Route path="/select-wallet" element={<SelectWallet />} />
            <Route path="/reset-wallet" element={<ResetWallet />} />
            <Route path="/import-private-key" element={<ImportPrivateKey />} />
            <Route path="/import-test-address" element={<ImportTestAddress />} />
            <Route path="/remove-wallet/:walletId" element={<RemoveWallet />} />
            <Route path="/show-passphrase/:walletId" element={<ShowPassphrase />} />
            <Route path="/show-private-key/:walletId/:addressPath?" element={<ShowPrivateKey />} />
            
            {/* Viewing */}
            <Route path="/address-history" element={<AddressHistory />} />
            <Route path="/select-address" element={<SelectAddress />} />
            <Route path="/view-address" element={<ViewAddress />} />
            <Route path="/select-assets" element={<SelectAssets />} />
            <Route path="/asset/:asset" element={<ViewAsset />} />
            <Route path="/balance/:asset" element={<ViewBalance />} />
            <Route path="/utxo/:txid" element={<ViewUtxo />} />
            <Route path="/transaction/:txHash" element={<ViewTransaction />} />
            
            {/* Compose - Send & Transfer */}
            <Route path="/compose/send/mpma" element={<ComposeMPMA />} />
            <Route path="/compose/send/:asset" element={<ComposeSend />} />
            <Route path="/compose/sweep/:address?" element={<ComposeSweep />} />
            
            {/* Compose - Trading */}
            <Route path="/compose/order/:asset?" element={<ComposeOrder />} />
            <Route path="/compose/btcpay" element={<ComposeBTCPay />} />
            <Route path="/compose/cancel/:hash?" element={<ComposeCancel />} />
            
            {/* Compose - Issuance */}
            <Route path="/compose/issuance/:asset?" element={<ComposeIssuance />} />
            <Route path="/compose/issuance/issue-supply/:asset" element={<ComposeIssuanceIssueSupply />} />
            <Route path="/compose/issuance/lock-supply/:asset" element={<ComposeIssuanceLockSupply />} />
            <Route path="/compose/issuance/reset-supply/:asset" element={<ComposeIssuanceResetSupply />} />
            <Route path="/compose/issuance/transfer-ownership/:asset" element={<ComposeIssuanceTransferOwnership />} />
            <Route path="/compose/issuance/update-description/:asset" element={<ComposeIssuanceUpdateDescription />} />
            <Route path="/compose/issuance/lock-description/:asset" element={<ComposeIssuanceLockDescription />} />
            <Route path="/compose/destroy/:asset" element={<ComposeDestroy />} />
            
            {/* Compose - Dispensers */}
            <Route path="/compose/dispenser/:asset" element={<ComposeDispenser />} />
            <Route path="/compose/dispenser/close/:asset?" element={<ComposeDispenserClose />} />
            <Route path="/compose/dispenser/close-by-hash/:tx_hash?" element={<ComposeDispenserCloseByHash />} />
            <Route path="/compose/dispenser/dispense/:address?" element={<ComposeDispenserDispense />} />
            
            {/* Compose - Fairminting */}
            <Route path="/compose/fairminter/:asset?" element={<ComposeFairminter />} />
            <Route path="/compose/fairmint/:asset?" element={<ComposeFairmint />} />
            
            {/* Compose - Other */}
            <Route path="/compose/dividend/:asset" element={<ComposeDividend />} />
            <Route path="/compose/bet" element={<ComposeBet />} />
            <Route path="/compose/weekly-bet" element={<ComposeWeeklyBet />} />
            <Route path="/compose/broadcast" element={<ComposeBroadcast />} />
            <Route path="/compose/broadcast/address-options" element={<ComposeBroadcastAddressOptions />} />
            
            {/* Compose - UTXO */}
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
            <Route path="/compose/utxo/detach/:txid" element={<ComposeUtxoDetach />} />
            <Route path="/compose/utxo/move/:txid" element={<ComposeUtxoMove />} />
            
            {/* Provider approval routes */}
            <Route path="/provider/approve-connection" element={<ApproveConnection />} />
            <Route path="/provider/approve-transaction" element={<ApproveTransaction />} />
            <Route path="/provider/approve-compose" element={<ApproveCompose />} />
            <Route path="/provider/approval-queue" element={<ApprovalQueue />} />
            
          </Route>
        </Route>

        {/* Catch-all route */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
