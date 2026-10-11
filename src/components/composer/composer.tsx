import { type ReactElement, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { HuntProgress } from "@/components/domain/zeld/hunt-progress";
import { FiHelpCircle, FiRefreshCw, FiX } from "@/components/icons";
import type { TransactionReviewProps } from "@/components/screens/review-screen";
import { SuccessScreen } from "@/components/screens/success-screen";
import { Banner } from "@/components/ui/banner";
import { Spinner } from "@/components/ui/spinner";
import { ComposerProvider } from "@/contexts/composer-context"
import { useComposer } from "@/contexts/composer-context-object";
import { useHeader } from "@/contexts/header-context";
import type { ApiResponse } from "@/core/counterparty/compose";
import { HUNTS_WHILE_SIGNING } from "@/core/zeld/eligibility";

import { t } from '@/i18n';
export type ComposeType =
  | 'send' | 'mpma' | 'order' | 'dispenser' | 'dispense'
  | 'fairminter' | 'fairmint' | 'dividend' | 'sweep' | 'btcpay'
  | 'cancel' | 'dispenser-close-by-hash' | 'broadcast'
  | 'attach' | 'detach' | 'move-utxo' | 'move' | 'destroy' | 'issue-supply'
  | 'lock-supply' | 'reset-supply' | 'transfer' | 'update-description'
  | 'lock-description' | 'issuance' | 'pooldeposit' | 'poolwithdraw';

interface ComposerProps<T> {

  composeType: ComposeType;
  composeApiMethod: (data: T) => Promise<ApiResponse>;

  initialTitle: string;
  initialFormData?: T;

  FormComponent?: (props: {
    formAction: (formData: FormData) => void | Promise<void>;
    initialFormData: T | null;
    error?: string | null;
    showHelpText?: boolean;
  }) => ReactElement;
  /** Render callbacks return elements; changing their identity must not remount their forms. */
  renderForm?: ComposerProps<T>['FormComponent'];
  renderReview?: ComposerProps<T>['ReviewComponent'];
  ReviewComponent?: (props: TransactionReviewProps & { apiResponse: ApiResponse }) => ReactElement;

  headerCallbacks?: {
    onBack?: () => void;
    onToggleHelp?: () => void;
  };
}

interface ComposerInnerProps<T> extends Omit<ComposerProps<T>, "composeApiMethod" | "composeType"> {
}

function ComposerInner<T>({
  initialTitle,
  initialFormData,
  FormComponent,
  ReviewComponent,
  renderForm,
  renderReview,
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
    acceptZeldHunt,
  } = useComposer<T>();

  const headerConfig = useMemo(() => {
    const handleCancel = () => {
      reset();
      void navigate("/index");
    };

    const onBackDefault = () => navigate(-1);
    const onBackSuccess = () => {
      reset();
      void navigate("/index");
    };

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

  useEffect(() => {
    setHeaderProps(headerConfig);
    return () => setHeaderProps(null);
  }, [headerConfig, setHeaderProps]);

  const handleFormAction = useCallback((formData: FormData) => {

    return composeTransaction(formData);
  }, [composeTransaction]);

  if (state.isComposing || state.isSigning) {
    const hunt = state.zeldHuntProgress;
    const metadata = state.apiResponse?.result.zeld_hunt;
    const signingBudget = metadata?.reason === HUNTS_WHILE_SIGNING ? metadata.seconds : 0;
    const message = state.isComposing ? t('composer_composer_composing_transaction')
      : signingBudget ? t('zeld_signing_hunt', [String(signingBudget)])
      : t('composer_composer_signing_and_broadcasting');
    return (
      <div className="min-h-[300px] p-4 flex flex-col items-center justify-center">
        {hunt ? <HuntProgress progress={hunt} onContinue={acceptZeldHunt} /> : <Spinner message={message} />}
      </div>
    );
  }

  return (
    <>
      {state.step === "form" && (renderForm ? renderForm({
        formAction: handleFormAction,
        initialFormData: state.formData ?? initialFormData ?? null,
        error: state.error,
        showHelpText,
      }) : FormComponent && (
        <FormComponent
          formAction={handleFormAction}
          initialFormData={state.formData ?? initialFormData ?? null}
          error={state.error}
          showHelpText={showHelpText}
        />
      ))}

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
          {state.reviewNotices.map((notice, index) => (
            <div key={`${index}-${notice}`} className="px-4 pt-4">
              <Banner severity="info" title={notice} />
            </div>
          ))}
          {renderReview ? renderReview({
            apiResponse: state.apiResponse,
            onSign: () => { void signAndBroadcast(); },
            onBack: goBack,
            error: state.error,
            isSigning: state.isSigning,
          }) : ReviewComponent && <ReviewComponent
            apiResponse={state.apiResponse}
            onSign={() => { void signAndBroadcast(); }}
            onBack={goBack}
            error={state.error}
            isSigning={state.isSigning}
          />}
        </>
      )}

      {state.step === "success" && state.apiResponse && (
        <SuccessScreen
          apiResponse={state.apiResponse}
        />
      )}
    </>
  );
}

export function Composer<T>({
  composeType,
  composeApiMethod,
  initialTitle,
  initialFormData,
  FormComponent,
  ReviewComponent,
  renderForm,
  renderReview,
  headerCallbacks,
}: ComposerProps<T>): ReactElement {
  const { pathname } = useLocation();
  return (
    <ComposerProvider<T>
      key={pathname}
      composeType={composeType}
      composeApi={composeApiMethod}
      initialTitle={initialTitle}
    >
      <ComposerInner<T>
        initialTitle={initialTitle}
        initialFormData={initialFormData}
        FormComponent={FormComponent}
        ReviewComponent={ReviewComponent}
        renderForm={renderForm}
        renderReview={renderReview}
        headerCallbacks={headerCallbacks}
      />
    </ComposerProvider>
  );
}
