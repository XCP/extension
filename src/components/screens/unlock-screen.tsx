"use client";

import { useState, useEffect, useRef, type ReactElement } from "react";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/inputs/password-input";

/**
 * Props for the UnlockScreen component
 */
interface UnlockScreenProps {
  /**
   * Title displayed at the top of the unlock screen
   */
  title?: string;
  
  /**
   * Subtitle or description text
   */
  subtitle?: string;
  
  /**
   * Callback function when password is submitted
   */
  onUnlock: (password: string) => Promise<void>;
  
  /**
   * Optional callback when cancel is clicked (shows cancel button when provided)
   */
  onCancel?: () => void;
  
  /**
   * Custom error message to display
   */
  error?: string;
  
  /**
   * Whether the form is currently submitting
   */
  isSubmitting?: boolean;
  
  /**
   * Minimum password length required
   */
  minPasswordLength?: number;
  
  /**
   * Custom placeholder text for password input
   */
  placeholder?: string;
  
  /**
   * Custom text for the submit button
   */
  submitText?: string;
  
  /**
   * Additional CSS classes for the container
   */
  className?: string;
}

/**
 * UnlockScreen - A reusable screen component for password-based authentication
 * 
 * This component provides a consistent unlock interface that can be used in:
 * - Full page unlock (unlock-wallet page)
 * - Modal authorization (AuthorizationModal)
 * - Any other password-protected actions
 * 
 * Features:
 * - Auto-focus on password input
 * - Enter key submission
 * - Validation feedback
 * - Loading states
 * - Consistent styling with the app
 * 
 * @example
 * ```tsx
 * // Full page usage
 * <UnlockScreen
 *   title="XCP Wallet"
 *   subtitle="v0.0.1"
 *   onUnlock={handleUnlock}
 * />
 * 
 * // Modal usage
 * <UnlockScreen
 *   title="Authorization Required"
 *   subtitle="Enter your password to sign this transaction"
 *   onUnlock={handleAuth}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export function UnlockScreen({
  title = "Unlock Wallet",
  subtitle = "Enter your password to continue",
  onUnlock,
  onCancel,
  error: externalError,
  isSubmitting = false,
  minPasswordLength = 8,
  placeholder = "Enter your password",
  submitText = "Unlock",
  className = "",
}: UnlockScreenProps): ReactElement {
  const [password, setPassword] = useState("");
  const [internalError, setInternalError] = useState<string | undefined>();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  
  // Use external error if provided, otherwise internal
  const error = externalError || internalError;
  
  // Auto-focus password input on mount
  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);
  
  // Clear internal error when external error changes
  useEffect(() => {
    if (externalError) {
      setInternalError(undefined);
    }
  }, [externalError]);
  
  /**
   * Handle form submission
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setInternalError(undefined);
    
    // Validate password
    if (!password) {
      setInternalError("Password cannot be empty.");
      return;
    }
    
    if (password.length < minPasswordLength) {
      setInternalError(`Password must be at least ${minPasswordLength} characters.`);
      return;
    }
    
    try {
      await onUnlock(password);
      // Clear password on success (component might unmount)
      setPassword("");
    } catch (err) {
      console.error("Unlock error:", err);
      setInternalError(
        err instanceof Error 
          ? err.message 
          : "Invalid password. Please try again."
      );
    }
  };
  
  /**
   * Handle Enter key press
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleSubmit();
    }
  };
  
  /**
   * Handle cancel action
   */
  const handleCancel = () => {
    setPassword("");
    setInternalError(undefined);
    onCancel?.();
  };
  
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          {/* Header Section - Simple title */}
          <h1 className="text-3xl mb-5 flex justify-between items-center">
            <span className="font-bold">{title}</span>
            {subtitle && <span>{subtitle}</span>}
          </h1>
          
          {/* Form Section */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              name="password"
              placeholder={placeholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              innerRef={passwordInputRef}
              aria-label="Password"
              aria-invalid={!!error}
              aria-describedby={error ? "password-error" : undefined}
            />
            
            {/* Error Message - Simple inline error */}
            {error && (
              <p className="text-red-500 text-sm" role="alert">
                {error}
              </p>
            )}
            
            {/* Action Buttons */}
            {onCancel ? (
              <div className="flex justify-between gap-3">
                <Button 
                  type="button"
                  onClick={handleCancel}
                  variant="transparent"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={!password || isSubmitting}
                  className="flex-1"
                  aria-label={isSubmitting ? "Unlocking..." : submitText}
                >
                  {isSubmitting ? "Unlocking..." : submitText}
                </Button>
              </div>
            ) : (
              <Button 
                type="submit"
                fullWidth
                disabled={!password || isSubmitting}
                aria-label={isSubmitting ? "Unlocking..." : submitText}
              >
                {isSubmitting ? "Unlocking..." : submitText}
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}