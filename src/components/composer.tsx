import { useEffect, useMemo, useCallback } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useComposer } from "@/contexts/composer-context";
import type { FormDataType } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse } from "@/utils/blockchain/counterparty";

/**
 * Defines callbacks for customizing header behavior.
 * @typedef {Object} HeaderCallbacks
 * @property {() => void} [onBack] - Optional callback for the back button.
 * @property {() => void} [onToggleHelp] - Optional callback for toggling help text.
 */
interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

/**
 * Props for the Composer component.
 * @typedef {Object} ComposerProps
 * @property {string} initialTitle - The initial title for the header.
 * @property {(props: { onSubmit: (data: FormDataType) => void; initialFormData?: FormDataType }) => ReactElement} FormComponent - Component for rendering the form step.
 * @property {(props: { apiResponse: ApiResponse; onSign: () => Promise<void>; onBack: () => void }) => ReactElement} ReviewComponent - Component for rendering the review step.
 * @property {(data: FormDataType) => Promise<ApiResponse>} composeTransaction - Function to compose the transaction.
 * @property {HeaderCallbacks} [headerCallbacks] - Optional callbacks to override default header behavior.
 */
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

/**
 * A multi-step transaction composer that guides the user through form input, review, and success stages.
 * Manages loading states, header configuration, and transaction signing/broadcasting.
 * @param {ComposerProps} props - The properties for the Composer component.
 * @returns {JSX.Element} The rendered composer UI based on the current step.
 * @example
 * ```tsx
 * <Composer
 *   initialTitle="Send Tokens"
 *   FormComponent={SendForm}
 *   ReviewComponent={SendReview}
 *   composeTransaction={composeSendTransaction}
 * />
 * ```
 */
export function Composer({
  initialTitle,
  FormComponent,
  ReviewComponent,
  composeTransaction,
  headerCallbacks,
}: ComposerProps): JSX.Element {
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

  /**
   * Toggles the display of help text in settings.
   */
  const toggleHelp = useCallback(() => {
    updateSettings({ showHelpText: !settings?.showHelpText });
  }, [updateSettings, settings?.showHelpText]);

  const effectiveToggleHelp = headerCallbacks?.onToggleHelp || toggleHelp;

  /**
   * Handles navigation or step reversion when the back button is pressed.
   */
  const handleBack = useCallback(() => {
    if (step === "review") {
      setApiResponse(null); // Clear API response but keep formData
      setStep("form"); // Go back to form with existing formData
    } else {
      reset(); // Full reset on other steps
      navigate(-1);
    }
  }, [step, setApiResponse, setStep, navigate, reset]);

  /**
   * Cancels the current operation, resetting state and navigating appropriately.
   */
  const handleCancel = useCallback(() => {
    if (step === "review") {
      setFormData(null);
      setApiResponse(null);
      setStep("form");
    } else {
      reset();
      navigate('/index');
    }
  }, [step, setFormData, setApiResponse, setStep, navigate, reset]);

  /**
   * Configures the header based on the current step and loading state.
   */
  const headerConfig = useMemo(() => {
    if (isLoading) {
      return {
        useLogoTitle: true,
        leftButton: {
          icon: <FiX className="w-4 h-4" />,
          onClick: handleCancel,
          ariaLabel: "Cancel transaction",
        },
      };
    }
    if (step === "review" && apiResponse) {
      return {
        title: initialTitle,
        onBack: headerCallbacks?.onBack || handleBack,
        rightButton: {
          icon: <FiX className="w-4 h-4" />,
          onClick: () => {
            reset();
            navigate('/index');
          },
          ariaLabel: "Cancel and return to index",
        },
      };
    }
    if (step === "success" && apiResponse) {
      return {
        useLogoTitle: true,
        onBack: () => {
          reset();
          navigate('/index');
        },
        rightButton: {
          icon: <FiRefreshCw className="w-4 h-4" />,
          onClick: () => {
            reset();
            setStep('form');
          },
          ariaLabel: "Reset and return to form",
        },
      };
    }
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
    navigate,
    reset,
    setStep,
  ]);

  useEffect(() => {
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null); // Cleanup on unmount
  }, [headerConfig, setHeaderProps]);

  /**
   * Submits form data to compose a transaction, managing loading state and errors.
   * @param {FormDataType} data - The form data to submit.
   */
  const handleFormSubmit = useCallback(async (data: FormDataType) => {
    const loadingId = showLoading("Composing transaction...");
    setError(null);
    try {
      if (!activeAddress) throw new Error("Wallet not initialized.");
      const response = await composeTransaction({
        ...data,
        sourceAddress: activeAddress.address,
      });
      setApiResponse(response);
      setFormData(data);
      setStep("review");
    } catch (err) {
      console.error("Compose error:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      hideLoading(loadingId);
    }
  }, [
    activeAddress,
    composeTransaction,
    setApiResponse,
    setFormData,
    setStep,
    setError,
    showLoading,
    hideLoading,
  ]);

  /**
   * Signs and broadcasts the composed transaction, managing loading state and errors.
   */
  const handleSign = useCallback(async () => {
    const loadingId = showLoading("Signing and broadcasting transaction...");
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
      hideLoading(loadingId);
    }
  }, [
    apiResponse,
    activeWallet,
    activeAddress,
    signTransaction,
    broadcastTransaction,
    setApiResponse,
    setStep,
    setError,
    showLoading,
    hideLoading,
  ]);

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
