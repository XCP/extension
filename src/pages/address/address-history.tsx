"use client";

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  FaExternalLinkAlt,
  FaSpinner,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { Button } from "@/components/button";
import { useWallet } from "@/contexts/wallet-context";
import { useHeader } from "@/contexts/header-context";
import { fetchTransactions, TransactionResponse, Transaction } from "@/utils/blockchain/counterparty";

const TRANSACTIONS_PER_PAGE = 20;

export default function AddressHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalTransactions, setTotalTransactions] = useState(0);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;

  const navigate = useNavigate();
  const { activeAddress } = useWallet();
  const { setHeaderProps } = useHeader();
  // Use activeAddress from the new context structure.
  const currentAddress = activeAddress?.address;

  const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE);
  const location = useLocation();

  // If a page is saved in location.state but not in the URL, update the search params.
  useEffect(() => {
    const savedPage = location.state?.page;
    if (savedPage && !searchParams.get("page")) {
      setSearchParams({ page: savedPage.toString() });
    }
  }, [location.state, searchParams, setSearchParams]);

  const loadTransactions = async (page: number) => {
    if (!currentAddress) return;
    try {
      setLoading(true);
      const offset = (page - 1) * TRANSACTIONS_PER_PAGE;
      const data: TransactionResponse = await fetchTransactions(currentAddress, {
        limit: TRANSACTIONS_PER_PAGE,
        offset,
        verbose: true,
        show_unconfirmed: true,
      });
      setTransactions(data.result);
      setTotalTransactions(data.result_count);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch transactions"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions(currentPage);
  }, [currentPage, currentAddress]);

  // Set the header.
  useEffect(() => {
    setHeaderProps({
      title: "History",
      onBack: () => navigate("/index"),
      rightButton: {
        icon: <FaExternalLinkAlt />,
        onClick: () =>
          window.open(`https://www.xcp.io/address/${currentAddress}`, "_blank"),
        ariaLabel: "View on XChain",
      },
    });
  }, [setHeaderProps, navigate, currentAddress]);

  const handlePageChange = (page: number) => {
    setSearchParams({ page: page.toString() });
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleString();

  const renderPagination = () => (
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }

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
      {/* Move pagination to bottom and add padding */}
      {transactions.length > 0 && totalPages > 1 && (
        <div className="p-4">
          {renderPagination()}
        </div>
      )}
    </div>
  );
}
