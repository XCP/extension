import { FaCheckCircle, FaClipboard, FaCheck } from "react-icons/fa";
import { useState } from "react";
import { Button } from "@/components/button";

interface SuccessScreenProps {
  apiResponse: any;
  onReset: () => void;
}

export function SuccessScreen({ apiResponse, onReset }: SuccessScreenProps) {
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const broadcastResponse = apiResponse.broadcast;
  const txid = broadcastResponse?.txid || "unknown";
  // Adjust the explorer URL as needed
  const explorerUrl = `https://blockchain.info/tx/${txid}`;

  const handleCopyTxid = async () => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy transaction ID:", err);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCopyTxid();
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-6rem)]">
      <div className="p-4 bg-green-50 rounded-lg shadow-lg text-center max-w-md w-full">
        <FaCheckCircle className="text-green-600 w-12 h-12 mx-auto" />
        <h2 className="text-2xl font-bold text-green-800 mt-4">
          Transaction Successful!
        </h2>
        <p className="mt-2 text-green-700">
          Your transaction has been signed and broadcast.
        </p>
        
        <div className="mt-4">
          <div
            onClick={handleCopyTxid}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Copy transaction ID"
            className="font-mono text-sm bg-white border border-gray-200 rounded-lg p-3 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
          >
            {txid}
          </div>
        </div>
        
        <div className="mt-4 space-y-4">
          <Button
            onClick={handleCopyTxid}
            color="blue"
            fullWidth
            className="max-w-full"
            aria-label="Copy transaction ID"
          >
            {copiedToClipboard ? (
              <>
                <FaCheck className="w-4 h-4 mr-2" aria-hidden="true" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <FaClipboard className="w-4 h-4 mr-2" aria-hidden="true" />
                <span>Copy Transaction ID</span>
              </>
            )}
          </Button>
          
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 underline mt-2"
          >
            View Transaction on Explorer
          </a>
        </div>
      </div>
    </div>
  );
}
