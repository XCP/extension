import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import axios from "axios";

import { useWalletContext } from "@/contexts/wallet-context";
import { useHeaderContext } from "@/contexts/header-context";
import { useAddressSync } from "@/hooks/useAddressSync";
import { FeeRateInput } from "@/components/feeRateInput";
import { fetchConsolidationFeeConfig, estimateConsolidationFees } from "@/utils/consolidation";
import { btcToSat } from "@/utils/bitcoin";

// ... other imports ...

interface ConsolidationData {
  summary: {
    total_utxos: number;
    total_btc: number;
    batches_required: number;
  };
  fee_config: {
    service_fee_percent: number;
    service_fee_address: string;
    exemption_threshold_sats: number;
  };
  utxos: Array<{
    txid: string;
    vout: number;
    value: number;
    script_pubkey_hex: string;
    prev_tx_hex: string;
  }>;
}

export default function ConsolidateForm() {
  const navigate = useNavigate();
  const { setTitle } = useHeaderContext();
  const { activeAddress } = useWalletContext();
  
  const [consolidationData, setConsolidationData] = useState<ConsolidationData | null>(null);
  const [feeRate, setFeeRate] = useState<number>(10);
  const [includeStamps, setIncludeStamps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use the sync hook
  const {
    syncStatus,
    isStale,
    triggerSync,
    isSyncing
  } = useAddressSync(activeAddress?.address, {
    onComplete: async (summary) => {
      // Refresh data after sync completes
      await fetchConsolidationData();
    },
    onError: (error) => {
      setError(error);
    }
  });
  
  // Set header
  useEffect(() => {
    setTitle("Consolidate UTXOs");
    return () => setTitle("");
  }, [setTitle]);
  
  // Fetch consolidation data
  const fetchConsolidationData = async () => {
    if (!activeAddress) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (!includeStamps) params.append('include_stamps', 'false');
      
      const response = await axios.get<ConsolidationData>(
        `https://app.xcp.io/api/v1/address/${activeAddress.address}/consolidation?${params}`
      );
      
      if (response.status === 202) {
        // Address is being indexed
        setConsolidationData(null);
        return;
      }
      
      setConsolidationData(response.data);
      
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 202) {
        // Indexing in progress - this is handled by sync hook
        setConsolidationData(null);
      } else {
        setError('Failed to fetch consolidation data');
        console.error('Error fetching consolidation data:', err);
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    if (activeAddress) {
      fetchConsolidationData();
    }
  }, [activeAddress, includeStamps]);
  
  // Calculate if we can proceed
  const canProceed = consolidationData && 
                     consolidationData.summary.total_utxos > 0 && 
                     feeRate > 0 &&
                     !isSyncing;
  
  const handleContinue = () => {
    if (!canProceed || !consolidationData) return;
    
    // Navigate to review page with all data
    navigate('/actions/consolidate/review', {
      state: {
        consolidationData,
        feeRate,
        includeStamps
      }
    });
  };
  
  // Show loading spinner on initial load
  if (loading && !consolidationData && !isStale) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        
        {/* Recoverable Amount with Sync Status */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Recoverable Amount
            </span>
            
            {/* Sync Status Indicator */}
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  Syncing... {syncStatus.progress}%
                </span>
              )}
              
              {syncStatus.status === 'completed' && (
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
              )}
              
              {(isStale || !consolidationData) && !isSyncing && (
                <button
                  onClick={triggerSync}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Refresh data"
                >
                  <ArrowPathIcon className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>
          
          <div className="text-2xl font-bold">
            {consolidationData ? (
              `${consolidationData.summary.total_btc.toFixed(8)} BTC`
            ) : (
              <span className="text-gray-400">--</span>
            )}
          </div>
          
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {consolidationData ? (
              `${consolidationData.summary.total_utxos} UTXOs`
            ) : isStale ? (
              'Click refresh to update'
            ) : isSyncing ? (
              syncStatus.message
            ) : (
              'No data available'
            )}
          </div>
          
          {/* Progress bar for syncing */}
          {isSyncing && syncStatus.progress && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${syncStatus.progress}%` }}
                />
              </div>
              {syncStatus.estimatedSeconds && (
                <p className="text-xs text-gray-500 mt-1">
                  Estimated time: {syncStatus.estimatedSeconds}s
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Fee Configuration */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Network Fee
          </h3>
          
          <FeeRateInput
            value={feeRate}
            onChange={setFeeRate}
            disabled={isSyncing}
          />
          
          {consolidationData?.fee_config && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Service fee: {consolidationData.fee_config.service_fee_percent}%</p>
              {consolidationData.summary.total_btc * 100000000 < consolidationData.fee_config.exemption_threshold_sats && (
                <p className="text-green-600 dark:text-green-400">
                  ✓ Exempt from service fee (below threshold)
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Include Stamps Option */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="include-stamps"
            checked={includeStamps}
            onChange={(e) => setIncludeStamps(e.target.checked)}
            disabled={isSyncing}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label 
            htmlFor="include-stamps" 
            className="text-sm text-gray-700 dark:text-gray-300"
          >
            Include STAMP UTXOs (may increase fees)
          </label>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        
        {/* Info Messages */}
        {isStale && !isSyncing && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Data may be outdated. Click the refresh button to update.
            </p>
          </div>
        )}
      </div>
      
      {/* Action Buttons */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          
          <button
            onClick={handleContinue}
            disabled={!canProceed}
            className={`
              flex-1 px-4 py-2 rounded-lg font-medium transition-colors
              ${canProceed
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {isSyncing ? 'Syncing...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}