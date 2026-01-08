import { useState, useEffect } from "react";
import { FaChevronDown, FaChevronRight, FaHistory } from "@/components/icons";
import { formatAmount } from "@/utils/format";
import { consolidationApi, type ConsolidationStatusResponse } from "@/utils/blockchain/bitcoin/consolidationApi";

interface ConsolidationHistoryProps {
  address: string;
}

export function ConsolidationHistory({ address }: ConsolidationHistoryProps) {
  const [status, setStatus] = useState<ConsolidationStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      if (!address) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await consolidationApi.getConsolidationStatus(address);
        setStatus(data);
      } catch (err: any) {
        console.error("Failed to fetch consolidation history:", err);
        // Don't show error for 404s (no history)
        if (!err?.message?.includes('404')) {
          setError("Failed to load recovery history");
        }
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchHistory();
  }, [address]);

  // Refresh every 30 seconds if there are pending transactions
  useEffect(() => {
    if (!status?.recent_consolidations?.some(c => c.status === 'pending')) return;
    
    const interval = setInterval(() => {
      async function refreshHistory() {
        try {
          const data = await consolidationApi.getConsolidationStatus(address);
          setStatus(data);
        } catch (err) {
          // Silently fail for refresh
        }
      }
      refreshHistory();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [address, status?.recent_consolidations]);

  // Load history when section is expanded
  useEffect(() => {
    if (showHistory && status && !isLoading) {
      // History already loaded
    }
  }, [showHistory, status, isLoading]);

  // Don't show anything if still loading initially
  if (isLoading) {
    return null;
  }

  // Don't show the section if there's no history and not an error
  if (!error && (!status || !status.recent_consolidations || status.recent_consolidations.length === 0)) {
    return null;
  }

  return (
    <div className="mt-4 bg-white rounded-lg shadow-sm">
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer"
        aria-expanded={showHistory}
        aria-controls="recovery-history"
      >
        <div className="flex items-center gap-2">
          <FaHistory className="text-gray-500 w-4 h-4" aria-hidden="true" />
          <h3 className="text-sm font-medium text-gray-900">Recovery History</h3>
        </div>
        {showHistory ? (
          <FaChevronDown className="text-gray-400 w-4 h-4" aria-hidden="true" />
        ) : (
          <FaChevronRight className="text-gray-400 w-4 h-4" aria-hidden="true" />
        )}
      </button>

      {showHistory && (
        <div id="recovery-history" className="border-t border-gray-100">
          {error ? (
            <div className="p-4 text-center text-red-600 text-sm">
              {error}
            </div>
          ) : !status || status.recent_consolidations.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No recovery transactions yet
            </div>
          ) : (
            <div className="p-4">
              {/* Transaction List */}
              <div className="space-y-2">
                {status.recent_consolidations.filter(tx => tx.status !== 'replaced').map((tx) => (
                  <div
                    key={tx.txid}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatAmount({
                            value: tx.amount_recovered,
                            minimumFractionDigits: 8,
                            maximumFractionDigits: 8,
                          })} BTC recovered
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Consolidated {tx.utxos_consolidated} UTXOs
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(tx.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://mempool.space/tx/${tx.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 hover:underline truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        TX: {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                      </a>
                      {tx.status === 'pending' ? (
                        <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                          Pending
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                          Confirmed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}