"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheckCircle, FaTimesCircle, FaInfoCircle } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useHeader } from "@/contexts/header-context";
import { verifyMessage } from "@/utils/blockchain/bitcoin";
import type { ReactElement } from "react";

/**
 * VerifyMessage component for verifying Bitcoin message signatures
 */
export default function VerifyMessage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  
  // State
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Verify Message",
      onBack: () => navigate("/actions"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);
  
  const handleVerify = async () => {
    if (!address.trim()) {
      setError("Please enter a Bitcoin address");
      return;
    }
    
    if (!message.trim()) {
      setError("Please enter the message that was signed");
      return;
    }
    
    if (!signature.trim()) {
      setError("Please enter the signature");
      return;
    }
    
    setIsVerifying(true);
    setError(null);
    setVerificationResult(null);
    
    try {
      const isValid = await verifyMessage(message, signature, address);
      setVerificationResult(isValid);
    } catch (err) {
      console.error("Failed to verify message:", err);
      setError(err instanceof Error ? err.message : "Failed to verify message");
      setVerificationResult(false);
    } finally {
      setIsVerifying(false);
    }
  };
  
  const handlePasteJSON = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const data = JSON.parse(clipboardText);
      
      if (data.address) setAddress(data.address);
      if (data.message) setMessage(data.message);
      if (data.signature) setSignature(data.signature);
      
      setError(null);
    } catch (err) {
      setError("Failed to parse JSON from clipboard. Make sure it's valid JSON with address, message, and signature fields.");
    }
  };
  
  const handleClear = () => {
    setAddress("");
    setMessage("");
    setSignature("");
    setVerificationResult(null);
    setError(null);
  };
  
  return (
    <div className="p-4 space-y-4">
      {/* Info Box */}
      <div className="bg-blue-50 rounded-lg p-3 flex gap-2">
        <FaInfoCircle className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <div className="font-medium">Message Verification</div>
          <div className="text-xs mt-1">
            Verify that a message was signed by the owner of a Bitcoin address. 
            This proves they control the private key without revealing it.
          </div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          onClick={handlePasteJSON}
          color="gray"
        >
          Paste JSON
        </Button>
        <Button
          onClick={handleClear}
          color="gray"
        >
          Clear All
        </Button>
      </div>
      
      {/* Address Input */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bitcoin Address
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter the Bitcoin address (e.g., 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)"
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
        />
      </div>
      
      {/* Message Input */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Original Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter the exact message that was signed..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={4}
        />
        <div className="mt-2 text-xs text-gray-500">
          {message.length} characters - Must match exactly
        </div>
      </div>
      
      {/* Signature Input */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Signature
        </label>
        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Enter the signature (base64 or hex format)..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
          rows={3}
        />
      </div>
      
      {/* Verify Button */}
      <Button
        onClick={handleVerify}
        color="blue"
        disabled={!address.trim() || !message.trim() || !signature.trim() || isVerifying}
        fullWidth
      >
        {isVerifying ? "Verifying..." : "Verify Signature"}
      </Button>
      
      {/* Error Display */}
      {error && (
        <ErrorAlert message={error} onClose={() => setError(null)} />
      )}
      
      {/* Verification Result */}
      {verificationResult !== null && !error && (
        <div className={`rounded-lg p-4 ${
          verificationResult 
            ? "bg-green-50 border-2 border-green-200" 
            : "bg-red-50 border-2 border-red-200"
        }`}>
          <div className="flex items-center gap-3">
            {verificationResult ? (
              <>
                <FaCheckCircle className="text-green-600 text-2xl" />
                <div>
                  <div className="font-medium text-green-900">Signature Valid</div>
                  <div className="text-sm text-green-700 mt-1">
                    The signature is valid and was created by the owner of address:
                  </div>
                  <div className="font-mono text-xs text-green-800 mt-1 break-all">
                    {address}
                  </div>
                </div>
              </>
            ) : (
              <>
                <FaTimesCircle className="text-red-600 text-2xl" />
                <div>
                  <div className="font-medium text-red-900">Signature Invalid</div>
                  <div className="text-sm text-red-700 mt-1">
                    The signature does not match the message and address provided.
                    Please check that all fields are entered correctly.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Help Section */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Verification Tips</h3>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>The message must match exactly, including spaces and punctuation</li>
          <li>Signatures are typically in base64 format (65 bytes when decoded)</li>
          <li>Taproot signatures start with "tr:" followed by hex characters</li>
          <li>You can paste a JSON object with address, message, and signature fields</li>
          <li>Case matters for the message, but not for the address</li>
        </ul>
      </div>
    </div>
  );
}