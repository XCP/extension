import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FaCheckCircle, FaUpload, FiRefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { DestinationInput } from "@/components/ui/inputs/destination-input";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { useHeader } from "@/contexts/header-context";
import { verifyMessageWithMethod } from "@/core/bitcoin/messageVerifier";
import { validateSignatureJson } from "@/core/validation/signatureJson";

import { t } from '@/i18n';
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
      title: t('common_verify_message'),
      onBack: () => navigate(-1),
      rightButton: {
        ariaLabel: t('common_reset_form'),
        icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
        onClick: handleClear,
        disabled: !hasContent,
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, handleClear, address, message, signature, verificationResult, error]);
  
  const handleVerify = async () => {
    if (!message.trim()) {
      setError(t('actions_verify_message_please_enter_the_message_that'));
      return;
    }

    if (!signature.trim()) {
      setError(t('actions_verify_message_please_enter_the_signature'));
      return;
    }

    if (!address.trim()) {
      setError(t('actions_verify_message_please_enter_the_signer_s'));
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
      setError(err instanceof Error ? err.message : t('actions_verify_message_failed_to_verify_message'));
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
          setError(result.error || t('actions_verify_message_invalid_signature_json_file'));
          return;
        }

        setAddress(result.data.address);
        setMessage(result.data.message);
        setSignature(result.data.signature);
        setVerificationResult(null);
        setVerificationMethod(null);
        setError(null);
      } catch (_err) {
        setError(t('actions_verify_message_failed_to_parse_json_file'));
      }
    };
    input.click();
  };
  
  return (
    <div className="p-4 space-y-4">
      {/* Quick Actions */}
      <div className="flex gap-2">
        <button type="button"
          onClick={handleUploadJSON}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
        >
          <FaUpload className="size-4 mr-2" aria-hidden="true" />
          
          {t('actions_verify_message_upload_json')}
        </button>
      </div>
      
      {/* Combined Input Box */}
      <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4">
        {/* Message Input - First, since this is what they're verifying */}
        <TextAreaInput
          value={message}
          onChange={setMessage}
          label={t('common_message')}
          placeholder={t('actions_verify_message_enter_the_exact_message_that')}
          rows={4}
          required={false}
          showCharCount={true}
          description={t('actions_verify_message_must_match_exactly')}
        />

        {/* Signature Input - Second, usually received with the message */}
        <div className="mt-4">
          <TextAreaInput
            value={signature}
            onChange={setSignature}
            label={t('common_signature')}
            placeholder={t('actions_verify_message_enter_the_signature_base64_or')}
            rows={3}
            required={false}
          />
        </div>

        {/* Address Input - Last, to verify against */}
        <div className="mt-4">
          <DestinationInput
            value={address}
            onChange={setAddress}
            label={t('actions_verify_message_signer_s_address')}
            placeholder={t('actions_verify_message_enter_the_bitcoin_address_that')}
            required={false}
            showHelpText={false}
          />
          {verificationResult !== null && !error && (
            <div className="mt-2">
              {verificationResult ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <FaCheckCircle className="text-green-600 size-3" aria-hidden="true" />
                    <span className="text-xs text-green-600">{t('actions_verify_message_signature_valid')}</span>
                  </div>
                  {verificationMethod && (
                    <div className="text-xs text-gray-500">
                      {t('actions_verify_message_verified_using', [String(verificationMethod)])}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-red-600">{t('actions_verify_message_signature_invalid_does_not_match')}</span>
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
            {isVerifying ? t('common_verifying') : t('actions_verify_message_verify_signature')}
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