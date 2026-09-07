import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FiExternalLink, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { type ConsolidationStatusResponse, consolidationApi } from "@/core/bitcoin/consolidationApi";
import { displayLocale, formatAddress, formatAmount } from "@/core/format";

import { t } from '@/i18n';

function ConsolidateStatusPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  const [status, setStatus] = useState<ConsolidationStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setHeaderProps({
      title: t('consolidate_status_consolidation_status'),
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  const fetchStatus = async () => {
    if (!activeAddress) return;
    
    try {
      setError(null);
      const statusData = await consolidationApi.getConsolidationStatus(activeAddress.address);
      setStatus(statusData);
    } catch (err) {
      console.error("Error fetching consolidation status:", err);
      setError(err instanceof Error ? err.message : t('consolidate_status_failed_to_fetch_status'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // fetchStatus is redefined every render; listing it would recreate the interval each time and
  // the 30s auto-refresh would never fire.
  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [activeAddress]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStatus();
  };

  const openInExplorer = (txid: string) => {
    window.open(`https://mempool.space/tx/${txid}`, '_blank');
  };

  if (!activeAddress) {
    return (
      <div className="p-4">
        <p className="text-gray-600">{t('common_no_active_address_selected')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700">{error}</p>
        </div>
        <Button onClick={handleRefresh} color="gray">
          {t('common_try_again')}
        </Button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-4">
        <p className="text-gray-600">{t('common_no_consolidation_data_available')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Overview Card */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex justify-between items-start mb-4">
          <h2 className="font-semibold">{t('consolidate_status_consolidation_overview')}</h2>
          <button type="button"
            onClick={handleRefresh}
            className={`p-2 hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isRefreshing ? 'animate-spin' : ''}`}
            aria-label={t('consolidate_status_refresh_status')}
          >
            <FiRefreshCw className="size-4 text-gray-600" aria-hidden="true" />
          </button>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('common_address')}</span>
            <span className="font-medium">{formatAddress(status.address, true)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('consolidate_status_available_utxos')}</span>
            <span className="font-medium">{status.status.available_utxos}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('consolidate_status_pending_utxos')}</span>
            <span className="font-medium text-yellow-600">{status.status.pending_utxos}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('consolidate_status_confirmed_consolidations')}</span>
            <span className="font-medium text-green-600">{status.status.confirmed_consolidations}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('consolidate_status_total_recovered')}</span>
            <span className="font-medium">
              {formatAmount({
                value: status.status.total_recovered_btc,
                minimumFractionDigits: 8,
                maximumFractionDigits: 8,
              })} BTC
            </span>
          </div>
        </div>
        
        {status.status.pending_utxos > 0 && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-xs text-yellow-800">
              {t('consolidate_status_utxos_are_pending_confirmation_please', [String(status.status.pending_utxos)])}
            </p>
          </div>
        )}
      </div>

      {/* Recent Consolidations */}
      {status.recent_consolidations.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <h2 className="font-semibold mb-3">{t('consolidate_status_recent_consolidations')}</h2>
          <div className="space-y-2">
            {status.recent_consolidations.filter(tx => tx.status !== 'replaced').map((tx) => (
              <div 
                key={tx.txid}
                className="p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        tx.status === 'confirmed' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {tx.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(tx.timestamp).toLocaleDateString(displayLocale())}
                      </span>
                    </div>
                  </div>
                  <button type="button"
                    onClick={() => openInExplorer(tx.txid)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={t('common_view_in_explorer')}
                  >
                    <FiExternalLink className="size-4 text-gray-600" aria-hidden="true" />
                  </button>
                </div>
                
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('common_utxos_consolidated')}</span>
                    <span className="font-medium">{tx.utxos_consolidated}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('consolidate_status_amount_recovered')}</span>
                    <span className="font-medium">
                      {formatAmount({
                        value: tx.amount_recovered,
                        minimumFractionDigits: 8,
                        maximumFractionDigits: 8,
                      })} BTC
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-2">
                    {tx.txid}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {status.status.available_utxos > 0 && status.status.pending_utxos === 0 && (
          <Button
            onClick={() => navigate('/actions/consolidate')}
            color="blue"
            fullWidth
          >
            {t('consolidate_status_start_new_consolidation')}
          </Button>
        )}
        <Button
          onClick={() => navigate('/')}
          color="gray"
          fullWidth
        >
          {t('common_back_to_wallet')}
        </Button>
      </div>
    </div>
  );
}

export default ConsolidateStatusPage;