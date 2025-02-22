import { useEffect, useMemo, useCallback } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useComposer } from "@/contexts/composer-context";
import type { FormDataType } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse } from "@/utils/blockchain/counterparty";

interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

interface ComposerProps {
  initialTitle: string;
  FormComponent: (props: { 
    onSubmit: (data: FormDataType) => void;
    initialFormData?: FormDataType;
  }) => ReactElement;
  ReviewComponent: (props: { 
    apiResponse: ApiResponse; 
    onSign: () => Promise<void>; 
    onBack: () => void;
  }) => ReactElement;
  composeTransaction: (data: FormDataType) => Promise<ApiResponse>;
  headerCallbacks?: HeaderCallbacks;
}

export function Composer({
  initialTitle,
  FormComponent,
  ReviewComponent,
  composeTransaction,
  headerCallbacks,
}: ComposerProps) {
  const navigate = useNavigate();
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction } = useWallet();
  const { isLoading, showLoading, hideLoading } = useLoading();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();
  const {
    step,
    setStep,
    formData,
    setFormData,
    apiResponse,
    setApiResponse,
    error,
    setError,
    reset,
  } = useComposer();

  const toggleHelp = useCallback(
    () => updateSettings({ showHelpText: !settings?.showHelpText }),
    [updateSettings, settings?.showHelpText]
  );
  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  const handleBack = useCallback(() => {
    if (step === "review") {
      setApiResponse(null); // Clear the API response but keep formData
      setStep("form"); // Go back to form with existing formData
    } else {
      reset(); // Full reset on other steps
      navigate(-1);
    }
  }, [step, setApiResponse, setStep, navigate, reset]);

  const handleCancel = useCallback(() => {
    if (step === "review") {
      // Reset form data and go back to form step
      setFormData(null);
      setApiResponse(null);
      setStep("form");
    } else {
      // For other steps, reset everything and navigate away
      reset();
      navigate('/index');
    }
  }, [step, setFormData, setApiResponse, setStep, navigate, reset]);

  const headerConfig = useMemo(() => {
    if (isLoading)
      return {
        useLogoTitle: true,
        leftButton: {
          icon: <FiX className="w-4 h-4" />,
          onClick: () => {},
          ariaLabel: "Cancel transaction",
        },
      };
    if (step === "review" && apiResponse)
      return {
        title: initialTitle,
        onBack: headerCallbacks?.onBack || handleBack,
        rightButton: {
          icon: <FiX className="w-4 h-4" />,
          onClick: handleCancel,
          ariaLabel: "Reset form",
        },
      };
    if (step === "success" && apiResponse)
      return { 
        useLogoTitle: true, 
        onBack: reset,  // Changed from headerCallbacks?.onBack || handleBack
        rightButton: {  // Added rightButton configuration
          icon: <FiX className="w-4 h-4" />,
          onClick: handleCancel,
          ariaLabel: "Cancel and return to index",
        },
      };
    return {
      title: initialTitle,
      onBack: headerCallbacks?.onBack || handleBack,
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" />,
        onClick: effectiveToggleHelp,
        ariaLabel: "Toggle help text",
      },
    };
  }, [
    isLoading,
    step,
    apiResponse,
    initialTitle,
    effectiveToggleHelp,
    headerCallbacks,
    handleBack,
    handleCancel,
    reset,  // Add reset to dependencies
  ]);

  useEffect(() => {
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null);
  }, [headerConfig, setHeaderProps]);

  async function handleFormSubmit(data: FormDataType) {
    showLoading("Composing transaction...");
    setError(null);
    try {
      if (!activeAddress) throw new Error("Wallet not initialized.");
      const response = await composeTransaction({
        ...data,
        sourceAddress: activeAddress.address,
      });
      setApiResponse(response);
      setFormData(data); // Store the submitted data in context
      setStep("review");
    } catch (err) {
      console.error("Compose error:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      hideLoading();
    }
  }

  async function handleSign() {
    showLoading("Signing and broadcasting transaction...");
    setError(null);
    try {
      if (!apiResponse) throw new Error("No transaction composed.");
      if (!activeWallet || !activeAddress) throw new Error("Wallet not initialized.");
      const rawTxHex = apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      const broadcastResponse = await broadcastTransaction(signedTxHex);
      setApiResponse({ ...apiResponse, broadcast: broadcastResponse });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      hideLoading();
    }
  }

  return (
    <div>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {step === "form" && (
        <FormComponent 
          onSubmit={handleFormSubmit} 
          initialFormData={formData || undefined}
        />
      )}
      {step === "review" && apiResponse && (
        <ReviewComponent apiResponse={apiResponse} onSign={handleSign} onBack={handleBack} />
      )}
      {step === "success" && apiResponse && (
        <SuccessScreen apiResponse={apiResponse} onReset={reset} />
      )}
    </div>
  );
}
