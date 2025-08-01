"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaStore, FaExchangeAlt, FaSync } from "react-icons/fa";
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
          <div className="grid grid-cols-3 gap-4">
            <Button 
              color="gray" 
              onClick={() => {}} 
              className="flex-col !py-4" 
              aria-label="Dispensers"
              disabled
            >
              <FaStore className="text-xl mb-2" aria-hidden="true" />
              <span>Dispensers</span>
            </Button>
            <Button 
              color="gray" 
              onClick={() => {}} 
              className="flex-col !py-4" 
              aria-label="Orders"
              disabled
            >
              <FaExchangeAlt className="text-xl mb-2" aria-hidden="true" />
              <span>Orders</span>
            </Button>
            <Button 
              color="gray" 
              onClick={() => {}} 
              className="flex-col !py-4" 
              aria-label="Swaps"
              disabled
            >
              <FaSync className="text-xl mb-2" aria-hidden="true" />
              <span>Swaps</span>
            </Button>
          </div>

          {/* Coming Soon Section */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">Market features coming soon!</p>
              <p className="text-sm">Browse, create, and manage DEX orders.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}