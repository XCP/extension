import { useEffect, useState } from "react";
import { FaChevronRight, FaHistory, FiChevronDown } from "@/components/icons";
import { type ConsolidationStatusResponse, consolidationApi } from "@/core/bitcoin/consolidationApi";
import { fetchTransactionChainStatus } from "@/core/bitcoin/utxo";
import { formatAmount } from "@/core/format";

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
        } catch (_err) {
          // The tracker could not answer, which is precisely when its last word must not be
          // repeated: an outage once left a confirmed recovery reading "Pending" on this screen
          // while mempool.space knew better. Ask the chain about the rows shown as pending and
          // promote the ones it has confirmed; an unreachable explorer changes nothing.
          setStatus((current) => {
            if (!current) return current;
            const pending = current.recent_consolidations.filter((tx) => tx.status === "pending");
            if (pending.length > 0) {
              Promise.all(
                pending.map(async (tx) => [tx.txid, await fetchTransactionChainStatus(tx.txid)] as const),
              ).then((checks) => {
                const confirmed = new Set(
                  checks.filter(([, chain]) => chain?.confirmed).map(([txid]) => txid),
                );
                if (confirmed.size === 0) return;
                setStatus((latest) =>
                  latest
                    ? {
                        ...latest,
                        recent_consolidations: latest.recent_consolidations.map((tx) =>
                          confirmed.has(tx.txid)
                            ? { ...tx, status: "confirmed" as const, confirmations: Math.max(1, tx.confirmations) }
                            : tx,
                        ),
                      }
                    : latest,
                );
              });
            }
            return current;
          });
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
      <button type="button"
        onClick={() => setShowHistory(!showHistory)}
        className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-lg"
        aria-expanded={showHistory}
        aria-controls="recovery-history"
      >
        <div className="flex items-center gap-2">
          <FaHistory className="text-gray-500 size-4" aria-hidden="true" />
          <h2 className="text-sm font-medium text-gray-900">Recovery History</h2>
        </div>
        {showHistory ? (
          <FiChevronDown className="text-gray-400 size-4" aria-hidden="true" />
        ) : (
          <FaChevronRight className="text-gray-400 size-4" aria-hidden="true" />
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
                        TX: {tx.txid.slice(0, 8)}…{tx.txid.slice(-8)}
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