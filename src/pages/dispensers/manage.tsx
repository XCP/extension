
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaFilter, FaTimes, FaExternalLinkAlt } from "@/components/icons";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressDispensers, type Dispenser } from "@/utils/blockchain/counterparty/api";
import { formatAmount } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Status mapping for dispensers
 */
const DISPENSER_STATUS = {
  0: { label: "Open", color: "bg-green-100 text-green-800" },
  10: { label: "Closed", color: "bg-gray-100 text-gray-800" },
  11: { label: "Closing", color: "bg-yellow-100 text-yellow-800" },
} as const;

type StatusFilter = "all" | "open" | "closed";

/**
 * DispenserManagement component for managing user's dispensers
 */
export default function DispenserManagement(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeAddress } = useWallet();
  
  // State
  const [dispensers, setDispensers] = useState<Dispenser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  
  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "My Dispensers",
      onBack: () => navigate("/market"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);
  
  // Load dispensers
  const loadDispensers = async () => {
    if (!activeAddress?.address) {
      setDispensers([]);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const statusParam = statusFilter === "all" ? undefined : 
                         statusFilter === "open" ? "open" : "closed";
      
      const response = await fetchAddressDispensers(activeAddress.address, {
        status: statusParam,
        limit: 100,
      });

      setDispensers(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dispensers");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Reload when filter or address changes
  useEffect(() => {
    loadDispensers();
  }, [activeAddress, statusFilter]);
  
  const getFilteredDispensers = () => {
    if (statusFilter === "all") return dispensers;
    
    return dispensers.filter(d => {
      if (statusFilter === "open") return d.status === 0;
      if (statusFilter === "closed") return d.status === 10 || d.status === 11;
      return true;
    });
  };
  
  const filteredDispensers = getFilteredDispensers();
  
  if (isLoading) {
    return <Spinner message="Loading your dispensers…" />;
  }
  
  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={loadDispensers} color="blue">
          Try Again
        </Button>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-4">
      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm p-3">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <FaFilter className="size-3" aria-hidden="true" />
            Filter by Status
          </button>
          
          {statusFilter !== "all" && (
            <button
              onClick={() => setStatusFilter("all")}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 rounded"
            >
              <FaTimes className="size-3" aria-hidden="true" />
              Clear Filter
            </button>
          )}
        </div>
        
        {showFilters && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                statusFilter === "all"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              All ({dispensers.length})
            </button>
            <button
              onClick={() => setStatusFilter("open")}
              className={`px-3 py-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
                statusFilter === "open"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Open ({dispensers.filter(d => d.status === 0).length})
            </button>
            <button
              onClick={() => setStatusFilter("closed")}
              className={`px-3 py-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 ${
                statusFilter === "closed"
                  ? "bg-gray-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Closed ({dispensers.filter(d => d.status === 10 || d.status === 11).length})
            </button>
          </div>
        )}
      </div>
      
      {/* Dispensers List */}
      {filteredDispensers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-gray-500">
            {statusFilter === "all" 
              ? "You don't have any dispensers yet"
              : `No ${statusFilter} dispensers found`}
          </div>
          {statusFilter === "all" && (
            <Button
              onClick={() => navigate("/compose/dispenser")}
              color="blue"
              className="mt-4"
            >
              Create Dispenser
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDispensers.map((dispenser) => {
            const statusInfo = DISPENSER_STATUS[dispenser.status as keyof typeof DISPENSER_STATUS] || 
                              { label: "Unknown", color: "bg-gray-100 text-gray-800" };
            
            return (
              <div
                key={dispenser.tx_hash}
                className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {dispenser.asset}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Remaining: {formatAmount({
                        value: Number(dispenser.give_remaining_normalized),
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 8,
                      })} {dispenser.asset}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => window.open(`https://www.xcp.io/tx/${dispenser.tx_hash}`, "_blank")}
                    className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    aria-label="View on XCP.io"
                  >
                    <FaExternalLinkAlt className="size-4" aria-hidden="true" />
                  </button>
                </div>
                
                <div className="text-xs text-gray-500 mb-3">
                  TX: {dispenser.tx_hash}
                </div>
                
                {/* Actions */}
                <div className="flex gap-2">
                  {dispenser.status === 0 && (
                    <>
                      <Button
                        onClick={() => navigate(`/compose/dispenser/close/${dispenser.source}/${dispenser.asset}`)}
                        color="gray"
                        fullWidth
                      >
                        Close Dispenser
                      </Button>
                      <Button
                        onClick={() => navigate(`/compose/dispenser/${dispenser.asset}`)}
                        color="blue"
                        fullWidth
                      >
                        Create Another
                      </Button>
                    </>
                  )}
                  
                  {(dispenser.status === 10 || dispenser.status === 11) && (
                    <Button
                      onClick={() => navigate(`/compose/dispenser/${dispenser.asset}`)}
                      color="blue"
                      fullWidth
                    >
                      Create New Dispenser
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Create New Button */}
      {filteredDispensers.length > 0 && (
        <Button
          onClick={() => navigate("/compose/dispenser")}
          color="blue"
          fullWidth
        >
          Create New Dispenser
        </Button>
      )}
    </div>
  );
}