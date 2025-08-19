"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCopy, FaCheck, FaInfoCircle, FaLock } from "react-icons/fa";
import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";
import { ErrorAlert } from "@/components/error-alert";
import { AuthorizationModal } from "@/components/modals/authorization-modal";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { signMessage, getSigningCapabilities } from "@/utils/blockchain/bitcoin";
import type { ReactElement } from "react";

/**
 * SignMessage component for signing messages with Bitcoin addresses
 */
export default function SignMessage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress, unlockWallet, isWalletLocked, getPrivateKey } = useWallet();
  
  // State
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Message",
      onBack: () => navigate("/actions"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);
  
  // Get signing capabilities for current address
  const addressType = activeWallet?.addressType;
  const signingCapabilities = activeAddress && addressType ? 
    getSigningCapabilities(addressType) : 
    { canSign: false, method: "Not available", notes: "No address selected" };
  
  const handleSign = async (password?: string) => {
    if (!activeWallet || !activeAddress) {
      setError("No active wallet or address");
      return;
    }
    
    if (!message.trim()) {
      setError("Please enter a message to sign");
      return;
    }
    
    if (!signingCapabilities.canSign) {
      setError(`Message signing not supported for ${addressType} addresses`);
      return;
    }
    
    setIsSigning(true);
    setError(null);
    setSignature("");
    
    try {
      // Check if wallet is locked
      if (!password && await isWalletLocked()) {
        setShowAuthModal(true);
        setIsSigning(false);
        return;
      }
      
      // Unlock wallet if password provided
      if (password) {
        await unlockWallet(activeWallet.id, password);
        setShowAuthModal(false);
      }
      
      // Get private key using wallet context
      // This handles both mnemonic and private key wallets correctly
      const privateKeyHex = await getPrivateKey(
        activeWallet.id,
        activeAddress.path
      );
      
      // Sign the message
      const result = await signMessage(
        message,
        privateKeyHex,
        addressType!,  // We've already checked it exists
        true // compressed
      );
      
      setSignature(result.signature);
    } catch (err) {
      console.error("Failed to sign message:", err);
      setError(err instanceof Error ? err.message : "Failed to sign message");
    } finally {
      setIsSigning(false);
    }
  };
  
  const handleCopy = async (text: string, field: 'message' | 'signature' | 'json') => {
    try {
      let copyText = text;
      
      if (field === 'json') {
        // Create JSON format for easy sharing
        copyText = JSON.stringify({
          address: activeAddress?.address,
          message: message,
          signature: signature,
          timestamp: new Date().toISOString()
        }, null, 2);
      }
      
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };
  
  const handleUnlockAndSign = async (password: string) => {
    await handleSign(password);
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
      {/* Address Info */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="text-sm text-gray-600 mb-1">Signing with address:</div>
        <div className="font-mono text-sm text-gray-900 break-all">{activeAddress.address}</div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-500">Type: {addressType || "Unknown"}</span>
          {signingCapabilities.canSign ? (
            <span className="text-xs text-green-600"> Signing supported</span>
          ) : (
            <span className="text-xs text-red-600"> Signing not supported</span>
          )}
        </div>
      </div>
      
      {/* Signing Info */}
      {signingCapabilities.notes && (
        <div className="bg-blue-50 rounded-lg p-3 flex gap-2">
          <FaInfoCircle className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <div className="font-medium">{signingCapabilities.method}</div>
            <div className="text-xs mt-1">{signingCapabilities.notes}</div>
          </div>
        </div>
      )}
      
      {/* Message Input */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Message to Sign
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your message here..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={4}
          disabled={!signingCapabilities.canSign || isSigning}
        />
        <div className="mt-2 flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {message.length} characters
          </span>
          {message && (
            <button
              onClick={() => handleCopy(message, 'message')}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Copy message
            </button>
          )}
        </div>
      </div>
      
      {/* Sign Button */}
      <Button
        onClick={() => handleSign()}
        color="blue"
        disabled={!signingCapabilities.canSign || !message.trim() || isSigning}
        fullWidth
      >
        {isSigning ? (
          <div className="flex items-center justify-center gap-2">
            <Spinner />
            Signing...
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <FaLock className="w-4 h-4" />
            Sign Message
          </div>
        )}
      </Button>
      
      {/* Error Display */}
      {error && (
        <ErrorAlert message={error} onClose={() => setError(null)} />
      )}
      
      {/* Signature Display */}
      {signature && (
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Signature</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(signature, 'signature')}
                className="text-blue-600 hover:text-blue-700"
                title="Copy signature"
              >
                {copied ? (
                  <FaCheck className="w-4 h-4" />
                ) : (
                  <FaCopy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded p-3">
            <div className="font-mono text-xs text-gray-800 break-all">
              {signature}
            </div>
          </div>
          
          <div className="pt-2 border-t border-gray-200">
            <button
              onClick={() => handleCopy('', 'json')}
              className="w-full text-sm text-blue-600 hover:text-blue-700"
            >
              Copy as JSON (address + message + signature)
            </button>
          </div>
        </div>
      )}
      
      {/* How to Verify */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">How to Verify</h3>
        <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
          <li>Share your address, message, and signature</li>
          <li>The recipient can verify using any Bitcoin wallet or tool</li>
          <li>Verification proves you control the private key for this address</li>
        </ol>
      </div>
      
      {/* Authorization Modal */}
      {showAuthModal && (
        <AuthorizationModal
          onUnlock={handleUnlockAndSign}
          onCancel={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}