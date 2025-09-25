"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaExchangeAlt, FaSync, FaCog, FaBitcoin, FaCoins } from "react-icons/fa";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { formatAmount } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/index",
  } as const,
} as const;

/**
 * Market component displays the XCP DEX marketplace.
 *
 * @returns {ReactElement} The rendered market UI.
 * @example
 * ```tsx
 * <Market />
 * ```
 */
export default function Market(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { btc, xcp, loading, error, refetch } = useMarketPrices();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Marketplace",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="market-title">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <div className="space-y-4">
          {/* Header Section */}
          <div className="text-center py-8">
            <h1 id="market-title" className="text-3xl font-bold text-gray-900 mb-2">
              XCP DEX
            </h1>
          </div>

          {/* Price Display Section */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* BTC Price Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FaBitcoin className="text-orange-500 text-lg" aria-hidden="true" />
                  <span className="font-medium text-gray-900">BTC</span>
                </div>
                {loading ? (
                  <div className="animate-pulse bg-gray-200 h-5 w-16 rounded"></div>
                ) : error ? (
                  <span className="text-red-500 text-sm">Error</span>
                ) : btc ? (
                  <span className="font-semibold text-gray-900">
                    ${formatAmount({ value: btc, maximumFractionDigits: 0 })}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            </div>

            {/* XCP Price Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FaCoins className="text-blue-500 text-lg" aria-hidden="true" />
                  <span className="font-medium text-gray-900">XCP</span>
                </div>
                {loading ? (
                  <div className="animate-pulse bg-gray-200 h-5 w-16 rounded"></div>
                ) : error ? (
                  <span className="text-red-500 text-sm">Error</span>
                ) : xcp ? (
                  <span className="font-semibold text-gray-900">
                    ${formatAmount({ value: xcp, maximumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-center mb-4">
              <button
                onClick={refetch}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Retry loading prices
              </button>
            </div>
          )}

          {/* Market Actions */}
          <div className="space-y-4">
            {/* Orders Section */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">DEX Orders</h2>
              <p className="text-sm text-gray-600 mb-4">
                Trade assets peer-to-peer with XCP.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  color="blue"
                  onClick={() => {}}
                  className="flex items-center justify-center gap-2"
                  aria-label="Browse Orders"
                  disabled
                >
                  <FaExchangeAlt className="text-sm" aria-hidden="true" />
                  <span>Browse</span>
                </Button>
                <Button
                  color="gray"
                  onClick={() => {}}
                  className="flex items-center justify-center gap-2"
                  aria-label="Manage Orders"
                  disabled
                >
                  <FaCog className="text-sm" aria-hidden="true" />
                  <span>Manage</span>
                </Button>
              </div>
            </div>

            {/* Dispensers Section */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Dispensers</h2>
              <p className="text-sm text-gray-600 mb-4">
                Bitcoin-operated vending machines.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  color="blue"
                  onClick={() => {}}
                  className="flex items-center justify-center gap-2"
                  aria-label="Browse Dispensers"
                  disabled
                >
                  <FaExchangeAlt className="text-sm" aria-hidden="true" />
                  <span>Browse</span>
                </Button>
                <Button
                  color="gray"
                  onClick={() => navigate("/dispensers/manage")}
                  className="flex items-center justify-center gap-2"
                  aria-label="Manage Dispensers"
                >
                  <FaCog className="text-sm" aria-hidden="true" />
                  <span>Manage</span>
                </Button>
              </div>
            </div>

            {/* Swaps Section - Coming Soon */}
            <div className="bg-white rounded-lg shadow-sm p-4 opacity-50">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Atomic Swaps</h2>
              <p className="text-sm text-gray-600 mb-4">
                Trustless peer-to-peer asset exchanges
              </p>
              <div className="text-center text-gray-500 py-2">
                <FaSync className="text-2xl mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm">Coming Soon</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}