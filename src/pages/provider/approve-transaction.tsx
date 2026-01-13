import { useState, useMemo } from 'react';
import { FiGlobe, FiAlertTriangle, FiX, FiChevronDown, FiChevronUp, FiInfo, FiShield } from '@/components/icons';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { VerificationStatus } from '@/components/verification-status';
import { formatAddress, formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { useSignTransactionRequest } from '@/hooks/useSignTransactionRequest';
import { getWalletService } from '@/services/walletService';
import {
  analyzeEncoding,
  checkWalletCompatibility,
  getEncodingDisplayInfo,
  type WalletType,
  type EncodingAnalysis,
  type WalletCompatibility,
} from '@/utils/blockchain/counterparty/encodingValidator';

export default function ApproveTransaction() {
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
  } = useSignTransactionRequest();

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);

  // Determine wallet type for compatibility checking
  const walletType: WalletType = useMemo(() => {
    if (!activeWallet) return 'software';
    if (activeWallet.type === 'hardware' && activeWallet.hardwareData) {
      return activeWallet.hardwareData.vendor as WalletType;
    }
    return 'software';
  }, [activeWallet]);

  // Analyze transaction encoding for Counterparty compatibility
  const encodingAnalysis: EncodingAnalysis | null = useMemo(() => {
    if (!decodedInfo?.outputs) return null;
    return analyzeEncoding(decodedInfo.outputs);
  }, [decodedInfo?.outputs]);

  // Check wallet compatibility with the detected encoding
  const walletCompatibility: WalletCompatibility | null = useMemo(() => {
    if (!encodingAnalysis) return null;
    return checkWalletCompatibility(encodingAnalysis.encoding, walletType, encodingAnalysis);
  }, [encodingAnalysis, walletType]);

  // Get display info for encoding
  const encodingDisplayInfo = useMemo(() => {
    if (!encodingAnalysis) return null;
    return getEncodingDisplayInfo(encodingAnalysis);
  }, [encodingAnalysis]);

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
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading transaction details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError || !request || !decodedInfo) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <FiAlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{loadError || 'Request not found'}</p>
          <Button color="gray" onClick={() => window.close()}>Close</Button>
        </div>
      </div>
    );
  }

  // No wallet state
  if (!activeAddress || !activeWallet) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <p className="text-gray-500">Please unlock your wallet first</p>
        </div>
      </div>
    );
  }

  const hasHighFee = decodedInfo.fee > 10000000; // > 0.1 BTC fee
  const verificationPassed = decodedInfo.verification?.passed;
  const verificationWarning = decodedInfo.verification?.warning;
  const verificationFailed = verificationPassed === false;
  const isStrictMode = settings?.strictTransactionVerification !== false;

  // Check if signing is blocked - either by verification failure or wallet compatibility
  const cannotSign = walletCompatibility?.canSign === false;
  const shouldBlockSigning = (isStrictMode && verificationFailed) || cannotSign;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Sign Transaction</h1>
          <button
            onClick={handleReject}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
            disabled={isSigning}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {/* Site info */}
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <FiGlobe className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{domain}</h2>
            <p className="text-sm text-gray-500 break-all">{request.origin}</p>
            <p className="text-sm text-gray-600 mt-2">wants to sign a transaction</p>
          </div>

          {error && <ErrorAlert message={error} />}

          {/* Transaction Summary */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Transaction Summary</h3>

            <div className="space-y-3">
              {/* Inputs */}
              <div className="flex justify-between items-start">
                <span className="text-sm text-gray-600">Inputs:</span>
                <span className="text-sm text-gray-900 text-right">
                  {decodedInfo.inputs.length} input{decodedInfo.inputs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Total Input Value */}
              {decodedInfo.totalInputValue > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-gray-600">Total Input:</span>
                  <span className="text-sm text-gray-900 text-right">
                    {formatAmount({
                      value: fromSatoshis(decodedInfo.totalInputValue, true),
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
                  {decodedInfo.outputs.length} output{decodedInfo.outputs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Fee */}
              {decodedInfo.fee > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-gray-600">Network Fee:</span>
                  <span className={`text-sm text-right ${decodedInfo.fee > 10000000 ? 'text-orange-600 font-medium' : 'text-gray-900'}`}>
                    {formatAmount({
                      value: fromSatoshis(decodedInfo.fee, true),
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} BTC
                    <span className="text-gray-500 ml-1">({decodedInfo.fee.toLocaleString()} sats)</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Counterparty Message (if detected) */}
          {decodedInfo.counterpartyMessage && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mr-2">
                  {decodedInfo.counterpartyMessage.messageType}
                </span>
              </div>
              <p className="text-sm text-purple-800 mt-2">
                {decodedInfo.counterpartyMessage.description}
              </p>
            </div>
          )}

          {/* Verification Status */}
          <VerificationStatus
            passed={verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

          {/* Encoding Information (for Counterparty transactions) */}
          {encodingAnalysis && encodingAnalysis.encoding !== 'unknown' && encodingDisplayInfo && (
            <div className={`rounded-lg p-4 border ${
              encodingDisplayInfo.severity === 'error'
                ? 'bg-red-50 border-red-200'
                : encodingDisplayInfo.severity === 'warning'
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start">
                <FiInfo className={`w-5 h-5 mt-0.5 mr-2 flex-shrink-0 ${
                  encodingDisplayInfo.severity === 'error'
                    ? 'text-red-600'
                    : encodingDisplayInfo.severity === 'warning'
                    ? 'text-yellow-600'
                    : 'text-blue-600'
                }`} />
                <div>
                  <p className={`text-sm font-medium ${
                    encodingDisplayInfo.severity === 'error'
                      ? 'text-red-900'
                      : encodingDisplayInfo.severity === 'warning'
                      ? 'text-yellow-900'
                      : 'text-blue-900'
                  }`}>
                    {encodingDisplayInfo.title}
                  </p>
                  <p className={`text-xs mt-1 ${
                    encodingDisplayInfo.severity === 'error'
                      ? 'text-red-700'
                      : encodingDisplayInfo.severity === 'warning'
                      ? 'text-yellow-700'
                      : 'text-blue-700'
                  }`}>
                    {encodingDisplayInfo.description}
                  </p>
                  {encodingAnalysis.details.estimatedDataSize > 0 && (
                    <p className={`text-xs mt-1 ${
                      encodingDisplayInfo.severity === 'error'
                        ? 'text-red-600'
                        : encodingDisplayInfo.severity === 'warning'
                        ? 'text-yellow-600'
                        : 'text-blue-600'
                    }`}>
                      Data size: ~{encodingAnalysis.details.estimatedDataSize} bytes in {encodingAnalysis.details.dataOutputCount} output{encodingAnalysis.details.dataOutputCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Wallet Compatibility Warning/Error */}
          {walletCompatibility && (walletCompatibility.warning || walletCompatibility.error) && (
            <div className={`rounded-lg p-4 border ${
              walletCompatibility.error
                ? 'bg-red-50 border-red-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-start">
                <FiShield className={`w-5 h-5 mt-0.5 mr-2 flex-shrink-0 ${
                  walletCompatibility.error ? 'text-red-600' : 'text-yellow-600'
                }`} />
                <div>
                  <p className={`text-sm font-medium ${
                    walletCompatibility.error ? 'text-red-900' : 'text-yellow-900'
                  }`}>
                    {walletType === 'software' ? 'Software Wallet' : walletType.charAt(0).toUpperCase() + walletType.slice(1)} Compatibility
                  </p>
                  <p className={`text-xs mt-1 ${
                    walletCompatibility.error ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {walletCompatibility.error || walletCompatibility.warning}
                  </p>
                  {walletCompatibility.suggestions && walletCompatibility.suggestions.length > 0 && (
                    <ul className={`text-xs mt-2 list-disc list-inside space-y-1 ${
                      walletCompatibility.error ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {walletCompatibility.suggestions.map((suggestion, idx) => (
                        <li key={idx}>{suggestion}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Expandable Details */}
          <div className="bg-white rounded-lg shadow-sm">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-6 py-4 flex items-center justify-between text-left"
            >
              <span className="text-sm font-medium text-gray-700">Transaction Details</span>
              {showDetails ? (
                <FiChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <FiChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showDetails && (
              <div className="px-6 pb-4 space-y-4">
                {/* Inputs List */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Inputs ({decodedInfo.inputs.length})</h4>
                  <div className="space-y-2">
                    {decodedInfo.inputs.map((input, idx) => (
                      <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">#{idx}</span>
                          {input.value !== undefined && (
                            <span className="text-gray-900">{fromSatoshis(input.value, true)} BTC</span>
                          )}
                        </div>
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

                {/* TXID */}
                {decodedInfo.txid && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Transaction ID</h4>
                    <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 break-all">
                      {decodedInfo.txid}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* From Wallet */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Signing With</h3>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{activeWallet.name}</p>
              <p className="text-xs text-gray-500 truncate">{activeAddress.address}</p>
            </div>
          </div>

          {/* High Fee Warning */}
          {hasHighFee && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start">
                <FiAlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium mb-1">Review Carefully</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>High network fee detected</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">What happens next?</h3>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• The transaction will be signed with your private key</li>
              <li>• The signed transaction will be returned to the requesting site</li>
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
            {isSigning ? 'Signing...' : shouldBlockSigning ? (cannotSign ? 'Cannot Sign' : 'Blocked') : 'Sign'}
          </Button>
        </div>
      </div>
    </div>
  );
}
