
import { useEffect, useMemo, useCallback, type ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "@/components/icons";
import { onMessage } from 'webext-bridge/popup';
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { UnlockScreen } from "@/components/screens/unlock-screen";
import { LoadingOverlay } from "@/components/loading-overlay";
import { ComposerProvider, useComposer } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import type { ApiResponse } from "@/utils/blockchain/counterparty/compose";

/**
 * Compose operation types for internal wallet use
 */
export type ComposeType =
  | 'send' | 'mpma' | 'order' | 'dispenser' | 'dispense'
  | 'fairminter' | 'fairmint' | 'dividend' | 'sweep' | 'btcpay'
  | 'cancel' | 'dispenser-close-by-hash' | 'broadcast'
  | 'attach' | 'detach' | 'move-utxo' | 'move' | 'destroy' | 'issue-supply'
  | 'lock-supply' | 'reset-supply' | 'transfer' | 'update-description'
  | 'lock-description' | 'issuance';

/**
 * Props for the Composer component.
 * @template T - Type of form data
 */
interface ComposerProps<T> {
  // Compose configuration
  composeType: ComposeType;
  composeApiMethod: (data: T) => Promise<ApiResponse>;

  // UI configuration
  initialTitle: string;
  initialFormData?: T;

  // Components
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
    hideBackButton?: boolean;
  }) => ReactElement;

  // Optional callbacks
  headerCallbacks?: {
    onBack?: () => void;
    onToggleHelp?: () => void;
  };
}

/**
 * Internal props for ComposerInner
 */
interface ComposerInnerProps<T> extends Omit<ComposerProps<T>, "composeApiMethod" | "composeType"> {
}

/**
 * Inner composer component that uses the context
 */
function ComposerInner<T>({
  initialTitle,
  initialFormData,
  FormComponent,
  ReviewComponent,
  headerCallbacks,
}: ComposerInnerProps<T>): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const {
    state,
    composeTransaction,
    signAndBroadcast,
    goBack,
    reset,
    setShowAuthModal,
    showHelpText,
    toggleHelpText,
    handleUnlockAndSign,
  } = useComposer<T>();

  // Header configuration based on current step
  const headerConfig = useMemo(() => {
    const handleCancel = () => {
      reset();
      navigate("/index");
    };

    const onBackDefault = () => navigate(-1);
    const onBackSuccess = () => {
      reset();
      navigate("/index");
    };

    // Loading states
    if (state.isComposing || state.isSigning) {
      return {
        useLogoTitle: true,
        leftButton: {
          icon: <FiX className="w-4 h-4" aria-hidden="true" />,
          onClick: handleCancel,
          ariaLabel: "Cancel transaction",
        },
      };
    }

    // Review step
    if (state.step === "review" && state.apiResponse) {
      return {
        title: initialTitle,
        onBack: goBack,
        rightButton: {
          icon: <FiX className="w-4 h-4" aria-hidden="true" />,
          onClick: handleCancel,
          ariaLabel: "Cancel and return to index",
        },
      };
    }

    // Success step
    if (state.step === "success" && state.apiResponse) {
      return {
        useLogoTitle: true,
        onBack: onBackSuccess,
        rightButton: {
          icon: <FiRefreshCw className="w-4 h-4" aria-hidden="true" />,
          onClick: reset,
          ariaLabel: "Return to form",
        },
      };
    }

    // Form step (default)
    return {
      title: initialTitle,
      onBack: headerCallbacks?.onBack || onBackDefault,
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: headerCallbacks?.onToggleHelp || toggleHelpText,
        ariaLabel: "Toggle help text",
      },
    };
  }, [
    state.step,
    state.apiResponse,
    state.isComposing,
    state.isSigning,
    initialTitle,
    headerCallbacks?.onBack,
    headerCallbacks?.onToggleHelp,
    goBack,
    reset,
    toggleHelpText,
    navigate,
  ]);

  // Set header props
  useEffect(() => {
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null);
  }, [headerConfig, setHeaderProps]);

  // Listen for wallet lock events
  useEffect(() => {
    const unsubscribe = onMessage('walletLocked', ({ data }: { data: { locked: boolean } }) => {
      if (data?.locked) {
        setShowAuthModal(true);
      }
    });
    return () => {
      // Clean up if onMessage returns an unsubscribe function
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [setShowAuthModal]);

  // Handle form submission - wrapped to prevent unmount
  const handleFormAction = useCallback((formData: FormData) => {
    // Call synchronously to prevent unmount
    composeTransaction(formData);
  }, [composeTransaction]);

  // Render based on current step
  return (
    <div className="relative">
      {/* Local loading overlay that won't cause unmounts */}
      <LoadingOverlay
        isLoading={state.isComposing || state.isSigning}
        message={state.isComposing ? "Composing transaction..." : "Signing and broadcasting..."}
      />

      {state.step === "form" && (
        <FormComponent
          formAction={handleFormAction}
          initialFormData={state.formData ?? initialFormData ?? null}
          error={state.error}
          showHelpText={showHelpText}
        />
      )}

      {state.step === "review" && state.apiResponse && (
        <ReviewComponent
          apiResponse={state.apiResponse}
          onSign={signAndBroadcast}
          onBack={goBack}
          error={state.error}
          isSigning={state.isSigning}
        />
      )}

      {state.step === "success" && state.apiResponse && (
        <SuccessScreen
          apiResponse={state.apiResponse}
          onReset={reset}
        />
      )}

      {state.showAuthModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <div 
            className="w-full max-w-lg animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <UnlockScreen
              title="Authorization Required"
              subtitle="Your session has expired. Please enter your password to continue."
              onUnlock={handleUnlockAndSign}
              onCancel={() => setShowAuthModal(false)}
              submitText="Authorize"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main composer component that provides the context
 */
export function Composer<T>({
  composeType,
  composeApiMethod,
  initialTitle,
  initialFormData,
  FormComponent,
  ReviewComponent,
  headerCallbacks,
}: ComposerProps<T>): ReactElement {
  return (
    <ComposerProvider<T>
      composeType={composeType}
      composeApi={composeApiMethod}
      initialTitle={initialTitle}
    >
      <ComposerInner<T>
        initialTitle={initialTitle}
        initialFormData={initialFormData}
        FormComponent={FormComponent}
        ReviewComponent={ReviewComponent}
        headerCallbacks={headerCallbacks}
      />
    </ComposerProvider>
  );
}