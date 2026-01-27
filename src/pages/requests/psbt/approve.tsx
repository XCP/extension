import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiGlobe, FiAlertTriangle, FiX, FiChevronDown, FiChevronUp } from '@/components/icons';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { VerificationStatus } from '@/components/verification-status';
import { formatAddress, formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { useSignPsbtRequest } from '@/hooks/useSignPsbtRequest';
import { getWalletService } from '@/services/walletService';

export default function ApprovePsbtPage() {
  const navigate = useNavigate();
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const {
    request,
    decodedInfo,
    isLoading,
    error: loadError,
    handleSuccess,
    handleCancel,
    isProviderRequest
  } = useSignPsbtRequest();

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);

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

  const handleSign = async () => {
    if (!request || !decodedInfo) return;

    setIsSigning(true);
    setError('');

    try {
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
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <FiAlertTriangle className="size-12 text-red-500 mx-auto mb-4" aria-hidden="true" />
          <p className="text-red-600 mb-4">{loadError || 'Request not found'}</p>
          <Button color="gray" onClick={() => window.close()}>Close</Button>
        </div>
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

  const { psbtDetails, counterpartyMessage, txid, verification } = decodedInfo;
  const hasHighFee = psbtDetails.fee > 10000000; // > 0.1 BTC fee
  const hasAnyoneCanPay = request.sighashTypes?.some(t => (t & 0x80) !== 0);
  const verificationPassed = verification?.passed;
  const verificationWarning = verification?.warning;
  const verificationFailed = verificationPassed === false;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const shouldBlockSigning = isStrictMode && verificationFailed;

  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Sign Transaction</h1>
          <button
            onClick={handleReject}
            className="p-1 hover:bg-gray-100 rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            aria-label="Close"
            disabled={isSigning}
          >
            <FiX className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {/* Site info */}
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center size-16 bg-blue-100 rounded-full mb-4">
              <FiGlobe className="size-8 text-blue-600" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{domain}</h2>
            <p className="text-sm text-gray-500 break-all">{request.origin}</p>
            <p className="text-sm text-gray-600 mt-2">wants to sign a transaction</p>
          </div>

          {error && <ErrorAlert message={error} />}

          {/* Transaction Summary */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-medium text-gray-700 mb-4">Transaction Summary</h2>

            <div className="space-y-3">
              {/* Inputs */}
              <div className="flex justify-between items-start">
                <span className="text-sm text-gray-600">Inputs:</span>
                <span className="text-sm text-gray-900 text-right">
                  {psbtDetails.inputs.length} input{psbtDetails.inputs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Total Input Value */}
              {psbtDetails.totalInputValue > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-gray-600">Total Input:</span>
                  <span className="text-sm text-gray-900 text-right">
                    {formatAmount({
                      value: fromSatoshis(psbtDetails.totalInputValue, true),
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} BTC
                  </span>
                </div>
              )}

              {/* Outputs */}
              <div className="flex justify-between items-start">
                <span className="text-sm text-gray-600">Outputs:</span>
                <span className="text-sm text-gray-900 text-right">
                  {psbtDetails.outputs.length} output{psbtDetails.outputs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Fee */}
              {psbtDetails.fee > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-gray-600">Network Fee:</span>
                  <span className={`text-sm text-right ${psbtDetails.fee > 10000000 ? 'text-orange-600 font-medium' : 'text-gray-900'}`}>
                    {formatAmount({
                      value: fromSatoshis(psbtDetails.fee, true),
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} BTC
                    <span className="text-gray-500 ml-1">({psbtDetails.fee.toLocaleString()} sats)</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Counterparty Message (if detected) */}
          {counterpartyMessage && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mr-2">
                  {counterpartyMessage.messageType}
                </span>
              </div>
              <p className="text-sm text-purple-800 mt-2">
                {counterpartyMessage.description}
              </p>
            </div>
          )}

          {/* Verification Status */}
          <VerificationStatus
            passed={verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

          {/* Expandable Details */}
          <div className="bg-white rounded-lg shadow-sm">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-6 py-4 flex items-center justify-between text-left"
            >
              <span className="text-sm font-medium text-gray-700">Transaction Details</span>
              {showDetails ? (
                <FiChevronUp className="size-5 text-gray-400" aria-hidden="true" />
              ) : (
                <FiChevronDown className="size-5 text-gray-400" aria-hidden="true" />
              )}
            </button>

            {showDetails && (
              <div className="px-6 pb-4 space-y-4">
                {/* Inputs List */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Inputs ({psbtDetails.inputs.length})</h4>
                  <div className="space-y-2">
                    {psbtDetails.inputs.map((input, idx) => (
                      <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">#{idx}</span>
                          {input.value !== undefined && (
                            <span className="text-gray-900">{fromSatoshis(input.value, true)} BTC</span>
                          )}
                        </div>
                        <div className="text-gray-500 truncate" title={input.txid}>
                          {input.txid.slice(0, 8)}...:{input.vout}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Outputs List */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Outputs ({psbtDetails.outputs.length})</h4>
                  <div className="space-y-2">
                    {psbtDetails.outputs.map((output, idx) => (
                      <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                        <div className="flex justify-between">
                          <span className={`${output.type === 'op_return' ? 'text-purple-600' : 'text-gray-600'}`}>
                            {output.type === 'op_return' ? 'OP_RETURN' : output.type.toUpperCase()}
                          </span>
                          <span className="text-gray-900">{fromSatoshis(output.value, true)} BTC</span>
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

                {/* TXID if available */}
                {txid && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Transaction ID</h4>
                    <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 break-all">
                      {txid}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* From Wallet */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-medium text-gray-700 mb-3">Signing With</h2>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{activeWallet.name}</p>
              <p className="text-xs text-gray-500 truncate">{activeAddress.address}</p>
            </div>
          </div>

          {/* Other Warnings (high fee, ANYONECANPAY) */}
          {(hasHighFee || hasAnyoneCanPay) && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start">
                <FiAlertTriangle className="size-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium mb-1">Review Carefully</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    {hasHighFee && (
                      <li>High network fee detected</li>
                    )}
                    {hasAnyoneCanPay && (
                      <li>Using ANYONECANPAY sighash (atomic swap mode)</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-blue-900 mb-2">What happens next?</h2>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• The transaction will be signed with your private key</li>
              <li>• The signed PSBT will be returned to the requesting site</li>
              <li>• The site may broadcast the transaction to the network</li>
            </ul>
          </div>
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
