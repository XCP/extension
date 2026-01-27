import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheckCircle, FaUpload, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/button";
import { TextAreaInput } from "@/components/inputs/textarea-input";
import { DestinationInput } from "@/components/inputs/destination-input";
import { ErrorAlert } from "@/components/error-alert";
import { useHeader } from "@/contexts/header-context";
import { verifyMessageWithMethod } from "@/utils/blockchain/bitcoin/messageVerifier";
import { validateSignatureJson, type SignatureJson } from "@/utils/validation/signatureJson";
import type { ReactElement } from "react";

/**
 * VerifyMessage component for verifying Bitcoin message signatures
 */
export default function VerifyMessagePage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  
  // State
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const handleClear = useCallback(() => {
    setAddress("");
    setMessage("");
    setSignature("");
    setVerificationResult(null);
    setVerificationMethod(null);
    setError(null);
  }, []);

  // Configure header with reset button
  useEffect(() => {
    const hasContent = Boolean(address || message || signature || verificationResult !== null || error);

    setHeaderProps({
      title: "Verify Message",
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleClear,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, handleClear, address, message, signature, verificationResult, error]);
  
  const handleVerify = async () => {
    if (!message.trim()) {
      setError("Please enter the message that was signed");
      return;
    }

    if (!signature.trim()) {
      setError("Please enter the signature");
      return;
    }

    if (!address.trim()) {
      setError("Please enter the signer's Bitcoin address");
      return;
    }
    
    setIsVerifying(true);
    setError(null);
    setVerificationResult(null);
    setVerificationMethod(null);

    try {
      const result = await verifyMessageWithMethod(message, signature, address);
      setVerificationResult(result.valid);
      setVerificationMethod(result.method || null);
    } catch (err) {
      console.error("Failed to verify message:", err);
      setError(err instanceof Error ? err.message : "Failed to verify message");
      setVerificationResult(false);
    } finally {
      setIsVerifying(false);
    }
  };
  
  const handleUploadJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = validateSignatureJson(JSON.parse(text));

        if (!result.valid || !result.data) {
          setError(result.error || "Invalid signature JSON file");
          return;
        }

        setAddress(result.data.address);
        setMessage(result.data.message);
        setSignature(result.data.signature);
        setVerificationResult(null);
        setVerificationMethod(null);
        setError(null);
      } catch (err) {
        setError("Failed to parse JSON file. Make sure it's valid JSON with address, message, and signature fields.");
      }
    };
    input.click();
  };
  
  return (
    <div className="p-4 space-y-4">
      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleUploadJSON}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
        >
          <FaUpload className="size-4 mr-2" aria-hidden="true" />
          Upload JSON
        </button>
      </div>
      
      {/* Combined Input Box */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
        {/* Message Input - First, since this is what they're verifying */}
        <TextAreaInput
          value={message}
          onChange={setMessage}
          label="Message"
          placeholder="Enter the exact message that was signed…"
          rows={4}
          required={false}
          showCharCount={true}
          description="Must match exactly"
        />

        {/* Signature Input - Second, usually received with the message */}
        <div className="mt-4">
          <TextAreaInput
            value={signature}
            onChange={setSignature}
            label="Signature"
            placeholder="Enter the signature (base64 or hex format)…"
            rows={3}
            required={false}
          />
        </div>

        {/* Address Input - Last, to verify against */}
        <div className="mt-4">
          <DestinationInput
            value={address}
            onChange={setAddress}
            label="Signer's Address"
            placeholder="Enter the Bitcoin address that signed this"
            required={false}
            showHelpText={false}
          />
          {verificationResult !== null && !error && (
            <div className="mt-2">
              {verificationResult ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <FaCheckCircle className="text-green-600 size-3" aria-hidden="true" />
                    <span className="text-xs text-green-600">Signature Valid</span>
                  </div>
                  {verificationMethod && (
                    <div className="text-xs text-gray-500">
                      Verified using: {verificationMethod}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-red-600">Signature Invalid - Does not match the message and address provided</span>
              )}
            </div>
          )}
        </div>

        {/* Verify Button */}
        <div className="mt-4">
          <Button
            onClick={handleVerify}
            color="blue"
            disabled={!address.trim() || !message.trim() || !signature.trim() || isVerifying}
            fullWidth
          >
            {isVerifying ? "Verifying…" : "Verify Signature"}
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <ErrorAlert message={error} onClose={() => setError(null)} />
      )}
      
      {/* YouTube Tutorial - Hidden until we have a video URL */}
      {/* TODO: Add YouTube tutorial link when available
      <Button
        variant="youtube"
        href="https://youtube.com/watch?v=XXXXX"
      >
        Learn how to verify message signatures
      </Button>
      */}
    </div>
  );
}