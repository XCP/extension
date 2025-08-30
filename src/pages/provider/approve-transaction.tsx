import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getWalletService } from '@/services/walletService';

export default function ApproveTransaction() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const origin = searchParams.get('origin') || '';
  const requestId = searchParams.get('requestId') || '';
  const rawTx = searchParams.get('tx') || '';

  useEffect(() => {
    // Parse transaction details if available
    if (rawTx) {
      try {
        // TODO: Parse and display transaction details
        setTransactionDetails({
          raw: rawTx,
          // Add more details once we can parse the transaction
        });
      } catch (err) {
        setError('Invalid transaction');
      }
    }
  }, [rawTx]);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      // Send approval to background
      await browser.runtime.sendMessage({
        type: 'RESOLVE_PROVIDER_REQUEST',
        requestId,
        approved: true,
      });
      
      // Close window
      window.close();
    } catch (err) {
      setError('Failed to approve transaction');
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      // Send rejection to background
      await browser.runtime.sendMessage({
        type: 'RESOLVE_PROVIDER_REQUEST',
        requestId,
        approved: false,
      });
      
      // Close window
      window.close();
    } catch (err) {
      setError('Failed to reject transaction');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
        <h1 className="text-xl font-bold">Sign Transaction</h1>
        <p className="text-sm opacity-90 mt-1">Review and approve this transaction</p>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-yellow-800 font-medium">
                {origin} wants to sign a transaction
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Only approve if you trust this site
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {transactionDetails && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Transaction Details</h3>
            <div className="space-y-2">
              <div className="text-xs font-mono bg-white p-2 rounded border border-gray-200 break-all">
                {transactionDetails.raw.substring(0, 100)}...
              </div>
              <p className="text-xs text-gray-500">
                Full transaction hash will be signed with your private key
              </p>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h3 className="font-medium text-blue-900 mb-1">What happens next?</h3>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Your wallet will sign this transaction</li>
            <li>• The signed transaction will be returned to {origin}</li>
            <li>• The site can then broadcast it to the network</li>
            <li>• You can always reject if you're unsure</li>
          </ul>
        </div>
      </div>

      <div className="border-t p-4 bg-gray-50">
        <div className="flex space-x-3">
          <button
            onClick={handleReject}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Signing...' : 'Sign Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}