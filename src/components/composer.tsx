"use client";

import { useActionState, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse } from "@/utils/blockchain/counterparty";

interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

interface ComposerProps<T> {
  initialTitle: string;
  initialFormData?: T | null;
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

interface ComposerState<T> {
  step: "form" | "review" | "success";
  formData: T | null;
  apiResponse: ApiResponse | null;
}

interface ExtendedApiResponse extends ApiResponse {
  broadcast?: { txid: string; fees?: number };
}

export function Composer<T>({
  initialTitle,
  initialFormData = null,
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

  const initialComposeState: ComposerState<T> = {
    step: "form",
    formData: initialFormData,
    apiResponse: null,
  };

  const [error, setError] = useState<string | null>(null);

  async function composeAction(prevState: ComposerState<T>, formData: FormData): Promise<ComposerState<T>> {
    const loadingId = showLoading("Composing transaction...");
    try {
      if (!activeAddress) throw new Error("Wallet not initialized.");
      const rawData = Object.fromEntries(formData);
      const data = rawData as unknown as T;
      const response = await composeTransaction({
        ...data,
        sourceAddress: activeAddress.address,
      });
      setError(null);
      return {
        ...prevState,
        step: "review",
        formData: data,
        apiResponse: response,
      };
    } catch (err) {
      console.error("Compose error:", err);
      setError(err instanceof Error ? err.message : String(err));
      return prevState;
    } finally {
      hideLoading(loadingId);
    }
  }

  async function signAction(prevState: ComposerState<T>): Promise<ComposerState<T>> {
    const loadingId = showLoading("Signing and broadcasting transaction...");
    try {
      if (!prevState.apiResponse) throw new Error("No transaction composed.");
      if (!activeWallet || !activeAddress) throw new Error("Wallet not initialized.");
      const rawTxHex = prevState.apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      const broadcastResponse = await broadcastTransaction(signedTxHex);
      setError(null);
      return {
        ...prevState,
        step: "success",
        apiResponse: { ...prevState.apiResponse, broadcast: broadcastResponse } as ExtendedApiResponse,
      };
    } catch (err) {
      console.error("Sign error:", err);
      setError(err instanceof Error ? err.message : String(err));
      return prevState;
    } finally {
      hideLoading(loadingId);
    }
  }

  const [composeState, formAction, isComposePending] = useActionState(composeAction, initialComposeState);
  const [signState, signDispatch, isSignPending] = useActionState(signAction, composeState);

  const toggleHelp = () => updateSettings({ showHelpText: !settings?.showHelpText });
  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  const handleBack = () => {
    if (signState.step === "review") navigate(-1);
    else if (signState.step === "success") navigate("/index");
  };

  const handleCancel = () => navigate("/index");

  useEffect(() => {
    const headerConfig = isLoading || isComposePending || isSignPending
      ? {
          useLogoTitle: true,
          leftButton: {
            icon: <FiX className="w-4 h-4" aria-hidden="true" />,
            onClick: handleCancel,
            ariaLabel: "Cancel transaction",
          },
        }
      : signState.step === "review" && signState.apiResponse
      ? {
          title: initialTitle,
          onBack: headerCallbacks?.onBack || handleBack,
          rightButton: {
            icon: <FiX className="w-4 h-4" aria-hidden="true" />,
            onClick: handleCancel,
            ariaLabel: "Cancel and return to index",
          },
        }
      : signState.step === "success" && signState.apiResponse
      ? {
          useLogoTitle: true,
          onBack: () => navigate("/index"),
          rightButton: {
            icon: <FiRefreshCw className="w-4 h-4" aria-hidden="true" />,
            onClick: () => navigate(-1),
            ariaLabel: "Return to form",
          },
        }
      : {
          title: initialTitle,
          onBack: headerCallbacks?.onBack || (() => navigate(-1)),
          rightButton: {
            icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
            onClick: effectiveToggleHelp,
            ariaLabel: "Toggle help text",
          },
        };
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null);
  }, [
    composeState,
    isLoading,
    isComposePending,
    isSignPending,
    signState.step,
    signState.apiResponse,
    initialTitle,
    headerCallbacks,
    effectiveToggleHelp,
    handleBack,
    handleCancel,
    navigate,
    setHeaderProps,
  ]);

  return (
    <div>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {signState.step === "form" && (
        <FormComponent formAction={formAction} initialFormData={signState.formData || null} />
      )}
      {signState.step === "review" && signState.apiResponse && (
        <ReviewComponent
          apiResponse={signState.apiResponse}
          onSign={signDispatch}
          onBack={handleBack}
          error={error}
          setError={setError}
        />
      )}
      {signState.step === "success" && signState.apiResponse && (
        <SuccessScreen apiResponse={signState.apiResponse} onReset={() => navigate("/index")} />
      )}
    </div>
  );
}
