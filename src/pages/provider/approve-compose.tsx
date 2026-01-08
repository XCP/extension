import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FiGlobe, FiAlertTriangle, FiX } from '@/components/icons';
import { Button } from '@/components/button';
import { ErrorAlert } from '@/components/error-alert';
import { formatAmount, formatAddress } from '@/utils/format';
import { fromSatoshis, toBigNumber } from '@/utils/numeric';
import { useWallet } from '@/contexts/wallet-context';
import { useSettings } from '@/contexts/settings-context';
import { FeeRateInput } from '@/components/inputs/fee-rate-input';
import { safeSendMessage } from '@/utils/browser';

export default function ApproveCompose() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [feeRate, setFeeRate] = useState<number>(1); // Will be updated by FeeRateInput
  const [orderExpiration, setOrderExpiration] = useState<number>(0);

  const origin = searchParams.get('origin') || '';
  const requestId = searchParams.get('requestId') || '';
  const paramsStr = searchParams.get('params') || '{}';
  
  let params: any = {};
  try {
    params = JSON.parse(decodeURIComponent(paramsStr));
  } catch (e) {
    console.error('Failed to parse params:', e);
  }

  // Parse the origin to get a friendly domain name
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };
  
  const domain = getDomain(origin);

  useEffect(() => {
    // If no active wallet/address, redirect to unlock
    if (!activeWallet || !activeAddress) {
      navigate('/');
    }
    
    // Set default order expiration from settings or use max (8064 blocks)
    const defaultExpiration = settings?.defaultOrderExpiration || 8064;
    setOrderExpiration(defaultExpiration);
  }, [activeWallet, activeAddress, navigate, settings]);

  const formatQuantity = (quantity: number | string, isDivisible?: boolean) => {
    const qty = toBigNumber(quantity);
    
    if (isDivisible === false) {
      return qty.integerValue().toString();
    }
    
    // Assume 8 decimals for divisible assets (standard for XCP)
    const normalized = fromSatoshis(qty.toString());
    return formatAmount({
      value: parseFloat(normalized),
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    });
  };

  const getTransactionDetails = () => {
    const details: { label: string; value: string | React.ReactNode; warning?: boolean }[] = [];

    switch (params.type) {
      case 'send':
        details.push(
          { label: 'Action', value: 'Send Asset' },
          { label: 'To', value: formatAddress(params.destination, true) },
          { label: 'Asset', value: params.asset },
          { label: 'Amount', value: formatQuantity(params.quantity, params.divisible !== false) }
        );
        if (params.memo) {
          details.push({ label: 'Memo', value: params.memo });
        }
        break;

      case 'order':
        details.push(
          { label: 'Action', value: 'Create DEX Order' },
          { 
            label: 'Giving', 
            value: `${formatQuantity(params.give_quantity, true)} ${params.give_asset}`,
            warning: toBigNumber(params.give_quantity).isGreaterThan(100000000) // Warn for large amounts
          },
          { label: 'Getting', value: `${formatQuantity(params.get_quantity, true)} ${params.get_asset}` },
          { label: 'Requested Expiration', value: `${params.expiration || 1000} blocks` }
        );
        break;

      case 'issuance':
        details.push(
          { label: 'Action', value: 'Issue Asset' },
          { label: 'Asset Name', value: params.asset },
          { label: 'Quantity', value: formatQuantity(params.quantity, params.divisible) },
          { label: 'Divisible', value: params.divisible ? 'Yes' : 'No' }
        );
        if (params.description) {
          details.push({ label: 'Description', value: params.description });
        }
        if (params.transfer_destination) {
          details.push({ 
            label: 'Transfer To', 
            value: formatAddress(params.transfer_destination, true),
            warning: true 
          });
        }
        if (params.lock) {
          details.push({ label: 'Lock Supply', value: 'Yes ⚠️', warning: true });
        }
        break;

      case 'dispenser':
        details.push(
          { label: 'Action', value: 'Create Dispenser' },
          { label: 'Asset', value: params.asset },
          { label: 'Give Per Dispense', value: formatQuantity(params.give_quantity, true) },
          { label: 'Total Escrow', value: formatQuantity(params.escrow_quantity, true) },
          { label: 'BTC Price', value: `${params.mainchainrate} satoshis` }
        );
        break;

      case 'dividend':
        details.push(
          { label: 'Action', value: 'Pay Dividend' },
          { label: 'Asset', value: params.asset },
          { label: 'Dividend Asset', value: params.dividend_asset },
          { label: 'Per Unit', value: formatQuantity(params.quantity_per_unit, true) }
        );
        break;

      default:
        details.push(
          { label: 'Action', value: 'Unknown Transaction', warning: true },
          { label: 'Type', value: params.type || 'Unknown' }
        );
    }

    details.push({ label: 'Requested Fee Rate', value: `${params.fee_rate || 1} sat/vbyte` });

    return details;
  };

  const handleApprove = async () => {
    setIsProcessing(true);
    setError('');
    try {
      // Override the params with user-controlled values
      const updatedParams = { ...params };
      
      // Always use user's fee rate
      updatedParams.fee_rate = feeRate;
      
      // For orders, use user's expiration setting
      if (params.type === 'order') {
        updatedParams.expiration = orderExpiration;
      }

      // Send message to background script to resolve the request with updated params
      await safeSendMessage({
        type: 'RESOLVE_PROVIDER_REQUEST',
        requestId,
        approved: true,
        updatedParams
      });
      // Close the popup
      window.close();
    } catch (error) {
      console.error('Failed to approve transaction:', error);
      setError('Failed to approve transaction');
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      // Send message to background script to resolve the request
      await safeSendMessage({
        type: 'RESOLVE_PROVIDER_REQUEST',
        requestId,
        approved: false
      });
      // Close the popup
      window.close();
    } catch (error) {
      console.error('Failed to reject transaction:', error);
      setIsProcessing(false);
    }
  };

  if (!activeAddress || !activeWallet) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <p className="text-gray-500">Please unlock your wallet first</p>
        </div>
      </div>
    );
  }

  const transactionDetails = getTransactionDetails();
  const hasWarnings = transactionDetails.some(d => d.warning);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Transaction Approval</h1>
          <button
            onClick={handleReject}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
            disabled={isProcessing}
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
            <p className="text-sm text-gray-500 break-all">{origin}</p>
          </div>

          {error && <ErrorAlert message={error} />}

          {/* Transaction Details */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Transaction Details</h3>
            
            <div className="space-y-3">
              {transactionDetails.map((detail, idx) => (
                <div key={idx} className="flex justify-between items-start">
                  <span className="text-sm text-gray-600">{detail.label}:</span>
                  <span className={`text-sm text-right ml-2 ${detail.warning ? 'text-orange-600 font-medium' : 'text-gray-900'}`}>
                    {detail.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* User Controls */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Your Settings</h3>
            
            {/* Fee Rate Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fee Rate
              </label>
              <FeeRateInput
                onFeeRateChange={setFeeRate}
                disabled={isProcessing}
              />
              <p className="text-xs text-gray-500 mt-1">
                You control the fee rate for this transaction
              </p>
            </div>

            {/* Order Expiration (only for orders) */}
            {params.type === 'order' && (
              <div>
                <label htmlFor="expiration" className="block text-sm font-medium text-gray-700 mb-1">
                  Order Expiration
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="expiration"
                    type="number"
                    value={orderExpiration}
                    onChange={(e) => setOrderExpiration(Math.min(8064, Math.max(1, parseInt(e.target.value) || 0)))}
                    min="1"
                    max="8064"
                    disabled={isProcessing}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-gray-500">blocks</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Max: 8064 blocks (~8 weeks). Site requested: {params.expiration || 1000} blocks
                </p>
              </div>
            )}
          </div>

          {/* From Address */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">From Wallet</h3>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{activeWallet.name}</p>
              <p className="text-xs text-gray-500 truncate">{activeAddress.address}</p>
            </div>
          </div>

          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start">
                <FiAlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium mb-1">Review Carefully</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    {params.transfer_destination && (
                      <li>This will transfer asset ownership</li>
                    )}
                    {params.lock && (
                      <li>Asset supply will be permanently locked</li>
                    )}
                    {params.give_quantity > 100000000 && (
                      <li>Large amount transfer detected</li>
                    )}
                    {params.type === undefined && (
                      <li>Unknown transaction type - proceed with caution</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* What happens next */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">What happens next?</h3>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• A transaction will be created with YOUR fee rate and settings</li>
              <li>• You may be asked to sign the transaction</li>
              <li>• The site can then broadcast it to the network</li>
              <li>• Transaction fees ({feeRate} sat/vbyte) will be paid from your wallet</li>
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
            disabled={isProcessing}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            color="blue"
            onClick={handleApprove}
            disabled={isProcessing}
            fullWidth
          >
            {isProcessing ? "Processing..." : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}