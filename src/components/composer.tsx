"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { ErrorAlert } from "@/components/error-alert";
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
  const { activeWallet, activeAddress, signTransaction, broadcastTransaction, unlockWallet } = useWallet();
  const { isLoading, showLoading, hideLoading } = useLoading();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings } = useSettings();
  const { state, error, isPending, compose, sign, reset, revertToForm } = useComposer<T>();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const formAction = useCallback(
    (formData: FormData) => {
      if (activeAddress) {
        const loadingId = showLoading("Composing transaction...");
        compose(formData, composeTransaction, activeAddress.address)
          .finally(() => {
            hideLoading(loadingId);
          });
      }
    },
    [compose, composeTransaction, activeAddress, showLoading, hideLoading]
  );

  const signAction = useCallback(async () => {
    if (!state.apiResponse || !activeAddress || !activeWallet) return;

    const loadingId = showLoading("Signing and broadcasting transaction...");
    try {
      const rawTxHex = state.apiResponse.result.rawtransaction;
      try {
        const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
        await broadcastTransaction(signedTxHex);
        sign(state.apiResponse, async () => {});
      } catch (err) {
        // Check if the error is due to wallet being locked
        if (err instanceof Error && err.message.includes("Wallet is locked")) {
          hideLoading(loadingId);
          setShowPasswordModal(true);
          return; // Exit early, we'll handle this via the password modal
        }
        throw err; // Re-throw if it's not a wallet lock error
      }
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

  const handleUnlockAndSign = async () => {
    if (!activeWallet || !password) return;
    
    const loadingId = showLoading("Authorizing transaction...");
    try {
      // First unlock the wallet
      await unlockWallet(activeWallet.id, password);
      
      // Then retry the sign action
      if (state.apiResponse && activeAddress) {
        const rawTxHex = state.apiResponse.result.rawtransaction;
        const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
        await broadcastTransaction(signedTxHex);
        sign(state.apiResponse, async () => {});
      }
      
      // Clear the password and close the modal
      setPassword("");
      setShowPasswordModal(false);
      setUnlockError(null);
    } catch (err) {
      console.error("Authorization error:", err);
      let errorMessage = "Failed to authorize transaction";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setUnlockError(errorMessage);
    } finally {
      hideLoading(loadingId);
    }
  };

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
      {error && <ErrorAlert message={error} onClose={() => reset()} />}
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
        <SuccessScreen apiResponse={state.apiResponse} onReset={onResetForm} />
      )}
      
      {/* Password Modal for Transaction Authorization */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h1 className="text-xl font-bold mb-5 flex justify-between items-center">
              <span>Authorize Transaction</span>
            </h1>
            
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Please enter your password to authorize this transaction.
            </p>
            
            {unlockError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg" role="alert">
                {unlockError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassword("");
                    setUnlockError(null);
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnlockAndSign}
                  disabled={!password}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 ${!password ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Authorize
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
