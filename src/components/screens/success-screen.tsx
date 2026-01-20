import { type ReactElement, useState, useCallback } from "react";
import { FaCheckCircle, FaClipboard, FaCheck } from "@/components/icons";
import { Button } from "@/components/button";

/**
 * Broadcast response from API
 */
interface BroadcastResponse {
  txid?: string;
  [key: string]: any;
}

/**
 * API response structure for transaction broadcast
 */
interface ApiResponse {
  broadcast?: BroadcastResponse;
  [key: string]: any;
}

/**
 * Props for the SuccessScreen component
 */
interface SuccessScreenProps {
  /** API response containing broadcast details */
  apiResponse: ApiResponse;
  /** Optional callback to reset/restart the flow */
  onReset?: () => void;
  /** Optional custom explorer URL template (use {txid} as placeholder) */
  explorerUrlTemplate?: string;
}

/**
 * Default blockchain explorer URL template
 */
const DEFAULT_EXPLORER_URL = "https://mempool.space/tx/{txid}";

/**
 * Displays a success screen after transaction broadcast.
 * 
 * This component shows a success message with the transaction ID,
 * allows copying the ID to clipboard, and provides a link to view
 * the transaction on a blockchain explorer.
 * 
 * @example
 * ```tsx
 * <SuccessScreen
 *   apiResponse={{ broadcast: { txid: "abc123..." } }}
 *   onReset={() => resetForm()}
 *   explorerUrlTemplate="https://mempool.space/tx/{txid}"
 * />
 * ```
 */
export function SuccessScreen({ 
  apiResponse, 
  onReset,
  explorerUrlTemplate = DEFAULT_EXPLORER_URL 
}: SuccessScreenProps): ReactElement {
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  
  // Extract transaction ID safely
  const txid = apiResponse?.broadcast?.txid || "unknown";
  const explorerUrl = explorerUrlTemplate.replace("{txid}", txid);

  /**
   * Copies the transaction ID to clipboard
   */
  const handleCopyTxid = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedToClipboard(true);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy transaction ID:", err);
      // Could add error toast here if we have a toast system
    }
  }, [txid]);

  /**
   * Handles keyboard interaction for the clickable transaction ID
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCopyTxid();
    }
  }, [handleCopyTxid]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
      {/* Success Card */}
      <div className="p-6 bg-green-50 rounded-lg shadow-lg text-center max-w-md w-full">
        {/* Success Icon */}
        <FaCheckCircle
          className="text-green-600 size-10 mx-auto"
          aria-hidden="true"
        />

        {/* Success Title */}
        <h2 className="text-xl font-bold text-green-800 mt-3">
          Transaction Successful
        </h2>

        {/* Success Message */}
        <p className="mt-1 text-sm text-green-700">
          Your transaction was broadcasted.
        </p>

        {/* Transaction ID Display */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Transaction ID
          </label>
          <div
            className="font-mono text-xs bg-white border border-gray-200 rounded-lg p-2 break-all text-gray-800 select-all"
          >
            {txid}
          </div>
        </div>

        {/* Copy Button - Primary action inside green box */}
        <div className="mt-4">
          <Button
            onClick={handleCopyTxid}
            color="blue"
            fullWidth
            aria-label={copiedToClipboard ? "Transaction ID copied" : "Copy transaction ID to clipboard"}
          >
            {copiedToClipboard ? (
              <>
                <FaCheck className="size-4 mr-2" aria-hidden="true" />
                Copied!
              </>
            ) : (
              <>
                <FaClipboard className="size-4 mr-2" aria-hidden="true" />
                Copy Transaction ID
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Mempool link - Footer outside the green box */}
      {txid !== "unknown" && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-gray-500 hover:text-blue-600 hover:underline transition-colors"
          aria-label="View transaction on mempool.space (opens in new tab)"
        >
          View on mempool.space →
        </a>
      )}
    </div>
  );
}