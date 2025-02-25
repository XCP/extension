"use client";

import { useEffect, useCallback, useMemo } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useComposer } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse as CounterpartyApiResponse } from "@/utils/blockchain/counterparty";

interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

interface ComposerProps<T> {
  initialTitle: string;
  FormComponent: (props: {
    formAction: (formData: FormData) => void;
    initialFormData: T | null;
  }) => ReactElement;
  ReviewComponent: (props: {
    apiResponse: ApiResponse;
    onSign: () => void;
    onBack: () => void;
    error: string | null;
    setError: (error: string | null) => void;
  }) => ReactElement;
  composeTransaction: (data: T) => Promise<ApiResponse>;
  headerCallbacks?: HeaderCallbacks;
}

interface ApiResponse extends CounterpartyApiResponse {
  result: CounterpartyApiResponse["result"] & {
    data: string | null;
  };
}

export function Composer<T>({
  initialTitle,
  FormComponent,
  ReviewComponent,
  composeTransaction,
  headerCallbacks,
}: ComposerProps<T>): ReactElement {
  const navigate = useNavigate();
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction } = useWallet(); // Updated to include signTransaction
  const { isLoading, showLoading, hideLoading } = useLoading();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();
  const { state, error, isPending, compose, sign, reset, revertToForm } = useComposer<T>();

  const formAction = useCallback(
    (formData: FormData) => {
      if (activeAddress) {
        compose(formData, composeTransaction, activeAddress.address);
      }
    },
    [compose, composeTransaction, activeAddress]
  );

  const signAction = useCallback(async () => {
    if (!state.apiResponse || !activeAddress || !activeWallet) return;

    const loadingId = showLoading("Signing and broadcasting transaction...");
    try {
      const rawTxHex = state.apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      await broadcastTransaction(signedTxHex);
      sign(state.apiResponse, async () => {});
    } catch (err) {
      console.error("Sign action error:", err);
      let errorMessage = "Failed to sign and broadcast transaction";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      throw new Error(errorMessage);
    } finally {
      hideLoading(loadingId);
    }
  }, [
    state.apiResponse,
    activeAddress,
    activeWallet,
    signTransaction,
    broadcastTransaction,
    showLoading,
    hideLoading,
    sign,
  ]);

  const handleBack = useCallback(() => {
    if (state.step === "review") {
      revertToForm();
    } else if (state.step === "success") {
      reset();
      navigate("/index");
    }
  }, [state.step, revertToForm, reset, navigate]);

  const handleCancel = useCallback(() => {
    reset();
    navigate("/index");
  }, [reset, navigate]);

  const toggleHelp = useCallback(() => updateSettings({ showHelpText: !settings?.showHelpText }), [
    settings?.showHelpText,
    updateSettings,
  ]);

  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  const onBackSuccess = useCallback(() => {
    reset();
    navigate("/index");
  }, [reset, navigate]);

  const onResetForm = useCallback(() => {
    reset();
  }, [reset]);

  const onBackDefault = useCallback(() => navigate(-1), [navigate]);

  const headerConfig = useMemo(() => {
    if (isLoading || isPending) {
      return {
        useLogoTitle: true,
        leftButton: {
          icon: <FiX className="w-4 h-4" aria-hidden="true" />,
          onClick: handleCancel,
          ariaLabel: "Cancel transaction",
        },
      };
    }
    if (state.step === "review" && state.apiResponse) {
      return {
        title: initialTitle,
        onBack: handleBack,
        rightButton: {
          icon: <FiX className="w-4 h-4" aria-hidden="true" />,
          onClick: handleCancel,
          ariaLabel: "Cancel and return to index",
        },
      };
    }
    if (state.step === "success" && state.apiResponse) {
      return {
        useLogoTitle: true,
        onBack: onBackSuccess,
        rightButton: {
          icon: <FiRefreshCw className="w-4 h-4" aria-hidden="true" />,
          onClick: onResetForm,
          ariaLabel: "Return to form",
        },
      };
    }
    return {
      title: initialTitle,
      onBack: headerCallbacks?.onBack || onBackDefault,
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: effectiveToggleHelp,
        ariaLabel: "Toggle help text",
      },
    };
  }, [
    isLoading,
    isPending,
    state.step,
    state.apiResponse,
    initialTitle,
    headerCallbacks?.onBack,
    handleCancel,
    handleBack,
    effectiveToggleHelp,
    onBackSuccess,
    onResetForm,
    onBackDefault,
  ]);

  useEffect(() => {
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null);
  }, [headerConfig, setHeaderProps]);

  return (
    <div>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {state.step === "form" && (
        <FormComponent formAction={formAction} initialFormData={state.formData || null} />
      )}
      {state.step === "review" && state.apiResponse && (
        <ReviewComponent
          apiResponse={state.apiResponse}
          onSign={signAction}
          onBack={handleBack}
          error={error}
          setError={() => {}}
        />
      )}
      {state.step === "success" && state.apiResponse && (
        <SuccessScreen apiResponse={state.apiResponse} onReset={onBackSuccess} />
      )}
    </div>
  );
}
