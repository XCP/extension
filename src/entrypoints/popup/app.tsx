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

// Action pages
import Actions from '@/pages/actions/actions';
import Consolidate from '@/pages/actions/consolidate/page';
import SignMessage from '@/pages/actions/sign-message';
import VerifyMessage from '@/pages/actions/verify-message';

// Address pages
import AddressHistory from '@/pages/address/address-history';
import SelectAddress from '@/pages/address/select-address';
import ViewAddress from '@/pages/address/view-address';

// Asset pages
import SelectAssets from '@/pages/assets/select-assets';
import ViewAsset from '@/pages/assets/view-asset';
import ViewBalance from '@/pages/assets/view-balance';
import ViewUtxo from '@/pages/assets/view-utxo';

// Transaction pages
import ViewTransaction from '@/pages/transaction/view-transaction';

// Provider pages
import ApproveConnection from '@/pages/provider/approve-connection';
import ApproveTransaction from '@/pages/provider/approve-transaction';
import ApproveCompose from '@/pages/provider/approve-compose';
import ApprovalQueue from '@/pages/provider/approval-queue';
import PhishingWarning from '@/pages/provider/phishing-warning-page';

// Compose pages
import ComposeBet from '@/pages/compose/bet/page';
import ComposeWeeklyBet from '@/pages/compose/bet/weekly/page';
import ComposeBroadcast from '@/pages/compose/broadcast/page';
import ComposeBroadcastInscription from '@/pages/compose/broadcast/inscription/page';
import ComposeBroadcastAddressOptions from '@/pages/compose/broadcast/address-options/page';
import ComposeBTCPay from '@/pages/compose/order/btcpay/page';
import ComposeCancel from '@/pages/compose/order/cancel/page';
import ComposeDestroy from '@/pages/compose/issuance/destroy-supply/page';
import ComposeDispenser from '@/pages/compose/dispenser/page';
import ComposeDispenserClose from '@/pages/compose/dispenser/close/page';
import ComposeDispenserCloseByHash from '@/pages/compose/dispenser/close-by-hash/page';
import ComposeDispenserDispense from '@/pages/compose/dispenser/dispense/page';
import ComposeDividend from '@/pages/compose/dividend/page';
import ComposeIssuance from '@/pages/compose/issuance/page';
import ComposeIssuanceIssueSupply from '@/pages/compose/issuance/issue-supply/page';
import ComposeIssuanceLockSupply from '@/pages/compose/issuance/lock-supply/page';
import ComposeIssuanceResetSupply from '@/pages/compose/issuance/reset-supply/page';
import ComposeIssuanceTransferOwnership from '@/pages/compose/issuance/transfer-ownership/page';
import ComposeIssuanceUpdateDescription from '@/pages/compose/issuance/update-description/page';
import ComposeFairminter from '@/pages/compose/fairminter/page';
import ComposeFairmint from '@/pages/compose/fairminter/fairmint/page';
import ComposeSend from '@/pages/compose/send/page';
import ComposeSweep from '@/pages/compose/sweep/page';
import ComposeUtxoAttach from '@/pages/compose/utxo/attach/page';
import ComposeUtxoDetach from '@/pages/compose/utxo/detach/page';
import ComposeUtxoMove from '@/pages/compose/utxo/move/page';
import ComposeOrder from '@/pages/compose/order/page';

// Dispenser pages
import DispenserManagement from '@/pages/dispensers/manage';

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
import ConnectedSites from '@/pages/settings/connected-sites';
import PinnedAssetsSettings from '@/pages/settings/pinned-assets-settings';

// Market page
import Market from '@/pages/market';

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

        {/* Protected routes */}
        <Route element={<AuthRequired />}>
          <Route element={<Layout showFooter={true} />}>
            <Route path="/index" element={<Index />} />
            <Route path="/market" element={<Market />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route element={<Layout />}>
            <Route path="/add-wallet" element={<AddWallet />} />
            <Route path="/select-wallet" element={<SelectWallet />} />
            <Route path="/reset-wallet" element={<ResetWallet />} />
            <Route path="/remove-wallet/:walletId" element={<RemoveWallet />} />
            <Route path="/show-passphrase/:walletId" element={<ShowPassphrase />} />
            <Route path="/show-private-key/:walletId/:addressPath?" element={<ShowPrivateKey />} />
            <Route path="/consolidate" element={<Consolidate />} />
            <Route path="/actions/sign-message" element={<SignMessage />} />
            <Route path="/actions/verify-message" element={<VerifyMessage />} />
            <Route path="/settings/address-type" element={<AddressTypeSettings />} />
            <Route path="/settings/advanced" element={<AdvancedSettings />} />
            <Route path="/settings/connected-sites" element={<ConnectedSites />} />
            <Route path="/settings/security" element={<SecuritySettings />} />
            <Route path="/settings/pinned-assets" element={<PinnedAssetsSettings />} />
            <Route path="/address-history" element={<AddressHistory />} />
            <Route path="/select-address" element={<SelectAddress />} />
            <Route path="/view-address" element={<ViewAddress />} />
            <Route path="/select-assets" element={<SelectAssets />} />
            <Route path="/asset/:asset" element={<ViewAsset />} />
            <Route path="/balance/:asset" element={<ViewBalance />} />
            <Route path="/compose/bet" element={<ComposeBet />} />
            <Route path="/compose/weekly-bet" element={<ComposeWeeklyBet />} />
            <Route path="/compose/broadcast" element={<ComposeBroadcast />} />
            <Route path="/compose/broadcast/inscription" element={<ComposeBroadcastInscription />} />
            <Route path="/compose/broadcast/address-options" element={<ComposeBroadcastAddressOptions />} />
            <Route path="/compose/btcpay" element={<ComposeBTCPay />} />
            <Route path="/compose/cancel/:hash?" element={<ComposeCancel />} />
            <Route path="/compose/send/:asset" element={<ComposeSend />} />
            <Route path="/compose/sweep/:address?" element={<ComposeSweep />} />
            <Route path="/compose/destroy/:asset" element={<ComposeDestroy />} />
            <Route path="/compose/dispenser/close/:asset?" element={<ComposeDispenserClose />} />
            <Route path="/compose/dispenser/close-by-hash/:tx_hash?" element={<ComposeDispenserCloseByHash />} />
            <Route path="/compose/dispenser/:asset" element={<ComposeDispenser />} />
            <Route path="/compose/dispenser/dispense/:address?" element={<ComposeDispenserDispense />} />
            <Route path="/compose/dividend/:asset" element={<ComposeDividend />} />
            <Route path="/compose/issuance/:asset?" element={<ComposeIssuance />} />
            <Route path="/compose/issuance/issue-supply/:asset" element={<ComposeIssuanceIssueSupply />} />
            <Route path="/compose/issuance/lock-supply/:asset" element={<ComposeIssuanceLockSupply />} />
            <Route path="/compose/issuance/reset-supply/:asset" element={<ComposeIssuanceResetSupply />} />
            <Route path="/compose/issuance/transfer-ownership/:asset" element={<ComposeIssuanceTransferOwnership />} />
            <Route path="/compose/issuance/update-description/:asset" element={<ComposeIssuanceUpdateDescription />} />
            <Route path="/compose/issuance/destroy/:asset" element={<ComposeDestroy />} />
            <Route path="/compose/fairminter/:asset?" element={<ComposeFairminter />} />
            <Route path="/compose/fairmint/:asset?" element={<ComposeFairmint />} />
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttach />} />
            <Route path="/compose/utxo/detach/:txid" element={<ComposeUtxoDetach />} />
            <Route path="/compose/utxo/move/:txid" element={<ComposeUtxoMove />} />
            <Route path="/compose/order/:asset?" element={<ComposeOrder />} />
            <Route path="/utxo/:txid" element={<ViewUtxo />} />
            <Route path="/transaction/:txHash" element={<ViewTransaction />} />
            <Route path="/dispensers/manage" element={<DispenserManagement />} />
            
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
