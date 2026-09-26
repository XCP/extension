import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { FullscreenLoading } from '@/components/layout/fullscreen-loading';
import { Layout } from '@/components/layout/layout';
import { AuthRequired } from '@/components/router/auth-required';
import { KeychainLockedOnly } from '@/components/router/keychain-locked-only';
import { KeychainOpenOrNew } from '@/components/router/keychain-open-or-new';
import { NoKeychainOnly } from '@/components/router/no-keychain-only';
import { useWallet } from '@/contexts/wallet-context';
import { lazyPage, preloadPages, retryFailedPages } from '@/entrypoints/popup/lazy-page';
import HomePage from '@/pages/index';
import OnboardingPage from '@/pages/keychain/onboarding';
import UnlockPage from '@/pages/keychain/unlock';
import NotFoundPage from '@/pages/not-found';
import ApproveConnectionPage from '@/pages/requests/connect/approve';
import ApproveMessagePage from '@/pages/requests/message/approve';
import ApprovePsbtPage from '@/pages/requests/psbt/approve';
import ApprovePsbtsPage from '@/pages/requests/psbts/approve';
import ApproveTransactionPage from '@/pages/requests/transaction/approve';
import { analytics, sanitizePath } from '@/platform/fathom';

// Pages a popup can open on stay in the entry chunk: home, unlock, onboarding, not-found, and the
// five /requests/*/approve pages the provider's approval windows open on, so a site's request is
// shown without waiting on a chunk. Everything else is split per route and preloaded when the
// browser is idle after first render.
const ActionsPage = lazyPage(() => import('@/pages/actions'));
const ConsolidatePage = lazyPage(() => import('@/pages/actions/consolidate'));
const ConsolidateStatusPage = lazyPage(() => import('@/pages/actions/consolidate/status'));
const ConsolidateSuccessPage = lazyPage(() => import('@/pages/actions/consolidate/success'));
const SignMessagePage = lazyPage(() => import('@/pages/actions/sign-message'));
const VerifyMessagePage = lazyPage(() => import('@/pages/actions/verify-message'));
const AddressesPage = lazyPage(() => import('@/pages/addresses'));
const AddressDetailsPage = lazyPage(() => import('@/pages/addresses/details'));
const AddressHistoryPage = lazyPage(() => import('@/pages/addresses/history'));
const AssetsPage = lazyPage(() => import('@/pages/assets'));
const AssetPage = lazyPage(() => import('@/pages/assets/[asset]'));
const AssetBalancePage = lazyPage(() => import('@/pages/assets/[asset]/balance'));
const UtxoPage = lazyPage(() => import('@/pages/assets/utxos/[txHash]'));
const ComposeBroadcastPage = lazyPage(() => import('@/pages/compose/broadcast'));
const ComposeBroadcastAddressOptionsPage = lazyPage(() => import('@/pages/compose/broadcast/address-options'));
const ComposeDispenserPage = lazyPage(() => import('@/pages/compose/dispenser'));
const ComposeDispenserClosePage = lazyPage(() => import('@/pages/compose/dispenser/close'));
const ComposeDispenserCloseByHashPage = lazyPage(() => import('@/pages/compose/dispenser/close-by-hash'));
const ComposeDispensePage = lazyPage(() => import('@/pages/compose/dispenser/dispense'));
const ComposeDividendPage = lazyPage(() => import('@/pages/compose/dividend'));
const ComposeFairminterPage = lazyPage(() => import('@/pages/compose/fairminter'));
const ComposeFairmintPage = lazyPage(() => import('@/pages/compose/fairminter/fairmint'));
const ComposeIssuancePage = lazyPage(() => import('@/pages/compose/issuance'));
const ComposeDestroySupplyPage = lazyPage(() => import('@/pages/compose/issuance/destroy-supply'));
const ComposeIssueSupplyPage = lazyPage(() => import('@/pages/compose/issuance/issue-supply'));
const ComposeLockDescriptionPage = lazyPage(() => import('@/pages/compose/issuance/lock-description'));
const ComposeLockSupplyPage = lazyPage(() => import('@/pages/compose/issuance/lock-supply'));
const ComposeResetSupplyPage = lazyPage(() => import('@/pages/compose/issuance/reset-supply'));
const ComposeTransferOwnershipPage = lazyPage(() => import('@/pages/compose/issuance/transfer-ownership'));
const ComposeUpdateDescriptionPage = lazyPage(() => import('@/pages/compose/issuance/update-description'));
const ComposeOrderPage = lazyPage(() => import('@/pages/compose/order'));
const ComposeOrderBtcPayPage = lazyPage(() => import('@/pages/compose/order/btcpay'));
const ComposeOrderCancelPage = lazyPage(() => import('@/pages/compose/order/cancel'));
const ComposePoolDepositPage = lazyPage(() => import('@/pages/compose/pool/deposit'));
const ComposePoolWithdrawPage = lazyPage(() => import('@/pages/compose/pool/withdraw'));
const ComposeSendPage = lazyPage(() => import('@/pages/compose/send'));
const ComposeMpmaPage = lazyPage(() => import('@/pages/compose/send/mpma'));
const ComposeSwapPage = lazyPage(() => import('@/pages/compose/swap'));
const ComposeSweepPage = lazyPage(() => import('@/pages/compose/sweep'));
const ComposeUtxoAttachPage = lazyPage(() => import('@/pages/compose/utxo/attach'));
const ComposeUtxoDetachPage = lazyPage(() => import('@/pages/compose/utxo/detach'));
const ComposeUtxoMovePage = lazyPage(() => import('@/pages/compose/utxo/move'));
const ShowPassphrasePage = lazyPage(() => import('@/pages/keychain/secrets/show-passphrase'));
const ShowPrivateKeyPage = lazyPage(() => import('@/pages/keychain/secrets/show-private-key'));
const CreateMnemonicPage = lazyPage(() => import('@/pages/keychain/setup/create-mnemonic'));
const ImportMnemonicPage = lazyPage(() => import('@/pages/keychain/setup/import-mnemonic'));
const ImportPrivateKeyPage = lazyPage(() => import('@/pages/keychain/setup/import-private-key'));
const ImportTestAddressPage = lazyPage(() => import('@/pages/keychain/setup/import-test-address'));
const WalletsPage = lazyPage(() => import('@/pages/keychain/wallets'));
const AddWalletPage = lazyPage(() => import('@/pages/keychain/wallets/add'));
const ConnectHardwarePage = lazyPage(() => import('@/pages/keychain/wallets/connect-hardware'));
const RemoveWalletPage = lazyPage(() => import('@/pages/keychain/wallets/remove'));
const ResetWalletPage = lazyPage(() => import('@/pages/keychain/wallets/reset'));
const MarketPage = lazyPage(() => import('@/pages/market'));
const BtcPricePage = lazyPage(() => import('@/pages/market/btc'));
const AssetDispensersPage = lazyPage(() => import('@/pages/market/dispensers/[asset]'));
const AssetOrdersPage = lazyPage(() => import('@/pages/market/orders/[baseAsset]/[quoteAsset]'));
const XcpPricePage = lazyPage(() => import('@/pages/market/xcp'));
const PoolPage = lazyPage(() => import('@/pages/pools/[assetA]/[assetB]'));
const PoolPositionPage = lazyPage(() => import('@/pages/pools/[lpAsset]'));
const SettingsPage = lazyPage(() => import('@/pages/settings'));
const AddressTypesPage = lazyPage(() => import('@/pages/settings/address-types'));
const AdvancedSettingsPage = lazyPage(() => import('@/pages/settings/advanced'));
const ConnectedSitesPage = lazyPage(() => import('@/pages/settings/connected-sites'));
const PinnedAssetsPage = lazyPage(() => import('@/pages/settings/pinned-assets'));
const SecuritySettingsPage = lazyPage(() => import('@/pages/settings/security'));
const TransactionPage = lazyPage(() => import('@/pages/transactions/[txHash]'));
const ZeldPage = lazyPage(() => import('@/pages/zeld'));
const ZeldParkPage = lazyPage(() => import('@/pages/zeld/park'));
const ZeldSendPage = lazyPage(() => import('@/pages/zeld/send'));

export default function App() {
  const { keychainExists, keychainLocked, isLoading } = useWallet();
  const location = useLocation();

  useEffect(() => {
    // "/" is a pure redirect stub; tracking it would log a phantom pageview
    // on every popup open and mask the real entry-page distribution
    if (location.pathname !== '/') {
      analytics.page(sanitizePath(location.pathname));
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!isLoading) return preloadPages();
  }, [isLoading]);

  if (isLoading) return <FullscreenLoading />;

  return (
    <ErrorBoundary onReset={retryFailedPages}>
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
          <Route path="/requests/psbts/approve" element={<ApprovePsbtsPage />} />
          <Route path="/requests/message/approve" element={<ApproveMessagePage />} />
        </Route>

        <Route element={<AuthRequired />}>
          <Route element={<Layout showFooter={true} />}>
            <Route path="/index" element={<HomePage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/market/dispensers/:asset" element={<AssetDispensersPage />} />
            <Route path="/market/orders/:baseAsset/:quoteAsset" element={<AssetOrdersPage />} />
            <Route path="/actions" element={<ActionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route element={<Layout />}>
            <Route path="/market/btc" element={<BtcPricePage />} />
            <Route path="/market/xcp" element={<XcpPricePage />} />

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
            <Route path="/keychain/wallets/connect-hardware" element={<ConnectHardwarePage />} />
            <Route path="/keychain/secrets/show-passphrase/:walletId" element={<ShowPassphrasePage />} />
            <Route path="/keychain/secrets/show-private-key/:walletId/:addressPath?" element={<ShowPrivateKeyPage />} />

            <Route path="/addresses" element={<AddressesPage />} />
            <Route path="/addresses/details" element={<AddressDetailsPage />} />
            <Route path="/addresses/history" element={<AddressHistoryPage />} />

            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/utxos/:txHash" element={<UtxoPage />} />
            <Route path="/assets/:asset/balance" element={<AssetBalancePage />} />
            <Route path="/assets/:asset" element={<AssetPage />} />
            <Route path="/pools/:assetA/:assetB" element={<PoolPage />} />
            <Route path="/pools/:lpAsset" element={<PoolPositionPage />} />

            <Route path="/transactions/:txHash" element={<TransactionPage />} />

            <Route path="/zeld" element={<ZeldPage />} />
            <Route path="/zeld/send" element={<ZeldSendPage />} />
            <Route path="/zeld/park" element={<ZeldParkPage />} />

            <Route path="/compose/send/mpma" element={<ComposeMpmaPage />} />
            <Route path="/compose/send/:asset" element={<ComposeSendPage />} />
            <Route path="/compose/sweep/:address?" element={<ComposeSweepPage />} />
            <Route path="/compose/order/btcpay" element={<ComposeOrderBtcPayPage />} />
            <Route path="/compose/order/cancel/:hash?" element={<ComposeOrderCancelPage />} />
            <Route path="/compose/order/:asset?" element={<ComposeOrderPage />} />
            <Route path="/compose/swap/:giveAsset?/:getAsset?" element={<ComposeSwapPage />} />
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
            <Route path="/compose/dispenser/:asset?" element={<ComposeDispenserPage />} />
            <Route path="/compose/fairminter/:asset?" element={<ComposeFairminterPage />} />
            <Route path="/compose/fairmint/:asset?" element={<ComposeFairmintPage />} />
            <Route path="/compose/dividend/:asset" element={<ComposeDividendPage />} />
            <Route path="/compose/broadcast/address-options" element={<ComposeBroadcastAddressOptionsPage />} />
            <Route path="/compose/broadcast" element={<ComposeBroadcastPage />} />
            <Route path="/compose/pool/deposit" element={<ComposePoolDepositPage />} />
            <Route path="/compose/pool/deposit/:assetA/:assetB" element={<ComposePoolDepositPage />} />
            <Route path="/compose/pool/withdraw/:lpAsset" element={<ComposePoolWithdrawPage />} />
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
