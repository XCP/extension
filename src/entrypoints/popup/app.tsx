import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ErrorBoundary } from '@/components/layout/error-boundary';
import { FaSpinner } from '@/components/icons';
import { Layout } from '@/components/layout/layout';
import { AuthRequired } from '@/components/router/auth-required';
import { NoKeychainOnly } from '@/components/router/no-keychain-only';
import { KeychainLockedOnly } from '@/components/router/keychain-locked-only';
import { KeychainOpenOrNew } from '@/components/router/keychain-open-or-new';
import { useWallet } from '@/contexts/wallet-context';
import { analytics, sanitizePath } from '@/utils/fathom';

// Keychain + Requests (public-ish)
import OnboardingPage from '@/pages/keychain/onboarding';
import UnlockPage from '@/pages/keychain/unlock';
import CreateMnemonicPage from '@/pages/keychain/setup/create-mnemonic';
import ImportMnemonicPage from '@/pages/keychain/setup/import-mnemonic';
import ApproveConnectionPage from '@/pages/requests/connect/approve';
import ApprovePsbtPage from '@/pages/requests/psbt/approve';
import ApproveTransactionPage from '@/pages/requests/transaction/approve';

// Main sections
import HomePage from '@/pages/index';
import MarketPage from '@/pages/market';
import ActionsPage from '@/pages/actions';
import SettingsPage from '@/pages/settings';

// Market
import BtcPricePage from '@/pages/market/btc';
import DispenserManagementPage from '@/pages/market/dispensers/manage';
import AssetDispensersPage from '@/pages/market/dispensers/[asset]';
import OrderManagementPage from '@/pages/market/orders/manage';
import AssetOrdersPage from '@/pages/market/orders/[baseAsset]/[quoteAsset]';

// Actions
import ConsolidatePage from '@/pages/actions/consolidate';
import ConsolidateStatusPage from '@/pages/actions/consolidate/status';
import ConsolidateSuccessPage from '@/pages/actions/consolidate/success';
import SignMessagePage from '@/pages/actions/sign-message';
import VerifyMessagePage from '@/pages/actions/verify-message';

// Settings
import AddressTypesPage from '@/pages/settings/address-types';
import AdvancedSettingsPage from '@/pages/settings/advanced';
import ConnectedSitesPage from '@/pages/settings/connected-sites';
import SecuritySettingsPage from '@/pages/settings/security';
import PinnedAssetsPage from '@/pages/settings/pinned-assets';

// Keychain (protected)
import ImportPrivateKeyPage from '@/pages/keychain/setup/import-private-key';
import ImportTestAddressPage from '@/pages/keychain/setup/import-test-address';
import WalletsPage from '@/pages/keychain/wallets';
import AddWalletPage from '@/pages/keychain/wallets/add';
import RemoveWalletPage from '@/pages/keychain/wallets/remove';
import ResetWalletPage from '@/pages/keychain/wallets/reset';
import ShowPassphrasePage from '@/pages/keychain/secrets/show-passphrase';
import ShowPrivateKeyPage from '@/pages/keychain/secrets/show-private-key';

// Viewing
import AddressesPage from '@/pages/addresses';
import AddressDetailsPage from '@/pages/addresses/details';
import AddressHistoryPage from '@/pages/addresses/history';
import AssetsPage from '@/pages/assets';
import AssetPage from '@/pages/assets/[asset]';
import AssetBalancePage from '@/pages/assets/[asset]/balance';
import UtxoPage from '@/pages/assets/utxos/[txHash]';
import TransactionPage from '@/pages/transactions/[txHash]';

// Compose
import ComposeSendPage from '@/pages/compose/send';
import ComposeMpmaPage from '@/pages/compose/send/mpma';
import ComposeSweepPage from '@/pages/compose/sweep';
import ComposeOrderPage from '@/pages/compose/order';
import ComposeOrderBtcPayPage from '@/pages/compose/order/btcpay';
import ComposeOrderCancelPage from '@/pages/compose/order/cancel';
import ComposeIssuancePage from '@/pages/compose/issuance';
import ComposeIssueSupplyPage from '@/pages/compose/issuance/issue-supply';
import ComposeLockSupplyPage from '@/pages/compose/issuance/lock-supply';
import ComposeResetSupplyPage from '@/pages/compose/issuance/reset-supply';
import ComposeTransferOwnershipPage from '@/pages/compose/issuance/transfer-ownership';
import ComposeUpdateDescriptionPage from '@/pages/compose/issuance/update-description';
import ComposeLockDescriptionPage from '@/pages/compose/issuance/lock-description';
import ComposeDestroySupplyPage from '@/pages/compose/issuance/destroy-supply';
import ComposeDispenserPage from '@/pages/compose/dispenser';
import ComposeDispenserClosePage from '@/pages/compose/dispenser/close';
import ComposeDispenserCloseByHashPage from '@/pages/compose/dispenser/close-by-hash';
import ComposeDispensePage from '@/pages/compose/dispenser/dispense';
import ComposeFairminterPage from '@/pages/compose/fairminter';
import ComposeFairmintPage from '@/pages/compose/fairminter/fairmint';
import ComposeDividendPage from '@/pages/compose/dividend';
import ComposeBroadcastPage from '@/pages/compose/broadcast';
import ComposeBroadcastAddressOptionsPage from '@/pages/compose/broadcast/address-options';
import ComposeUtxoAttachPage from '@/pages/compose/utxo/attach';
import ComposeUtxoDetachPage from '@/pages/compose/utxo/detach';
import ComposeUtxoMovePage from '@/pages/compose/utxo/move';

import NotFoundPage from '@/pages/not-found';

function FullscreenLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
      <FaSpinner className="text-4xl text-primary-600 animate-spin" aria-label="Loading…" />
    </div>
  );
}

export default function App() {
  const { keychainExists, keychainLocked, isLoading } = useWallet();
  const location = useLocation();

  useEffect(() => {
    analytics.page(sanitizePath(location.pathname));
  }, [location.pathname]);

  if (isLoading) return <FullscreenLoading />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/"
          element={
            !keychainExists ? (
              <Navigate to="/keychain/onboarding" replace />
            ) : keychainLocked ? (
              <Navigate to="/keychain/unlock" replace />
            ) : (
              <Navigate to="/index" replace />
            )
          }
        />

        {/* Public-ish routes with Layout */}
        <Route element={<Layout />}>
          {/* Onboarding: only when no keychain exists */}
          <Route element={<NoKeychainOnly />}>
            <Route path="/keychain/onboarding" element={<OnboardingPage />} />
          </Route>

          {/* Unlock: only when keychain exists but locked */}
          <Route element={<KeychainLockedOnly />}>
            <Route path="/keychain/unlock" element={<UnlockPage />} />
          </Route>

          {/* Setup: allow if no keychain OR unlocked */}
          <Route element={<KeychainOpenOrNew />}>
            <Route path="/keychain/setup/create-mnemonic" element={<CreateMnemonicPage />} />
            <Route path="/keychain/setup/import-mnemonic" element={<ImportMnemonicPage />} />
          </Route>

          {/* Request approval: handle their own auth states */}
          <Route path="/requests/connect/approve" element={<ApproveConnectionPage />} />
          <Route path="/requests/transaction/approve" element={<ApproveTransactionPage />} />
          <Route path="/requests/psbt/approve" element={<ApprovePsbtPage />} />
        </Route>

        <Route element={<AuthRequired />}>
          <Route element={<Layout showFooter={true} />}>
            <Route path="/index" element={<HomePage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route element={<Layout />}>
            <Route path="/market/btc" element={<BtcPricePage />} />
            <Route path="/market/dispensers/manage" element={<DispenserManagementPage />} />
            <Route path="/market/orders/manage" element={<OrderManagementPage />} />
            <Route path="/market/dispensers/:asset" element={<AssetDispensersPage />} />
            <Route path="/market/orders/:baseAsset/:quoteAsset" element={<AssetOrdersPage />} />

            <Route path="/actions/consolidate" element={<ConsolidatePage />} />
            <Route path="/actions/consolidate/status" element={<ConsolidateStatusPage />} />
            <Route path="/actions/consolidate/success" element={<ConsolidateSuccessPage />} />
            <Route path="/actions/sign-message" element={<SignMessagePage />} />
            <Route path="/actions/verify-message" element={<VerifyMessagePage />} />

            <Route path="/settings/address-types" element={<AddressTypesPage />} />
            <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
            <Route path="/settings/connected-sites" element={<ConnectedSitesPage />} />
            <Route path="/settings/security" element={<SecuritySettingsPage />} />
            <Route path="/settings/pinned-assets" element={<PinnedAssetsPage />} />

            <Route path="/keychain/setup/import-private-key" element={<ImportPrivateKeyPage />} />
            <Route path="/keychain/setup/import-test-address" element={<ImportTestAddressPage />} />
            <Route path="/keychain/wallets" element={<WalletsPage />} />
            <Route path="/keychain/wallets/add" element={<AddWalletPage />} />
            <Route path="/keychain/wallets/remove/:walletId" element={<RemoveWalletPage />} />
            <Route path="/keychain/wallets/reset" element={<ResetWalletPage />} />
            <Route path="/keychain/secrets/show-passphrase/:walletId" element={<ShowPassphrasePage />} />
            <Route path="/keychain/secrets/show-private-key/:walletId/:addressPath?" element={<ShowPrivateKeyPage />} />

            <Route path="/addresses" element={<AddressesPage />} />
            <Route path="/addresses/details" element={<AddressDetailsPage />} />
            <Route path="/addresses/history" element={<AddressHistoryPage />} />

            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/utxos/:txHash" element={<UtxoPage />} />
            <Route path="/assets/:asset/balance" element={<AssetBalancePage />} />
            <Route path="/assets/:asset" element={<AssetPage />} />

            <Route path="/transactions/:txHash" element={<TransactionPage />} />

            <Route path="/compose/send/mpma" element={<ComposeMpmaPage />} />
            <Route path="/compose/send/:asset" element={<ComposeSendPage />} />
            <Route path="/compose/sweep/:address?" element={<ComposeSweepPage />} />
            <Route path="/compose/order/btcpay" element={<ComposeOrderBtcPayPage />} />
            <Route path="/compose/order/cancel/:hash?" element={<ComposeOrderCancelPage />} />
            <Route path="/compose/order/:asset?" element={<ComposeOrderPage />} />
            <Route path="/compose/issuance/issue-supply/:asset" element={<ComposeIssueSupplyPage />} />
            <Route path="/compose/issuance/lock-supply/:asset" element={<ComposeLockSupplyPage />} />
            <Route path="/compose/issuance/reset-supply/:asset" element={<ComposeResetSupplyPage />} />
            <Route path="/compose/issuance/transfer-ownership/:asset" element={<ComposeTransferOwnershipPage />} />
            <Route path="/compose/issuance/update-description/:asset" element={<ComposeUpdateDescriptionPage />} />
            <Route path="/compose/issuance/lock-description/:asset" element={<ComposeLockDescriptionPage />} />
            <Route path="/compose/issuance/destroy/:asset" element={<ComposeDestroySupplyPage />} />
            <Route path="/compose/issuance/:asset?" element={<ComposeIssuancePage />} />
            <Route path="/compose/dispenser/close/:asset?" element={<ComposeDispenserClosePage />} />
            <Route path="/compose/dispenser/close-by-hash/:txHash?" element={<ComposeDispenserCloseByHashPage />} />
            <Route path="/compose/dispenser/dispense/:address?" element={<ComposeDispensePage />} />
            <Route path="/compose/dispenser/:asset" element={<ComposeDispenserPage />} />
            <Route path="/compose/fairminter/:asset?" element={<ComposeFairminterPage />} />
            <Route path="/compose/fairmint/:asset?" element={<ComposeFairmintPage />} />
            <Route path="/compose/dividend/:asset" element={<ComposeDividendPage />} />
            <Route path="/compose/broadcast/address-options" element={<ComposeBroadcastAddressOptionsPage />} />
            <Route path="/compose/broadcast" element={<ComposeBroadcastPage />} />
            <Route path="/compose/utxo/attach/:asset" element={<ComposeUtxoAttachPage />} />
            <Route path="/compose/utxo/detach/:txId" element={<ComposeUtxoDetachPage />} />
            <Route path="/compose/utxo/move/:txId" element={<ComposeUtxoMovePage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
