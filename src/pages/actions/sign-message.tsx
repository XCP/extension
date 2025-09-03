"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCopy, FaCheck, FaLock, FaCheckCircle, FaInfoCircle, FaRedo } from "react-icons/fa";
import { FiDownload } from "react-icons/fi";
import { Button } from "@/components/button";
import { TextAreaInput } from "@/components/inputs/textarea-input";
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
  const [copiedField, setCopiedField] = useState<'message' | 'signature' | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Configure header with reset button (always icon-only)
  useEffect(() => {
    setHeaderProps({
      title: "Sign Message",
      onBack: () => navigate("/actions"),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FaRedo className="w-3 h-3" />,
        onClick: () => {
          setMessage("");
          setSignature("");
          setError(null);
        },
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);
  
  // Get signing capabilities for current address
  const addressFormat = activeWallet?.addressFormat;
  const signingCapabilities = activeAddress && addressFormat ? 
    getSigningCapabilities(addressFormat) : 
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
      setError(`Message signing not supported for ${ addressFormat } addresses`);
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
      const privateKeyResult = await getPrivateKey(
        activeWallet.id,
        activeAddress.path
      );
      const privateKeyHex = privateKeyResult.key;
      const compressed = privateKeyResult.compressed;
      
      // Sign the message
      const result = await signMessage(
        message,
        privateKeyHex,
        addressFormat!,  // We've already checked it exists
        compressed
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
      if (field === 'json') {
        // Create JSON format and download as file
        const jsonData = {
          address: activeAddress?.address,
          message: message,
          signature: signature,
          timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `signature-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 1500);
      }
    } catch (err) {
      setError("Failed to perform action");
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
      {/* Message Input */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            // Reset signature if message changes after signing
            if (signature) {
              setSignature("");
            }
          }}
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
              className={`text-xs transition-all duration-200 cursor-pointer flex items-center gap-1 ${
                copiedField === 'message' 
                  ? 'text-green-600 hover:text-green-700' 
                  : 'text-blue-600 hover:text-blue-700'
              }`}
            >
              {copiedField === 'message' ? (
                <>
                  <FaCheck className="w-3 h-3" />
                  Copied!
                </>
              ) : (
                'Copy message'
              )}
            </button>
          )}
        </div>
        
        {/* Signature Output */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Signature
          </label>
          <textarea
            value={signature}
            placeholder="Signature will appear here after signing..."
            className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
            rows={3}
            disabled
            readOnly
          />
          <div className="h-1" aria-hidden="true">&nbsp;</div>
          {signature && (
            <div className="mt-2 flex justify-between items-center">
              <span className="text-xs text-green-600 flex items-center gap-1">
                <FaCheckCircle className="w-3 h-3" />
                Signed
              </span>
              <button
                onClick={() => handleCopy(signature, 'signature')}
                className={`text-xs transition-all duration-200 cursor-pointer flex items-center gap-1 ${
                  copiedField === 'signature' 
                    ? 'text-green-600 hover:text-green-700' 
                    : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {copiedField === 'signature' ? (
                  <>
                    <FaCheck className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  'Copy signature'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Sign Button - only show if not signed */}
      {!signature && (
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
      )}
      
      {/* Error Display */}
      {error && (
        <ErrorAlert message={error} onClose={() => setError(null)} />
      )}
      
      {/* Actions for Signature */}
      {signature && (
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setMessage("");
              setSignature("");
              setError(null);
            }}
            color="gray"
          >
            Reset
          </Button>
          <Button
            onClick={() => handleCopy('', 'json')}
            color="blue"
            fullWidth
          >
            Download JSON
          </Button>
        </div>
      )}
      
      {/* YouTube Tutorial */}
      <Button 
        variant="youtube"
        href=""
      >
        Learn how to sign and verify messages
      </Button>
      
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