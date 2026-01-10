import { useState, useRef, useEffect } from "react";
import { FiInfo, FiX } from "@/components/icons";
import { formatAddress, formatTimeAgo } from "@/utils/format";
import type { AssetInfo } from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";

interface AssetInfoPopoverProps {
  assetInfo: AssetInfo | null;
  userBalance?: string;
  className?: string;
}

/**
 * AssetInfoPopover displays an info icon that shows asset details on click.
 * Shows: Supply, Divisible, Locked, Issuer
 */
export function AssetInfoPopover({
  assetInfo,
  userBalance,
  className = ""
}: AssetInfoPopoverProps): ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!assetInfo) return null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        title="View asset details"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <FiInfo className="w-4 h-4" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-10 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">Asset Details</span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
              aria-label="Close"
            >
              <FiX className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1.5 text-xs">
            {(assetInfo.owner || assetInfo.issuer) && (
              <div className="flex justify-between">
                <span className="text-gray-500">Owner</span>
                <span className="text-gray-900 font-mono">{formatAddress(assetInfo.owner || assetInfo.issuer!)}</span>
              </div>
            )}
            {assetInfo.first_issuance_block_time && (
              <div className="flex justify-between">
                <span className="text-gray-500">Issued</span>
                <span className="text-gray-900">{formatTimeAgo(assetInfo.first_issuance_block_time)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Locked</span>
              <span className="text-gray-900">{assetInfo.locked ? "Yes" : "No"}</span>
            </div>
            {assetInfo.description_locked && (
              <div className="flex justify-between">
                <span className="text-gray-500">Description Locked</span>
                <span className="text-gray-900">Yes</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Divisible</span>
              <span className="text-gray-900">{assetInfo.divisible ? "Yes" : "No"}</span>
            </div>
            {userBalance !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">Your Balance</span>
                <span className="text-gray-900">{userBalance}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
