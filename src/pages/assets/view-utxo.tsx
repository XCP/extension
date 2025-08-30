"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaChevronRight, FaClipboard, FaCheck } from "react-icons/fa";
import { ErrorAlert } from "@/components/error-alert";
import { AddressHeader } from "@/components/headers/address-header";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchUtxoBalances, type UtxoBalance } from "@/utils/blockchain/counterparty";
import { fetchBitcoinTransaction } from "@/utils/blockchain/bitcoin/utxo";
import { formatTxid, formatAmount, formatTimeAgo } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { ReactElement } from "react";

/**
 * Interface for an actionable option for a UTXO.
 */
interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
  variant?: "default" | "success" | "destructive";
}

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    COMPOSE: "/compose",
  } as const,
} as const;

/**
 * ViewUtxo component displays details and actions for a specific UTXO.
 *
 * Features:
 * - Fetches and displays UTXO balances
 * - Provides actions for moving or detaching assets
 *
 * @returns {ReactElement} The rendered UTXO view UI.
 * @example
 * ```tsx
 * <ViewUtxo />
 * ```
 */
export default function ViewUtxo(): ReactElement {
  const { txid } = useParams<{ txid: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress, activeWallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [btcTxData, setBtcTxData] = useState<any>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Handle copy UTXO to clipboard
  const handleCopyUtxo = async () => {
    if (!txid) return;
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy UTXO:", err);
    }
  };

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "UTXO Details",
      onBack: () => {
        // Navigate to view-balance of the first asset if available
        if (balances.length > 0) {
          navigate(`/balance/${balances[0].asset}`);
        } else {
          navigate(-1);
        }
      },
      rightButton: {
        icon: copiedToClipboard ? <FaCheck aria-hidden="true" /> : <FaClipboard aria-hidden="true" />,
        onClick: handleCopyUtxo,
        ariaLabel: "Copy UTXO"
      }
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, txid, copiedToClipboard, balances]);

  // Load UTXO balances and Bitcoin transaction data
  useEffect(() => {
    if (!txid) {
      setBalances([]);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      try {
        // Parse UTXO format (txid:vout)
        const [transactionId, voutStr] = txid.split(':');
        const vout = parseInt(voutStr, 10);
        
        // Load both UTXO balances and Bitcoin transaction data in parallel
        const [balancesResponse, btcTx] = await Promise.all([
          fetchUtxoBalances(txid),
          fetchBitcoinTransaction(transactionId)
        ]);
        
        setBalances(balancesResponse.result);
        setBtcTxData({ ...btcTx, vout });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch UTXO data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [txid]);

  /**
   * Generates a list of available actions for the UTXO.
   * @returns {Action[]} The list of actionable options for the UTXO.
   */
  const getActions = (): Action[] => {
    if (!txid) return [];
    return [
      {
        id: "move",
        name: "Move",
        description: "Move this UTXO to another address",
        path: `${CONSTANTS.PATHS.COMPOSE}/utxo/move/${txid}`,
      },
      {
        id: "detach",
        name: "Detach",
        description: "Detach assets from this UTXO",
        path: `${CONSTANTS.PATHS.COMPOSE}/utxo/detach/${txid}`,
        variant: "destructive",
      },
    ];
  };

  if (isLoading) return <div className="p-4 text-center text-gray-600">Loading UTXO details...</div>;
  if (error) return <ErrorAlert message={error} onClose={() => setError(null)} />;

  return (
    <div className="p-4 space-y-6" role="main" aria-labelledby="utxo-title">
      {activeAddress && (
        <AddressHeader
          address={activeAddress.address}
          walletName={activeWallet?.name ?? ""}
          className="mt-1 mb-5"
        />
      )}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h2 id="utxo-title" className="text-sm font-medium text-gray-900">
          Details
        </h2>
        <div className="mt-2 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Output</span>
            <span className="text-sm font-mono text-gray-900">{formatTxid(txid || '')}</span>
          </div>
          {btcTxData && (
            <>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Time Attached</span>
                <span className="text-sm text-gray-900">
                  {btcTxData.blocktime ? formatTimeAgo(btcTxData.blocktime) : 'Pending'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Confirmations</span>
                <span className="text-sm text-gray-900">
                  {btcTxData.confirmations ? btcTxData.confirmations.toLocaleString() : '0'}
                </span>
              </div>
              {btcTxData.vout !== undefined && btcTxData.vout_list && btcTxData.vout_list[btcTxData.vout] && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">BTC Value</span>
                  <span className="text-sm text-gray-900">
                    {formatAmount({
                      value: fromSatoshis(btcTxData.vout_list[btcTxData.vout].value_int, true),
                      maximumFractionDigits: 8,
                      minimumFractionDigits: 0
                    })} BTC
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {balances.length > 0 && (
          <>
            <hr className="my-4 border-gray-200" />
            <h3 className="text-sm font-medium text-gray-900">Balances</h3>
            <div className="mt-2 space-y-2">
              {balances.map((balance, index) => (
                <div 
                  key={index} 
                  className="flex justify-between p-2 -mx-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/balance/${balance.asset}`)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${balance.asset} balance`}
                >
                  <span className="text-sm text-gray-500">{balance.asset}</span>
                  <span className="text-sm text-gray-900">{balance.quantity_normalized}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="space-y-2">
        {getActions().map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(action.path)}
            className={`
              bg-white rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors
              ${action.variant === "destructive" ? "border border-red-200" : ""}
            `}
            role="button"
            tabIndex={0}
            aria-label={action.name}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3
                  className={`
                    text-sm font-medium
                    ${action.variant === "destructive" ? "text-red-600" : "text-gray-900"}
                  `}
                >
                  {action.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{action.description}</p>
              </div>
              <FaChevronRight className="text-gray-400 w-4 h-4" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
