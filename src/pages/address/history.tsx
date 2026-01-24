
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiRefreshCw, FaChevronLeft, FaChevronRight } from "@/components/icons";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { TransactionCard } from "@/components/cards/transaction-card";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchTransactions, type PaginatedResponse, type Transaction } from "@/utils/blockchain/counterparty/api";
import type { ReactElement } from "react";

/**
 * Constants for transaction pagination and navigation paths.
 */
const CONSTANTS = {
  TRANSACTIONS_PER_PAGE: 20,
  PATHS: {
    BACK: "/index",
    TRANSACTION: "/transaction",
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
      const data: PaginatedResponse<Transaction> = await fetchTransactions(activeAddress.address, {
        limit: CONSTANTS.TRANSACTIONS_PER_PAGE,
        offset,
        verbose: true,
        showUnconfirmed: true,
      });
      setTransactions(data.result);
      setTotalTransactions(data.result_count);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch transactions";
      // "Invalid integer: cursor" error occurs for new addresses with no history
      // Treat this as an empty result rather than an error
      if (errorMessage.includes("Invalid integer: cursor")) {
        setTransactions([]);
        setTotalTransactions(0);
        setError(null);
      } else {
        setError(errorMessage);
      }
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
        icon: <FiRefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />,
        onClick: () => loadTransactions(),
        ariaLabel: "Refresh transactions",
        disabled: isLoading,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isLoading]);

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
          <FaChevronLeft className="size-4" aria-hidden="true" />
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
          <FaChevronRight className="size-4" aria-hidden="true" />
        </div>
      </Button>
    </div>
  );

  if (isLoading) return <Spinner message="Loading transactions…" />;
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
              <TransactionCard
                key={tx.tx_hash}
                transaction={tx}
                onClick={() =>
                  navigate(`${CONSTANTS.PATHS.TRANSACTION}/${tx.tx_hash}`, { state: { page: currentPage } })
                }
              />
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
