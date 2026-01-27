import { type ReactElement, type ReactNode, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FeeRateInput } from "@/components/ui/inputs/fee-rate-input";
import { useComposer } from "@/contexts/composer-context";

/**
 * Props for the ComposerForm component
 */
export interface ComposerFormProps {
  // Required props
  children: ReactNode;
  formAction: (formData: FormData) => void;
  
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
  const { state, showHelpText, clearError } = useComposer<unknown>();
  const formRef = useRef<HTMLFormElement>(null);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  // Determine if form is submitting
  const isSubmitting = isLocalSubmitting || state.isComposing;
  
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
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isLocalSubmitting) return;

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
          
          {showFeeRate && (
            <FeeRateInput
              showHelpText={showHelpText}
              disabled={isSubmitting}
            />
          )}
          
          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={isSubmitting || submitDisabled}
          >
            {isSubmitting ? "Submitting…" : submitText}
          </Button>
        </form>
      </div>
    </div>
  );
}