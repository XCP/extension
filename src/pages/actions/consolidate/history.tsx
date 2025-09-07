import { useState, useEffect } from "react";
import { formatAddress, formatAmount } from "@/utils/format";
import { consolidationApi, type ConsolidationStatusResponse } from "@/services/consolidationApiService";
import { Spinner } from "@/components/spinner";

interface ConsolidationHistoryProps {
  address: string;
}

export function ConsolidationHistory({ address }: ConsolidationHistoryProps) {
  const [status, setStatus] = useState<ConsolidationStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    // Refresh every 30 seconds if there are pending transactions
    const interval = setInterval(() => {
      if (status?.recent_consolidations?.some(c => c.status === 'pending')) {
        fetchHistory();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [address, status?.recent_consolidations]);

  if (isLoading) {
    return (
      <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recovery History</h3>
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recovery History</h3>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (!status || !status.recent_consolidations || status.recent_consolidations.length === 0) {
    return (
      <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recovery History</h3>
        <p className="text-sm text-gray-500">No recovery transactions yet</p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Recovery History</h3>
        {status.status.total_recovered_btc > 0 && (
          <span className="text-xs text-green-600 font-medium">
            Total Recovered: {formatAmount({
              value: status.status.total_recovered_btc,
              minimumFractionDigits: 8,
              maximumFractionDigits: 8,
            })} BTC
          </span>
        )}
      </div>

      {/* Summary Stats */}
      {(status.status.available_utxos > 0 || status.status.pending_utxos > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">Available</div>
            <div className="font-semibold">{status.status.available_utxos} UTXOs</div>
          </div>
          <div className="bg-yellow-50 rounded p-2">
            <div className="text-gray-500">Pending</div>
            <div className="font-semibold text-yellow-600">{status.status.pending_utxos} UTXOs</div>
          </div>
          <div className="bg-green-50 rounded p-2">
            <div className="text-gray-500">Recovered</div>
            <div className="font-semibold text-green-600">{status.status.confirmed_consolidations} TXs</div>
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="space-y-2">
        {status.recent_consolidations.map((tx) => (
          <div
            key={tx.txid}
            className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <a
                  href={`https://mempool.space/tx/${tx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-blue-600 hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                </a>
                {tx.status === 'pending' ? (
                  <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                    Pending
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                    {tx.confirmations} conf
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {tx.utxos_consolidated} UTXOs → {formatAmount({
                  value: tx.amount_recovered,
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC
              </div>
            </div>
            <div className="text-xs text-gray-400">
              {new Date(tx.timestamp).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}