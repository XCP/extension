import { useState, useEffect } from 'react';
import { FiGlobe, FiAlertTriangle, FiShieldOff, FiClock, FiChevronDown, FiChevronUp, FiArrowDown } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
import { formatAddress, formatAmount, formatPriceRatio } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { useHeader } from '@/contexts/header-context';
import { useSignTransactionRequest } from '@/hooks/useSignTransactionRequest';
import { getWalletService } from '@/services/walletService';
import type { DecodedTransactionInfo } from '@/hooks/useSignTransactionRequest';

/**
 * Check if an asset is divisible, using enriched messageData when available.
 * Returns true for BTC/XCP, checks asset_info for other assets, undefined if unknown.
 */
function isAssetDivisible(
  asset: string,
  messageData?: Record<string, unknown>,
  assetField?: string,
): boolean | undefined {
  const name = asset.toUpperCase();
  if (name === 'BTC' || name === 'XCP') return true;

  if (messageData && assetField) {
    const assetInfo = messageData[`${assetField}_info`] as Record<string, unknown> | undefined;
    if (assetInfo?.divisible === true) return true;
    if (assetInfo?.divisible === false) return false;
  }
  return undefined; // Unknown
}

/**
 * Normalize a raw quantity for display.
 * Divisible assets divide by 10^8, indivisible show raw with commas.
 */
function normalizeQuantity(quantity: unknown, asset: string, messageData?: Record<string, unknown>, assetField?: string): string {
  if (quantity == null) return '?';
  const val = BigInt(String(quantity));
  const divisible = isAssetDivisible(asset, messageData, assetField);
  if (divisible === true) return fromSatoshis(Number(val));
  return val.toLocaleString();
}

/**
 * Build a human-readable label and description from transaction data.
 * Uses the API counterpartyMessage if available, otherwise falls back
 * to the local unpack from verification.
 */
function getTxActionInfo(decodedInfo: DecodedTransactionInfo): { label: string; description: string } | null {
  // Try API message first
  if (decodedInfo.counterpartyMessage) {
    return {
      label: decodedInfo.counterpartyMessage.messageType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: decodedInfo.counterpartyMessage.description,
    };
  }

  // Fall back to local unpack
  const unpack = decodedInfo.verification?.localUnpack;
  if (!unpack?.success || !unpack.messageType || !unpack.data) return null;

  const data = unpack.data as Record<string, unknown>;
  const label = unpack.messageType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Build description from common fields
  switch (unpack.messageType) {
    case 'enhanced_send':
    case 'send':
      return { label: 'Send', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'order':
      return { label: 'Order', description: `Give ${normalizeQuantity(data.giveQuantity, data.giveAsset as string)} ${data.giveAsset} for ${normalizeQuantity(data.getQuantity, data.getAsset as string)} ${data.getAsset}` };
    case 'cancel':
      return { label: 'Cancel Order', description: `Cancel ${String(data.offerHash).slice(0, 16)}…` };
    case 'issuance':
    case 'subasset_issuance':
    case 'lr_issuance':
    case 'lr_subasset':
      return { label: 'Issuance', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'dispenser':
      return { label: 'Dispenser', description: `${normalizeQuantity(data.escrowQuantity, data.asset as string)} ${data.asset}` };
    case 'dispense':
      return { label: 'Dispense', description: 'Dispense from dispenser' };
    case 'sweep':
      return { label: 'Sweep', description: `Sweep to ${String(data.destination).slice(0, 16)}…` };
    case 'destroy':
      return { label: 'Destroy', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'dividend':
      return { label: 'Dividend', description: `${normalizeQuantity(data.quantityPerUnit, data.dividendAsset as string)} ${data.dividendAsset} per ${data.asset}` };
    case 'attach':
      return { label: 'Attach', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'detach':
      return { label: 'Detach', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    case 'mpma_send':
      return { label: 'Multi-Send', description: `${(data.sends as unknown[])?.length || 0} recipients` };
    case 'fairminter':
      return { label: 'Fairminter', description: `${data.asset}` };
    case 'fairmint':
      return { label: 'Fairmint', description: `${normalizeQuantity(data.quantity, data.asset as string)} ${data.asset}` };
    default:
      return { label, description: unpack.messageType };
  }
}

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
      /** Normalized give quantity (for price ratio formatting) */
      normalizedGive: number;
      /** Normalized get quantity (for price ratio formatting) */
      normalizedGet: number;
      expiration: number;
    }
  | { type: 'fallback'; label: string; description: string }
  | null;

/**
 * Extract structured action data for visual rendering.
 * Returns typed discriminated union per message type.
 */
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

    return {
      type: 'order',
      giveAmount,
      giveAsset: data.giveAsset,
      getAmount,
      getAsset: data.getAsset,
      normalizedGive: Number(data.giveQuantity),
      normalizedGet: Number(data.getQuantity),
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
    isProviderRequest
  } = useSignTransactionRequest(activeAddress?.address);

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [priceFlipped, setPriceFlipped] = useState(false);

  // Parse origin to get domain name
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };

  const domain = request ? getDomain(request.origin) : '';
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Transaction",
    });
  }, [setHeaderProps]);

  const handleSign = async () => {
    if (!request || !decodedInfo || !activeAddress) return;

    setIsSigning(true);
    setError('');

    try {
      const walletService = getWalletService();
      const signedTxHex = await walletService.signTransaction(
        request.rawTxHex,
        activeAddress.address
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full size-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading transaction details…</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError || !request || !decodedInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh p-6">
        <div className="bg-gray-100 rounded-full p-4 mb-4">
          <FiClock className="size-8 text-gray-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Request Expired</p>
        <p className="text-xs text-gray-500 mb-6 text-center max-w-[240px]">
          {loadError || 'This signing request is no longer available.'}
        </p>
        <Button color="gray" onClick={() => window.close()} className="min-w-[160px]">
          Close Window
        </Button>
      </div>
    );
  }

  // No wallet state
  if (!activeAddress || !activeWallet) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <p className="text-gray-500">Please unlock your wallet first</p>
        </div>
      </div>
    );
  }

  const txAction = getTxActionData(decodedInfo);
  const hasHighFee = decodedInfo.fee > 10000000; // > 0.1 BTC fee
  const verificationPassed = decodedInfo.verification?.passed;
  const verificationWarning = decodedInfo.verification?.warning;
  const verificationFailed = verificationPassed === false;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const safetyBlocked = decodedInfo.safety?.blocked ?? false;
  const safetyWarnings = decodedInfo.safety?.warnings ?? [];
  const shouldBlockSigning = safetyBlocked || (isStrictMode && verificationFailed);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {/* Wallet info - shown at top */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {activeWallet.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {activeAddress.address}
              </p>
            </div>
            <div className="ml-3 flex-shrink-0">
              <div className="size-2.5 bg-green-500 rounded-full"></div>
            </div>
          </div>

          {/* Site info - slim bar since user is already connected */}
          <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="flex-shrink-0 inline-flex items-center justify-center size-8 bg-blue-100 rounded-full">
              {faviconError ? (
                <FiGlobe className="size-4 text-blue-600" aria-hidden="true" />
              ) : (
                <img
                  src={faviconUrl}
                  alt={`${domain} favicon`}
                  className="size-4 rounded-sm"
                  onError={() => setFaviconError(true)}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{domain}</p>
              <p className="text-xs text-gray-400 truncate">{request.origin}</p>
            </div>
          </div>

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
                    {formatPriceRatio(
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
                {txAction.expiration > 0 && (
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Expires in {txAction.expiration.toLocaleString()} blocks
                  </p>
                )}
              </div>
            ) : (
              /* Fallback — flat label + description (all other types) */
              <div className="text-center mb-3">
                {txAction?.type === 'fallback' ? (
                  <>
                    <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
                    <p className="text-lg font-bold text-gray-900">{txAction.description}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-1">Total Value</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatAmount({
                        value: fromSatoshis(decodedInfo.totalInputValue, true),
                        minimumFractionDigits: 8,
                        maximumFractionDigits: 8,
                      })} <span className="text-base font-medium text-gray-500">BTC</span>
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="text-center pt-3 border-t border-gray-100 space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-gray-500">Network Fee:</span>
                <span className={`text-xs font-medium ${decodedInfo.fee > 10000000 ? 'text-orange-600' : 'text-gray-900'}`}>
                  {formatAmount({
                    value: fromSatoshis(decodedInfo.fee, true),
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} BTC
                  {decodedInfo.vsize && (
                    <span className="text-gray-400 font-normal ml-1">({Math.ceil(decodedInfo.fee / decodedInfo.vsize)} sat/vB)</span>
                  )}
                </span>
              </div>
              {decodedInfo.counterpartyMessage?.messageData?.fee != null &&
                Number(decodedInfo.counterpartyMessage.messageData.fee) > 0 && (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-gray-500">Protocol Fee:</span>
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
          </div>

          {/* Transaction Details (expandable) */}
          <div className="bg-white rounded-lg shadow-sm">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-6 py-4 flex items-center gap-1.5 text-left cursor-pointer hover:opacity-70 transition-opacity"
            >
              <span className="text-sm font-medium text-gray-700">Transaction Details</span>
              {showDetails ? (
                <FiChevronUp className="size-4 text-gray-400" aria-hidden="true" />
              ) : (
                <FiChevronDown className="size-4 text-gray-400" aria-hidden="true" />
              )}
            </button>

            {showDetails && (
              <div className="px-6 pb-4 space-y-4 border-t border-gray-100 pt-4">
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
                      {decodedInfo.inputs.map((input, idx) => (
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
                        </div>
                      ))}
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
                          {output.address && (
                            <div className="text-gray-500 truncate" title={output.address}>
                              {formatAddress(output.address, true)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
              </div>
            )}
          </div>

          {/* Security Warnings */}
          {safetyWarnings.map((warning, idx) => {
            const isBlock = warning.severity === 'block';
            const isDanger = warning.severity === 'danger';
            const bgColor = isBlock ? 'bg-red-50' : isDanger ? 'bg-red-50' : 'bg-orange-50';
            const borderColor = isBlock ? 'border-red-300' : isDanger ? 'border-red-200' : 'border-orange-200';
            const iconColor = isBlock ? 'text-red-600' : isDanger ? 'text-red-500' : 'text-orange-600';
            const textColor = isBlock ? 'text-red-800' : isDanger ? 'text-red-700' : 'text-orange-800';
            const Icon = isBlock || isDanger ? FiShieldOff : FiAlertTriangle;

            return (
              <div key={idx} className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
                <div className="flex items-start">
                  <Icon className={`size-5 ${iconColor} mt-0.5 mr-2 flex-shrink-0`} aria-hidden="true" />
                  <div className={`text-sm ${textColor}`}>
                    <p className="font-medium">{warning.title}</p>
                    <p className="text-xs mt-1">{warning.message}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Verification Status */}
          <VerificationStatus
            passed={verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

          {/* High Fee Warning */}
          {hasHighFee && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start">
                <FiAlertTriangle className="size-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium">High Network Fee</p>
                  <p className="text-xs mt-1">This transaction has an unusually high fee. Double-check before signing.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
          <Button
            color="gray"
            onClick={handleReject}
            disabled={isSigning}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            color="blue"
            onClick={handleSign}
            disabled={isSigning || shouldBlockSigning}
            fullWidth
          >
            {isSigning ? 'Signing…' : shouldBlockSigning ? 'Blocked' : 'Sign'}
          </Button>
        </div>
      </div>
    </div>
  );
}
