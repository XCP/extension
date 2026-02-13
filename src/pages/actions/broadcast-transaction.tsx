import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaCopy, FaCheck, FaCheckCircle, FiRefreshCw, FiExternalLink } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { broadcastTransaction } from "@/utils/blockchain/bitcoin/transactionBroadcaster";
import type { ReactElement } from "react";

type CopiedField = "txid" | null;

export default function BroadcastTransactionPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  const [signedTxHex, setSignedTxHex] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [txid, setTxid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<CopiedField>(null);

  const handleReset = useCallback(() => {
    setSignedTxHex("");
    setTxid("");
    setError(null);
  }, []);

  useEffect(() => {
    const hasContent = Boolean(signedTxHex || txid || error);
    setHeaderProps({
      title: "Broadcast Transaction",
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleReset,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, handleReset, signedTxHex, txid, error]);

  const handleBroadcast = async () => {
    setError(null);
    setTxid("");

    const trimmed = signedTxHex.trim();
    if (!trimmed) {
      setError("Please enter a signed transaction hex");
      return;
    }

    if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
      setError("Invalid hex string");
      return;
    }

    setIsBroadcasting(true);

    try {
      const result = await broadcastTransaction(trimmed);
      setTxid(result.txid);
    } catch (err) {
      console.error("Failed to broadcast transaction:", err);
      setError(
        err instanceof Error ? err.message : "Failed to broadcast transaction"
      );
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleCopy = async (text: string, field: CopiedField) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 space-y-4">
        {/* Input */}
        <TextAreaInput
          value={signedTxHex}
          onChange={(value) => {
            setSignedTxHex(value);
            if (txid) setTxid("");
          }}
          label="Signed Transaction Hex"
          placeholder="Paste signed transaction hex here…"
          rows={4}
          required={false}
          showCharCount={false}
          disabled={isBroadcasting}
        />
        <div className="flex justify-end">
          <span className="text-xs text-gray-500">
            {signedTxHex.length} characters
          </span>
        </div>

        {/* Broadcast button */}
        {!txid && (
          <Button
            onClick={() => handleBroadcast()}
            color="blue"
            disabled={!signedTxHex.trim() || isBroadcasting}
            fullWidth
          >
            {isBroadcasting ? (
              <>
                <FiRefreshCw
                  className="size-4 mr-2 animate-spin"
                  aria-hidden="true"
                />
                Broadcasting…
              </>
            ) : (
              "Broadcast Transaction"
            )}
          </Button>
        )}

        {/* Success */}
        {txid && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FaCheckCircle className="size-4 text-green-600" aria-hidden="true" />
                <span className="text-sm font-medium text-green-800">
                  Transaction Broadcast
                </span>
              </div>
              <p className="text-xs text-green-700 font-mono break-all">
                {txid}
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  onClick={() => handleCopy(txid, "txid")}
                  className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                    copiedField === "txid"
                      ? "text-green-600 hover:text-green-700"
                      : "text-blue-600 hover:text-blue-700"
                  }`}
                >
                  {copiedField === "txid" ? (
                    <>
                      <FaCheck className="size-3" aria-hidden="true" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <FaCopy className="size-3" aria-hidden="true" />
                      Copy txid
                    </>
                  )}
                </button>
                {!txid.startsWith("dev_mock_tx_") && (
                  <a
                    href={`https://mempool.space/tx/${txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <FiExternalLink className="size-3" aria-hidden="true" />
                    View on mempool.space
                  </a>
                )}
              </div>
            </div>

            <Button onClick={handleReset} color="gray">
              Reset
            </Button>
          </div>
        )}
      </div>

      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
    </div>
  );
}
