"use client";

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { ErrorAlert } from "@/components/error-alert";
import { useHeader } from "@/contexts/header-context";
import { fetchUtxoBalances, type UtxoBalance } from "@/utils/blockchain/counterparty";
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
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "UTXO Details",
      onBack: () => navigate(-1),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  // Load UTXO balances
  useEffect(() => {
    if (!txid) {
      setBalances([]);
      return;
    }

    const loadUtxoBalances = async () => {
      setIsLoading(true);
      try {
        const response = await fetchUtxoBalances(txid);
        setBalances(response.result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch UTXO balances");
      } finally {
        setIsLoading(false);
      }
    };

    loadUtxoBalances();
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
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h2 id="utxo-title" className="text-sm font-medium text-gray-900">
          UTXO Details
        </h2>
        <div className="mt-2 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Transaction ID</span>
            <span className="text-sm font-mono text-gray-900">{txid}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Address</span>
            <span className="text-sm font-mono text-gray-900">
              {balances[0]?.utxo_address || "Unknown"}
            </span>
          </div>
        </div>
      </div>
      {balances.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-900">Asset Balances</h2>
          <div className="mt-2 space-y-2">
            {balances.map((balance, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-sm text-gray-500">{balance.asset}</span>
                <span className="text-sm text-gray-900">{balance.quantity_normalized}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
