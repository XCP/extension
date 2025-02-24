"use client";

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { FaExternalLinkAlt, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchTransactions, type TransactionResponse, type Transaction } from "@/utils/blockchain/counterparty";
import type { ReactElement } from 'react';

/**
 * Number of transactions to display per page.
 * @constant {number}
 */
const TRANSACTIONS_PER_PAGE = 20;

/**
 * A component that displays the transaction history for the active wallet address.
 * Supports pagination and external link navigation to XChain.
 * @returns {JSX.Element} The rendered transaction history UI.
 * @example
 * ```tsx
 * <AddressHistory />
 * ```
 */
export default function AddressHistory(): ReactElement {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalTransactions, setTotalTransactions] = useState(0);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;

  const navigate = useNavigate();
  const { activeAddress } = useWallet();
  const { setHeaderProps } = useHeader();
  const { showLoading, hideLoading } = useLoading();
  const location = useLocation();

  const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE);

  /**
   * Syncs URL search params with saved page state from location if needed.
   */
  useEffect(() => {
    const savedPage = location.state?.page;
    if (savedPage && !searchParams.get("page")) {
      setSearchParams({ page: savedPage.toString() });
    }
  }, [location.state, searchParams, setSearchParams]);

  /**
   * Loads transactions for the current page, managing loading state via context.
   */
  useEffect(() => {
    if (!activeAddress?.address) {
      setTransactions([]);
      return;
    }

    let loadingId: string | undefined;
    let isCancelled = false;

    const loadTransactions = async (page: number) => {
      loadingId = showLoading("Loading transaction history...", {
        onError: (err) => setError(`Failed to load transactions: ${err.message}`),
      });
      try {
        const offset = (page - 1) * TRANSACTIONS_PER_PAGE;
        const data: TransactionResponse = await fetchTransactions(activeAddress.address, {
          limit: TRANSACTIONS_PER_PAGE,
          offset,
          verbose: true,
          show_unconfirmed: true,
        });
        if (!isCancelled) {
          setTransactions(data.result);
          setTotalTransactions(data.result_count);
          setError(null);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch transactions");
        }
      } finally {
        if (!isCancelled && loadingId) {
          hideLoading(loadingId);
        }
      }
    };

    loadTransactions(currentPage);

    return () => {
      isCancelled = true;
      if (loadingId) hideLoading(loadingId);
    };
  }, [currentPage, activeAddress, showLoading, hideLoading]);

  /**
   * Configures the header with back navigation and an external link to XChain.
   */
  useEffect(() => {
    setHeaderProps({
      title: "History",
      onBack: () => navigate("/index"),
      rightButton: {
        icon: <FaExternalLinkAlt />,
        onClick: () =>
          window.open(`https://www.xcp.io/address/${activeAddress?.address}`, "_blank"),
        ariaLabel: "View on XChain",
      },
    });
    return () => setHeaderProps(null); // Cleanup on unmount
  }, [setHeaderProps, navigate, activeAddress]);

  /**
   * Changes the current page and updates URL search params.
   * @param {number} page - The page number to navigate to.
   */
  const handlePageChange = (page: number) => {
    setSearchParams({ page: page.toString() });
  };

  /**
   * Formats a Unix timestamp into a human-readable date string.
   * @param {number} timestamp - The Unix timestamp in seconds.
   * @returns {string} The formatted date string.
   */
  const formatDate = (timestamp: number): string =>
    new Date(timestamp * 1000).toLocaleString();

  /**
   * Renders pagination controls for navigating between pages.
   * @returns {JSX.Element} The pagination buttons.
   */
  const renderPagination = (): ReactElement => (
    <div className="flex justify-between gap-4">
      <Button
        color="blue"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        fullWidth
      >
        <div className="flex items-center justify-center gap-2">
          <FaChevronLeft />
          Previous
        </div>
      </Button>

      <Button
        color="blue"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        fullWidth
      >
        <div className="flex items-center justify-center gap-2">
          Next
          <FaChevronRight />
        </div>
      </Button>
    </div>
  );

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="flex flex-col h-full">
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
                  navigate(`/transaction/${tx.tx_hash}`, {
                    state: { page: currentPage },
                  })
                }
                className="block hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="bg-white rounded-lg shadow p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium text-gray-900">
                      {tx.unpacked_data.message_type.toUpperCase()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(tx.block_time)}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 break-all flex items-center gap-1">
                    TX: {tx.tx_hash}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
              <div className="text-gray-600 text-lg font-medium mb-2">
                No Transactions Yet
              </div>
              <div className="text-gray-500 text-sm">
                This address hasn't made any transactions on Counterparty.
              </div>
            </div>
          </div>
        )}
      </div>
      {transactions.length > 0 && totalPages > 1 && (
        <div className="p-4">
          {renderPagination()}
        </div>
      )}
    </div>
  );
}
