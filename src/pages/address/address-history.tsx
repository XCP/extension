"use client";

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaExternalLinkAlt, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchTransactions, type TransactionResponse, type Transaction } from "@/utils/blockchain/counterparty";
import { formatDate, formatTimeAgo } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Constants for transaction pagination and navigation paths.
 */
const CONSTANTS = {
  TRANSACTIONS_PER_PAGE: 20,
  PATHS: {
    BACK: "/index",
    TRANSACTION: "/transaction",
    XCHAIN_URL: "https://www.xcp.io/address",
  } as const,
} as const;

/**
 * AddressHistory component displays the transaction history for the active wallet address.
 * Features pagination and external link navigation to XChain.
 *
 * @returns {ReactElement} The rendered transaction history UI.
 * @example
 * ```tsx
 * <AddressHistory />
 * ```
 */
export default function AddressHistory(): ReactElement {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;
  const totalPages = Math.ceil(totalTransactions / CONSTANTS.TRANSACTIONS_PER_PAGE);

  const navigate = useNavigate();
  const { activeAddress } = useWallet();
  const { setHeaderProps } = useHeader();

  /**
   * Loads transactions for the current page, handling loading and error states.
   */
  const loadTransactions = async () => {
    if (!activeAddress?.address) {
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    try {
      const offset = (currentPage - 1) * CONSTANTS.TRANSACTIONS_PER_PAGE;
      const data: TransactionResponse = await fetchTransactions(activeAddress.address, {
        limit: CONSTANTS.TRANSACTIONS_PER_PAGE,
        offset,
        verbose: true,
        show_unconfirmed: true,
      });
      setTransactions(data.result);
      setTotalTransactions(data.result_count);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
    } finally {
      setIsLoading(false);
    }
  };

  // Sync URL search params with saved page state
  useEffect(() => {
    const savedPage = history.state?.page;
    if (savedPage && !searchParams.get("page")) {
      setSearchParams({ page: savedPage.toString() });
    }
  }, [searchParams, setSearchParams]);

  // Fetch transactions when page or address changes
  useEffect(() => {
    loadTransactions();
  }, [currentPage, activeAddress]);

  // Auto-refresh for unconfirmed transactions
  useEffect(() => {
    // Check if there are any unconfirmed transactions
    const hasUnconfirmed = transactions.some(tx => tx.confirmed === false);
    
    if (hasUnconfirmed) {
      // Set up interval to refresh every 30 seconds
      const interval = setInterval(() => {
        loadTransactions();
      }, 30000); // 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [transactions]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "History",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: {
        icon: <FaExternalLinkAlt aria-hidden="true" />,
        onClick: () => window.open(`${CONSTANTS.PATHS.XCHAIN_URL}/${activeAddress?.address}`, "_blank"),
        ariaLabel: "View on XChain",
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, activeAddress]);

  /**
   * Updates the current page in URL search params.
   * @param page - The page number to navigate to.
   */
  const handlePageChange = (page: number) => {
    setSearchParams({ page: page.toString() });
  };

  /**
   * Renders pagination controls for navigating between pages.
   * @returns {ReactElement} Pagination buttons.
   */
  const renderPagination = (): ReactElement => (
    <div className="flex justify-between gap-4">
      <Button
        color="blue"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1 || isLoading}
        fullWidth
      >
        <div className="flex items-center justify-center gap-2">
          <FaChevronLeft aria-hidden="true" />
          Previous
        </div>
      </Button>
      <Button
        color="blue"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages || isLoading}
        fullWidth
      >
        <div className="flex items-center justify-center gap-2">
          Next
          <FaChevronRight aria-hidden="true" />
        </div>
      </Button>
    </div>
  );

  if (isLoading) return <Spinner message="Loading transactions..." />;
  if (error) return <ErrorAlert message={error} onClose={() => setError(null)} />;

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="history-title">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        {transactions.length > 0 ? (
          <div className="space-y-4">
            {totalPages > 1 && (
              <div className="text-center text-sm text-gray-500 mb-4">
                Page {currentPage} of {totalPages}
              </div>
            )}
            {transactions.map((tx) => (
              <div
                key={tx.tx_hash}
                onClick={() =>
                  navigate(`${CONSTANTS.PATHS.TRANSACTION}/${tx.tx_hash}`, { state: { page: currentPage } })
                }
                className={`block hover:shadow-lg transition-shadow cursor-pointer ${
                  tx.confirmed === false ? "opacity-75" : ""
                }`}
                role="button"
                tabIndex={0}
                aria-label={`View transaction ${tx.tx_hash}`}
              >
                <div className={`rounded-lg shadow p-4 space-y-2 ${
                  tx.confirmed === false 
                    ? "bg-yellow-50 border-2 border-yellow-200" 
                    : "bg-white"
                }`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {tx.unpacked_data.message_type.toUpperCase().replace(/_/g, " ")}
                      </div>
                      {tx.confirmed === false && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500" title={tx.confirmed === false ? "Unconfirmed" : formatDate(tx.block_time)}>
                      {tx.confirmed === false ? "Mempool" : formatTimeAgo(tx.block_time)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 break-all flex items-center gap-1">
                    TX: {tx.tx_hash}
                    {tx.confirmed === false && (
                      <span className="text-yellow-600 ml-2">(0 confirmations)</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
              <div className="text-gray-600 text-lg font-medium mb-2">No Transactions Yet</div>
              <div className="text-gray-500 text-sm">
                This address hasn’t made any transactions on Counterparty.
              </div>
            </div>
          </div>
        )}
      </div>
      {transactions.length > 0 && totalPages > 1 && <div className="p-4">{renderPagination()}</div>}
    </div>
  );
}
