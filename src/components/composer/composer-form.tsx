import { type ReactElement, type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FeeRateInput } from "@/components/ui/inputs/fee-rate-input";
import { useComposer } from "@/contexts/composer-context-object";

import { t } from '@/i18n';
/**
 * Props for the ComposerForm component
 */
export interface ComposerFormProps {
  // Required props
  children: ReactNode;
  formAction: (formData: FormData) => void | Promise<void>;

  // Optional props
  header?: ReactNode;
  submitText?: string;
  submitDisabled?: boolean;
  showFeeRate?: boolean;
  className?: string;
  formClassName?: string;
  containerClassName?: string;
}

/**
 * Compose form component for all transaction composition forms
 * Provides consistent structure, styling, and behavior
 * Uses composer context for state and actions
 * 
 * @example
 * ```tsx
 * <ComposerForm
 *   formAction={handleSubmit}
 *   header={<BalanceHeader balance={balance} />}
 *   submitText="Send"
 * >
 *   <AmountInput />
 *   <DestinationInput />
 * </ComposerForm>
 * ```
 */
export function ComposerForm({
  children,
  formAction,
  header,
  submitText = "Continue",
  submitDisabled = false,
  showFeeRate = true,
  className = "space-y-4",
  formClassName = "space-y-4",
  containerClassName = "bg-white rounded-lg shadow-lg p-3 sm:p-4",
}: ComposerFormProps): ReactElement {
  // Get state from composer context
  // Using unknown instead of any for better type safety - ComposerForm only uses
  // state.error and state.isComposing which are not dependent on the formData type
  const { state, showHelpText, clearError, feeRate, setFeeRate } = useComposer<unknown>();
  const formRef = useRef<HTMLFormElement>(null);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);
  const clipboardTarget = useRef<HTMLInputElement | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  // Determine if form is submitting
  const isSubmitting = isLocalSubmitting || state.isComposing;
  const feeRateMissing = showFeeRate &&
    (feeRate === null || !Number.isFinite(feeRate) || feeRate < 0.1);
  
  return (
    <div className={className}>
      {header}
      
      <div className={containerClassName}>
        {state.error && (
          <ErrorAlert 
            message={state.error} 
            onClose={clearError}
          />
        )}
        
        <form
          ref={formRef}
          className={formClassName}
          onPasteCapture={(event) => {
            if (!(event.target instanceof HTMLInputElement)) return;
            if (!/[\r\n]/.test(event.clipboardData.getData('text/plain'))) return;
            event.preventDefault();
            clipboardTarget.current = event.target;
            setClipboardError('The pasted value contains line breaks. Enter a single value before continuing.');
          }}
          onChangeCapture={(event) => {
            if ((event.target as EventTarget) === clipboardTarget.current) {
              clipboardTarget.current = null;
              setClipboardError(null);
            }
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isLocalSubmitting || submitDisabled || feeRateMissing || clipboardError || !e.currentTarget.checkValidity()) return;

            setIsLocalSubmitting(true);
            try {
              const formData = new FormData(e.currentTarget);
              await formAction(formData);
            } catch (error) {
              console.error('Form submission error:', error);
            } finally {
              setIsLocalSubmitting(false);
            }
          }}
        >
          {children}
          {clipboardError && <ErrorAlert message={clipboardError} />}
          
          {showFeeRate && (
            <FeeRateInput
              showHelpText={showHelpText}
              disabled={isSubmitting}
              initialValue={feeRate}
              onFeeRateChange={setFeeRate}
            />
          )}
          
          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={isSubmitting || submitDisabled || feeRateMissing || Boolean(clipboardError)}
          >
            {isSubmitting ? t('composer_composer_form_submitting') : submitText}
          </Button>
        </form>
      </div>
    </div>
  );
}
