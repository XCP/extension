import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FaCheckCircle, FiExternalLink, FaCopy, FiX } from "@/components/icons";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { formatAddress } from "@/utils/format";
import { type ConsolidationResult } from "@/hooks/useMultiBatchConsolidation";

interface LocationState {
  results: ConsolidationResult[];
  totalBatches: number;
  address: string;
}

function ConsolidateSuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderProps } = useHeader();
  
  const state = location.state as LocationState;
  
  useEffect(() => {
    setHeaderProps({
      title: "Started Recovery",
      onBack: () => navigate('/actions/consolidate'), // Back to recovery tool homepage
      rightButton: {
        icon: <FiX className="size-4" aria-hidden="true" />,
        onClick: () => navigate('/'),
        ariaLabel: "Close and go home"
      }
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);
  
  if (!state || !state.results) {
    navigate('/');
    return null;
  }
  
  const successfulBatches = state.results.filter(r => r.status === 'success');
  const failedBatches = state.results.filter(r => r.status === 'error');
  const totalUtxos = state.results.reduce((sum, r) => sum + r.utxosConsolidated, 0);
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };
  
  const openInExplorer = (txid: string) => {
    window.open(`https://mempool.space/tx/${txid}`, '_blank');
  };
  
  return (
    <div className="p-4 space-y-4">
      {/* Success Header */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <FaCheckCircle className="size-6 text-green-600 mt-1 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-green-900">
              Consolidation Successful!
            </h2>
            <p className="text-sm text-green-700 mt-1">
              Successfully broadcast {successfulBatches.length} of {state.totalBatches} batch{state.totalBatches > 1 ? 'es' : ''}.
              {failedBatches.length > 0 && ` ${failedBatches.length} batch${failedBatches.length > 1 ? 'es' : ''} failed.`}
            </p>
          </div>
        </div>
      </div>
      
      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h2 className="font-semibold mb-3">Consolidation Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Address:</span>
            <span className="font-medium">{formatAddress(state.address, true)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Batches:</span>
            <span className="font-medium">{state.totalBatches}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Successful:</span>
            <span className="font-medium text-green-600">{successfulBatches.length}</span>
          </div>
          {failedBatches.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Failed:</span>
              <span className="font-medium text-red-600">{failedBatches.length}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">UTXOs Consolidated:</span>
            <span className="font-medium">{totalUtxos}</span>
          </div>
        </div>
      </div>
      
      {/* Transaction List */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h2 className="font-semibold mb-3">Transaction IDs</h2>
        <div className="space-y-2">
          {state.results.map((result) => (
            <div 
              key={result.batchNumber}
              className={`p-3 rounded-md border ${
                result.status === 'success' 
                  ? 'bg-gray-50 border-gray-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium">
                  Batch {result.batchNumber} ({result.utxosConsolidated} UTXOs)
                </span>
                <span className={`text-xs px-2 py-1 rounded ${
                  result.status === 'success' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  {result.status === 'success' ? 'Success' : 'Failed'}
                </span>
              </div>
              
              {result.status === 'success' && result.txid && (
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-xs text-gray-600 font-mono break-all flex-1">
                    {result.txid}
                  </span>
                  <button
                    onClick={() => copyToClipboard(result.txid)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    title="Copy transaction ID"
                    aria-label="Copy transaction ID"
                  >
                    <FaCopy className="size-4 text-gray-600" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => openInExplorer(result.txid)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    title="View in explorer"
                    aria-label="View in explorer"
                  >
                    <FiExternalLink className="size-4 text-gray-600" aria-hidden="true" />
                  </button>
                </div>
              )}
              
              {result.status === 'error' && result.error && (
                <div className="text-xs text-red-600 mt-2">
                  Error: {result.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Your transactions are now in the mempool and will be confirmed in the next blocks. 
          The consolidated Bitcoin will be available once the transactions are confirmed.
        </p>
      </div>
      
      {/* Action Buttons */}
      <div className="flex space-x-3">
        <Button
          onClick={() => navigate('/')}
          color="gray"
          fullWidth
        >
          Back to Wallet
        </Button>
        <Button
          onClick={() => navigate('/actions/consolidate/status')}
          color="blue"
          fullWidth
        >
          View Status
        </Button>
      </div>
    </div>
  );
}

export default ConsolidateSuccessPage;