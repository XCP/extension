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
  result: CounterpartyApiResponse['result'] & {
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
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction } = useWallet();
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

  const signAction = useCallback(() => {
    if (state.apiResponse && activeAddress) {
      const signFn = async () => {
        const loadingId = showLoading("Signing and broadcasting transaction...");
        try {
          const rawTxHex = state.apiResponse!.result.rawtransaction;
          const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
          await broadcastTransaction(signedTxHex);
        } finally {
          hideLoading(loadingId);
        }
      };
      sign(state.apiResponse, signFn);
    }
  }, [state.apiResponse, sign, signTransaction, broadcastTransaction, activeAddress, showLoading, hideLoading]);

  const handleBack = useCallback(() => {
    if (state.step === "review") {
      revertToForm(); // Go back to form, keep formData
    } else if (state.step === "success") {
      reset(); // Reset and go to /index
      navigate("/index");
    }
  }, [state.step, revertToForm, reset, navigate]);

  const handleCancel = useCallback(() => {
    reset(); // Reset and go to /index
    navigate("/index");
  }, [reset, navigate]);

  const toggleHelp = useCallback(() => updateSettings({ showHelpText: !settings?.showHelpText }), [
    settings?.showHelpText,
    updateSettings,
  ]);

  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  const onBackSuccess = useCallback(() => {
    reset(); // Reset and go to /index
    navigate("/index");
  }, [reset, navigate]);

  const onResetForm = useCallback(() => {
    reset(); // Reset and stay on form
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
        onBack: handleBack, // Go back to form, keep data
        rightButton: {
          icon: <FiX className="w-4 h-4" aria-hidden="true" />,
          onClick: handleCancel, // Reset and go to /index
          ariaLabel: "Cancel and return to index",
        },
      };
    }
    if (state.step === "success" && state.apiResponse) {
      return {
        useLogoTitle: true,
        onBack: onBackSuccess, // Reset and go to /index
        rightButton: {
          icon: <FiRefreshCw className="w-4 h-4" aria-hidden="true" />,
          onClick: onResetForm, // Reset and go to form
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
          setError={() => {}} // Error setting handled in context
        />
      )}
      {state.step === "success" && state.apiResponse && (
        <SuccessScreen apiResponse={state.apiResponse} onReset={onBackSuccess} />
      )}
    </div>
  );
}
