"use client";

import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FaExternalLinkAlt, FaChevronLeft } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { fetchTransaction, type Transaction } from "@/utils/blockchain/counterparty";
import { formatDate, formatAmount, formatTimeAgo } from "@/utils/format";
import { getMessageHandler } from "./message-types";
import type { ReactElement } from "react";

/**
 * ViewTransaction component displays the details of a specific transaction.
 * Uses modular message type handlers for different transaction types.
 */
export default function ViewTransaction(): ReactElement {
  const { txHash } = useParams<{ txHash: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderProps } = useHeader();
  
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get the page number from location state to return to the correct history page
  const savedPage = location.state?.page || 1;

  useEffect(() => {
    const loadTransaction = async () => {
      if (!txHash) {
        setError("No transaction hash provided");
        setIsLoading(false);
        return;
      }

      try {
        const tx = await fetchTransaction(txHash, { verbose: true });
        if (tx) {
          setTransaction(tx);
        } else {
          setError("Transaction not found");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch transaction");
      } finally {
        setIsLoading(false);
      }
    };

    loadTransaction();
  }, [txHash]);

  useEffect(() => {
    setHeaderProps({
      title: "Transaction",
      onBack: () => navigate(`/address-history?page=${savedPage}`),
      rightButton: {
        icon: <FaExternalLinkAlt aria-hidden="true" />,
        onClick: () => window.open(`https://www.xcp.io/tx/${txHash}`, "_blank"),
        ariaLabel: "View on XChain",
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, txHash, savedPage]);

  if (isLoading) return <Spinner message="Loading transaction..." />;
  if (error) return <ErrorAlert message={error} onClose={() => setError(null)} />;
  if (!transaction) return <ErrorAlert message="Transaction not found" />;

  // Get the message type
  const messageType = transaction.unpacked_data?.message_type || 
                      transaction.transaction_type || 
                      transaction.type || 
                      "unknown";

  // Get the custom fields using the appropriate handler
  const handler = getMessageHandler(messageType);
  const customFields = handler ? handler(transaction) : [];

  // Calculate BTC fee if available
  const btcFee = transaction.fee ? transaction.fee / 1e8 : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <div className="bg-white rounded-lg shadow-lg p-4 space-y-4">
          <h3 className="text-lg font-bold">
            {messageType.toUpperCase().replace(/_/g, " ")}
          </h3>

          <div className="space-y-4">
            {/* Transaction Hash */}
            <div className="space-y-1">
              <span className="font-semibold text-gray-700">Transaction Hash:</span>
              <div className="bg-gray-50 p-2 rounded break-all text-gray-900 text-xs">
                {transaction.tx_hash}
              </div>
            </div>

            {/* Block Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="font-semibold text-gray-700">Block:</span>
                <div className="bg-gray-50 p-2 rounded text-gray-900">
                  {transaction.block_index}
                </div>
              </div>
              <div className="space-y-1">
                <span className="font-semibold text-gray-700">Time:</span>
                <div 
                  className="bg-gray-50 p-2 rounded text-gray-900 cursor-help"
                  title={formatDate(transaction.block_time)}
                >
                  {formatTimeAgo(transaction.block_time)}
                </div>
              </div>
            </div>

            {/* Source Address */}
            <div className="space-y-1">
              <span className="font-semibold text-gray-700">From:</span>
              <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
                {transaction.source || "N/A"}
              </div>
            </div>

            {/* Destination Address (if applicable) */}
            {(transaction.destination && transaction.destination !== transaction.source) && (
              <div className="space-y-1">
                <span className="font-semibold text-gray-700">To:</span>
                <div className="bg-gray-50 p-2 rounded break-all text-gray-900">
                  {transaction.destination}
                </div>
              </div>
            )}

            {/* Type-specific fields */}
            {customFields.filter(field => field.value !== undefined && field.value !== null && field.value !== '').map((field, idx) => (
              <div key={idx} className="space-y-1">
                <span className="font-semibold text-gray-700">{field.label}:</span>
                <div className="bg-gray-50 p-2 rounded text-gray-900">
                  {typeof field.value === 'string' || typeof field.value === 'number' ? (
                    <span>{field.value}</span>
                  ) : (
                    field.value
                  )}
                </div>
              </div>
            ))}

            {/* Fee */}
            {(btcFee !== null && btcFee > 0) && (
              <div className="space-y-1">
                <span className="font-semibold text-gray-700">Fee:</span>
                <div className="bg-gray-50 p-2 rounded text-gray-900">
                  {`${formatAmount({
                    value: btcFee,
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} BTC`}
                </div>
              </div>
            )}

            {/* BTC Amount (if different from fee and greater than 0) */}
            {transaction.btc_amount !== undefined && transaction.btc_amount > 0 && (
              <div className="space-y-1">
                <span className="font-semibold text-gray-700">BTC Amount:</span>
                <div className="bg-gray-50 p-2 rounded text-gray-900">
                  {transaction.btc_amount_normalized ? 
                    `${transaction.btc_amount_normalized} BTC` : 
                    `${formatAmount({
                      value: transaction.btc_amount / 1e8,
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} BTC`
                  }
                </div>
              </div>
            )}

            {/* Confirmation Status */}
            <div className="space-y-1">
              <span className="font-semibold text-gray-700">Status:</span>
              <div className="bg-gray-50 p-2 rounded text-gray-900">
                {transaction.confirmed ? "Confirmed" : "Unconfirmed"}
              </div>
            </div>
          </div>

          {/* Raw Transaction Data */}
          <div className="mt-4">
            <details>
              <summary className="text-md font-semibold cursor-pointer text-gray-700 hover:text-gray-900">
                Raw Transaction Data
              </summary>
              <pre className="mt-2 overflow-y-auto overflow-x-auto text-sm bg-gray-50 p-3 rounded-md h-44 border border-gray-200">
                {JSON.stringify(transaction, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>

      {/* Footer with Back to History button */}
      <div className="p-4">
        <Button 
          onClick={() => navigate(`/address-history?page=${savedPage}`)} 
          color="blue"
          fullWidth
        >
          <div className="flex items-center justify-center gap-2">
            <FaChevronLeft aria-hidden="true" />
            Back to History
          </div>
        </Button>
      </div>
    </div>
  );
}