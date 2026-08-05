import { useEffect, useState } from 'react';
import {ApprovalExpired, ApprovalFooter,
  ApprovalLoading, ApprovalNoWallet,ApprovalSiteBar, 
  ApprovalWalletHeader, 
} from '@/components/domain/approval/approval-chrome';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { MoneyMovementView } from '@/components/domain/approval/money-movement-view';
import { getTxActionInfo, isAssetDivisible, normalizeQuantity } from '@/components/domain/tx/tx-action-info';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
import { FiArrowDown } from '@/components/icons';
import { Collapsible } from '@/components/ui/collapsible';
import { ErrorAlert } from '@/components/ui/error-alert';
import { type WarningItem, WarningStack } from '@/components/ui/warning-stack';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import { classifySignedInputAssets } from '@/core/counterparty/inputAssets';
import { formatAddress, formatAmount, formatPriceRatio } from '@/core/format';
import { fromSatoshis } from '@/core/numeric';
import { usePopupLifecycle } from '@/hooks/usePopupLifecycle';
import type { DecodedTransactionInfo } from '@/hooks/useSignTransactionRequest';
import { useSignTransactionRequest } from '@/hooks/useSignTransactionRequest';
import { getConnectionRevokedError, getIdentityMismatchError } from '@/platform/provider/requestIdentity';
import { getConnectionService } from '@/services/connectionService';
import { getWalletService } from '@/services/walletService';

/**
 * Structured data for per-type visual renderers.
 * Currently only 'order' has a visual card; all other types fall back to flat text.
 */
type TxActionData =
  | {
      type: 'order';
      giveAmount: string;
      giveAsset: string;
      getAmount: string;
      getAsset: string;
      /**
       * Give/get quantities in display units, for the price ratio — or null when divisibility
       * could not be established for both assets, in which case no ratio is shown. A ratio of raw
       * base units is wrong by 1e8 for a mixed-divisibility pair, and silently right for a
       * matched one, which is what hid it.
       */
      normalizedGive: number | null;
      normalizedGet: number | null;
      expiration: number;
    }
  | { type: 'fallback'; label: string; description: string }
  | null;

/**
 * Extract structured action data for visual rendering.
 * Returns typed discriminated union per message type.
 */
/**
 * Split a trailing address off a headline so the two can be set differently.
 *
 * Deliberately anchored to the end and to address shapes: only the destination a send, sweep or
 * UTXO move ends with should be pulled out. A description with no trailing address comes back
 * whole, so every other message type renders exactly as before.
 */
function splitTrailingAddress(description: string): { sentence: string; address?: string } {
  const match = description.match(
    /^(.*?)\s((?:bc1|tb1)[023456789acdefghjklmnpqrstuvwxyz]{20,}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/
  );
  return match ? { sentence: match[1]!, address: match[2]! } : { sentence: description };
}

function getTxActionData(decodedInfo: DecodedTransactionInfo): TxActionData {
  // --- Try API message first (for 'order') ---
  if (decodedInfo.counterpartyMessage) {
    const { messageType, messageData } = decodedInfo.counterpartyMessage;

    if (messageType === 'order') {
      const giveAssetRaw = String(messageData.give_asset ?? '');
      const getAssetRaw = String(messageData.get_asset ?? '');
      const giveAmount = normalizeQuantity(messageData.give_quantity, giveAssetRaw, messageData, 'give_asset');
      const getAmount = normalizeQuantity(messageData.get_quantity, getAssetRaw, messageData, 'get_asset');

      // Prefer asset_longname (subasset display name) over numeric ID
      const giveInfo = messageData.give_asset_info as { asset_longname?: string | null } | undefined;
      const getInfo = messageData.get_asset_info as { asset_longname?: string | null } | undefined;
      const giveAsset = giveInfo?.asset_longname || giveAssetRaw;
      const getAsset = getInfo?.asset_longname || getAssetRaw;

      const rawGive = Number(messageData.give_quantity);
      const rawGet = Number(messageData.get_quantity);
      const giveDivisor = isAssetDivisible(giveAssetRaw, messageData, 'give_asset') ? 1e8 : 1;
      const getDivisor = isAssetDivisible(getAssetRaw, messageData, 'get_asset') ? 1e8 : 1;

      return {
        type: 'order',
        giveAmount,
        giveAsset,
        getAmount,
        getAsset,
        normalizedGive: rawGive / giveDivisor,
        normalizedGet: rawGet / getDivisor,
        expiration: Number(messageData.expiration ?? 0),
      };
    }
  }

  // --- Try local unpack (for 'order') ---
  const unpack = decodedInfo.verification?.localUnpack;
  if (unpack?.success && unpack.messageType === 'order' && unpack.data) {
    const data = unpack.data as {
      giveAsset: string;
      giveQuantity: bigint;
      getAsset: string;
      getQuantity: bigint;
      expiration: number;
    };

    const giveAmount = normalizeQuantity(data.giveQuantity, data.giveAsset);
    const getAmount = normalizeQuantity(data.getQuantity, data.getAsset);

    /** 1e8 for a known-divisible asset, 1 for a known-indivisible one, null when unknown. */
    const divisorFor = (asset: string): number | null => {
      const divisible = isAssetDivisible(asset);
      return divisible === undefined ? null : divisible ? 1e8 : 1;
    };
    const localGiveDivisor = divisorFor(data.giveAsset);
    const localGetDivisor = divisorFor(data.getAsset);

    return {
      type: 'order',
      giveAmount,
      giveAsset: data.giveAsset,
      getAmount,
      getAsset: data.getAsset,
      // Divisibility is not available on this path — the local unpack carries asset names, not
      // asset_info — so it can only be established for BTC and XCP. Rather than dividing by a
      // guess, the ratio is withheld unless both sides are known.
      normalizedGive: localGiveDivisor === null
        ? null
        : Number(data.giveQuantity) / localGiveDivisor,
      normalizedGet: localGetDivisor === null
        ? null
        : Number(data.getQuantity) / localGetDivisor,
      expiration: data.expiration,
    };
  }

  // --- Fallback: use existing flat text ---
  const info = getTxActionInfo(decodedInfo);
  if (info) {
    return { type: 'fallback', label: info.label, description: info.description };
  }
  return null;
}

export default function ApproveTransactionPage() {
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
  } = useSignTransactionRequest(activeAddress?.address);
  usePopupLifecycle(request?.id, 'sign-transaction');

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [priceFlipped, setPriceFlipped] = useState(false);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Transaction",
    });
  }, [setHeaderProps]);

  const handleSign = async () => {
    if (!request || !decodedInfo || !activeAddress) return;

    const identityError = getIdentityMismatchError(request, activeAddress.address, activeWallet?.id);
    if (identityError) {
      setError(identityError);
      return;
    }

    // A request stays open for up to ten minutes, so the site's grant is rechecked here rather
    // than trusted from when the request was created — revoking a site in Settings must take
    // effect on an approval already on screen. The PSBT path has always done this.
    const revokedError = await getConnectionRevokedError(request, getConnectionService());
    if (revokedError) {
      setError(revokedError);
      return;
    }

    setIsSigning(true);
    setError('');

    try {
      const walletService = getWalletService();
      const signedTxHex = await walletService.signTransaction(
        request.rawTxHex,
        request.address
      );

      await handleSuccess(signedTxHex);
      window.close();
    } catch (err) {
      console.error('Failed to sign transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign transaction');
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

  const txAction = getTxActionData(decodedInfo);
  // An absolute ceiling alone lets a fee just under it drain a small transaction, so the rate is
  // checked too — that case previously drew no warning at all. It warns rather than blocks: the
  // transaction was built elsewhere, so an expensive one can be legitimate and the wallet cannot
  // know the intent. The compose path blocks the same condition because it built the transaction
  // itself, and there an absurd fee means the response misbehaved.
  const feeRateAbsurd = exceedsSaneFeeRate(decodedInfo.fee, decodedInfo.vsize);
  const hasHighFee = decodedInfo.fee > 10000000 || feeRateAbsurd; // > 0.1 BTC, or an absurd rate
  const verificationPassed = decodedInfo.verification?.passed;
  const verificationRepackProved = decodedInfo.verification?.repackProved ?? false;
  const verificationWarning = decodedInfo.verification?.warning;
  // A disagreement with the decode API is only grounds to stop when we cannot vouch for the bytes
  // ourselves. Once the rebuild has reproduced the payload exactly, our reading of it is provably
  // complete, so an API that reports something different is the one that is wrong — and under
  // ADR-019 that endpoint is untrusted and user-configurable, which means letting it veto a
  // signature hands an untrusted party a way to block transactions that are demonstrably fine.
  // This is not hypothetical: until the JSON boundary was fixed, every quantity above 2^53 was
  // rounded on arrival and blocked signing over a disagreement our own parsing had manufactured.
  const verificationFailed = verificationPassed === false && !verificationRepackProved;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const safetyBlocked = decodedInfo.safety?.blocked ?? false;
  const safetyWarnings = decodedInfo.safety?.warnings ?? [];
  const shouldBlockSigning = safetyBlocked || (isStrictMode && verificationFailed);

  // Attached-asset status per input. Inputs are dense, so array position is the index.
  const attachedByInput = new Map(decodedInfo.attachedAssets.map(entry => [entry.inputIndex, entry]));
  // The wallet signs inputs it controls, i.e. those belonging to the active address.
  const signerInputIndices = decodedInfo.inputs
    .map((input, index) => ({ input, index }))
    .filter(({ input }) => input.address &&
      normalizeAddressForComparison(input.address) === normalizeAddressForComparison(activeAddress.address))
    .map(({ index }) => index);
  const { withAssets: signedInputsWithAssets, unknownStatus: signedInputsUnknownStatus } =
    classifySignedInputAssets(decodedInfo.attachedAssets, signerInputIndices);

  // Net effect of this transaction on your wallet — the anti-blind-signing summary.
  const movement = computeMoneyMovement({
    inputs: decodedInfo.inputs,
    outputs: decodedInfo.outputs,
    myAddresses: [activeAddress.address],
    fee: decodedInfo.fee,
    // A raw transaction is signed SIGHASH_ALL throughout, so every output is committed.
    committedOutputs: null,
  });

  const warningItems: WarningItem[] = safetyWarnings.map((warning, idx) => ({
    key: `safety-${idx}`,
    severity: warning.severity === 'block' ? 'danger' : warning.severity,
    title: warning.title,
    description: warning.message,
  }));
  // The message's own references to this transaction, where they do not resolve against it. A
  // warning rather than a block: core rejects such a transaction, so it is ineffective rather than
  // dangerous — but the screen cannot describe what it claims to do.
  for (const [idx, finding] of (decodedInfo.structureFindings ?? []).entries()) {
    warningItems.push({
      key: `structure-${idx}`,
      severity: 'warning',
      title: finding.title,
      description: finding.message,
    });
  }

  if (signedInputsWithAssets.length > 0) {
    warningItems.push({
      key: 'attached-assets',
      severity: 'warning',
      title: 'Spends UTXOs holding Counterparty assets',
      description: 'Inputs you are signing carry attached assets. Signing moves them, not just BTC.',
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsWithAssets.flatMap(entry =>
            entry.assets.map(asset => (
              <li key={`${entry.inputIndex}-${asset.asset}`}>
                Input #{entry.inputIndex}: {asset.quantity_normalized} {asset.asset_longname ?? asset.asset}
              </li>
            ))
          )}
        </ul>
      ),
    });
  }
  if (signedInputsUnknownStatus.length > 0) {
    warningItems.push({
      key: 'unknown-status',
      severity: 'warning',
      title: "Couldn't verify asset status",
      description: `The balance lookup failed for ${signedInputsUnknownStatus.length === 1 ? 'an input' : 'some inputs'} you are signing, so attached Counterparty assets can't be confirmed either way. Proceed only if you trust this transaction.`,
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsUnknownStatus.map(entry => (
            <li key={entry.inputIndex}>Input #{entry.inputIndex}: status unknown</li>
          ))}
        </ul>
      ),
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <ApprovalWalletHeader walletName={activeWallet.name} address={activeAddress.address} />

          <ApprovalSiteBar origin={request.origin} />

          {error && <ErrorAlert message={error} />}

          {/* Transaction action & fee */}
          <div className="bg-white rounded-lg shadow-sm p-5">
            {txAction?.type === 'order' ? (
              /* Order — Uniswap-style swap card */
              <div className="mb-3">
                {/* Give box */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">You give</p>
                  <p className="text-xl font-bold text-gray-900">
                    {txAction.giveAmount}{' '}
                    <span className="text-base font-normal text-gray-500">{txAction.giveAsset}</span>
                  </p>
                </div>

                {/* Arrow + price between boxes */}
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="bg-white border border-gray-200 rounded-full p-1">
                    <FiArrowDown className="size-3.5 text-gray-400" aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPriceFlipped(f => !f)}
                    className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                    title="Click to flip price"
                  >
                    {txAction.normalizedGive === null || txAction.normalizedGet === null
                      ? 'Price unavailable'
                      : formatPriceRatio(
                          txAction.normalizedGive,
                          txAction.normalizedGet,
                          txAction.giveAsset,
                          txAction.getAsset,
                          priceFlipped,
                        )}
                  </button>
                </div>

                {/* Get box */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">You receive</p>
                  <p className="text-xl font-bold text-gray-900">
                    {txAction.getAmount}{' '}
                    <span className="text-base font-normal text-gray-500">{txAction.getAsset}</span>
                  </p>
                </div>

                {/* Expiration */}
                <p className="text-xs text-gray-400 text-center mt-2">
                  {txAction.expiration === 0
                    ? 'Never expires'
                    : `Expires in ${txAction.expiration.toLocaleString()} blocks`}
                </p>
              </div>
            ) : txAction?.type === 'fallback' ? (
              /* Counterparty action — flat label + description */
              <div className="text-center mb-3">
                <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
                {(() => {
                  // A send or sweep headline ends in an address: a long, unbreakable token that
                  // set in 18px bold ran to three lines and dominated the card, shouting the
                  // least readable part of the sentence. It is split off and set like the
                  // outputs list — smaller, monospace, not bold — so the sentence carries the
                  // weight and the address stays scannable.
                  //
                  // It is still shown whole and allowed to wrap. Truncating here would repeat
                  // the lookalike-grinding problem the outputs list deliberately avoids, and for
                  // an enhanced send the destination lives in the payload, so this headline is
                  // the only place it appears at all.
                  const { sentence, address } = splitTrailingAddress(txAction.description);
                  return (
                    <>
                      <p className="text-lg font-bold text-gray-900 break-words">{sentence}</p>
                      {address && (
                        <p className="mt-1 text-sm font-medium font-mono text-gray-700 break-all">
                          {address}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : null}
            <MoneyMovementView movement={movement} hasHighFee={hasHighFee} showHeadline={!txAction} />
            {decodedInfo.counterpartyMessage?.messageData?.fee != null &&
              Number(decodedInfo.counterpartyMessage.messageData.fee) > 0 && (
              <div className="mt-1.5 flex items-center justify-center gap-2 text-xs">
                <span className="text-gray-500">Protocol Fee:</span>
                <span className="text-sm font-medium text-purple-700">
                  {formatAmount({
                    value: fromSatoshis(Number(decodedInfo.counterpartyMessage.messageData.fee), true),
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} XCP
                </span>
              </div>
            )}
          </div>

          {/* Transaction Details (expandable) */}
          <Collapsible variant="card" title="Transaction Details">
                  {/* TX Hash */}
                  {decodedInfo.txid && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">TX Hash</h4>
                      <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 break-all">
                        {decodedInfo.txid}
                      </div>
                    </div>
                  )}

                  {/* Inputs List */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Inputs ({decodedInfo.inputs.length})</h4>
                    <div className="space-y-2">
                      {decodedInfo.inputs.map((input, idx) => {
                        const inputAssets = attachedByInput.get(idx);
                        return (
                        <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                          <span className="text-gray-600">#{idx}</span>
                          {input.address && (
                            <div className="text-gray-500 truncate" title={input.address}>
                              {formatAddress(input.address, true)}
                            </div>
                          )}
                          <div className="text-gray-400 truncate" title={input.txid}>
                            {input.txid.slice(0, 8)}...:{input.vout}
                          </div>
                          {inputAssets?.assets.map((asset) => (
                            <div key={asset.asset} className="mt-1 flex justify-between text-purple-700">
                              <span className="truncate" title={asset.asset_longname ?? asset.asset}>
                                {asset.asset_longname ?? asset.asset}
                              </span>
                              <span className="font-medium flex-shrink-0 ml-2">{asset.quantity_normalized}</span>
                            </div>
                          ))}
                          {inputAssets?.lookupFailed && (
                            <div className="mt-1 text-amber-600">Asset status unavailable</div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Outputs List */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Outputs ({decodedInfo.outputs.length})</h4>
                    <div className="space-y-2">
                      {decodedInfo.outputs.map((output, idx) => (
                        <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                          <div className="flex justify-between">
                            <span className={`${output.type === 'op_return' ? 'text-purple-600' : 'text-gray-600'}`}>
                              {output.type === 'op_return' ? 'OP_RETURN' : output.type.toUpperCase()}
                            </span>
                            <span className="text-gray-900 font-medium">{formatAmount({ value: fromSatoshis(output.value, true), minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC</span>
                          </div>
                          {/* Shown in full and allowed to wrap. This is where the user checks
                              where a site's transaction sends money, and 6 leading + 6 trailing
                              characters is grindable for a lookalike - the prefix of a bech32
                              address is fixed, so only a handful of characters are actually
                              being compared. */}
                          {output.address && (
                            <div className="text-gray-500 break-all font-mono" title={output.address}>
                              {formatAddress(output.address, false)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recipients of a multi-destination send. These live in the Counterparty
                      payload rather than in BTC outputs, so the outputs list above cannot show
                      them and this is the only place they appear. Addresses are shown in full for
                      the same reason as the outputs above. */}
                  {decodedInfo.mpmaRecipients.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                        Recipients ({decodedInfo.mpmaRecipients.length})
                      </h4>
                      <div className="space-y-2">
                        {decodedInfo.mpmaRecipients.map((recipient, idx) => (
                          <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                            <div className="flex justify-between gap-2">
                              <span className="text-gray-600 truncate">{recipient.asset}</span>
                              <span className="text-gray-900 font-medium flex-shrink-0">
                                {recipient.quantity}
                              </span>
                            </div>
                            <div className="text-gray-500 break-all font-mono" title={recipient.address}>
                              {recipient.address}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* The outcome of the local checks, in plain words and only for someone who
                      opened this panel. It stays off the main screen because a person cannot act
                      on it and a permanent reassurance there would only teach them to stop
                      reading. */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Checks</h4>
                    <div className="bg-gray-50 p-2 rounded text-xs text-gray-600">
                      {verificationRepackProved
                        ? 'We rebuilt this transaction from scratch and got exactly the same thing you are signing, so the summary above leaves nothing out.'
                        : 'We could not automatically re-create this kind of transaction to double-check it. That is not a sign of a problem — check the details above yourself.'}
                    </div>
                  </div>
          </Collapsible>

          {/* Warnings, rendered in a fixed severity order (danger → success) */}
          <WarningStack items={warningItems} />

          {/* Verification Status (compact badge when passed) */}
          <VerificationStatus
            passed={verificationRepackProved ? true : verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

        </div>
      </div>

      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleSign}
        busy={isSigning}
        blocked={shouldBlockSigning}
        isHardware={activeWallet.type === 'hardware'}
      />
    </div>
  );
}
