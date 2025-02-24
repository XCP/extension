"use client";

import React, { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaChevronRight } from 'react-icons/fa';
import { useHeader } from '@/contexts/header-context';
import { fetchUtxoBalances, type UtxoBalance } from '@/utils/blockchain/counterparty/api';

/**
 * Represents an actionable option for a UTXO.
 * @typedef {Object} Action
 * @property {string} id - Unique identifier for the action.
 * @property {string} name - Display name of the action.
 * @property {string} description - Description of the action.
 * @property {string} path - Navigation path for the action.
 * @property {'default' | 'success' | 'destructive'} [variant] - Optional styling variant for the action.
 */
interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
  variant?: 'default' | 'success' | 'destructive';
}

/**
 * A component that displays details and actions for a specific UTXO.
 * Fetches UTXO balances and provides navigation to UTXO-related actions.
 * @returns {ReactElement} The rendered UTXO view UI.
 * @example
 * ```tsx
 * <ViewUtxo />
 * ```
 */
export const ViewUtxo = (): ReactElement => {
  const { txid } = useParams<{ txid: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const [error, setError] = useState<Error | null>(null);
  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Configures the header with navigation back to the previous page.
   */
  useEffect(() => {
    setHeaderProps({
      title: 'UTXO Details',
      onBack: () => navigate(-1),
    });

    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  /**
   * Loads UTXO balances for the given transaction ID, managing loading state via context.
   */
  useEffect(() => {
    if (!txid) {
      setBalances([]);
      return;
    }

    let isCancelled = false;

    const loadUtxoBalances = async () => {
      setIsLoading(true);
      try {
        const response = await fetchUtxoBalances(txid);
        if (!isCancelled) {
          setBalances(response.result);
          setError(null);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadUtxoBalances();

    return () => {
      isCancelled = true;
    };
  }, [txid]);

  /**
   * Generates a list of available actions for the UTXO.
   * @returns {Action[]} The list of actionable options for the UTXO.
   */
  const getActions = (): Action[] => {
    if (!txid) return [];

    return [
      {
        id: 'move',
        name: 'Move',
        description: 'Move this UTXO to another address',
        path: `/compose/utxo/move/${txid}`,
      },
      {
        id: 'detach',
        name: 'Detach',
        description: 'Detach assets from this UTXO',
        path: `/compose/utxo/detach/${txid}`,
        variant: 'destructive',
      },
    ];
  };

  if (error) {
    return (
      <div className="p-4 text-center text-gray-600">
        Failed to load UTXO information: {error.message}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* UTXO Details */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-medium text-gray-900">UTXO Details</h2>
        <div className="mt-2 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Transaction ID</span>
            <span className="text-sm font-mono text-gray-900">{txid}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Address</span>
            <span className="text-sm font-mono text-gray-900">
              {balances[0]?.utxo_address || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Asset Balances */}
      {balances.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-medium text-gray-900">Asset Balances</h2>
          <div className="mt-2 space-y-2">
            {balances.map((balance, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-sm text-gray-500">{balance.asset}</span>
                <span className="text-sm text-gray-900">
                  {balance.quantity_normalized}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UTXO Actions */}
      <div className="space-y-2">
        {getActions().map((action) => (
          <div
            key={action.id}
            onClick={() => navigate(action.path)}
            className={`
              bg-white rounded-lg p-4 shadow-sm cursor-pointer 
              hover:bg-gray-50 transition-colors
              ${action.variant === 'destructive' ? 'border border-red-200' : ''}
            `}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className={`
                  text-sm font-medium
                  ${action.variant === 'destructive' ? 'text-red-600' : 'text-gray-900'}
                `}>
                  {action.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {action.description}
                </p>
              </div>
              <FaChevronRight className="text-gray-400 w-4 h-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ViewUtxo;
