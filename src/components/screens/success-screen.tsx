import { type ReactElement, useState, useCallback } from "react";
import { FaCheckCircle, FaClipboard, FaCheck, FaExternalLinkAlt } from "@/components/icons";
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
const DEFAULT_EXPLORER_URL = "https://blockchain.info/tx/{txid}";

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
    <div className="flex items-center justify-center min-h-[calc(100vh-6rem)]">
      <div className="p-6 bg-green-50 rounded-lg shadow-lg text-center max-w-md w-full">
        {/* Success Icon */}
        <FaCheckCircle
          className="text-green-600 size-12 mx-auto"
          aria-hidden="true"
        />
        
        {/* Success Title */}
        <h2 className="text-2xl font-bold text-green-800 mt-4">
          Transaction Successful!
        </h2>
        
        {/* Success Message */}
        <p className="mt-2 text-green-700">
          Your transaction has been signed and broadcast.
        </p>
        
        {/* Transaction ID Display */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transaction ID:
          </label>
          <div
            onClick={handleCopyTxid}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Transaction ID: ${txid}. Click to copy`}
            className="font-mono text-sm bg-white border border-gray-200 rounded-lg p-3 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors duration-200"
          >
            {txid}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="mt-6 space-y-3">
          {/* Copy Button */}
          <Button
            onClick={handleCopyTxid}
            color="blue"
            fullWidth
            aria-label={copiedToClipboard ? "Transaction ID copied" : "Copy transaction ID to clipboard"}
          >
            {copiedToClipboard ? (
              <>
                <FaCheck className="size-4 mr-2" aria-hidden="true" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <FaClipboard className="size-4 mr-2" aria-hidden="true" />
                <span>Copy Transaction ID</span>
              </>
            )}
          </Button>
          
          {/* Explorer Link */}
          {txid !== "unknown" && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-600 rounded-lg hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors duration-200"
              aria-label="View transaction on blockchain explorer (opens in new tab)"
            >
              <FaExternalLinkAlt className="size-4 mr-2" aria-hidden="true" />
              View on Explorer
            </a>
          )}
          
          {/* Reset Button (if callback provided) */}
          {onReset && (
            <Button
              onClick={onReset}
              color="gray"
              fullWidth
              aria-label="Start a new transaction"
            >
              New Transaction
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}