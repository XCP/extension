"use client";

import { useActionState, useEffect } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse } from "@/utils/blockchain/counterparty";

/**
 * Callbacks for customizing header behavior.
 */
interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

/**
 * Props for the Composer component.
 */
interface ComposerProps {
  initialTitle: string;
  initialFormData: FormDataType | null;
  FormComponent: (props: {
    formAction: (formData: FormData) => void;
    initialFormData: FormDataType | null;
  }) => ReactElement;
  ReviewComponent: (props: {
    apiResponse: ApiResponse;
    onSign: () => void;
    onBack: () => void;
  }) => ReactElement;
  composeTransaction: (data: FormDataType) => Promise<ApiResponse>;
  headerCallbacks?: HeaderCallbacks;
}

/**
 * State for tracking the transaction flow.
 */
interface ComposerState {
  step: "form" | "review" | "success";
  formData: FormDataType | null;
  apiResponse: ApiResponse | null;
  error: string | null;
}

/**
 * Union of all supported form data types.
 */
export type FormDataType =
  | import("@/utils/blockchain/counterparty").SendOptions
  | import("@/utils/blockchain/counterparty").BetOptions
  | import("@/utils/blockchain/counterparty").BroadcastOptions
  | import("@/utils/blockchain/counterparty").BTCPayOptions
  | import("@/utils/blockchain/counterparty").BurnOptions
  | import("@/utils/blockchain/counterparty").CancelOptions
  | import("@/utils/blockchain/counterparty").DestroyOptions
  | import("@/utils/blockchain/counterparty").DispenserOptions
  | import("@/utils/blockchain/counterparty").DispenseOptions
  | import("@/utils/blockchain/counterparty").DividendOptions
  | import("@/utils/blockchain/counterparty").IssuanceOptions
  | import("@/utils/blockchain/counterparty").MPMAOptions
  | import("@/utils/blockchain/counterparty").OrderOptions
  | import("@/utils/blockchain/counterparty").SweepOptions
  | import("@/utils/blockchain/counterparty").FairminterOptions
  | import("@/utils/blockchain/counterparty").FairmintOptions
  | import("@/utils/blockchain/counterparty").AttachOptions
  | import("@/utils/blockchain/counterparty").DetachOptions
  | import("@/utils/blockchain/counterparty").MoveOptions;

/**
 * Updated ApiResponse to include optional broadcast field.
 */
interface ExtendedApiResponse extends ApiResponse {
  broadcast?: {
    txid: string;
    fees?: number;
  };
}

/**
 * Manages a multi-step blockchain transaction process using React 19 features.
 */
export function Composer({
  initialTitle,
  initialFormData,
  FormComponent,
  ReviewComponent,
  composeTransaction,
  headerCallbacks,
}: ComposerProps): ReactElement {
  const navigate = useNavigate();
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction } = useWallet();
  const { isLoading, showLoading, hideLoading } = useLoading();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();

  // Initial state for composing the transaction
  const initialComposeState: ComposerState = {
    step: "form",
    formData: initialFormData,
    apiResponse: null,
    error: null,
  };

  // Action to compose the transaction
  async function composeAction(prevState: ComposerState, formData: FormData): Promise<ComposerState> {
    const loadingId = showLoading("Composing transaction...");
    try {
      if (!activeAddress) throw new Error("Wallet not initialized.");
      const rawData = Object.fromEntries(formData);
      const data = rawData as unknown as FormDataType; // Safer type assertion
      const response = await composeTransaction({
        ...data,
        sourceAddress: activeAddress.address,
      });
      return {
        ...prevState,
        step: "review",
        formData: data,
        apiResponse: response,
        error: null,
      };
    } catch (err) {
      console.error("Compose error:", err);
      return { ...prevState, error: err instanceof Error ? err.message : String(err) };
    } finally {
      hideLoading(loadingId);
    }
  }

  // Manage compose state with useActionState
  const [composeState, formAction, isComposePending] = useActionState(composeAction, initialComposeState);

  // Initial state for signing/broadcasting
  const initialSignState = { ...composeState };

  // Action to sign and broadcast the transaction
  async function signAction(prevState: ComposerState): Promise<ComposerState> {
    const loadingId = showLoading("Signing and broadcasting transaction...");
    try {
      if (!prevState.apiResponse) throw new Error("No transaction composed.");
      if (!activeWallet || !activeAddress) throw new Error("Wallet not initialized.");
      const rawTxHex = prevState.apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      const broadcastResponse = await broadcastTransaction(signedTxHex);
      return {
        ...prevState,
        step: "success",
        apiResponse: { ...prevState.apiResponse, broadcast: broadcastResponse } as ExtendedApiResponse,
        error: null,
      };
    } catch (err) {
      console.error("Sign error:", err);
      return { ...prevState, error: err instanceof Error ? err.message : String(err) };
    } finally {
      hideLoading(loadingId);
    }
  }

  // Manage sign state with a separate useActionState instance
  const [signState, signDispatch, isSignPending] = useActionState(signAction, initialSignState);

  // Toggle help text visibility
  const toggleHelp = () => updateSettings({ showHelpText: !settings?.showHelpText });
  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  // Handle back navigation
  const handleBack = () => {
    if (signState.step === "review") navigate(-1);
    else if (signState.step === "success") navigate("/index");
  };

  // Handle cancellation
  const handleCancel = () => navigate("/index");

  // Configure header based on state and loading
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
      {signState.error && <div style={{ color: "red" }}>{signState.error}</div>}
      {signState.step === "form" && (
        <FormComponent formAction={formAction} initialFormData={signState.formData || null} />
      )}
      {signState.step === "review" && signState.apiResponse && (
        <ReviewComponent apiResponse={signState.apiResponse} onSign={signDispatch} onBack={handleBack} />
      )}
      {signState.step === "success" && signState.apiResponse && (
        <SuccessScreen apiResponse={signState.apiResponse} onReset={() => navigate("/index")} />
      )}
    </div>
  );
}
