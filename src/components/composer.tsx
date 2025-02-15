import { useState, useEffect, useMemo, useCallback } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

interface HeaderCallbacks {
  onCancel?: () => void;
  onBack?: () => void;
  onReset?: () => void;
  onToggleHelp?: () => void;
}

interface ComposerProps {
  initialTitle: string;
  FormComponent: (props: { onSubmit: (data: any) => void }) => ReactElement;
  ReviewComponent: (props: {
    apiResponse: any;
    onSign: () => void;
    onBack: () => void;
  }) => ReactElement;
  composeTransaction: (data: any) => Promise<any>;
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
  const showHelpText = settings?.showHelpText;

  const toggleHelp = useCallback(() => {
    updateSettings({ showHelpText: !settings?.showHelpText });
  }, [updateSettings, settings?.showHelpText]);

  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  const [step, setStep] = useState<"form" | "review">("form");
  const [formData, setFormData] = useState<any>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    setApiResponse(null);
    setStep("form");
  }, []);

  const headerConfig = useMemo(() => {
    if (isLoading) {
      return {
        useLogoTitle: true,
        leftButton: {
          icon: <FiX className="w-4 h-4" />,
          onClick: headerCallbacks?.onCancel || (() => {}),
          ariaLabel: "Cancel transaction",
        },
      };
    }

    if (step === "review" && apiResponse) {
      return {
        useLogoTitle: true,
        onBack: headerCallbacks?.onBack || handleBack,
      };
    }

    return {
      title: initialTitle,
      onBack: () => navigate(-1),
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
    navigate,
    effectiveToggleHelp,
    headerCallbacks,
    handleBack,
  ]);

  // Set header props on mount and cleanup
  useEffect(() => {
    setHeaderProps(headerConfig);
    // Cleanup with null instead of empty object
    return () => setHeaderProps(null);
  }, [headerConfig, setHeaderProps]);

  async function handleFormSubmit(data: any) {
    showLoading("Composing transaction...");
    setError(null);
    try {
      const response = await composeTransaction(data);
      setApiResponse(response);
      setFormData(data);
      setStep("review");
    } catch (err) {
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
      if (!activeWallet || !activeAddress)
        throw new Error("Wallet is not properly initialized.");
      const rawTxHex = apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      await broadcastTransaction(signedTxHex);
      alert("Transaction signed successfully!");
      headerCallbacks?.onReset?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      hideLoading();
    }
  }

  return (
    <div>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {step === "form" && <FormComponent onSubmit={handleFormSubmit} />}
      {step === "review" && apiResponse && (
        <ReviewComponent
          apiResponse={apiResponse}
          onSign={handleSign}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
