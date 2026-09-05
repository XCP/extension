import { useEffect, useState } from 'react';
import {
  ApprovalAttentionScreen,
  highFeeAttentionItem,
  partitionApprovalItems,
  verificationAttentionItem,
} from '@/components/domain/approval/approval-attention';
import {ApprovalExpired, ApprovalFooter,
  ApprovalLoading, ApprovalNoWallet,ApprovalSiteBar, 
  ApprovalWalletHeader, 
} from '@/components/domain/approval/approval-chrome';
import { ApprovalSummaryCard } from '@/components/domain/approval/approval-summary-card';
import { ApprovalTransactionDetails } from '@/components/domain/approval/approval-transaction-details';
import { buildApprovalWarnings } from '@/components/domain/approval/approval-warnings';
import { BitcoinPaymentCard } from '@/components/domain/approval/bitcoin-payment-card';
import { CounterpartyDetailsCard } from '@/components/domain/approval/counterparty-details-card';
import { MarketplaceReviewCard } from '@/components/domain/approval/marketplace-review-card';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { buildOrderAction } from '@/components/domain/approval/order-card';
import { describePsbtFlexibility } from '@/components/domain/approval/psbt-flexibility';
import { attachDestinationVout, getTxActionInfo } from '@/components/domain/tx/tx-action-info';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
import { Collapsible } from '@/components/ui/collapsible';
import { ErrorAlert } from '@/components/ui/error-alert';
import { type WarningItem, WarningStack } from '@/components/ui/warning-stack';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import { committedOutputIndices, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import { assertPsbtAlkanesSigningSafe, resolvePsbtSigningInputIndices } from '@/core/bitcoin/psbtApprovalDecoder';
import { classifySignedInputAssets } from '@/core/counterparty/inputAssets';
import { shouldBlockSigning } from '@/core/counterparty/unpack/providerVerify';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis, toFiniteNumber } from "@/core/numeric";
import { useFeeRates } from '@/hooks/useFeeRates';
import { usePopupLifecycle } from '@/hooks/usePopupLifecycle';
import { useSignPsbtRequest } from '@/hooks/useSignPsbtRequest';
import { getIdentityMismatchError, getPsbtPermissionError } from '@/platform/provider/requestIdentity';
import { getConnectionService } from '@/services/connectionService';
import { getWalletService } from '@/services/walletService';

function formatSighashType(sighashType: number): string {
  switch (sighashType) {
    case 0x01: return 'ALL';
    case 0x81: return 'ALL | ANYONECANPAY';
    case 0x83: return 'SINGLE | ANYONECANPAY';
    default: return `0x${sighashType.toString(16)}`;
  }
}

export default function ApprovePsbtPage() {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const { setHeaderProps } = useHeader();
  const {
    request,
    decodedInfo,
    isLoading,
    error: loadError,
    handleSuccess,
    handleCancel,
  } = useSignPsbtRequest(activeAddress?.address);
  const { feeRates } = useFeeRates();
  usePopupLifecycle(request?.id, 'sign-psbt');

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [showAttention, setShowAttention] = useState(false);
  const listingContext = request?.marketplaceIntent?.action === 'create_listing'
    ? request.marketplaceIntent.listingContext
    : undefined;
  const isRepriceListing = listingContext?.mode === 'reprice';
  const listingHeader = isRepriceListing ? 'Reprice Listing' : 'Create Listing';

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: request?.signingPurpose === 'bitcoin-payment'
        ? 'Send Bitcoin'
        : request?.marketplaceIntent?.action === 'attach_for_listing'
          ? 'Attach for Listing'
          : request?.marketplaceIntent?.action === 'prepare_asset'
            ? 'Prepare Asset'
          : request?.marketplaceIntent?.action === 'create_listing'
            ? listingHeader
            : request?.marketplaceIntent?.action === 'buy_listings'
              ? 'Buy Collectibles'
              : request?.marketplaceIntent?.action === 'authorize_exact_offer'
                ? 'Authorize Offer'
                : request?.marketplaceIntent?.action === 'accept_exact_offer'
                  ? 'Accept Offer'
                  : 'Sign Transaction',
    });
  }, [listingHeader, request?.marketplaceIntent?.action, request?.signingPurpose, setHeaderProps]);

  useEffect(() => setShowAttention(false), [request?.id]);

  const handleSign = async () => {
    if (!request || !decodedInfo) return;
    if (decodedInfo.safety?.blocked) {
      setError('This transaction is blocked by the wallet safety checks.');
      return;
    }

    const identityError = getIdentityMismatchError(request, activeAddress?.address, activeWallet?.id);
    if (identityError) {
      setError(identityError);
      return;
    }

    setIsSigning(true);
    setError('');

    try {
      const permissionError = await getPsbtPermissionError(
        request,
        activeAddress!.address,
        getConnectionService()
      );
      if (permissionError) throw new Error(permissionError);

      await assertPsbtAlkanesSigningSafe(request.psbtHex, activeAddress!.address, request.signInputs);
      const walletService = getWalletService();
      const signedPsbtHex = await walletService.signPsbt(
        request.psbtHex,
        request.signInputs,
        request.sighashTypes
      );

      await handleSuccess(signedPsbtHex);
      window.close();
    } catch (err) {
      console.error('Failed to sign PSBT:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign PSBT');
      setIsSigning(false);
    }
  };

  const handleReject = async () => {
    setIsSigning(true);
    try {
      await handleCancel();
      window.close();
    } catch (err) {
      console.error('Failed to cancel:', err);
      setIsSigning(false);
    }
  };

  if (isLoading) return <ApprovalLoading />;
  if (loadError || !request || !decodedInfo) return <ApprovalExpired message={loadError} />;
  if (!activeAddress || !activeWallet) return <ApprovalNoWallet />;

  const { psbtDetails, counterpartyMessage, txid, verification, safety, attachedAssets } = decodedInfo;
  const isBitcoinPayment = request.signingPurpose === 'bitcoin-payment';
  const semanticMarketplaceReview = decodedInfo.marketplaceReview?.status === 'proved'
    || decodedInfo.marketplaceReview?.status === 'caution';
  // The same card the raw-transaction screen shows, so an order looks identical whichever signing
  // method the site called.
  const order = buildOrderAction(decodedInfo);
  const txAction = order ? null : getTxActionInfo(decodedInfo, decodedInfo.protocolContext);
  // Warn on the fee *rate* as well as its absolute size: a fee under the absolute ceiling can still
  // be absurd on a small transaction, and that case previously drew no warning at all. It warns
  // rather than blocks — an expensive transaction can be legitimate here, the transaction was built
  // elsewhere so the wallet cannot know the intent, and vsize is only estimated (the unsigned bytes
  // plus a signature allowance per input). Skipped when the PSBT is unfunded, where the fee is not
  // yet knowable because the other party supplies the inputs.
  const estimatedVsize = psbtDetails.rawTxHex
    ? psbtDetails.rawTxHex.length / 2 + psbtDetails.inputs.length * 110
    : undefined;
  const feeRateAbsurd = !psbtDetails.unfunded
    && exceedsSaneFeeRate(psbtDetails.fee, estimatedVsize, feeRates?.fastestFee);
  const hasHighFee = psbtDetails.fee > 10000000 || feeRateAbsurd; // > 0.1 BTC, or an absurd rate

  // Distinguish seller vs buyer in atomic swap PSBTs:
  // - Seller: the REQUEST asks the user to sign with ANYONECANPAY (0x80 bit set)
  // - Buyer: the PSBT contains an ANYONECANPAY input (seller's signature) but
  //   the user is signing with SIGHASH_ALL — they are completing the swap


  const verificationPassed = verification?.passed;
  const verificationWarning = verification?.warning;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const deferredVerificationFailure = verificationPassed === false
    && verification?.repackProved !== true
    && !isStrictMode;
  const safetyBlocked = safety?.blocked ?? false;
  const safetyWarnings = safety?.warnings ?? [];
  // Shared with the raw-transaction approval screen so the two cannot drift.
  const verificationBlocked = shouldBlockSigning({
    safetyBlocked,
    verificationPassed,
    repackProved: verification?.repackProved ?? false,
    strictMode: isStrictMode,
  });
  const requestedAddressSpends = Object.entries(request.signInputs ?? {}).map(
    ([address, indices]) => ({
      address,
      indices,
      value: indices.reduce(
        (sum, index) => sum + (psbtDetails.inputs[index]?.value ?? 0),
        0
      ),
    })
  );
  const requestedInputIndices = resolvePsbtSigningInputIndices(
    psbtDetails.inputs,
    [activeAddress.address],
    request.signInputs && Object.keys(request.signInputs).length > 0
      ? Object.values(request.signInputs).flat()
      : undefined,
  );
  const { withAssets: signedInputsWithAssets, unknownStatus: signedInputsUnknownStatus } =
    classifySignedInputAssets(attachedAssets, requestedInputIndices);
  const displayedText = order
    ? [order.giveAsset, order.getAsset]
    : txAction
      ? [txAction.description, ...txAction.protocol.map((field) => field.value)]
      : [];
  displayedText.push(...signedInputsWithAssets.flatMap((entry) =>
    entry.assets.map((asset) => asset.asset_longname ?? asset.asset)
  ));
  const effectiveSighashes = requestedInputIndices.map(index => ({
    index,
    type: resolvePsbtSighashType(
      request.sighashTypes?.[index],
      psbtDetails.inputs[index]?.sighashType
    ),
  }));
  const anyoneCanPaySighashes = effectiveSighashes.filter(({ type }) => (type & 0x80) !== 0);
  const usesPairedAddress = requestedAddressSpends.some(
    ({ address }) => normalizeAddressForComparison(address)
      !== normalizeAddressForComparison(activeAddress.address)
  );

  // Net effect of this transaction on your wallet — the money-movement summary,
  // computed structurally (replaces the old swap-detection heuristic; works for
  // any tx shape). "Your" addresses are the active address plus any paired signer.
  const myAddresses = [activeAddress.address, ...requestedAddressSpends.map((s) => s.address)];
  // Outputs the signature leaves free are not change coming back to you.
  const committedOutputs = committedOutputIndices(
    effectiveSighashes.map(({ index, type }) => ({ index, sighashType: type })),
    psbtDetails.outputs.length
  );
  const movement = computeMoneyMovement({
    inputs: psbtDetails.inputs,
    outputs: psbtDetails.outputs,
    myAddresses,
    fee: psbtDetails.fee,
    committedOutputs,
  });
  const flexibilityReview = describePsbtFlexibility(
    effectiveSighashes.map(({ index, type }) => ({ index, sighashType: type })),
    movement.atRisk
  );

  const warningItems: WarningItem[] = buildApprovalWarnings({
    displayedText,
    safetyWarnings,
    attachedAssetDestination: semanticMarketplaceReview
      ? null
      : decodedInfo.attachedAssetDestination,
    structureFindings: decodedInfo.structureFindings ?? [],
    signedInputsWithAssets: semanticMarketplaceReview ? [] : signedInputsWithAssets,
    signedInputsUnknownStatus,
  });

  // PSBT-only: a raw transaction is signed SIGHASH_ALL throughout and cannot change after signing.
  if (flexibilityReview && !semanticMarketplaceReview) {
    // ALL|ANYONECANPAY commits every present output; SINGLE|ANYONECANPAY does not. Keep that
    // distinction visible so normal collaborative funding does not look like output redirection.
    warningItems.push({
      key: 'anyonecanpay',
      severity: flexibilityReview.severity,
      title: flexibilityReview.title,
      description: flexibilityReview.description,
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {anyoneCanPaySighashes.map(({ index, type }) => (
            <li key={index}>Input #{index}: {formatSighashType(type)}</li>
          ))}
        </ul>
      ),
    });
  }

  const marketplaceReview = decodedInfo.marketplaceReview;
  const routineAttach = marketplaceReview?.family === 'attach_for_listing'
    || marketplaceReview?.family === 'prepare_asset';
  const marketplaceBlocked = marketplaceReview?.status === 'blocked'
    || marketplaceReview?.status === 'retry';
  // A missing balance answer is uncertainty, not permission to assume an input is clean.
  const assetStatusBlocked = signedInputsUnknownStatus.length > 0;
  // A structure finding blocks: the message provably cannot do what it claims, so signing only
  // spends fees on a broken transaction no honest composer produces.
  const structureBlocked = (decodedInfo.structureFindings ?? []).length > 0;
  const blockSigning = verificationBlocked || marketplaceBlocked || assetStatusBlocked || structureBlocked;
  const { attention } = partitionApprovalItems(warningItems);
  const genericAttention = movement.atRisk > 0
    ? attention.filter(item => item.key !== 'anyonecanpay')
    : attention;
  // Attach quotes are intrinsically block-dependent and already disclosed in the action card. A
  // second click on a proved listing or inventory attach would turn that routine protocol fact
  // into warning wallpaper.
  const marketplaceRequiresAttention = marketplaceReview?.status === 'caution'
    && !routineAttach;
  // Plain-language consequences per family: what signing does, and how to undo it. The analyzer's
  // notices state the same facts in protocol terms; this screen is where a person decides.
  // create_listing is absent here on purpose: a fully proved listing is 'proved', never
  // 'caution', so its consequences live in the review facts on the one screen.
  const marketplaceAttention: WarningItem[] = !marketplaceRequiresAttention
    ? []
    : marketplaceReview.family === 'authorize_exact_offer'
      ? [{
          key: 'marketplace-offer',
          severity: 'warning' as const,
          title: 'The seller can complete this sale at any time',
          description:
            'Signing lets the seller finish this exact trade without asking you again — the ' +
            'first confirmed spend of your funding wins. To withdraw the offer, spend your ' +
            'funding UTXO.',
        }]
      : marketplaceReview.notices.map((notice, index) => ({
          key: `marketplace-${index}`,
          severity: notice.severity,
          title: 'This authorization remains usable after signing',
          description: notice.message,
        }));
  const approvalAttentionItems: WarningItem[] = [
    ...marketplaceAttention,
    ...genericAttention,
    ...(deferredVerificationFailure ? [verificationAttentionItem(verificationWarning)] : []),
    // A proved marketplace review has already named the flexible amount and its rules, so the
    // generic redirection alarm would restate it in scarier words.
    ...(movement.atRisk > 0 && !semanticMarketplaceReview ? [{
      key: 'btc-at-risk',
      severity: 'danger' as const,
      title: `${formatAmount({
        value: fromSatoshis(movement.atRisk, true),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC is not guaranteed back`,
      description:
        'The requested signature does not commit every output returning this amount. Whoever completes the transaction may redirect it.',
    }] : []),
    ...(hasHighFee ? [highFeeAttentionItem(psbtDetails.fee, estimatedVsize)] : []),
  ];
  const requiresAttention = !blockSigning && approvalAttentionItems.length > 0;
  const attentionTitle = marketplaceRequiresAttention
    ? marketplaceReview.family === 'authorize_exact_offer'
      ? 'Before you authorize'
      : 'Review before signing'
    : approvalAttentionItems.some(item => item.severity === 'danger')
      ? 'Review transaction risk'
      : 'Review before signing';
  const confirmLabel = marketplaceReview?.family === 'create_listing'
    ? isRepriceListing ? 'Authorize reprice' : 'Authorize listing'
    : marketplaceReview?.family === 'authorize_exact_offer'
      ? 'Authorize offer'
      : marketplaceReview?.family === 'prepare_asset'
        ? 'Prepare asset'
      : counterpartyMessage?.messageType === 'destroy'
        ? 'Destroy supply'
        : 'Confirm and sign';
  // The payment card is the one voice for a failed plain-Bitcoin payment, exactly as the
  // marketplace card is for its gate: the generic stack stays silent and the card carries the
  // analyzer's reason.
  const bitcoinPaymentGate = isBitcoinPayment
    ? safetyWarnings.find(warning => warning.code === 'bitcoin_payment_gate')
    : undefined;

  // The marketplace review is the screen's one voice: proved/caution states take over the
  // headline and merge their facts into the Counterparty details instead of stacking a second
  // presentation on top of the generic one. Proved attach families keep the standard attach
  // headline because the semantic title adds nothing over "Attach 1 RAREPEPE".
  const marketplaceHeadline = semanticMarketplaceReview
    && !routineAttach
    ? { label: '', description: marketplaceReview!.title }
    : null;
  const marketplaceFacts = semanticMarketplaceReview ? marketplaceReview!.facts : [];
  const protocolFields = txAction && 'protocol' in txAction ? txAction.protocol : [];
  const detailFields = [
    ...marketplaceFacts,
    // The quoted marketplace XCP fee supersedes the generic XCP-fee row on an attach.
    ...protocolFields.filter(field =>
      !(field.label === 'XCP fee' && marketplaceFacts.some(fact => fact.label === 'Quoted XCP fee'))),
  ];
  // An unfunded marketplace authorization moves nothing yet; the facts (or the gating card)
  // state exactly where things stand, so the movement block would only resolve to an alarming
  // "Couldn't be determined" beside them.
  const hideMovement = Boolean(marketplaceReview && psbtDetails.unfunded);

  const handleApprovalAction = () => {
    if (requiresAttention) {
      setShowAttention(true);
      return;
    }
    void handleSign();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <ApprovalWalletHeader walletName={activeWallet.name} address={activeAddress.address} />

          {usesPairedAddress && (
            <Collapsible variant="card" title={`Signing addresses (${requestedAddressSpends.length})`}>
              <p className="text-xs text-gray-500">
                Only the inputs shown below will be signed with their matching addresses in this wallet.
              </p>
              <div className="space-y-2">
                {requestedAddressSpends.map(({ address, indices, value }) => (
                  <div key={address} className="flex items-start justify-between gap-3 text-xs">
                    <div>
                      <p className="font-mono text-gray-700">{formatAddress(address, true)}</p>
                      <p className="text-gray-500">Inputs {indices.map(index => `#${index}`).join(', ')}</p>
                    </div>
                    <p className="font-medium text-gray-700">{value.toLocaleString()} sats</p>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          <ApprovalSiteBar origin={request.origin} />

          {error && <ErrorAlert message={error} />}

          {/* Transaction action & fee. Skipped when there is nothing to put in it — a gated
              unfunded authorization with no decodable action would render an empty card. */}
          {(order || marketplaceHeadline || txAction || !hideMovement) && (
          <ApprovalSummaryCard
            unfunded={psbtDetails.unfunded}
            txAction={marketplaceHeadline ?? txAction}
            order={order}
            movement={movement}
            flexibility={semanticMarketplaceReview ? undefined : flexibilityReview?.kind}
            hasHighFee={hasHighFee}
            deferCautions={requiresAttention}
            hideMovement={hideMovement}
            protocolFeeXcp={counterpartyMessage?.messageData?.fee != null
              ? toFiniteNumber(counterpartyMessage.messageData.fee) ?? null
              : null}
          />
          )}

          {/* Colored verdict cards sit under the plain summary, matching the app-wide order of
              summary first, callouts second. */}
          {isBitcoinPayment && request.bitcoinPaymentIntent && (
            <BitcoinPaymentCard
              intent={request.bitcoinPaymentIntent}
              proof={decodedInfo.bitcoinPaymentProof}
              failure={decodedInfo.bitcoinPaymentBlockers}
            />
          )}

          {/* A gating failure gets exactly one voice: the review card alone carries the
              blockers, and the generic warning stack below stays silent for it. Proved and
              caution reviews render through the standard headline and details instead. */}
          {marketplaceBlocked && marketplaceReview && (
            <MarketplaceReviewCard review={marketplaceReview} />
          )}

          <CounterpartyDetailsCard
            fields={detailFields}
            recipients={decodedInfo.mpmaRecipients}
          />
          <ApprovalTransactionDetails
            txid={txid}
            inputs={psbtDetails.inputs}
            outputs={psbtDetails.outputs}
            attachedAssets={attachedAssets}
            verification={verification}
            attachVout={attachDestinationVout(decodedInfo)}
          />

          {/* A blocked request explains itself. The marketplace and payment gates speak through
              their own cards above, so their echo warnings stay out of the stack. */}
          {blockSigning && !marketplaceBlocked && !bitcoinPaymentGate && (
            <WarningStack items={attention} />
          )}

          {/* Verification Status (compact badge when passed) */}
          {!isBitcoinPayment && !decodedInfo.marketplaceReview && (
            <VerificationStatus
              passed={deferredVerificationFailure
                ? undefined
                : verification?.repackProved ? true : verificationPassed}
              warning={verificationWarning}
              isStrict={isStrictMode}
            />
          )}

        </div>
      </div>

      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleApprovalAction}
        busy={isSigning}
        blocked={blockSigning}
        isHardware={activeWallet.type === 'hardware'}
        signLabel={requiresAttention
          ? 'Review'
          : marketplaceReview?.family === 'create_listing'
            ? confirmLabel
            : marketplaceReview?.family === 'prepare_asset'
              ? confirmLabel
              : 'Sign'}
      />

      {showAttention && requiresAttention && (
        <ApprovalAttentionScreen
          title={attentionTitle}
          description="Confirm the authorization details below before the wallet adds your signature."
          items={approvalAttentionItems}
          confirmLabel={confirmLabel}
          busy={isSigning}
          isHardware={activeWallet.type === 'hardware'}
          onBack={() => setShowAttention(false)}
          onConfirm={() => void handleSign()}
        />
      )}
    </div>
  );
}
