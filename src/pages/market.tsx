"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaExchangeAlt, FaSync, FaCog, FaPlus } from "react-icons/fa";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
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
            <p className="text-lg text-gray-600">
              Trade Assets Peer-to-Peer
            </p>
          </div>

          {/* Market Actions */}
          <div className="space-y-4">
            {/* Dispensers Section */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Dispensers</h2>
              <p className="text-sm text-gray-600 mb-4">
                Create automated vending machines for your assets
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  color="blue" 
                  onClick={() => navigate("/compose/dispenser")} 
                  className="flex items-center justify-center gap-2" 
                  aria-label="Create Dispenser"
                >
                  <FaPlus className="text-sm" aria-hidden="true" />
                  <span>Create</span>
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

            {/* Orders Section */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Orders</h2>
              <p className="text-sm text-gray-600 mb-4">
                Trade assets directly on the Counterparty DEX
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  color="blue" 
                  onClick={() => navigate("/compose/order")} 
                  className="flex items-center justify-center gap-2" 
                  aria-label="Create Order"
                >
                  <FaPlus className="text-sm" aria-hidden="true" />
                  <span>Create</span>
                </Button>
                <Button 
                  color="gray" 
                  onClick={() => {}} 
                  className="flex items-center justify-center gap-2" 
                  aria-label="View Orders"
                  disabled
                >
                  <FaExchangeAlt className="text-sm" aria-hidden="true" />
                  <span>Browse</span>
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