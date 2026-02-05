import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaCopy, FaCheck, FaLock, FaCheckCircle, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getWalletService } from "@/services/walletService";
import { analytics } from "@/utils/fathom";
import type { ReactElement } from "react";

/**
 * SignTransaction component for signing raw transactions
 */
export default function SignTransactionPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress } = useWallet();

  // State
  const [rawTxHex, setRawTxHex] = useState("");
  const [signedTxHex, setSignedTxHex] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'input' | 'output' | null>(null);

  // Reset function with stable reference
  const handleReset = useCallback(() => {
    setRawTxHex("");
    setSignedTxHex("");
    setError(null);
  }, []);

  // Configure header with reset button
  useEffect(() => {
    const hasContent = Boolean(rawTxHex || signedTxHex || error);

    setHeaderProps({
      title: "Sign Transaction",
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleReset,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, handleReset, rawTxHex, signedTxHex, error]);

  const handleSign = async () => {
    if (!activeWallet || !activeAddress) {
      setError("No active wallet or address");
      return;
    }

    const trimmed = rawTxHex.trim();
    if (!trimmed) {
      setError("Please enter a raw transaction hex");
      return;
    }

    if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
      setError("Invalid hex string");
      return;
    }

    setIsSigning(true);
    setError(null);
    setSignedTxHex("");

    try {
      const walletService = getWalletService();
      const signed = await walletService.signTransaction(
        trimmed,
        activeAddress.address
      );

      setSignedTxHex(signed);
      analytics.track('transaction_signed');
    } catch (err) {
      console.error("Failed to sign transaction:", err);
      setError(err instanceof Error ? err.message : "Failed to sign transaction");
    } finally {
      setIsSigning(false);
    }
  };

  const handleCopy = async (text: string, field: 'input' | 'output') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  if (!activeAddress) {
    return (
      <div className="p-4 text-center">
        <div className="text-gray-600 mb-4">No active address selected</div>
        <Button onClick={() => navigate("/index")} color="blue">
          Go to Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
        {/* Raw Transaction Input */}
        <TextAreaInput
          value={rawTxHex}
          onChange={(value) => {
            setRawTxHex(value);
            if (signedTxHex) {
              setSignedTxHex("");
            }
          }}
          label="Raw Transaction Hex"
          placeholder="Paste raw transaction hex here…"
          rows={4}
          required={false}
          showCharCount={false}
          disabled={isSigning}
        />
        <div className="mt-2 flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {rawTxHex.length} characters
          </span>
          {rawTxHex && (
            <button
              onClick={() => handleCopy(rawTxHex, 'input')}
              className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                copiedField === 'input'
                  ? 'text-green-600 hover:text-green-700'
                  : 'text-blue-600 hover:text-blue-700'
              }`}
            >
              {copiedField === 'input' ? (
                <>
                  <FaCheck className="size-3" aria-hidden="true" />
                  Copied!
                </>
              ) : (
                'Copy'
              )}
            </button>
          )}
        </div>

        {/* Signed Transaction Output */}
        <div className="mt-4">
          <TextAreaInput
            value={signedTxHex}
            onChange={() => {}}
            label="Signed Transaction Hex"
            placeholder="Signed transaction will appear here after signing..."
            rows={4}
            disabled={true}
            readOnly={true}
            className="bg-gray-50"
          />
          {signedTxHex && (
            <div className="mt-2 flex justify-between items-center">
              <span className="text-xs text-green-600 flex items-center gap-1">
                <FaCheckCircle className="size-3" aria-hidden="true" />
                Signed
              </span>
              <button
                onClick={() => handleCopy(signedTxHex, 'output')}
                className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                  copiedField === 'output'
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {copiedField === 'output' ? (
                  <>
                    <FaCheck className="size-3" aria-hidden="true" />
                    Copied!
                  </>
                ) : (
                  <>
                    <FaCopy className="size-3" aria-hidden="true" />
                    Copy signed tx
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Sign Button - only show if not signed */}
        {!signedTxHex && (
          <div className="mt-4">
            <Button
              onClick={() => handleSign()}
              color="blue"
              disabled={!rawTxHex.trim() || isSigning}
              fullWidth
            >
              {isSigning ? (
                <>
                  <FiRefreshCw className="size-4 mr-2 animate-spin" aria-hidden="true" />
                  {activeWallet?.type === 'hardware' ? 'Confirm on device…' : 'Signing…'}
                </>
              ) : (
                <>
                  <FaLock className="size-4 mr-2" aria-hidden="true" />
                  Sign Transaction
                </>
              )}
            </Button>
          </div>
        )}

        {/* Reset button after signing */}
        {signedTxHex && (
          <div className="mt-4">
            <Button
              onClick={handleReset}
              color="gray"
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <ErrorAlert message={error} onClose={() => setError(null)} />
      )}
    </div>
  );
}
