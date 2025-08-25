"use client";

import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useActionState,
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
    showHelpText?: boolean;
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

/**
 * Map of Options type names to compose types for normalization
 */
const OPTIONS_TO_COMPOSE_TYPE: Record<string, string> = {
  'SendOptions': 'send',
  'ExtendedSendOptions': 'send',
  'OrderOptions': 'order',
  'IssuanceOptions': 'issuance',
  'DestroyOptions': 'destroy',
  'DispenserOptions': 'dispenser',
  'DispenseOptions': 'dispense',
  'DividendOptions': 'dividend',
  'BurnOptions': 'burn',
  'BetOptions': 'bet',
  'BroadcastOptions': 'broadcast',
  'SweepOptions': 'sweep',
  'FairminterOptions': 'fairminter',
  'FairmintOptions': 'fairmint',
  'AttachOptions': 'attach',
  'DetachOptions': 'detach',
  'MoveOptions': 'move',
  'BTCPayOptions': 'btcpay',
  'CancelOptions': 'cancel',
  'MPMAOptions': 'mpma',
  'MPMAData': 'mpma',
};

/**
 * Gets the compose type from the generic type name
 */
function getComposeType<T>(data: T): string | undefined {
  // Try to get the constructor name from the prototype chain
  const typeName = (data as any)?.constructor?.name;
  if (typeName && OPTIONS_TO_COMPOSE_TYPE[typeName]) {
    return OPTIONS_TO_COMPOSE_TYPE[typeName];
  }
  
  // Fallback: try to infer from the data shape
  if (data && typeof data === 'object') {
    // Check for specific fields that identify the type
    if ('give_asset' in data && 'get_asset' in data) return 'order';
    if ('destination' in data && 'asset' in data && 'quantity' in data) return 'send';
    if ('asset' in data && 'divisible' in data) return 'issuance';
    if ('dispenser' in data) return 'dispense';
    if ('give_quantity' in data && 'escrow_quantity' in data) return 'dispenser';
    if ('dividend_asset' in data) return 'dividend';
    if ('wager_quantity' in data) return 'bet';
    if ('text' in data && !('destination' in data)) return 'broadcast';
    if ('flags' in data) return 'sweep';
    if ('order_match_id' in data) return 'btcpay';
    if ('offer_hash' in data) return 'cancel';
    // Add more patterns as needed
  }
  
  return undefined;
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
  const { settings } = useSettings();
  const { state, compose, sign, reset, revertToForm, clearError, setError, isPending } = useComposer<T>();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [localShowHelpText, setLocalShowHelpText] = useState<boolean | null>(null); // null means use global setting

  // Form action state for composing the transaction
  const [composeError, formAction, isComposing] = useActionState(
    async (_prevState: string | null, formData: FormData) => {
      if (!activeAddress) return "No active address available";
      const loadingId = showLoading("Composing transaction...");
      try {
        // Auto-detect compose type from form data
        const rawData = Object.fromEntries(formData);
        const detectedType = getComposeType(rawData);
        compose(formData, composeTransaction, activeAddress.address, loadingId, hideLoading, detectedType);
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

  // Local state for sign error since useActionState might not update immediately
  const [localSignError, setLocalSignError] = useState<string | null>(null);
  
  // Sign action state for signing and broadcasting  
  const [signError, signAction, isSigning] = useActionState(
    async (_prevState: string | null, apiResponse: ApiResponse) => {
      if (!apiResponse || !activeAddress || !activeWallet) {
        const error = "Invalid transaction data";
        setLocalSignError(error);
        return error;
      }
      
      const loadingId = showLoading("Signing and broadcasting transaction...");
      try {
        const rawTxHex = apiResponse.result.rawtransaction;
        const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
        const broadcastResponse = await broadcastTransaction(signedTxHex);
        
        // Add broadcast response to apiResponse
        const apiResponseWithBroadcast = {
          ...apiResponse,
          broadcast: broadcastResponse
        };
        
        // Call sign for success case
        sign(apiResponseWithBroadcast, async () => {});
        hideLoading(loadingId);
        setLocalSignError(null); // Clear error on success
        return null; // Success
        
      } catch (err) {
        hideLoading(loadingId);
        console.error("Sign action error:", err);
        
        const errorMessage = err instanceof Error ? err.message : "Failed to sign and broadcast transaction";
        
        // Set local error immediately for immediate UI update
        setLocalSignError(errorMessage);
        
        // IMPORTANT: Also set the error in composer context state
        // This ensures the error is visible in the review screen
        setError(errorMessage);
        
        // Special handling for wallet lock
        if (err instanceof Error && err.message.includes("Wallet is locked")) {
          setShowAuthModal(true);
        }
        
        // Force a re-render by setting the error in a timeout
        // This ensures the error is visible even if React batches updates
        setTimeout(() => {
          setLocalSignError(errorMessage);
          setError(errorMessage); // Also update context error in timeout
        }, 0);
        
        // Return the error message - this becomes signError
        return errorMessage;
      }
    },
    null
  );

  // Update localSignError when signError changes
  useEffect(() => {
    if (signError) {
      setLocalSignError(signError);
    }
  }, [signError]);

  // Debug: Log error states when on review step
  useEffect(() => {
    if (state.step === "review") {
      const currentError = state.error || localSignError || signError;
      if (currentError) {
        console.log('Review screen errors:', {
          stateError: state.error,
          localSignError,
          signError,
          combined: currentError
        });
      }
    }
  }, [state.step, state.error, localSignError, signError]);

  const handleSignAction = useCallback(async () => {
    if (state.apiResponse) {
      // Don't clear errors here - let them persist until successful signing
      
      if (await isWalletLocked()) {
        setShowAuthModal(true);
        return;
      }
      
      // Clear error only right before attempting to sign
      setLocalSignError(null);
      // Don't use startTransition - it might prevent error state updates
      signAction(state.apiResponse as ApiResponse);
    }
  }, [state.apiResponse, signAction, isWalletLocked]);

  const handleUnlockAndSign = useCallback(async (password: string) => {
    if (!activeWallet || !state.apiResponse || !activeAddress) return;

    const loadingId = showLoading("Authorizing transaction...");
    try {
      await unlockWallet(activeWallet.id, password);
      const rawTxHex = state.apiResponse.result.rawtransaction;
      const signedTxHex = await signTransaction(rawTxHex, activeAddress.address);
      const broadcastResponse = await broadcastTransaction(signedTxHex);
      // Add broadcast response to apiResponse
      const apiResponseWithBroadcast = {
        ...state.apiResponse,
        broadcast: broadcastResponse
      };
      sign(apiResponseWithBroadcast, async () => {});
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
      // Clear any sign errors when going back
      setLocalSignError(null);
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

  // Determine whether to show help text (local override or global setting)
  const shouldShowHelpText = localShowHelpText !== null ? localShowHelpText : (settings?.showHelpText ?? false);
  
  const toggleHelp = useCallback(() => {
    // Toggle local state, starting from current effective value
    setLocalShowHelpText(!shouldShowHelpText);
  }, [shouldShowHelpText]);

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
    onMessage('walletLocked', ({ data }: { data: { locked: boolean } }) => {
      if (data?.locked) {
        setShowAuthModal(true);
      }
    });
  }, []);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      clearError();
      setLocalSignError(null);
    };
  }, [clearError]);

  return (
    <div>
      {state.step === "form" && (
        <FormComponent
          formAction={formAction}
          initialFormData={state.formData || null}
          error={state.error || composeError}
          showHelpText={shouldShowHelpText}
        />
      )}
      {state.step === "review" && state.apiResponse && (
        <ReviewComponent
          apiResponse={state.apiResponse}
          onSign={handleSignAction}
          onBack={handleBack}
          error={state.error || localSignError || signError}
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
