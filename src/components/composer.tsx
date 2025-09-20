"use client";

import { useEffect, useMemo, type ReactElement } from "react";
import { FiHelpCircle, FiX, FiRefreshCw } from "react-icons/fi";
import { onMessage } from 'webext-bridge/popup';
import { useNavigate } from "react-router-dom";
import { SuccessScreen } from "@/components/screens/success-screen";
import { UnlockScreen } from "@/components/screens/unlock-screen";
import { ComposerProvider, useComposer } from "@/contexts/composer-context";
import { useHeader } from "@/contexts/header-context";
import type { ApiResponse } from "@/utils/blockchain/counterparty";

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
  composeApiMethod: (data: T) => Promise<ApiResponse>;
  headerCallbacks?: {
    onBack?: () => void;
    onToggleHelp?: () => void;
  };
  // Provider request handling
  composeRequestId?: string | null;
  initialFormData?: T | null;
  onSuccess?: (result: any) => void;
}

/**
 * Inner composer component that uses the context
 */
function ComposerInner<T>({
  initialTitle,
  FormComponent,
  ReviewComponent,
  headerCallbacks,
  composeRequestId,
  onSuccess,
}: Omit<ComposerProps<T>, "composeApiMethod" | "initialFormData">): ReactElement {
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

  // Handle success for provider requests
  useEffect(() => {
    if (state.step === "success" && state.apiResponse && composeRequestId && onSuccess) {
      // Call the success callback with the result
      onSuccess(state.apiResponse);
    }
  }, [state.step, state.apiResponse, composeRequestId, onSuccess]);

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

  // Handle form submission
  const handleFormAction = async (formData: FormData) => {
    await composeTransaction(formData);
  };

  // Render based on current step
  return (
    <div>
      {state.step === "form" && (
        <FormComponent
          formAction={handleFormAction}
          initialFormData={state.formData}
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
  initialTitle,
  FormComponent,
  ReviewComponent,
  composeApiMethod,
  headerCallbacks,
  composeRequestId,
  initialFormData,
  onSuccess,
}: ComposerProps<T>): ReactElement {
  return (
    <ComposerProvider<T>
      composeApi={composeApiMethod}
      initialTitle={initialTitle}
      initialFormData={initialFormData}
    >
      <ComposerInner<T>
        initialTitle={initialTitle}
        FormComponent={FormComponent}
        ReviewComponent={ReviewComponent}
        headerCallbacks={headerCallbacks}
        composeRequestId={composeRequestId}
        onSuccess={onSuccess}
      />
    </ComposerProvider>
  );
}