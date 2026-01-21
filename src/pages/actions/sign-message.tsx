
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSignMessageRequest } from "@/hooks/useSignMessageRequest";
import { FaCopy, FaCheck, FaLock, FaCheckCircle, FaInfoCircle, FiRefreshCw } from "@/components/icons";
import { FiDownload } from "@/components/icons";
import { Button } from "@/components/button";
import { TextAreaInput } from "@/components/inputs/textarea-input";
import { Spinner } from "@/components/spinner";
import { ErrorAlert } from "@/components/error-alert";
import { UnlockScreen } from "@/components/screens/unlock-screen";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { signMessage, getSigningCapabilities } from "@/utils/blockchain/bitcoin/messageSigner";
import { analytics } from "@/utils/fathom";
import type { ReactElement } from "react";

/**
 * SignMessage component for signing messages with Bitcoin addresses
 */
export default function SignMessage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress, selectWallet, isKeychainLocked, getPrivateKey } = useWallet();

  // Provider request hook for handling dApp integration
  const {
    providerMessage,
    providerOrigin,
    signMessageRequestId,
    handleSuccess,
    handleCancel,
    isProviderRequest
  } = useSignMessageRequest();

  // State
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'message' | 'signature' | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Load provider message if coming from dApp request
  useEffect(() => {
    if (providerMessage && !message) {
      setMessage(providerMessage);
    }
  }, [providerMessage, message]);

  // Reset function with stable reference
  const handleReset = useCallback(() => {
    setMessage("");
    setSignature("");
    setError(null);
  }, []);

  // Configure header with reset button (always icon-only)
  useEffect(() => {
    const headerTitle = isProviderRequest
      ? `Sign Message - ${new URL(providerOrigin || '').hostname}`
      : "Sign Message";

    const hasContent = Boolean(message || signature || error);

    setHeaderProps({
      title: headerTitle,
      onBack: isProviderRequest ? handleCancel : () => navigate(-1),
      rightButton: {
        ariaLabel: "Reset form",
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleReset,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isProviderRequest, providerOrigin, handleCancel, handleReset, message, signature, error]);
  
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
      // Check if keychain is locked
      if (!password && await isKeychainLocked()) {
        setShowAuthModal(true);
        setIsSigning(false);
        return;
      }
      
      // Load wallet if password provided (re-enter password scenario)
      if (password) {
        await selectWallet(activeWallet.id);
        setShowAuthModal(false);
      }
      
      // Get private key using wallet context
      // This handles both mnemonic and private key wallets correctly
      const privateKeyResult = await getPrivateKey(
        activeWallet.id,
        activeAddress.path
      );

      // Use the hex format for signing
      const privateKeyHex = privateKeyResult.hex;
      const compressed = privateKeyResult.compressed;

      // Sign the message
      const result = await signMessage(
        message,
        privateKeyHex,
        addressFormat!,  // We've already checked it exists
        compressed
      );
      
      setSignature(result.signature);
      analytics.track('message_signed');

      // If this is a provider request, notify the provider of success
      if (isProviderRequest) {
        await handleSuccess({ signature: result.signature });
      }
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
        <TextAreaInput
          value={message}
          onChange={(value) => {
            setMessage(value);
            // Reset signature if message changes after signing
            if (signature) {
              setSignature("");
            }
          }}
          label="Message"
          placeholder="Enter your message here…"
          rows={4}
          required={false}
          showCharCount={false}
          disabled={!signingCapabilities.canSign || isSigning}
        />
        <div className="mt-2 flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {message.length} characters
          </span>
          {message && (
            <button
              onClick={() => handleCopy(message, 'message')}
              className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                copiedField === 'message'
                  ? 'text-green-600 hover:text-green-700'
                  : 'text-blue-600 hover:text-blue-700'
              }`}
            >
              {copiedField === 'message' ? (
                <>
                  <FaCheck className="size-3" aria-hidden="true" />
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
          <TextAreaInput
            value={signature}
            onChange={() => {}} // Read-only
            label="Signature"
            placeholder="Signature will appear here after signing..."
            rows={3}
            disabled={true}
            readOnly={true}
            className="bg-gray-50"
          />
          {signature && (
            <div className="mt-2 flex justify-between items-center">
              <span className="text-xs text-green-600 flex items-center gap-1">
                <FaCheckCircle className="size-3" aria-hidden="true" />
                Signed
              </span>
              <button
                onClick={() => handleCopy(signature, 'signature')}
                className={`text-xs transition-colors duration-200 cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                  copiedField === 'signature'
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {copiedField === 'signature' ? (
                  <>
                    <FaCheck className="size-3" aria-hidden="true" />
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
              Signing…
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <FaLock className="size-4" aria-hidden="true" />
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
        href="https://youtube.com/watch?v=XXXXX"
      >
        Learn how to sign and verify messages
      </Button>
      
      {/* Authorization Modal */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="w-full max-w-lg animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <UnlockScreen
              title="Authorization Required"
              subtitle="Please enter your password to sign this message."
              onUnlock={handleUnlockAndSign}
              onCancel={() => setShowAuthModal(false)}
              submitText="Authorize"
            />
          </div>
        </div>
      )}
    </div>
  );
}