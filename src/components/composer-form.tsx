"use client";

import { type ReactElement, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
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
  const { state, showHelpText, clearError } = useComposer<any>();
  
  // Use form status for pending state
  const { pending } = useFormStatus();
  
  // Determine if form is submitting
  const isSubmitting = pending || state.isComposing;
  
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
        
        <form action={formAction} className={formClassName}>
          {children}
          
          {showFeeRate && (
            <FeeRateInput 
              showHelpText={showHelpText} 
              disabled={isSubmitting || submitDisabled} 
            />
          )}
          
          <Button 
            type="submit" 
            color="blue" 
            fullWidth 
            disabled={isSubmitting || submitDisabled}
          >
            {isSubmitting ? "Submitting..." : submitText}
          </Button>
        </form>
      </div>
    </div>
  );
}