"use client";

import { useState, useEffect, useRef, type ReactElement } from "react";
import { FiLock, FiAlertCircle } from "react-icons/fi";
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
   * Whether to show a lock icon in the header
   */
  showLockIcon?: boolean;
  
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
 *   title="Welcome Back"
 *   subtitle="Enter your password to unlock your wallet"
 *   onUnlock={handleUnlock}
 *   showLockIcon
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
  showLockIcon = false,
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
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            {/* Header Section */}
            <div className="text-center mb-6">
              {showLockIcon && (
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                    <FiLock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              )}
              
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {title}
              </h1>
              
              {subtitle && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
            
            {/* Error Message */}
            {error && (
              <div 
                className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2"
                role="alert"
                aria-live="polite"
              >
                <FiAlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-700 dark:text-red-400">
                  {error}
                </span>
              </div>
            )}
            
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
              
              {/* Action Buttons */}
              <div className={`flex ${onCancel ? 'justify-between' : 'justify-center'} gap-3`}>
                {onCancel && (
                  <Button 
                    type="button"
                    onClick={handleCancel}
                    variant="transparent"
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                )}
                
                <Button 
                  type="submit"
                  disabled={!password || isSubmitting}
                  className="flex-1"
                  aria-label={isSubmitting ? "Unlocking..." : submitText}
                >
                  {isSubmitting ? "Unlocking..." : submitText}
                </Button>
              </div>
            </form>
            
            {/* Help Text */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your password is never stored and is used only to decrypt your wallet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}