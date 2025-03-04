"use client";

import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useActionState,
  useTransition,
  type ReactElement,
} from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { onMessage } from 'webext-bridge/popup'; // Import for popup context
import { useNavigate } from "react-router-dom";
import { AuthorizationModal } from "@/components/modals/authorization-modal";
import { SuccessScreen } from "@/components/screens/success-screen";
import { useComposer } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import { useLoading } from "@/contexts/loading-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ApiResponse as CounterpartyApiResponse } from "@/utils/blockchain/counterparty";

/**
 * Callbacks for header customization.
 */
interface HeaderCallbacks {
  onBack?: () => void;
  onToggleHelp?: () => void;
}

/**
 * Props for the Composer component.
 * @template T - Type of form data
 */
interface ComposerProps<T> {
  initialTitle: string;
  FormComponent: (props: {
    formAction: (formData: FormData) => void;
    initialFormData: T | null;
    error?: string | null;
  }) => ReactElement;
  ReviewComponent: (props: {
    apiResponse: ApiResponse;
    onSign: () => void;
    onBack: () => void;
    error: string | null;
    isSigning: boolean;
  }) => ReactElement;
  composeTransaction: (data: T) => Promise<ApiResponse>;
  headerCallbacks?: HeaderCallbacks;
}

/**
 * Extended API response type from counterparty.
 */
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
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction, unlockWallet, isWalletLocked } =
    useWallet();
  const { isLoading, showLoading, hideLoading } = useLoading();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();
  const { state, compose, sign, reset, revertToForm, isPending } = useComposer<T>();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [, startTransition] = useTransition();

  // Form action state for composing the transaction
  const [composeError, formAction, isComposing] = useActionState(
    async (_prevState: string | null, formData: FormData) => {
      if (!activeAddress) return "No active address available";
      const loadingId = showLoading("Composing transaction...");
      try {
        compose(formData, composeTransaction, activeAddress.address, loadingId, hideLoading);
        return null; // Success
      } catch (err) {
        let errorMessage = "Failed to compose transaction";
        if (err instanceof Error) errorMessage = err.message;
        hideLoading(loadingId);
        return errorMessage;
      }
    },
    null
  );

  // Sign action state for signing and broadcasting
  const [signError, signAction, isSigning] = useActionState(
    async (_prevState: string | null, apiResponse: ApiResponse) => {
      if (!apiResponse || !activeAddress || !activeWallet) return "Invalid transaction data";
      const loadingId = showLoading("Signing and broadcasting transaction...");
      try {
        const rawTxHex = apiResponse.result.rawtransaction;
        const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
        await broadcastTransaction(signedTxHex);
        sign(apiResponse, async () => {});
        return null; // Success
      } catch (err) {
        console.error("Sign action error:", err);
        let errorMessage = "Failed to sign and broadcast transaction";
        if (err instanceof Error) {
          errorMessage = err.message;
          if (errorMessage.includes("Wallet is locked")) {
            setShowAuthModal(true);
            return "Wallet locked, authorization required";
          }
        }
        return errorMessage;
      } finally {
        hideLoading(loadingId);
      }
    },
    null
  );

  const handleSignAction = useCallback(async () => {
    if (state.apiResponse) {
      if (await isWalletLocked()) {
        setShowAuthModal(true);
        return;
      }
      startTransition(() => {
        signAction(state.apiResponse as ApiResponse);
      });
    }
  }, [state.apiResponse, signAction, isWalletLocked]);

  const handleUnlockAndSign = useCallback(async (password: string) => {
    if (!activeWallet || !state.apiResponse || !activeAddress) return;

    const loadingId = showLoading("Authorizing transaction...");
    try {
      await unlockWallet(activeWallet.id, password);
      const rawTxHex = state.apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      await broadcastTransaction(signedTxHex);
      sign(state.apiResponse, async () => {});
      setShowAuthModal(false);
    } catch (err) {
      console.error("Authorization error:", err);
      throw err; // Let the modal handle the error display
    } finally {
      hideLoading(loadingId);
    }
  }, [
    activeWallet,
    activeAddress,
    unlockWallet,
    state.apiResponse,
    signTransaction,
    broadcastTransaction,
    sign,
    showLoading,
    hideLoading,
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

  const toggleHelp = useCallback(
    () => updateSettings({ showHelpText: !settings?.showHelpText }),
    [settings?.showHelpText, updateSettings]
  );

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
    if (isLoading || isPending || isComposing || isSigning) {
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
    isComposing,
    isSigning,
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

  useEffect(() => {
    // Listen for wallet lock events from background
    onMessage('walletLocked', ({ data }) => {
      if (data.locked) {
        setShowAuthModal(true);
      }
    });
  }, []);

  return (
    <div>
      {state.step === "form" && (
        <FormComponent
          formAction={formAction}
          initialFormData={state.formData || null}
          error={state.error || composeError}
        />
      )}
      {state.step === "review" && state.apiResponse && (
        <ReviewComponent
          apiResponse={state.apiResponse}
          onSign={handleSignAction}
          onBack={handleBack}
          error={state.error || signError}
          isSigning={isSigning}
        />
      )}
      {state.step === "success" && state.apiResponse && (
        <SuccessScreen apiResponse={state.apiResponse} onReset={onResetForm} />
      )}

      {showAuthModal && (
        <AuthorizationModal
          onUnlock={handleUnlockAndSign}
          onCancel={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}
