import { useEffect, useMemo, useCallback } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useComposer } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";

interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

interface ComposerProps {
  initialTitle: string;
  FormComponent: (props: { onSubmit: (data: any) => void }) => ReactElement;
  ReviewComponent: (props: { apiResponse: any; onSign: () => Promise<void>; onBack: () => void }) => ReactElement;
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
  const { step, setStep, formData, setFormData, apiResponse, setApiResponse, error, setError, reset } = useComposer();

  const toggleHelp = useCallback(() => updateSettings({ showHelpText: !settings?.showHelpText }), [updateSettings, settings?.showHelpText]);
  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  const handleBack = useCallback(() => {
    if (step === "review") {
      setApiResponse(null);
      setStep("form");
    } else {
      reset();
      navigate(-1);
    }
  }, [step, setApiResponse, setStep, navigate, reset]);

  const headerConfig = useMemo(() => {
    if (isLoading) return { useLogoTitle: true, leftButton: { icon: <FiX className="w-4 h-4" />, onClick: () => {}, ariaLabel: "Cancel transaction" } };
    if (step === "review" && apiResponse) return { title: initialTitle, onBack: headerCallbacks?.onBack || handleBack };
    if (step === "success" && apiResponse) return { useLogoTitle: true, onBack: headerCallbacks?.onBack || handleBack };
    return {
      title: initialTitle,
      onBack: headerCallbacks?.onBack || handleBack,
      rightButton: { icon: <FiHelpCircle className="w-4 h-4" />, onClick: effectiveToggleHelp, ariaLabel: "Toggle help text" },
    };
  }, [isLoading, step, apiResponse, initialTitle, navigate, effectiveToggleHelp, headerCallbacks, handleBack]);

  useEffect(() => {
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null);
  }, [headerConfig, setHeaderProps]);

  async function handleFormSubmit(data: any) {
    showLoading("Composing transaction...");
    setError(null);
    try {
      if (!activeAddress) throw new Error("Wallet not initialized.");
      const response = await composeTransaction({
        sourceAddress: activeAddress.address,
        sat_per_vbyte: data.feeRateSatPerVByte,
        ...data,
      });
      setApiResponse(response);
      setFormData(data);
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
      {step === "form" && <FormComponent onSubmit={handleFormSubmit} />}
      {step === "review" && apiResponse && <ReviewComponent apiResponse={apiResponse} onSign={handleSign} onBack={handleBack} />}
      {step === "success" && apiResponse && <SuccessScreen apiResponse={apiResponse} onReset={reset} />}
    </div>
  );
}
