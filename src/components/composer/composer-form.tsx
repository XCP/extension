import { type ReactElement, type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FeeRateInput } from "@/components/ui/inputs/fee-rate-input";
import { useComposer } from "@/contexts/composer-context-object";

import { t } from '@/i18n';

export interface ComposerFormProps {
  children: ReactNode;
  formAction: (formData: FormData) => void | Promise<void>;

  header?: ReactNode;
  submitText?: string;
  submitDisabled?: boolean;
  showFeeRate?: boolean;
  className?: string;
  formClassName?: string;
  containerClassName?: string;
}

export function ComposerForm({
  children,
  formAction,
  header,
  submitText,
  submitDisabled = false,
  showFeeRate = true,
  className = "space-y-4",
  formClassName = "space-y-4",
  containerClassName = "bg-white rounded-lg shadow-lg p-3 sm:p-4",
}: ComposerFormProps): ReactElement {
  const { state, showHelpText, clearError, feeRate, setFeeRate } = useComposer<unknown>();
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);
  // Every rejected paste requires correction of that field. A later rejected paste must not
  // replace the earlier blocker and allow its last-valid value to be submitted accidentally.
  const clipboardTargets = useRef(new Set<HTMLInputElement>());
  const [clipboardError, setClipboardError] = useState(false);

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
          className={formClassName}
          onPasteCapture={(event) => {
            if (!(event.target instanceof HTMLInputElement)) return;
            if (!/[\r\n]/.test(event.clipboardData.getData('text/plain'))) return;
            event.preventDefault();
            clipboardTargets.current.add(event.target);
            setClipboardError(true);
          }}
          onChangeCapture={(event) => {
            if (event.target instanceof HTMLInputElement && clipboardTargets.current.delete(event.target)) {
              setClipboardError(clipboardTargets.current.size > 0);
            }
          }}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isLocalSubmitting || submitDisabled || feeRateMissing || clipboardError || !e.currentTarget.checkValidity()) return;

            setIsLocalSubmitting(true);
            const formData = new FormData(e.currentTarget);
            void (async () => {
              try {
                await formAction(formData);
              } catch (error) {
                console.error('Form submission error:', error);
              } finally {
                setIsLocalSubmitting(false);
              }
            })();
          }}
        >
          {children}
          {clipboardError && <ErrorAlert message={t('safety_clipboard_lines')} />}
          
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
            {isSubmitting ? t('composer_composer_form_submitting') : submitText ?? t('common_continue')}
          </Button>
        </form>
      </div>
    </div>
  );
}
