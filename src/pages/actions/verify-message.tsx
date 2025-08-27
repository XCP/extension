"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheckCircle, FaUpload, FaRedo } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { YouTubeTutorialCTA } from "@/components/youtube-tutorial-cta";
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
  
  const handleClear = () => {
    setAddress("");
    setMessage("");
    setSignature("");
    setVerificationResult(null);
    setError(null);
  };
  
  // Configure header with reset button
  useEffect(() => {
    setHeaderProps({
      title: "Verify Message",
      onBack: () => navigate("/actions"),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FaRedo className="w-3 h-3" />,
        onClick: handleClear,
      },
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
  
  const handleUploadJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (data.address) setAddress(data.address);
        if (data.message) setMessage(data.message);
        if (data.signature) setSignature(data.signature);
        
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
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <FaUpload className="w-4 h-4 mr-2" aria-hidden="true" />
          Upload JSON
        </button>
      </div>
      
      {/* Combined Input Box */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        {/* Address Input */}
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Address <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter the Bitcoin address"
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        
        {/* Message Input */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter the exact message that was signed..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
          />
          <div className="mt-2 text-xs text-gray-500">
            {message.length} characters - Must match exactly
          </div>
        </div>
        
        {/* Signature Input */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Signature <span className="text-red-500">*</span>
          </label>
          <textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Enter the signature (base64 or hex format)..."
            className={`w-full p-3 border rounded-lg transition-colors ${
              verificationResult !== null && !error
                ? verificationResult
                  ? "border-green-500 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  : "border-red-500 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                : "border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            }`}
            rows={3}
          />
          {verificationResult !== null && !error && (
            <div className="mt-2 flex items-center gap-1">
              {verificationResult ? (
                <>
                  <FaCheckCircle className="text-green-600 text-sm" />
                  <span className="text-xs text-green-600">Signature Valid</span>
                </>
              ) : (
                <span className="text-xs text-red-600">Signature Invalid - Does not match the message and address provided</span>
              )}
            </div>
          )}
        </div>
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
      
      {/* YouTube Tutorial */}
      <YouTubeTutorialCTA 
        text="Learn how to verify message signatures" 
        url="" 
      />
    </div>
  );
}