import { type ReactElement, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { FiHelpCircle, FiRefreshCw, FiX } from "@/components/icons";
import { SuccessScreen } from "@/components/screens/success-screen";
import { Banner } from "@/components/ui/banner";
import { Spinner } from "@/components/ui/spinner";
import { ComposerProvider } from "@/contexts/composer-context"
import { useComposer } from "@/contexts/composer-context-object";
import { useHeader } from "@/contexts/header-context";
import type { ApiResponse } from "@/core/counterparty/compose";

import { t } from '@/i18n';
/**
 * Compose operation types for internal wallet use
 */
export type ComposeType =
  | 'send' | 'mpma' | 'order' | 'dispenser' | 'dispense'
  | 'fairminter' | 'fairmint' | 'dividend' | 'sweep' | 'btcpay'
  | 'cancel' | 'dispenser-close-by-hash' | 'broadcast'
  | 'attach' | 'detach' | 'move-utxo' | 'move' | 'destroy' | 'issue-supply'
  | 'lock-supply' | 'reset-supply' | 'transfer' | 'update-description'
  | 'lock-description' | 'issuance' | 'pooldeposit' | 'poolwithdraw';

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
    formAction: (formData: FormData) => void | Promise<void>;
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
    showHelpText,
    toggleHelpText,
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
          icon: <FiX className="size-4" aria-hidden="true" />,
          onClick: handleCancel,
          ariaLabel: t('composer_composer_cancel_transaction'),
        },
      };
    }

    // Review step
    if (state.step === "review" && state.apiResponse) {
      return {
        title: initialTitle,
        onBack: goBack,
        rightButton: {
          icon: <FiX className="size-4" aria-hidden="true" />,
          onClick: handleCancel,
          ariaLabel: t('composer_composer_cancel_and_return_to_index'),
        },
      };
    }

    // Success step
    if (state.step === "success" && state.apiResponse) {
      return {
        useLogoTitle: true,
        onBack: onBackSuccess,
        rightButton: {
          icon: <FiRefreshCw className="size-4" aria-hidden="true" />,
          onClick: reset,
          ariaLabel: t('composer_composer_return_to_form'),
        },
      };
    }

    // Form step (default)
    return {
      title: initialTitle,
      onBack: headerCallbacks?.onBack || onBackDefault,
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: headerCallbacks?.onToggleHelp || toggleHelpText,
        ariaLabel: t('common_toggle_help_text'),
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

  // Handle form submission - wrapped to prevent unmount
  const handleFormAction = useCallback((formData: FormData) => {
    // Call synchronously to prevent unmount
    return composeTransaction(formData);
  }, [composeTransaction]);

  // Render based on current step
  // Show spinner during async operations (composing or signing)
  if (state.isComposing || state.isSigning) {
    return (
      <Spinner
        message={state.isComposing ? t('composer_composer_composing_transaction') : t('composer_composer_signing_and_broadcasting')}
        className="min-h-[300px]"
      />
    );
  }

  return (
    <>
      {state.step === "form" && (
        <FormComponent
          formAction={handleFormAction}
          initialFormData={state.formData ?? initialFormData ?? null}
          error={state.error}
          showHelpText={showHelpText}
        />
      )}

      {state.step === "review" && state.apiResponse && (
        <>
          {state.verificationWarnings.length > 0 && (
            <div className="px-4 pt-4">
              <Banner
                severity="warning"
                title={t('composer_composer_composed_transaction_differs_from_your')}
                description={t('composer_composer_these_differences_are_not_dangerous')}
              >
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {state.verificationWarnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </Banner>
            </div>
          )}
          <ReviewComponent
            apiResponse={state.apiResponse}
            onSign={signAndBroadcast}
            onBack={goBack}
            error={state.error}
            isSigning={state.isSigning}
          />
        </>
      )}

      {state.step === "success" && state.apiResponse && (
        <SuccessScreen
          apiResponse={state.apiResponse}
          onReset={reset}
        />
      )}
    </>
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
